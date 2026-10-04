import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';

/**
 * Las rutas de configuracion de IA (revision de la ## 8f a peticion del usuario): la prueba de
 * conexion con JSON DADO (no un «Hello» a ver que contesta) y la activacion. Dos promesas:
 *
 *   - La prueba va contra una config guardada (`configId`) o contra los datos del formulario
 *     tal cual (baseUrl+apiKey+model), que es lo que permite probar ANTES de guardar; y el
 *     estado (`test_status`) solo se persiste en la primera.
 *   - La configuracion activa es UNA: la recien creada es la activa, y activar otra apaga la
 *     anterior. La queja era «la IA no se activa se queda inactivada»: creabas una config
 *     nueva y la primera fila (la vieja, por rowid) seguia siendo la que contestaba.
 */

process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

type Sql = import('better-sqlite3').Database;

let app: Hono;
let db: Sql;
let closeDatabase: () => void;

async function makeUser(email: string) {
  const id = `u-${email.split('@')[0]}`;
  db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(
    id,
    email,
    'Tester',
    'hash'
  );
  const config = await import('../config/app.config.js');
  const token = jwt.sign({ sub: id, email }, config.config.auth.jwtSecret, { expiresIn: '1h' });
  return { id, token };
}

type User = { id: string; token: string };

function call(user: User, method: string, path: string, body?: unknown) {
  return app.request(`/api/ai${path}`, {
    method,
    headers: { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const json = async (response: Response): Promise<any> => await response.json();
const data = async (response: Response): Promise<any> => (await json(response)).data;

/** El proveedor contesta lo que se le diga: aqui se decide si la prueba pasa o no. */
function stubDelProveedor(content: string, status = 200): void {
  vi.stubGlobal(
    'fetch',
    (async (): Promise<Response> =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status
      })) as unknown as typeof fetch
  );
}

let alice: User;

beforeEach(async () => {
  vi.unstubAllGlobals();
  db.exec('DELETE FROM recipes; DELETE FROM ai_configs; DELETE FROM users;');
  alice = await makeUser(`alice-${Math.random().toString(36).slice(2)}@test.local`);
});

afterEach(() => {
  if (!db || !alice) return;
  db.prepare(
    'DELETE FROM meals WHERE calendar_id IN (SELECT id FROM weekly_calendars WHERE user_id = ?)'
  ).run(alice.id);
  db.prepare('DELETE FROM weekly_calendars WHERE user_id = ?').run(alice.id);
});

beforeAll(async () => {
  const database = await import('../config/database.js');
  await database.initializeDatabase();
  db = database.getDatabase();
  closeDatabase = database.closeDatabase;

  const { aiRoutes } = await import('./ai.routes.js');
  const { errorHandler } = await import('../middleware/error.middleware.js');
  const { timestampMiddleware } = await import('../middleware/timestamp.middleware.js');
  app = new Hono();
  app.onError(errorHandler as never);
  app.use('/api/*', timestampMiddleware());
  app.route('/api/ai', aiRoutes);
});

afterAll(() => closeDatabase?.());

async function crearConfig(
  user: User,
  nombre: string,
  baseUrl = 'http://localhost:9/v1',
  retryAttempts = 3
) {
  return data(
    await call(user, 'POST', '/configs', {
      name: nombre,
      provider: 'custom',
      baseUrl,
      apiKey: 'sk-x',
      model: 'gpt-5',
      retryAttempts
    })
  );
}

describe('la configuracion activa es UNA', () => {
  it('la config recien creada es la activa, y apaga la anterior', async () => {
    const primera = await crearConfig(alice, 'Vieja');
    expect(primera.isActive).toBe(true);

    const segunda = await crearConfig(alice, 'Nueva');
    const filas = db
      .prepare('SELECT name, is_active FROM ai_configs ORDER BY created_at, rowid')
      .all() as { name: string; is_active: number }[];
    expect(filas).toEqual([
      { name: 'Vieja', is_active: 0 },
      { name: 'Nueva', is_active: 1 }
    ]);
    expect(segunda.isActive).toBe(true);
  });

  it('la respuesta no devuelve la api_key', async () => {
    await crearConfig(alice, 'Con llave');
    const respuesta = await call(alice, 'GET', '/configs');
    const cuerpo = (await respuesta.json()) as { data: Record<string, unknown>[] };
    expect(cuerpo.data).toHaveLength(1);
    expect(JSON.stringify(cuerpo.data)).not.toContain('sk-');
    expect(JSON.stringify(cuerpo.data)).not.toContain('api_key');
    expect(cuerpo.data[0].baseUrl).toBe('http://localhost:9/v1'); // camelCase, lo que la UI lee
  });

  it('activar una config apaga las demas: elegir es exclusivo', async () => {
    await crearConfig(alice, 'Vieja');
    const nueva = await crearConfig(alice, 'Nueva');
    const vieja = db.prepare('SELECT id FROM ai_configs WHERE name = ?').get('Vieja') as {
      id: string;
    };

    await call(alice, 'PATCH', `/configs/${vieja.id}`, { isActive: true });
    const filas = db
      .prepare('SELECT name, is_active FROM ai_configs ORDER BY created_at, rowid')
      .all() as { name: string; is_active: number }[];
    expect(filas).toEqual([
      { name: 'Vieja', is_active: 1 },
      { name: 'Nueva', is_active: 0 }
    ]);
    expect(nueva.isActive).toBe(true); // lo que devolvio el alta, antes del cambio
  });
});

describe('POST /test-connection', () => {
  it('la config guardada se prueba con el JSON dado, y el estado queda en la fila', async () => {
    const config = await crearConfig(alice, 'Local');
    stubDelProveedor('{"status":"ok","message":"conexión establecida"}');

    const respuesta = await call(alice, 'POST', '/test-connection', { configId: config.id });
    expect(respuesta.status).toBe(200);
    const cuerpo = await data(respuesta);
    expect(cuerpo.success).toBe(true);
    expect(cuerpo.model).toBe('gpt-5');
    expect(typeof cuerpo.latency).toBe('number');

    const fila = db
      .prepare('SELECT test_status, test_error FROM ai_configs WHERE id = ?')
      .get(config.id) as { test_status: string | null; test_error: string | null };
    expect(fila.test_status).toBe('success');
    expect(fila.test_error).toBeNull();
  });

  it('el modelo que no devuelve el JSON pedido suspende la prueba, con su error en la fila', async () => {
    const config = await crearConfig(alice, 'Local');
    stubDelProveedor('Hello! How can I help you today?');

    const respuesta = await call(alice, 'POST', '/test-connection', { configId: config.id });
    const cuerpo = await data(respuesta);
    expect(cuerpo.success).toBe(false);
    expect(cuerpo.error).toContain('no devolvió el JSON pedido');

    const fila = db
      .prepare('SELECT test_status, test_error FROM ai_configs WHERE id = ?')
      .get(config.id) as { test_status: string | null; test_error: string | null };
    expect(fila.test_status).toBe('failed');
    expect(fila.test_error).toContain('no devolvió el JSON pedido');
  });

  it('se puede probar desde el formulario (sin guardar): el veredicto si, la fila no', async () => {
    stubDelProveedor('{"status":"ok","message":"conexión establecida"}');

    const respuesta = await call(alice, 'POST', '/test-connection', {
      baseUrl: 'http://localhost:9',
      apiKey: 'sk-x',
      model: 'gpt-5'
    });
    expect(respuesta.status).toBe(200);
    const cuerpo = await data(respuesta);
    expect(cuerpo.success).toBe(true);

    // Sin configId no hay fila que tocar: la casa aun no ha guardado nada.
    expect((db.prepare('SELECT COUNT(*) AS n FROM ai_configs').get() as { n: number }).n).toBe(0);
  });

  it('sin configId y sin datos de formulario no hay prueba que hacer', async () => {
    const respuesta = await call(alice, 'POST', '/test-connection', {});
    expect(respuesta.status).toBe(400);
  });
});

const recetaGenerada = {
  name: 'Lentejas de prueba',
  description: 'Una receta determinista de prueba.',
  difficulty: 'easy',
  cuisine: 'Mediterránea',
  totalTime: 30,
  prepTime: 10,
  cookTime: 20,
  restTime: null,
  servings: 2,
  calories: 420,
  ingredients: [
    { name: 'lentejas', quantity: 200, unit: 'g', preparation: '', isOptional: false, notes: '' }
  ],
  utensils: ['Olla'],
  instructionsByLevel: {
    basic: [
      { stepNumber: 1, instruction: 'Cocer las lentejas.', duration: 20, tips: '', warning: '' }
    ],
    intermediate: [
      {
        stepNumber: 1,
        instruction: 'Sofreír y cocer las lentejas hasta que estén tiernas.',
        duration: 20,
        tips: '',
        warning: ''
      }
    ],
    expert: [
      {
        stepNumber: 1,
        instruction: 'Sofreír a fuego medio y cocer a hervor suave hasta textura al dente.',
        duration: 20,
        tips: '',
        warning: ''
      }
    ]
  },
  nutrition: { calories: 420, protein: 24, carbs: 60, fat: 8, fiber: 14 },
  storage: {
    method: 'Refrigerar',
    duration: '3 días',
    reheating: 'Calentar',
    container: null,
    freezingPossible: true,
    freezingDuration: '3 meses'
  },
  tags: ['vegetariana']
};

const recetaConInstruccionesPorNivel = {
  ...recetaGenerada,
  instructionsByLevel: {
    basic: recetaGenerada.instructionsByLevel.basic,
    intermediate: recetaGenerada.instructionsByLevel.intermediate.map((step) => ({
      ...step,
      instruction: 'Sofreír las verduras y cocer las lentejas con el caldo.'
    })),
    expert: recetaGenerada.instructionsByLevel.expert.map((step) => ({
      ...step,
      instruction: 'Sofreír a fuego medio y cocer a hervor suave hasta textura al dente.'
    }))
  }
};

const peticionGeneracion = {
  ingredients: [{ id: 'lentils', name: 'lentejas', quantity: 200, unit: 'g' }],
  utensils: [{ id: 'pot', name: 'Olla', available: true }],
  servings: 2,
  difficulty: 'easy',
  detailLevel: 'basic',
  dietaryRestrictions: ['vegetariana'],
  allergies: ['cacahuete'],
  preferences: ['picante'],
  cookingTime: { min: 20, max: 35 }
};

function stubRecipeProvider(
  responseForCall: (callIndex: number) => Response = () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(recetaGenerada) } }] }),
      { status: 200 }
    )
) {
  const requests: Array<{ url: string; body: string }> = [];
  vi.stubGlobal('fetch', (async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    requests.push({ url: String(input), body: String(init?.body ?? '') });
    return responseForCall(requests.length);
  }) as typeof fetch);
  return requests;
}

function recipeCount(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM recipes').get() as { count: number }).count;
}

describe('POST /generate-recipe y /generate-multiple-recipes', () => {
  it('single rechaza la respuesta si falta un nivel de instrucciones', async () => {
    await crearConfig(alice, 'Proveedor sin retries', 'http://ai.test/v1', 0);
    const requests = stubRecipeProvider(
      () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    ...recetaGenerada,
                    instructionsByLevel: {
                      basic: recetaGenerada.instructionsByLevel.basic
                    }
                  })
                }
              }
            ]
          }),
          { status: 200 }
        )
    );

    const response = await call(alice, 'POST', '/generate-recipe', peticionGeneracion);
    const result = await json(response);

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty('data');
    expect(requests).toHaveLength(1);
    expect(recipeCount()).toBe(0);
  });

  it('single devuelve todas las instrucciones y la selección inicial en una llamada', async () => {
    await crearConfig(alice, 'Proveedor sin retries', 'http://ai.test/v1', 0);
    const requests = stubRecipeProvider(
      () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(recetaConInstruccionesPorNivel) } }]
          }),
          { status: 200 }
        )
    );

    const response = await call(alice, 'POST', '/generate-recipe', peticionGeneracion);
    const result = await json(response);

    expect(response.status).toBe(200);
    expect(result.data.instructionsByLevel).toEqual(
      recetaConInstruccionesPorNivel.instructionsByLevel
    );
    expect(result.data.selectedDetailLevel).toBe('basic');
    expect(result.data).not.toHaveProperty('steps');
    expect(requests).toHaveLength(1);
    const prompt = JSON.parse(requests[0].body).messages[1].content as string;
    expect(prompt).toContain('genera SIEMPRE los tres niveles completos');
    expect(recipeCount()).toBe(0);
  });

  it('single devuelve un borrador con el prompt vigente y no crea filas', async () => {
    await crearConfig(alice, 'Proveedor de prueba', 'http://ai.test/v1');
    const requests = stubRecipeProvider();

    const response = await call(alice, 'POST', '/generate-recipe', peticionGeneracion);
    const result = await json(response);

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject(recetaGenerada);
    expect(result.data).not.toHaveProperty('id');
    expect(recipeCount()).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('http://ai.test/v1/chat/completions');
    const providerBody = JSON.parse(requests[0].body);
    const prompt = providerBody.messages[1].content as string;
    expect(prompt).toContain('Ingredientes disponibles: 200 g de lentejas');
    expect(prompt).toContain('Utensilios disponibles: Olla');
    expect(prompt).toContain('Porciones: 2');
    expect(prompt).toContain('Dificultad: easy');
    expect(prompt).toContain('Nivel seleccionado al abrir la ficha: basic');
    expect(prompt).toContain('genera SIEMPRE los tres niveles completos');
    expect(prompt).toContain('Restricciones dietéticas: vegetariana');
    expect(prompt).toContain('Alergias: cacahuete');
    expect(prompt).toContain('Preferencias: picante');
    expect(prompt).toContain('Tiempo de cocción: entre 20 y 35 minutos');
  });

  it('multiple genera exactamente las candidatas pedidas mediante el proveedor y no persiste ninguna', async () => {
    await crearConfig(alice, 'Proveedor de prueba', 'http://ai.test/v1');
    const requests = stubRecipeProvider((callIndex) => {
      const recipe = {
        ...recetaGenerada,
        name: `Receta ${callIndex}`,
        ingredients: recetaGenerada.ingredients.map((ingredient) => ({
          ...ingredient,
          name: `ingrediente ${callIndex}`
        })),
        instructionsByLevel: {
          basic: recetaGenerada.instructionsByLevel.basic.map((step) => ({
            ...step,
            instruction: `Preparar receta ${callIndex} en versión basic.`
          })),
          intermediate: recetaGenerada.instructionsByLevel.intermediate.map((step) => ({
            ...step,
            instruction: `Preparar receta ${callIndex} en versión intermediate.`
          })),
          expert: recetaGenerada.instructionsByLevel.expert.map((step) => ({
            ...step,
            instruction: `Preparar receta ${callIndex} en versión expert.`
          }))
        }
      };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(recipe) } }] }),
        { status: 200 }
      );
    });

    const response = await call(alice, 'POST', '/generate-multiple-recipes', {
      ...peticionGeneracion,
      count: 3
    });
    const result = await json(response);

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(3);
    expect(result.data.map((recipe: { name: string }) => recipe.name)).toEqual([
      'Receta 1',
      'Receta 2',
      'Receta 3'
    ]);
    expect(requests).toHaveLength(3);
    expect(requests.every(({ url }) => url === 'http://ai.test/v1/chat/completions')).toBe(true);
    expect(recipeCount()).toBe(0);
  });

  it('multiple devuelve un borrador completo y utilizable con retries desactivados', async () => {
    await crearConfig(alice, 'Proveedor sin retries', 'http://ai.test/v1', 0);
    const requests = stubRecipeProvider();

    const response = await call(alice, 'POST', '/generate-multiple-recipes', {
      ...peticionGeneracion,
      count: 1
    });
    const result = await json(response);

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      name: recetaGenerada.name,
      description: recetaGenerada.description,
      difficulty: 'easy',
      totalTime: 30,
      prepTime: 10,
      cookTime: 20,
      servings: 2,
      ingredients: [{ name: 'lentejas', quantity: 200, unit: 'g' }],
      instructionsByLevel: recetaGenerada.instructionsByLevel
    });
    expect(requests).toHaveLength(1);
    expect(recipeCount()).toBe(0);
  });

  it('multiple rechaza un JSON insuficiente en lugar de devolver un candidato parcial', async () => {
    await crearConfig(alice, 'Proveedor sin retries', 'http://ai.test/v1', 0);
    const requests = stubRecipeProvider(
      () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ name: 'Solo el título' }) } }]
          }),
          { status: 200 }
        )
    );

    const response = await call(alice, 'POST', '/generate-multiple-recipes', {
      ...peticionGeneracion,
      count: 2
    });
    const result = await json(response);

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty('data');
    expect(requests).toHaveLength(1);
    expect(recipeCount()).toBe(0);
  });

  it('multiple rechaza una receta duplicada por contenido aunque el título cambie', async () => {
    await crearConfig(alice, 'Proveedor sin retries', 'http://ai.test/v1', 0);
    const requests = stubRecipeProvider(() => {
      const isSecondCall = requests.length !== 1;
      const recipe = {
        ...recetaGenerada,
        name: isSecondCall ? 'Guiso rústico de lentejas' : 'Lentejas mediterráneas',
        ingredients: [
          {
            ...recetaGenerada.ingredients[0],
            name: isSecondCall ? 'LÉNTEJAS' : 'lentejas'
          }
        ],
        instructionsByLevel: {
          basic: [
            {
              ...recetaGenerada.instructionsByLevel.basic[0],
              instruction: isSecondCall ? 'COCER las lentejas!!!' : 'Cocer las lentejas.'
            }
          ],
          intermediate: [
            {
              ...recetaGenerada.instructionsByLevel.intermediate[0],
              instruction: isSecondCall
                ? 'SOFREÍR y cocer las lentejas hasta que estén tiernas!!!'
                : 'Sofreír y cocer las lentejas hasta que estén tiernas.'
            }
          ],
          expert: [
            {
              ...recetaGenerada.instructionsByLevel.expert[0],
              instruction: isSecondCall
                ? 'SOFREÍR a fuego medio y cocer a hervor suave hasta textura al dente!!!'
                : 'Sofreír a fuego medio y cocer a hervor suave hasta textura al dente.'
            }
          ]
        }
      };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(recipe) } }] }),
        { status: 200 }
      );
    });

    const response = await call(alice, 'POST', '/generate-multiple-recipes', {
      ...peticionGeneracion,
      count: 2
    });
    const result = await json(response);

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty('data');
    expect(requests).toHaveLength(2);
    expect(recipeCount()).toBe(0);
  });

  it('multiple devuelve dos candidatas completas y distintas con una llamada por candidata', async () => {
    await crearConfig(alice, 'Proveedor sin retries', 'http://ai.test/v1', 0);
    const requests = stubRecipeProvider((callIndex) => {
      const recipe = {
        ...recetaGenerada,
        name: callIndex === 1 ? 'Lentejas mediterráneas' : 'Garbanzos al horno',
        ingredients: [
          {
            ...recetaGenerada.ingredients[0],
            name: callIndex === 1 ? 'lentejas' : 'garbanzos'
          },
          {
            ...recetaGenerada.ingredients[0],
            name: callIndex === 1 ? 'zanahoria' : 'calabacín'
          }
        ],
        instructionsByLevel: {
          basic: recetaGenerada.instructionsByLevel.basic.map((step) => ({
            ...step,
            instruction: callIndex === 1 ? 'Cocer las lentejas.' : 'Hornear los garbanzos.'
          })),
          intermediate: recetaGenerada.instructionsByLevel.intermediate.map((step) => ({
            ...step,
            instruction: callIndex === 1 ? 'Sofreír las lentejas.' : 'Dorar los garbanzos.'
          })),
          expert: recetaGenerada.instructionsByLevel.expert.map((step) => ({
            ...step,
            instruction:
              callIndex === 1
                ? 'Cocer las lentejas a hervor suave.'
                : 'Asar los garbanzos a temperatura controlada.'
          }))
        }
      };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(recipe) } }] }),
        { status: 200 }
      );
    });

    const response = await call(alice, 'POST', '/generate-multiple-recipes', {
      ...peticionGeneracion,
      count: 2
    });
    const result = await json(response);

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].ingredients[0].name).toBe('lentejas');
    expect(result.data[1].ingredients[0].name).toBe('garbanzos');
    expect(result.data[0].instructionsByLevel.basic[0].instruction).not.toBe(
      result.data[1].instructionsByLevel.basic[0].instruction
    );
    expect(requests).toHaveLength(2);
    expect(recipeCount()).toBe(0);
  });

  it('un fallo del proveedor no se oculta como lista vacía ni éxito parcial', async () => {
    await crearConfig(alice, 'Proveedor de prueba', 'http://ai.test/v1');
    const requests = stubRecipeProvider((callIndex) =>
      callIndex === 1
        ? new Response(
            JSON.stringify({ choices: [{ message: { content: JSON.stringify(recetaGenerada) } }] }),
            { status: 200 }
          )
        : new Response('provider unavailable', { status: 503 })
    );

    const response = await call(alice, 'POST', '/generate-multiple-recipes', {
      ...peticionGeneracion,
      count: 3
    });
    const result = await json(response);

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty('data', []);
    expect(requests).toHaveLength(5);
    expect(recipeCount()).toBe(0);
  });

  it('single reporta el error del proveedor y no persiste una receta', async () => {
    await crearConfig(alice, 'Proveedor de prueba', 'http://ai.test/v1');
    const requests = stubRecipeProvider(
      () => new Response('provider unavailable', { status: 503 })
    );

    const response = await call(alice, 'POST', '/generate-recipe', peticionGeneracion);
    const result = await json(response);

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(requests).toHaveLength(4);
    expect(recipeCount()).toBe(0);
  });

  it('multiple falla si el proveedor no produce ninguna candidata utilizable', async () => {
    await crearConfig(alice, 'Proveedor de prueba', 'http://ai.test/v1');
    const requests = stubRecipeProvider(
      () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ ...recetaGenerada, name: ' ' }) } }]
          }),
          { status: 200 }
        )
    );

    const response = await call(alice, 'POST', '/generate-multiple-recipes', {
      ...peticionGeneracion,
      count: 3
    });
    const result = await json(response);

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result.data ?? []).toHaveLength(0);
    expect(requests).toHaveLength(1);
    expect(recipeCount()).toBe(0);
  });

  it('una respuesta sin receta útil falla y no devuelve un borrador vacío', async () => {
    await crearConfig(alice, 'Proveedor de prueba', 'http://ai.test/v1');
    stubRecipeProvider(
      () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })
    );

    const response = await call(alice, 'POST', '/generate-recipe', peticionGeneracion);
    const result = await json(response);

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(recipeCount()).toBe(0);
  });
});

describe('POST /recommendations y /plan-week', () => {
  it('devuelve recomendaciones usando comidas recientes, ingredientes y preferencias', async () => {
    const recommendations = [
      {
        name: 'Sopa de tomate',
        reason: 'Aprovecha lo disponible',
        ingredients: ['tomate'],
        estimatedTime: 20
      }
    ];
    await crearConfig(alice, 'Proveedor sin retries', 'http://ai.test/v1', 0);
    const requests = stubRecipeProvider(
      () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ recommendations }) } }]
          }),
          { status: 200 }
        )
    );

    const response = await call(alice, 'POST', '/recommendations', {
      recentMeals: [{ date: '2026-10-02', meal: 'Pasta', recipeId: 'pasta-1' }],
      availableIngredients: ['tomate'],
      householdPreferences: { likes: ['sopa'], dislikes: ['picante'], allergies: ['nuez'] },
      count: 1
    });
    const result = await json(response);

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(recommendations);
    expect(requests).toHaveLength(1);
    const prompt = JSON.parse(requests[0].body).messages[1].content as string;
    expect(prompt).toContain('2026-10-02: Pasta');
    expect(prompt).toContain('Ingredientes disponibles: tomate');
    expect(prompt).toContain('Likes=sopa, Dislikes=picante, Alergias=nuez');
  });

  it('persiste el plan semanal solicitado y respeta solo las comidas elegidas', async () => {
    const plan = {
      days: [
        {
          date: '2026-10-05',
          meals: { dinner: { name: 'Cena QA', ingredients: ['Tomate'], time: 0 } },
          totalCalories: 180
        }
      ],
      shoppingList: ['Tomate']
    };
    await crearConfig(alice, 'Proveedor sin retries', 'http://ai.test/v1', 0);
    const requests = stubRecipeProvider(
      () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }),
          { status: 200 }
        )
    );

    const response = await call(alice, 'POST', '/plan-week', {
      startDate: '2026-10-05',
      endDate: '2026-10-05',
      goals: { type: 'balanced', caloriesTarget: 2000, customInstructions: 'Prioriza sencillez' },
      availableIngredients: ['Tomate'],
      mealTypes: ['dinner'],
      householdPreferences: { likes: ['casero'], dislikes: ['picante'] }
    });
    const result = await json(response);

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.days).toEqual(plan.days);
    expect(result.data.saved.created).toBe(1);
    expect(result.data.saved.skipped).toBe(0);
    expect(requests).toHaveLength(1);
    const prompt = JSON.parse(requests[0].body).messages[1].content as string;
    expect(prompt).toContain('Indicaciones del usuario (prioritarias): Prioriza sencillez');
    expect(prompt).toContain('Ingredientes disponibles: Tomate');
    expect(prompt).toContain('Preferencias: Likes=casero, Dislikes=picante');
    expect(prompt).toContain('Planifica SOLO estas comidas: dinner');
    expect(prompt).not.toContain('"breakfast":');

    const persisted = db
      .prepare(
        `SELECT m.date, m.meal_type, m.custom_meal, m.notes
         FROM meals m
         INNER JOIN weekly_calendars c ON c.id = m.calendar_id
         WHERE c.user_id = ?`
      )
      .get(alice.id) as
      { date: string; meal_type: string; custom_meal: string; notes: string } | undefined;
    expect(persisted).toEqual({
      date: '2026-10-05',
      meal_type: 'dinner',
      custom_meal: 'Cena QA',
      notes: 'Ingredientes: Tomate'
    });
  });

  it('rechaza un plan cuando todas las comidas están bloqueadas sin llamar al proveedor', async () => {
    db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(
      JSON.stringify({
        mealPlan: { breakfast: false, lunch: false, snack: false, dinner: false }
      }),
      alice.id
    );
    const requests = stubRecipeProvider();

    const response = await call(alice, 'POST', '/plan-week', {
      startDate: '2026-10-05',
      endDate: '2026-10-05',
      goals: { type: 'balanced' },
      mealTypes: ['dinner']
    });
    const result = await json(response);

    expect(response.status).toBe(400);
    expect(result.success).toBe(false);
    expect(result.code).toBe('MEAL_PLAN_ALL_BLOCKED');
    expect(requests).toHaveLength(0);
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM weekly_calendars WHERE user_id = ?').get(alice.id)
    ).toEqual({ count: 0 });
  });
});
