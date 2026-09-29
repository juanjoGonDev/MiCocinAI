import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiCallError,
  activeAiConfig,
  callAI,
  callAIStreaming,
  endpoint,
  extractJsonObject,
  pingDeConexion
} from './ai-client.js';

/**
 * El unico sitio que habla con un proveedor de IA tiene que fallar con nombres y
 * apellidos: «no hay configuracion», «el proveedor ha contestado mal» y «el modelo
 * no ha contestado JSON» son tres pantallas distintas para quien esta delante.
 *
 * No se toca la red: `globalThis.fetch` se sustituye por una funcion, que es lo que
 * el server usa de todas formas (fetch nativo de Node), y asi se puede ver tambien
 * el body que sale.
 */

function dbWith(rows: Record<string, any[]>) {
  return {
    prepare: (sql: string) => ({
      get: (...params: unknown[]) => {
        const table = /FROM (\w+)/.exec(sql)?.[1] ?? '';
        const list = rows[table] ?? [];
        if (table === 'ai_configs') {
          const [userId] = params as string[];
          return list.find((row) => row.user_id === userId && row.is_active === 1);
        }
        return list[0];
      },
      all: () => [],
      run: () => ({ changes: 0 })
    })
  } as any;
}

const CONFIG = {
  id: 'ai-1',
  user_id: 'u-1',
  is_active: 1,
  name: 'Local',
  provider: 'openai',
  base_url: 'https://ai.local/v1/',
  api_key: 'clave',
  model: 'gpt-vision',
  temperature: 0.2,
  max_tokens: 900,
  top_p: null,
  frequency_penalty: null,
  presence_penalty: null,
  timeout: 1234
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('activeAiConfig', () => {
  it('solo vale la fila activa de la propia cuenta', () => {
    const db = dbWith({ ai_configs: [CONFIG, { ...CONFIG, id: 'ai-2', is_active: 0 }] });
    expect(activeAiConfig(db, 'u-1')?.id).toBe('ai-1');
    expect(activeAiConfig(db, 'otro')).toBeUndefined();
  });
});

describe('callAI', () => {
  it('manda la config de la UI en el body, con la barra final normalizada', async () => {
    const seen: { url: string; init: any }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    const out = await callAI(
      'u-1',
      [{ role: 'user', content: 'hola' }],
      dbWith({ ai_configs: [CONFIG] })
    );

    expect(out).toBe('{"ok":true}');
    // `base_url` acabado en `/` no debe producir `//chat/completions`
    expect(seen[0].url).toBe('https://ai.local/v1/chat/completions');
    const body = JSON.parse(seen[0].init.body);
    expect(body).toMatchObject({ model: 'gpt-vision', temperature: 0.2, max_tokens: 900 });
    expect(seen[0].init.headers.Authorization).toBe('Bearer clave');
  });

  it('sin configuracion activa NO es un error del proveedor', async () => {
    await expect(callAI('u-x', [], dbWith({ ai_configs: [] }))).rejects.toMatchObject({
      code: 'NO_CONFIG'
    });
  });

  it('un 500 del proveedor se propaga con su cuerpo recortado', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('upstream exploded ' + 'x'.repeat(600), {
          status: 502,
          statusText: 'Bad Gateway'
        })
    );
    const error = await callAI('u-1', [], dbWith({ ai_configs: [CONFIG] })).catch((e) => e);
    expect(error).toBeInstanceOf(AiCallError);
    expect(error.code).toBe('PROVIDER');
    expect(error.message).toContain('upstream exploded');
    expect(error.detail).toHaveLength(400);
  });

  it('una respuesta sin choices se dice como respuesta mala, no como fallo de red', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })
    );
    await expect(callAI('u-1', [], dbWith({ ai_configs: [CONFIG] }))).rejects.toMatchObject({
      code: 'BAD_JSON'
    });
  });

  it('un fetch que revienta (DNS, timeout) es PROVIDER o TIMEOUT, y no se traga el motivo', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('The operation was aborted due to timeout');
    });
    await expect(callAI('u-1', [], dbWith({ ai_configs: [CONFIG] }))).rejects.toMatchObject({
      code: 'TIMEOUT'
    });
  });
});

describe('extractJsonObject', () => {
  it('lee el objeto tal cual', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('sobrevive al ```json que tantos modelos escriben', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('recorta la prosa de alrededor', () => {
    expect(extractJsonObject('Claro, aqui tienes:\n{"a":1}\n¿Te ayudo con algo más?')).toEqual({
      a: 1
    });
  });

  it('si no hay objeto, el error trae lo que contesto el modelo', () => {
    const error = (() => {
      try {
        extractJsonObject('no veo ninguna lista en la imagen');
        return null;
      } catch (e) {
        return e as AiCallError;
      }
    })();
    expect(error?.code).toBe('BAD_JSON');
    expect(error?.detail).toContain('no veo ninguna lista');
  });

  it('un objeto roto no se disfraza de vacio', () => {
    // Sin llave de cierre no hay ni donde mirar: BAD_JSON por ausencia de objeto...
    expect(() => extractJsonObject('{"a":')).toThrowError(/Invalid AI response format/);
    // ...y con ella pero mal formado (lo tipico de un modelo cortado por
    // max_tokens) tambien, con el parseo original en el detalle para poder
    // diagnosticar sin re-ejecutar la llamada.
    const error = (() => {
      try {
        // La llave de mas es lo que deja el greedy `\{...\}` con un JSON ya
        // inservible: el objeto «existe», pero no se puede leer.
        extractJsonObject('{"a": 1, "b": 2}}');
        return null;
      } catch (e) {
        return e as AiCallError;
      }
    })();
    expect(error?.code).toBe('BAD_JSON');
    expect(error?.detail).toContain('{"a": 1');
    // La coma suelta que sueltos los modelos cortados por `max_tokens`: el detalle
    // tiene que decir QUE caducidad del JSON es, no solo «formato malo».
    expect(error?.message).toContain('Invalid AI response format');
  });
});

/** Un cuerpo SSE de mentira: lo que devuelve un proveedor en modo stream. */
// El tsconfig del server no declara los globals de web streams: la clase se importa de
// node:stream/web, que es de donde sale el objeto de todas formas.
function sse(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller: { enqueue: (trozo: Uint8Array) => void; close: () => void }) {
      if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++]));
      else controller.close();
    }
  });
}

describe('callAIStreaming', () => {
  it('va entregando cada delta y devuelve el texto entero, con [DONE] y ruido de por medio', async () => {
    const deltas: string[] = [];
    const seen: { url: string; body: any }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      seen.push({ url, body: JSON.parse(init.body) });
      return new Response(
        sse([
          'data: ' + JSON.stringify({ choices: [{ delta: { content: '{\"lines\":[' } }] }) + '\n',
          ': keep-alive\n\n',
          'data: no soy json\n',
          'data: ' +
            JSON.stringify({ choices: [{ delta: { content: '{\"name\":\"Leche\"}' } }] }) +
            '\n',
          'data: [DONE]\n'
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
    });

    const texto = await callAIStreaming(
      'u-1',
      [{ role: 'user', content: 'lee' }],
      dbWith({ ai_configs: [CONFIG] }),
      (delta) => deltas.push(delta),
      new AbortController().signal
    );

    expect(texto).toBe('{"lines":[{"name":"Leche"}');
    expect(deltas).toEqual(['{"lines":[', '{"name":"Leche"}']);
    // El stream va de verdad en el body, y la senal de abort viaja con el fetch.
    expect(seen[0].body.stream).toBe(true);
  });

  it('sin configuracion activa, NO_CONFIG (la cola lo traduce por «configura la IA»)', async () => {
    await expect(
      callAIStreaming(
        'u-x',
        [],
        dbWith({ ai_configs: [] }),
        () => undefined,
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'NO_CONFIG' });
  });

  it('un 4xx/5xx del proveedor es PROVIDER con el cuerpo recortado', async () => {
    vi.stubGlobal('fetch', async () => new Response('boom ' + 'y'.repeat(500), { status: 500 }));
    const error = await callAIStreaming(
      'u-1',
      [],
      dbWith({ ai_configs: [CONFIG] }),
      () => undefined,
      new AbortController().signal
    ).catch((e) => e);
    expect(error).toBeInstanceOf(AiCallError);
    expect(error.code).toBe('PROVIDER');
    expect(error.detail).toHaveLength(400);
  });

  it('un stream que no trajo nada de texto es BAD_JSON, no un exito silencioso', async () => {
    vi.stubGlobal('fetch', async () => new Response(sse(['data: [DONE]\n']), { status: 200 }));
    await expect(
      callAIStreaming(
        'u-1',
        [],
        dbWith({ ai_configs: [CONFIG] }),
        () => undefined,
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'BAD_JSON' });
  });

  it('la senal abortada a mitad de stream corta la lectura con PROVIDER/Cancelado', async () => {
    const control = new AbortController();
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          sse([
            'data: ' + JSON.stringify({ choices: [{ delta: { content: 'primer trozo' } }] }) + '\n',
            'data: ' + JSON.stringify({ choices: [{ delta: { content: ' segundo' } }] }) + '\n'
          ]),
          { status: 200 }
        )
    );
    const error = await callAIStreaming(
      'u-1',
      [],
      dbWith({ ai_configs: [CONFIG] }),
      () => control.abort(),
      control.signal
    ).catch((e) => e);
    expect(error).toBeInstanceOf(AiCallError);
    expect(error.code).toBe('PROVIDER');
    expect(error.detail).toBe('CANCELLED');
  });

  it('un fetch que revienta con abort/timeout es TIMEOUT', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('The operation was aborted due to timeout');
    });
    await expect(
      callAIStreaming(
        'u-1',
        [],
        dbWith({ ai_configs: [CONFIG] }),
        () => undefined,
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});


// ── El endpoint tolerante y la prueba de conexion (revision a peticion del usuario) ──────

describe('endpoint', () => {
  it('la base sin camino se completa con el /v1 del convenio OpenAI-compatible', () => {
    expect(endpoint('http://localhost:8000')).toBe('http://localhost:8000/v1/chat/completions');
  });

  it('la base que ya trae su version se respeta, barra final incluida', () => {
    expect(endpoint('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/chat/completions');
    expect(endpoint('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1/chat/completions');
    expect(endpoint('http://x/api/v2')).toBe('http://x/api/v2/chat/completions');
  });

  it('la URL completa hasta chat/completions se usa tal cual', () => {
    expect(endpoint('https://x/proxy/chat/completions')).toBe('https://x/proxy/chat/completions');
  });
});

describe('callAI: el cuerpo lleva solo lo configurado', () => {
  it('los parametros en null no viajan: un proveedor estricto no recibe basura', async () => {
    const db = dbWith({
      ai_configs: [
        { ...CONFIG, temperature: null, max_tokens: null, top_p: null, frequency_penalty: null, presence_penalty: null }
      ]
    });
    let cuerpo: any;
    vi.stubGlobal(
      'fetch',
      async (_url: string, init: RequestInit) => {
        cuerpo = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
      }
    );
    await callAI('u-1', [{ role: 'user', content: 'hola' }], db);
    vi.unstubAllGlobals();
    expect(cuerpo).toEqual({ model: CONFIG.model, messages: [{ role: 'user', content: 'hola' }] });
  });

  it('los parametros con valor si viajan', async () => {
    const db = dbWith({ ai_configs: [{ ...CONFIG, temperature: 0.2, max_tokens: 500 }] });
    let cuerpo: any;
    vi.stubGlobal(
      'fetch',
      async (_url: string, init: RequestInit) => {
        cuerpo = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
      }
    );
    await callAI('u-1', [{ role: 'user', content: 'hola' }], db);
    vi.unstubAllGlobals();
    expect(cuerpo.temperature).toBe(0.2);
    expect(cuerpo.max_tokens).toBe(500);
  });
});

describe('pingDeConexion', () => {
  const respuesta = (content: unknown, status = 200) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });

  it('pide el JSON dado con response_format de esquema estricto, y lo valida', async () => {
    let cuerpo: any;
    vi.stubGlobal(
      'fetch',
      async (_url: string, init: RequestInit) => {
        cuerpo = JSON.parse(String(init.body));
        return respuesta('{"status":"ok","message":"conexión establecida"}');
      }
    );
    const veredicto = await pingDeConexion({ base_url: 'http://x:8000', api_key: 'k', model: 'gpt-5' });
    vi.unstubAllGlobals();
    expect(veredicto.ok).toBe(true);
    // El contrato del proveedor, como el ejemplo del usuario: json_schema estricto.
    expect(cuerpo.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'connection_test', strict: true, schema: expect.any(Object) }
    });
    // Y nada de max_tokens ni temperature en una prueba de un segundo.
    expect(cuerpo.max_tokens).toBeUndefined();
    expect(cuerpo.temperature).toBeUndefined();
  });

  it('un «Hello» ambiguo ya no vale: el modelo tiene que devolver el JSON pedido', async () => {
    vi.stubGlobal('fetch', async () => respuesta('Hello! How can I help you today?'));
    const veredicto = await pingDeConexion({ base_url: 'http://x/v1', api_key: 'k', model: 'm' });
    vi.unstubAllGlobals();
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.error).toContain('no devolvió el JSON pedido');
  });

  it('un 400 del proveedor se cuenta con su texto', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('{"error":"max_tokens is not supported"}', { status: 400 })
    );
    const veredicto = await pingDeConexion({ base_url: 'http://x/v1', api_key: 'k', model: 'm' });
    vi.unstubAllGlobals();
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.error).toContain('max_tokens is not supported');
  });

  it('la red caida es un veredicto, no una excepcion', async () => {
    vi.stubGlobal(
      'fetch',
      async () => {
        throw new Error('fetch failed');
      }
    );
    const veredicto = await pingDeConexion({ base_url: 'http://x/v1', api_key: 'k', model: 'm' });
    vi.unstubAllGlobals();
    expect(veredicto.ok).toBe(false);
  });
});
