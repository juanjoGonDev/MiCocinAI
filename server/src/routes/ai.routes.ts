import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  createAiConfigSchema,
  updateAiConfigSchema,
  testConnectionSchema,
  generateRecipeSchema,
  generateWeeklyPlanSchema,
  getRecommendationsSchema
} from '../schemas/ai.schema.js';
import type { AppEnv } from '../types/hono-env.js';

import {
  detailLevelForCookingLevel,
  hasTasteProfile,
  readCookingLevel,
  readTasteProfile,
  tastePromptLines
} from '../utils/taste-profile.js';
import { persistWeeklyPlan } from '../utils/weekly-plan.js';
import { callAI, extractJsonObject } from '../utils/ai-client.js';
const aiRoutes = new Hono<AppEnv>();
aiRoutes.use('*', authMiddleware);

// ═══════════════════════════════════════════════════════════════════
// AI Configurations
// ═══════════════════════════════════════════════════════════════════

// GET /api/ai/configs
aiRoutes.get('/configs', async (c) => {
  const userId = c.get('userId');
  const db = getDatabase();

  const configs = db.prepare(
    'SELECT id, name, provider, base_url, model, temperature, max_tokens, is_active, last_tested, test_status FROM ai_configs WHERE user_id = ?'
  ).all(userId);

  return c.json({ success: true, data: configs });
});

// POST /api/ai/configs
aiRoutes.post('/configs', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = createAiConfigSchema.parse(body);

  const db = getDatabase();
  const id = nanoid();

  db.prepare(`
    INSERT INTO ai_configs (id, user_id, name, provider, base_url, api_key, model, temperature, max_tokens, top_p, frequency_penalty, presence_penalty, timeout, retry_attempts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, input.name, input.provider, input.baseUrl, input.apiKey, input.model,
    input.temperature, input.maxTokens, input.topP, input.frequencyPenalty,
    input.presencePenalty, input.timeout, input.retryAttempts
  );

  const config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(id);
  return c.json({ success: true, data: config }, 201);
});

// PATCH /api/ai/configs/:id
aiRoutes.patch('/configs/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = updateAiConfigSchema.parse(body);

  const db = getDatabase();

  const existing = db.prepare('SELECT id FROM ai_configs WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) {
    return c.json({ success: false, message: 'Config not found' }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name); }
  if (input.baseUrl !== undefined) { updates.push('base_url = ?'); values.push(input.baseUrl); }
  if (input.apiKey !== undefined) { updates.push('api_key = ?'); values.push(input.apiKey); }
  if (input.model !== undefined) { updates.push('model = ?'); values.push(input.model); }
  if (input.temperature !== undefined) { updates.push('temperature = ?'); values.push(input.temperature); }
  if (input.maxTokens !== undefined) { updates.push('max_tokens = ?'); values.push(input.maxTokens); }
  if (input.isActive !== undefined) { updates.push('is_active = ?'); values.push(input.isActive ? 1 : 0); }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE ai_configs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(id);
  return c.json({ success: true, data: config });
});

// DELETE /api/ai/configs/:id
aiRoutes.delete('/configs/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDatabase();

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
    config = db.prepare('SELECT * FROM ai_configs WHERE id = ? AND user_id = ?').get(input.configId, userId) as any;
  } else {
    config = db.prepare('SELECT * FROM ai_configs WHERE user_id = ? AND is_active = 1').get(userId) as any;
  }

  if (!config) {
    return c.json({ success: false, message: 'No AI config found' }, 404);
  }

  const startTime = Date.now();

  try {
    // Test connection with a simple request
    const response = await fetch(`${config.base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      }),
      signal: AbortSignal.timeout(config.timeout)
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.text();
      db.prepare('UPDATE ai_configs SET test_status = ?, test_error = ?, last_tested = CURRENT_TIMESTAMP WHERE id = ?')
        .run('failed', error, config.id);

      return c.json({
        success: false,
        data: { success: false, latency, error }
      });
    }

    db.prepare('UPDATE ai_configs SET test_status = ?, test_error = NULL, last_tested = CURRENT_TIMESTAMP WHERE id = ?')
      .run('success', config.id);

    return c.json({
      success: true,
      data: { success: true, model: config.model, latency }
    });
  } catch (error: any) {
    const latency = Date.now() - startTime;
    const errorMessage = error.message || 'Connection failed';

    db.prepare('UPDATE ai_configs SET test_status = ?, test_error = ?, last_tested = CURRENT_TIMESTAMP WHERE id = ?')
      .run('failed', errorMessage, config.id);

    return c.json({
      success: false,
      data: { success: false, latency, error: errorMessage }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// AI Generation
// ═══════════════════════════════════════════════════════════════════

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

  const db = getDatabase();

  const ingredientList = input.ingredients.map(i => `${i.quantity} ${i.unit} de ${i.name}`).join(', ');
  const utensilList = input.utensils.filter(u => u.available).map(u => u.name).join(', ');

  // El perfil del comensal (alergias, gustos, objetivo) se añade siempre: lo
  // respondió en el onboarding y es lo que hace que la receta sea suya.
  const taste = readTasteProfile(db, userId);
  const tasteBlock = hasTasteProfile(taste) ? tastePromptLines(taste) : '';

  const detailInstructions: Record<string, string> = {
    basic: 'Instrucciones breves y claras.',
    intermediate: 'Instrucciones detalladas con consejos útiles.',
    expert: 'Instrucciones muy detalladas incluyendo técnicas culinarias, tiempos exactos, temperaturas, cómo cortar y preparar cada ingrediente paso a paso, tiempos de reposo, y cómo almacenar las sobras.'
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

  try {
    const response = await callAI(userId, [
      { role: 'system', content: 'Eres un chef profesional. Responde SOLO con JSON válido, sin markdown ni explicaciones.' },
      { role: 'user', content: prompt }
    ], db);

    // Parse JSON from response
    const recipe = extractJsonObject(response) as any;

    // Save recipe to database
    const id = nanoid();
    db.prepare(`
      INSERT INTO recipes (id, name, description, difficulty, cuisine, meal_type, total_time, prep_time, cook_time, rest_time, servings, calories, ingredients, utensils, steps, nutrition, storage, author, author_id, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, recipe.name, recipe.description, recipe.difficulty, recipe.cuisine,
      JSON.stringify([]), recipe.totalTime, recipe.prepTime, recipe.cookTime, recipe.restTime,
      recipe.servings, recipe.calories, JSON.stringify(recipe.ingredients),
      JSON.stringify(recipe.utensils), JSON.stringify(recipe.steps),
      JSON.stringify(recipe.nutrition), JSON.stringify(recipe.storage),
      'ai', userId, JSON.stringify(recipe.tags || [])
    );

    return c.json({ success: true, data: { id, ...recipe } });
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

  const recipes = [];

  for (let i = 0; i < (input.count || 3); i++) {
    try {
      // Reuse the single recipe generation logic
      const response = await fetch('http://localhost:3000/api/ai/generate-recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': c.req.header('Authorization') || ''
        },
        body: JSON.stringify(input)
      });

      const result = await response.json() as { success: boolean; data: unknown };
      if (result.success) {
        recipes.push(result.data);
      }
    } catch {
      // Continue with other recipes
    }
  }

  return c.json({ success: true, data: recipes });
});

// POST /api/ai/recommendations
aiRoutes.post('/recommendations', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = getRecommendationsSchema.parse(body);

  const db = getDatabase();

  const prompt = `Basándote en la siguiente información, recomienda ${input.count} recetas:

Comidas recientes: ${input.recentMeals.map(m => `${m.date}: ${m.meal}`).join(', ') || 'Ninguna'}
Ingredientes disponibles: ${input.availableIngredients.join(', ') || 'Ninguno específico'}
${input.householdPreferences ? `Preferencias: Likes=${input.householdPreferences.likes.join(',')}, Dislikes=${input.householdPreferences.dislikes.join(',')}, Alergias=${input.householdPreferences.allergies.join(',')}` : ''}

Responde SOLO con un JSON válido: {"recommendations": [{"name": "", "reason": "", "ingredients": [], "estimatedTime": 0}]}`;

  try {
    const response = await callAI(userId, [
      { role: 'system', content: 'Eres un chef profesional. Responde SOLO con JSON válido.' },
      { role: 'user', content: prompt }
    ], db);

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

  const prompt = `Genera un plan de comidas semanal:

Del ${input.startDate} al ${input.endDate}
Objetivo: ${input.goals.type}
${input.goals.caloriesTarget ? `Calorías diarias objetivo: ${input.goals.caloriesTarget}` : ''}${input.goals.customInstructions ? `\nIndicaciones del usuario (prioritarias): ${input.goals.customInstructions}` : ''}
${input.availableIngredients.length > 0 ? `Ingredientes disponibles: ${input.availableIngredients.join(', ')}` : ''}
${input.householdPreferences ? `Preferencias: Likes=${input.householdPreferences.likes.join(',')}, Dislikes=${input.householdPreferences.dislikes.join(',')}` : ''}${tasteBlock}

Responde SOLO con un JSON válido con esta estructura:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "meals": {
        "breakfast": {"name": "", "ingredients": [], "time": 0},
        "lunch": {"name": "", "ingredients": [], "time": 0},
        "dinner": {"name": "", "ingredients": [], "time": 0}
      },
      "totalCalories": 0
    }
  ],
  "shoppingList": ["item1", "item2"]
}`;

  try {
    const response = await callAI(userId, [
      { role: 'system', content: 'Eres un nutricionista y chef. Responde SOLO con JSON válido.' },
      { role: 'user', content: prompt }
    ], db);

    const plan = extractJsonObject(response) as any;

    // El plan se guarda en la semana pedida: si no, «Planificar con IA» se
    // quedaba en un toast de éxito sobre un calendario vacío.
    const saved = persistWeeklyPlan(db, {
      userId,
      startDate: input.startDate,
      endDate: input.endDate,
      goals: input.goals,
      plan
    });

    return c.json({ success: true, data: { ...plan, saved } });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
});

export { aiRoutes };
