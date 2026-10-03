import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  createAiConfigSchema,
  updateAiConfigSchema,
  testConnectionSchema,
  generateRecipeSchema,
  generateWeeklyPlanSchema,
  getRecommendationsSchema,
  type GenerateRecipeInput
} from '../schemas/ai.schema.js';
import { createRecipeSchema } from '../schemas/recipe.schema.js';
import type { AppEnv } from '../types/hono-env.js';

import {
  detailLevelForCookingLevel,
  hasTasteProfile,
  MEAL_TYPE_LABELS,
  plannedMealTypes,
  readCookingLevel,
  readMealPlan,
  readMealTimes,
  readTasteProfile,
  tastePromptLines
} from '../utils/taste-profile.js';
import { persistWeeklyPlan, resolveMealTypes } from '../utils/weekly-plan.js';
import { bloqueDeCaducidades } from '../utils/caducidades.js';
import { AiCallError, callAI, extractJsonObject, pingDeConexion } from '../utils/ai-client.js';
import type { AiConfigRow } from '../utils/ai-client.js';
import {
  cancelarColaDeConfiguracion,
  cerrarVentanasReintentoConfiguracion
} from '../utils/ticket-queue.js';
const aiRoutes = new Hono<AppEnv>();
aiRoutes.use('*', authMiddleware);

// ═══════════════════════════════════════════════════════════════════
// AI Configurations
// ═══════════════════════════════════════════════════════════════════

// GET /api/ai/configs
aiRoutes.get('/configs', async (c) => {
  const userId = c.get('userId');
  const db = getDatabase();

  const configs = db.prepare('SELECT * FROM ai_configs WHERE user_id = ?').all(userId);

  return c.json({
    success: true,
    data: configs.map((row) => toClientConfig(row as Record<string, unknown>))
  });
});

// POST /api/ai/configs
/**
 * Lo que el cliente ve de una configuracion: camelCase (lo que el formulario y las tarjetas
 * ya leen) y SIN la api_key. La fila cruda que salia antes tenia las dos culpas de «la IA no
 * se activa, se queda inactivada»: el badge miraba `isActive` mientras la API devolvia
 * `is_active` —la configuracion estaba activa en la base desde el primer dia, pero la UI no
 * lo veia— y la llave viajaba con cada respuesta.
 */
function toClientConfig(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    provider: row.provider as string,
    baseUrl: row.base_url as string,
    model: row.model as string,
    temperature: (row.temperature as number | null) ?? undefined,
    maxTokens: (row.max_tokens as number | null) ?? undefined,
    topP: (row.top_p as number | null) ?? undefined,
    frequencyPenalty: (row.frequency_penalty as number | null) ?? undefined,
    presencePenalty: (row.presence_penalty as number | null) ?? undefined,
    timeout: row.timeout as number | undefined,
    retryAttempts: row.retry_attempts as number | undefined,
    concurrency: row.concurrency as number,
    isActive: row.is_active === 1,
    lastTested: (row.last_tested as string | null) ?? undefined,
    testStatus: (row.test_status as string | null) ?? undefined,
    testError: (row.test_error as string | null) ?? undefined,
    updatedAt: row.updated_at as string
  };
}

aiRoutes.post('/configs', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = createAiConfigSchema.parse(body);

  const db = getDatabase();
  const id = nanoid();
  const configuracionesActivas = db
    .prepare('SELECT id FROM ai_configs WHERE user_id = ? AND is_active = 1')
    .all(userId) as { id: string }[];

  db.prepare(
    `
    INSERT INTO ai_configs (id, user_id, name, provider, base_url, api_key, model, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, timeout, retry_attempts, concurrency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    userId,
    input.name,
    input.provider,
    input.baseUrl,
    input.apiKey,
    input.model,
    input.temperature,
    input.maxTokens,
    input.topP,
    input.frequencyPenalty,
    input.presencePenalty,
    input.timeout,
    input.retryAttempts,
    input.concurrency
  );

  // La configuracion recien creada es LA activa, y solo hay una. Si no, la primera fila (la
  // vieja, por rowid) seguia siendo la que contestaba a todas las llamadas y la IA «no se
  // activaba nunca» por muchas configuraciones nuevas que se guardaran encima.
  db.prepare('UPDATE ai_configs SET is_active = 0 WHERE user_id = ? AND id != ?').run(userId, id);
  for (const antigua of configuracionesActivas) {
    cancelarColaDeConfiguracion(db, userId, antigua.id);
  }

  const config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(id);
  return c.json({ success: true, data: toClientConfig(config as Record<string, unknown>) }, 201);
});

// PATCH /api/ai/configs/:id
aiRoutes.patch('/configs/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = updateAiConfigSchema.parse(body);

  const db = getDatabase();

  const existing = db
    .prepare('SELECT id FROM ai_configs WHERE id = ? AND user_id = ?')
    .get(id, userId);
  if (!existing) {
    return c.json({ success: false, message: 'Config not found' }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];
  const configuracionesDesactivadas = input.isActive
    ? (db
        .prepare('SELECT id FROM ai_configs WHERE user_id = ? AND is_active = 1 AND id != ?')
        .all(userId, id) as { id: string }[])
    : [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }
  if (input.baseUrl !== undefined) {
    updates.push('base_url = ?');
    values.push(input.baseUrl);
  }
  if (input.apiKey !== undefined) {
    updates.push('api_key = ?');
    values.push(input.apiKey);
  }
  if (input.model !== undefined) {
    updates.push('model = ?');
    values.push(input.model);
  }
  if (input.temperature !== undefined) {
    updates.push('temperature = ?');
    values.push(input.temperature);
  }
  if (input.maxTokens !== undefined) {
    updates.push('max_tokens = ?');
    values.push(input.maxTokens);
  }
  if (input.isActive) {
    // Activar es elegir: solo una configuracion de la casa responde a la vez, y activar una
    // apaga las demas. (Desactivar la activa es legitimo: ahi la IA simplemente no esta.)
    db.prepare('UPDATE ai_configs SET is_active = 0 WHERE user_id = ?').run(userId);
  }
  if (input.isActive !== undefined) {
    updates.push('is_active = ?');
    values.push(input.isActive ? 1 : 0);
  }
  // La concurrencia máxima de esta configuración (## 12an) se edita en caliente.
  if (input.concurrency !== undefined) {
    updates.push('concurrency = ?');
    values.push(input.concurrency);
  }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE ai_configs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  for (const desactivada of configuracionesDesactivadas) {
    cancelarColaDeConfiguracion(db, userId, desactivada.id);
  }
  if (input.isActive === false) {
    cancelarColaDeConfiguracion(db, userId, id);
  }
  if (input.concurrency === 0) {
    cerrarVentanasReintentoConfiguracion(db, userId, id, 'CONCURRENCY_DISABLED');
  }

  const config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(id);
  return c.json({ success: true, data: toClientConfig(config as Record<string, unknown>) });
});

// DELETE /api/ai/configs/:id
aiRoutes.delete('/configs/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDatabase();

  const existe = db
    .prepare('SELECT id FROM ai_configs WHERE id = ? AND user_id = ?')
    .get(id, userId);
  if (!existe) {
    return c.json({ success: false, message: 'Config not found' }, 404);
  }
  cancelarColaDeConfiguracion(db, userId, id);
  const result = db.prepare('DELETE FROM ai_configs WHERE id = ? AND user_id = ?').run(id, userId);
  if (result.changes === 0) {
    return c.json({ success: false, message: 'Config not found' }, 404);
  }

  return c.json({ success: true, message: 'Config deleted' });
});

// POST /api/ai/test-connection
aiRoutes.post('/test-connection', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = testConnectionSchema.parse(body);

  const db = getDatabase();

  let config;
  if (input.configId) {
    config = db
      .prepare('SELECT * FROM ai_configs WHERE id = ? AND user_id = ?')
      .get(input.configId, userId) as any;
  } else if (input.baseUrl && input.apiKey && input.model) {
    // La prueba del FORMULARIO: los datos tal cual estan escritos, sin guardar nada. Es lo que
    // permite descartar una configuracion mala antes de que exista en la bandeja.
    config = {
      id: null,
      base_url: input.baseUrl,
      api_key: input.apiKey,
      model: input.model,
      timeout: input.timeout ?? null
    };
  } else {
    config = db
      .prepare('SELECT * FROM ai_configs WHERE user_id = ? AND is_active = 1')
      .get(userId) as any;
  }

  if (!config) {
    return c.json({ success: false, message: 'No AI config found' }, 404);
  }

  // La prueba ya no es un «Hello» a ver que contesta: se le pide al modelo un JSON DADO con
  // `response_format` de esquema estricto —el mismo contrato que exige el resto de la app, que
  // parsea JSON en todas sus funciones de IA— y se valida la contestacion. Un proveedor que no
  // sabe responder esto no sirve para la casa, y es mejor saberlo en Ajustes que en un ticket.
  const veredicto = await pingDeConexion(
    {
      base_url: config.base_url,
      api_key: config.api_key,
      model: config.model,
      timeout: config.timeout
    },
    {
      db,
      userId,
      config: {
        id: config.id ?? `ephemeral-${userId}`,
        name: String(config.name ?? 'Connection test'),
        provider: String(config.provider ?? 'custom'),
        base_url: config.base_url,
        api_key: config.api_key,
        model: config.model,
        temperature: (config.temperature as number | null) ?? null,
        max_tokens: (config.max_tokens as number | null) ?? null,
        top_p: (config.top_p as number | null) ?? null,
        frequency_penalty: (config.frequency_penalty as number | null) ?? null,
        presence_penalty: (config.presence_penalty as number | null) ?? null,
        timeout: (config.timeout as number | null) ?? null,
        retry_attempts: (config.retry_attempts as number | null) ?? 0,
        concurrency: (config.concurrency as number | null) ?? 0
      } satisfies AiConfigRow,
      configId: input.configId ? String(config.id) : null
    }
  );

  // El estado de la prueba solo se persiste cuando se prueba una config GUARDADA; la del
  // formulario se ensena y ya.
  if (input.configId) {
    db.prepare(
      'UPDATE ai_configs SET test_status = ?, test_error = ?, last_tested = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(veredicto.ok ? 'success' : 'failed', veredicto.ok ? null : veredicto.error, config.id);
  }

  if (!veredicto.ok) {
    return c.json({
      success: false,
      data: {
        success: false,
        model: config.model,
        latency: veredicto.latency,
        error: veredicto.error
      }
    });
  }
  return c.json({
    success: true,
    data: {
      success: true,
      model: config.model,
      latency: veredicto.latency,
      message: veredicto.message
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// AI Generation
// ═══════════════════════════════════════════════════════════════════

const generatedRecipeCandidateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(1000),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    cuisine: z.string().max(50).nullish(),
    totalTime: z.number().int().positive(),
    prepTime: z.number().int().positive(),
    cookTime: z.number().int().positive(),
    restTime: z.number().int().positive().nullish(),
    servings: z.number().int().positive(),
    calories: z.number().positive().nullish(),
    ingredients: z
      .array(
        z
          .object({
            name: z.string().trim().min(1),
            quantity: z.number().positive(),
            unit: z.enum([
              'g',
              'kg',
              'ml',
              'l',
              'cup',
              'tbsp',
              'tsp',
              'unit',
              'bunch',
              'slice',
              'piece'
            ]),
            preparation: z.string().nullish(),
            notes: z.string().nullish()
          })
          .passthrough()
      )
      .min(1),
    utensils: z.array(z.string()),
    steps: z
      .array(
        z
          .object({
            stepNumber: z.number().int().positive(),
            instruction: z.string().trim().min(1),
            duration: z.number().int().positive().nullish(),
            tips: z.string().nullish(),
            warning: z.string().nullish()
          })
          .passthrough()
      )
      .min(1),
    nutrition: z
      .object({
        calories: z.number(),
        protein: z.number(),
        carbs: z.number(),
        fat: z.number(),
        fiber: z.number().nullish()
      })
      .nullish(),
    storage: z
      .object({
        method: z.string().trim().min(1),
        duration: z.string().trim().min(1),
        reheating: z.string().nullish()
      })
      .passthrough()
      .nullish()
  })
  .passthrough();

type GeneratedRecipeCandidate = z.infer<typeof generatedRecipeCandidateSchema>;

/** Contrato de lo que el modal existente entrega a POST /api/recipes al guardar. */
function isSavableGeneratedRecipe(recipe: GeneratedRecipeCandidate): boolean {
  const savePayload = {
    name: recipe.name,
    description: recipe.description,
    difficulty: recipe.difficulty,
    cuisine: recipe.cuisine,
    totalTime: recipe.totalTime,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    restTime: recipe.restTime,
    servings: recipe.servings,
    calories: recipe.calories,
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      preparation: ingredient.preparation,
      isOptional: false,
      notes: ingredient.notes
    })),
    utensils: recipe.utensils,
    steps: recipe.steps.map((step) => ({
      stepNumber: step.stepNumber,
      instruction: step.instruction,
      duration: step.duration,
      timerRequired: Boolean(step.duration),
      timerDuration: step.duration,
      tips: step.tips,
      warning: step.warning
    })),
    nutrition: recipe.nutrition
      ? {
          calories: recipe.nutrition.calories,
          protein: recipe.nutrition.protein,
          carbs: recipe.nutrition.carbs,
          fat: recipe.nutrition.fat,
          fiber: recipe.nutrition.fiber || 0
        }
      : recipe.nutrition,
    storage: recipe.storage
      ? {
          method: recipe.storage.method,
          container: 'Apropiado',
          duration: recipe.storage.duration,
          reheatingInstructions: recipe.storage.reheating,
          freezingPossible: false
        }
      : recipe.storage,
    tags: []
  };

  return createRecipeSchema.safeParse(savePayload).success;
}

function normalizeRecipeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function candidateFingerprints(recipe: GeneratedRecipeCandidate): {
  full: string;
  content: string;
} {
  const ingredients = recipe.ingredients
    .map((ingredient) => [
      normalizeRecipeText(ingredient.name),
      String(ingredient.quantity),
      normalizeRecipeText(ingredient.unit)
    ])
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const steps = recipe.steps.map((step) => normalizeRecipeText(step.instruction));
  const content = JSON.stringify({ ingredients, steps });

  return {
    full: JSON.stringify({ name: normalizeRecipeText(recipe.name), ingredients, steps }),
    content
  };
}

function isDuplicateCandidate(
  candidate: GeneratedRecipeCandidate,
  existing: GeneratedRecipeCandidate[]
): boolean {
  const fingerprints = candidateFingerprints(candidate);
  return existing.some((recipe) => {
    const previous = candidateFingerprints(recipe);
    // Un título distinto no convierte el mismo conjunto de ingredientes y pasos en otra receta.
    return fingerprints.full === previous.full || fingerprints.content === previous.content;
  });
}

/** Genera y valida un borrador sin modificar recetas persistidas. */
async function generateRecipeDraft(
  userId: string,
  input: GenerateRecipeInput,
  db: ReturnType<typeof getDatabase>,
  kind: 'recipe' | 'multiple_recipes' = 'recipe',
  candidateNumber?: number
) {
  const ingredientList = input.ingredients
    .map((i) => `${i.quantity} ${i.unit} de ${i.name}`)
    .join(', ');
  const utensilList = input.utensils
    .filter((u) => u.available)
    .map((u) => u.name)
    .join(', ');

  // El perfil del comensal (alergias, gustos, objetivo) se añade siempre: lo
  // respondió en el onboarding y es lo que hace que la receta sea suya.
  const taste = readTasteProfile(db, userId);
  const tasteBlock = hasTasteProfile(taste) ? tastePromptLines(taste) : '';

  const detailInstructions: Record<string, string> = {
    basic: 'Instrucciones breves y claras.',
    intermediate: 'Instrucciones detalladas con consejos útiles.',
    expert:
      'Instrucciones muy detalladas incluyendo técnicas culinarias, tiempos exactos, temperaturas, cómo cortar y preparar cada ingrediente paso a paso, tiempos de reposo, y cómo almacenar las sobras.'
  };

  const prompt = `Genera una receta de cocina con las siguientes características:

Ingredientes disponibles: ${ingredientList}
Utensilios disponibles: ${utensilList}
Porciones: ${input.servings}
Dificultad: ${input.difficulty}
Nivel de detalle: ${input.detailLevel} - ${detailInstructions[input.detailLevel]}
${input.dietaryRestrictions.length > 0 ? `Restricciones dietéticas: ${input.dietaryRestrictions.join(', ')}` : ''}
${input.allergies.length > 0 ? `Alergias: ${input.allergies.join(', ')}` : ''}
${input.preferences.length > 0 ? `Preferencias: ${input.preferences.join(', ')}` : ''}
${tasteBlock}
${input.cookingTime ? `Tiempo de cocción: entre ${input.cookingTime.min} y ${input.cookingTime.max} minutos` : ''}
${kind === 'multiple_recipes' && candidateNumber !== undefined ? `Esta es la candidata ${candidateNumber} de ${input.count}. Propón una alternativa culinariamente distinta, variando de forma real los ingredientes y/o la técnica, sin dejar de respetar los ingredientes disponibles y las restricciones.` : ''}

Responde SOLO con un JSON válido con esta estructura:
{
  "name": "Nombre de la receta",
  "description": "Descripción breve",
  "difficulty": "easy|medium|hard",
  "cuisine": "Tipo de cocina",
  "totalTime": número en minutos,
  "prepTime": número en minutos,
  "cookTime": número en minutos,
  "restTime": número en minutos o null,
  "servings": ${input.servings},
  "calories": número aproximado,
  "ingredients": [{"name": "", "quantity": número, "unit": "", "preparation": "", "isOptional": false, "notes": ""}],
  "utensils": ["utensilios necesarios"],
  "steps": [{"stepNumber": 1, "instruction": "", "duration": minutos, "timerRequired": true/false, "timerDuration": minutos, "tips": "", "warning": ""}],
  "nutrition": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0},
  "storage": {"method": "", "duration": "", "reheating": "", "freezingPossible": true/false, "freezingDuration": ""},
  "tags": ["tag1", "tag2"]
}`;

  const response = await callAI(
    userId,
    [
      {
        role: 'system',
        content:
          'Eres un chef profesional. Responde SOLO con JSON válido, sin markdown ni explicaciones.'
      },
      { role: 'user', content: prompt }
    ],
    db,
    kind
  );

  const recipe = extractJsonObject(response);
  const name =
    recipe && typeof recipe === 'object' && !Array.isArray(recipe)
      ? (recipe as Record<string, unknown>).name
      : undefined;
  if (
    typeof recipe !== 'object' ||
    recipe === null ||
    Array.isArray(recipe) ||
    typeof name !== 'string' ||
    !name.trim()
  ) {
    throw new AiCallError('BAD_JSON', 'AI response does not contain a usable recipe draft');
  }

  return recipe as Record<string, unknown>;
}

// POST /api/ai/generate-recipe
aiRoutes.post('/generate-recipe', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  // El nivel de cocina del comensal fija cuánto hay que explicar, salvo que la
  // petición traiga un detalle explícito (lo que elija el formulario manda).
  const input = generateRecipeSchema.parse({
    ...body,
    detailLevel:
      typeof body?.detailLevel === 'string'
        ? body.detailLevel
        : detailLevelForCookingLevel(readCookingLevel(getDatabase(), userId))
  });

  try {
    const recipe = await generateRecipeDraft(userId, input, getDatabase());
    return c.json({ success: true, data: recipe });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

// POST /api/ai/generate-multiple-recipes
aiRoutes.post('/generate-multiple-recipes', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = generateRecipeSchema.parse({
    ...body,
    generateMultiple: true,
    detailLevel:
      typeof body?.detailLevel === 'string'
        ? body.detailLevel
        : detailLevelForCookingLevel(readCookingLevel(getDatabase(), userId))
  });

  try {
    const db = getDatabase();
    const recipes: GeneratedRecipeCandidate[] = [];

    for (let i = 0; i < input.count; i++) {
      const rawRecipe = await generateRecipeDraft(userId, input, db, 'multiple_recipes', i + 1);
      const parsedRecipe = generatedRecipeCandidateSchema.safeParse(rawRecipe);
      if (!parsedRecipe.success || !isSavableGeneratedRecipe(parsedRecipe.data)) {
        throw new AiCallError('BAD_JSON', 'AI response does not contain a usable recipe draft');
      }
      if (isDuplicateCandidate(parsedRecipe.data, recipes)) {
        throw new AiCallError('BAD_JSON', 'AI generated duplicate recipe drafts');
      }
      recipes.push(parsedRecipe.data);
    }

    return c.json({ success: true, data: recipes });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

// POST /api/ai/recommendations
aiRoutes.post('/recommendations', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = getRecommendationsSchema.parse(body);

  const db = getDatabase();

  // Lo que caduca pronto entra en la recomendacion (## 12ak): una sugerencia que ignore que el
  // pescado caduca manana es una sugerencia que manda tirar comida.
  const caducan = bloqueDeCaducidades(db, userId);

  const prompt = `Basándote en la siguiente información, recomienda ${input.count} recetas:

Comidas recientes: ${input.recentMeals.map((m) => `${m.date}: ${m.meal}`).join(', ') || 'Ninguna'}
Ingredientes disponibles: ${input.availableIngredients.join(', ') || 'Ninguno específico'}
${input.householdPreferences ? `Preferencias: Likes=${input.householdPreferences.likes.join(',')}, Dislikes=${input.householdPreferences.dislikes.join(',')}, Alergias=${input.householdPreferences.allergies.join(',')}` : ''}
${caducan ? `${caducan}` : ''}

Responde SOLO con un JSON válido: {"recommendations": [{"name": "", "reason": "", "ingredients": [], "estimatedTime": 0}]}`;

  try {
    const response = await callAI(
      userId,
      [
        { role: 'system', content: 'Eres un chef profesional. Responde SOLO con JSON válido.' },
        { role: 'user', content: prompt }
      ],
      db,
      'recommendations'
    );

    const result = extractJsonObject(response) as any;
    return c.json({ success: true, data: result.recommendations });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

// POST /api/ai/plan-week
aiRoutes.post('/plan-week', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = generateWeeklyPlanSchema.parse(body);

  const db = getDatabase();

  const taste = readTasteProfile(db, userId);
  const tasteBlock = hasTasteProfile(taste) ? `\n${tastePromptLines(taste)}\n` : '';

  // Las comidas pedidas y las horas de la casa entran en el prompt y en lo que se guarda: si solo
  // cambian la peticion, el modelo seguiria escribiendo un dia completo que despues habria que tirar.
  //
  // Y por encima estan las cuatro palabras de 12t-T: la casa puede tener comidas **bloqueadas** en
  // Preferencias, y un bloqueo se respeta aqui (el prompt) y en la persistencia. `resolveMealTypes` trata
  // «vacio» como «las cuatro», asi que el filtro se aplica despues —pedir solo lo bloqueado no puede
  // acabar planificando la semana entera.
  const permitidas = plannedMealTypes(readMealPlan(db, userId));
  const mealTypes = resolveMealTypes(input.mealTypes).filter((type) => permitidas.includes(type));
  if (mealTypes.length === 0) {
    return c.json(
      {
        success: false,
        code: 'MEAL_PLAN_ALL_BLOCKED',
        message: 'Todas las comidas estan bloqueadas en Preferencias: no hay nada que planificar.'
      },
      400
    );
  }
  const mealTimes = readMealTimes(db, userId);
  const mealShape = mealTypes
    .map((type) => `        "${type}": {"name": "", "ingredients": [], "time": 0}`)
    .join(',\n');
  const houseHours = mealTypes
    .map((type) => `${MEAL_TYPE_LABELS[type].toLowerCase()} a las ${mealTimes[type]}`)
    .join(', ');

  // Lo que caduca pronto viaja con el plan (## 12ak): el planificador tiene que gastar lo
  // que se tira antes, y eso no lo sabe el cliente —lo sabe la despensa—.
  const caducan = bloqueDeCaducidades(db, userId);

  const prompt = `Genera un plan de comidas semanal:

Del ${input.startDate} al ${input.endDate}
Objetivo: ${input.goals.type}
${input.goals.caloriesTarget ? `Calorías diarias objetivo: ${input.goals.caloriesTarget}` : ''}${input.goals.customInstructions ? `\nIndicaciones del usuario (prioritarias): ${input.goals.customInstructions}` : ''}
${input.availableIngredients.length > 0 ? `Ingredientes disponibles: ${input.availableIngredients.join(', ')}` : ''}
${caducan ? `${caducan}` : ''}
${input.householdPreferences ? `Preferencias: Likes=${input.householdPreferences.likes.join(',')}, Dislikes=${input.householdPreferences.dislikes.join(',')}` : ''}${tasteBlock}
Planifica SOLO estas comidas: ${mealTypes.join(', ')}. No añadas otras.
Horarios de esta casa: ${houseHours}. Tenlos en cuenta al elegir plato (no propongas un asado de tres horas para un desayuno de media mañana); el reloj de cada comida lo pone la app, no tú.

Responde SOLO con un JSON válido con esta estructura:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "meals": {
${mealShape}
      },
      "totalCalories": 0
    }
  ],
  "shoppingList": ["item1", "item2"]
}`;

  try {
    const response = await callAI(
      userId,
      [
        { role: 'system', content: 'Eres un nutricionista y chef. Responde SOLO con JSON válido.' },
        { role: 'user', content: prompt }
      ],
      db,
      'weekly_plan'
    );

    const plan = extractJsonObject(response) as any;

    // El plan se guarda en la semana pedida: si no, «Planificar con IA» se
    // quedaba en un toast de éxito sobre un calendario vacío.
    const saved = persistWeeklyPlan(db, {
      userId,
      startDate: input.startDate,
      endDate: input.endDate,
      goals: input.goals,
      plan,
      mealTypes,
      mealTimes
    });

    return c.json({ success: true, data: { ...plan, saved } });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

export { aiRoutes };
