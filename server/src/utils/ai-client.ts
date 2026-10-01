/**
 * El unico sitio del server que habla con un proveedor de IA (HOGARIA-SPEC §8f).
 *
 * Estaba dentro de `ai.routes.ts`, que es lo que pasa cuando una funcion se escribe
 * para una pantalla y luego la quiere una segunda: la copia se separa en el
 * tratamiento del error, y el segundo sitio es el que se entera tarde. De ahi que
 * aqui se devuelvan codigos, no frases: quien llama decide si el problema es suyo
 * (no hay configuracion), del proveedor (cayo, tardo) o del modelo (no contesto
 * JSON), y son tres avisos muy distintos para quien esta delante de la pantalla.
 */

import { z } from 'zod';

export type AiMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export type AiMessage = { role: 'system' | 'user' | 'assistant'; content: string | AiMessagePart[] };

export interface AiConfigRow {
  id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  temperature: number | null;
  max_tokens: number | null;
  top_p: number | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
  timeout: number | null;
  /** Máximo de trabajos IA en vuelo para esta configuración; 0 = ilimitado. */
  concurrency: number | null;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Se tipa con el tipo real y no con un estructural: el `prepare` de better-sqlite3
 *  tiene firmas que un `get(...p: unknown[])` suelto no satisfacen. */
type SqlDb = import('better-sqlite3').Database;

export type AiErrorCode = 'NO_CONFIG' | 'PROVIDER' | 'BAD_JSON' | 'TIMEOUT';

export class AiCallError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = 'AiCallError';
  }
}

/** La fila activa de `ai_config`: se lee siempre desde la BD, no se guarda en memoria. */
export function activeAiConfig(db: SqlDb, userId: string) {
  return db
    .prepare('SELECT * FROM ai_configs WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1')
    .get(userId) as AiConfigRow | undefined;
}

export function endpoint(baseUrl: string): string {
  // Una barra de mas en el `base_url` escrito a mano en Ajustes es lo normal; normalizar aqui
  // evita que cada llamante tenga que acordarse. Y el camino: el convenio OpenAI-compatible
  // (OpenAI, Ollama, LM Studio, vLLM, la webapi de la casa…) sirve en `/v1/chat/completions`,
  // asi que una base SIN camino (⌜http://host:8000⌋) se completa con el `/v1`; si la base ya
  // trae su version (⌜…/v1⌋) se respeta; y quien escriba la URL completa tambien. Antes una
  // base sin `/v1` producia un 404 silencioso y la IA «no se activaba nunca» siendo la
  // configuracion correcta.
  const base = String(baseUrl).trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v\d+[a-z]*$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/**
 * El cuerpo de la llamada se construye UNA vez: solo viaja lo que la casa configuro de verdad.
 * Mandar `temperature: null` (o cualquier parametro que el modelo no admite) es la forma mas
 * rapida de que un proveedor estricto conteste 400 a una configuracion perfecta.
 */
function chatBody(active: AiConfigRow, extra: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = { model: active.model, ...extra };
  for (const [campo, valor] of Object.entries({
    temperature: active.temperature,
    max_tokens: active.max_tokens,
    top_p: active.top_p,
    frequency_penalty: active.frequency_penalty,
    presence_penalty: active.presence_penalty
  })) {
    if (valor !== null && valor !== undefined) body[campo] = valor;
  }
  return body;
}

/**
 * Llamada a `/chat/completions` con lo que el usuario configuro en la UI (nada de
 * variables de entorno). Devuelve el texto del primer choice.
 */
export async function callAI(userId: string, messages: AiMessage[], db: SqlDb): Promise<string> {
  const active = activeAiConfig(db, userId);
  if (!active) {
    throw new AiCallError('NO_CONFIG', 'No active AI configuration found');
  }

  let response: Response;
  try {
    response = await fetch(endpoint(active.base_url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${active.api_key}`
      },
      body: JSON.stringify(chatBody(active, { messages })),
      signal: AbortSignal.timeout(active.timeout ?? DEFAULT_TIMEOUT_MS)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timeout|abort/i.test(message);
    throw new AiCallError(timedOut ? 'TIMEOUT' : 'PROVIDER', `AI API error: ${message}`, message);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new AiCallError('PROVIDER', `AI API error: ${text.slice(0, 400)}`, text.slice(0, 400));
  }

  const payload = (await response.json()) as any;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AiCallError('BAD_JSON', 'Invalid AI response format', JSON.stringify(payload).slice(0, 200));
  }
  return content;
}

/**
 * La llamada en STREAMING (## 12aj): misma configuracion, misma forma de error, pero entrega el
 * texto a medida que el modelo lo escribe. Es lo que hace que las lineas del ticket se vayan
 * viendo «poco a poco»: quien llama recibe cada trozo y decide que hacer con el.
 *
 * Si el proveedor no soporta `stream` (responde un JSON normal, o un 4xx), se lanza el mismo
 * `AiCallError` de siempre: la cola decide si reintentar sin streaming —el error antes del
 * primer trozo significa «aqui no hay stream», y caer a `callAI` es un detalle de transporte,
 * no un cambio de reglas.
 */
export async function callAIStreaming(
  userId: string,
  messages: AiMessage[],
  db: SqlDb,
  onDelta: (texto: string) => void,
  senal: AbortSignal
): Promise<string> {
  const active = activeAiConfig(db, userId);
  if (!active) {
    throw new AiCallError('NO_CONFIG', 'No active AI configuration found');
  }

  let response: Response;
  try {
    response = await fetch(endpoint(active.base_url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${active.api_key}`
      },
      body: JSON.stringify({
        model: active.model,
        messages,
        temperature: active.temperature,
        max_tokens: active.max_tokens,
        top_p: active.top_p,
        frequency_penalty: active.frequency_penalty,
        presence_penalty: active.presence_penalty,
        stream: true
      }),
      signal: senal
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timeout|abort/i.test(message);
    throw new AiCallError(timedOut ? 'TIMEOUT' : 'PROVIDER', `AI API error: ${message}`, message);
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new AiCallError('PROVIDER', `AI API error: ${text.slice(0, 400)}`, text.slice(0, 400));
  }

  const decoder = new TextDecoder();
  let entero = '';
  let porProcesar = '';
  for await (const trozo of response.body) {
    if (senal.aborted) throw new AiCallError('PROVIDER', 'Cancelado', 'CANCELLED');
    porProcesar += decoder.decode(trozo, { stream: true });
    // El SSE llega en lineas «data: {...}» separadas por saltos; una linea «data: [DONE]» cierra.
    const lineas = porProcesar.split('\n');
    porProcesar = lineas.pop() ?? '';
    for (const linea of lineas) {
      const recorte = linea.trim();
      if (!recorte.startsWith('data:')) continue;
      const dato = recorte.slice(5).trim();
      if (!dato || dato === '[DONE]') continue;
      try {
        const delta = (JSON.parse(dato) as any)?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          entero += delta;
          onDelta(delta);
        }
      } catch {
        // Un trozo que no es JSON: los proveedores mandan comentarios y keep-alives; a otra cosa.
      }
    }
  }
  if (!entero) {
    throw new AiCallError('BAD_JSON', 'El stream no trajo nada de texto', '');
  }
  return entero;
}

/**
 * El modelo escribe a veces ```json ... ``` o añade una frase antes del objeto.
 * Se saca el objeto y se parsea; si no lo hay, el error lleva los primeros 200
 * caracteres para que el visor de logs permita ver QUE contesto, que es lo unico
 * que sirve cuando falla la interpretacion de una foto.
 */
export function extractJsonObject(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new AiCallError('BAD_JSON', 'Invalid AI response format', raw.slice(0, 200));
  }
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    throw new AiCallError(
      'BAD_JSON',
      'Invalid AI response format',
      // Sin ternario `instanceof`: `JSON.parse` siempre lanza un Error, y la rama
      // imposible es una linea que nadie va a cubrir jamas.
      `${String((error as Error)?.message ?? error)} · ${raw.slice(0, 200)}`
    );
  }
}


// ── La prueba de conexión (HOGARIA-SPEC ## 8f, revisada a peticion del usuario) ──────────

/** El JSON que se le PIDE al modelo: dado, pequenyo y sin ambiguedad. Un «Hello» probaba que
 *  el proveedor contestaba cualquier cosa; esto prueba lo que la app necesita de verdad —que
 *  respete un formato— porque TODAS las funciones de IA de la casa parsean JSON. */
export const TEST_ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'message'],
  properties: {
    status: { type: 'string', enum: ['ok'] },
    message: { type: 'string' }
  }
} as const;

export const testAnswerSchema = z.object({
  status: z.literal('ok'),
  message: z.string().min(1)
});

/**
 * La prueba: una llamada real con `response_format` de esquema estricto (el mismo contrato que
 * usa el resto de la app) y validacion de que la contestacion ES el JSON pedido. Devuelve el
 * veredicto con su latencia; quien llama decide si lo guarda en `ai_configs` (prueba de una
 * config guardada) o solo lo ensena (prueba desde el formulario, sin tocar nada).
 */
export async function pingDeConexion(config: {
  base_url: string;
  api_key: string;
  model: string;
  timeout?: number | null;
}): Promise<{ ok: true; latency: number; message: string } | { ok: false; latency: number; error: string }> {
  const startTime = Date.now();
  try {
    const response = await fetch(endpoint(config.base_url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`
      },
      // El cuerpo es el minimo del contrato del proveedor: modelo, mensajes y el formato. Nada
      // de `max_tokens` ni `temperature`, que los modelos de razonamiento rechazan y no aportan
      // nada a una prueba de un segundo.
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content:
              'Prueba de conexión. Devuelve exactamente este JSON y nada más: {"status":"ok","message":"conexión establecida"}'
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'connection_test',
            strict: true,
            schema: TEST_ANSWER_SCHEMA
          }
        }
      }),
      signal: AbortSignal.timeout(config.timeout ?? DEFAULT_TIMEOUT_MS)
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const error = (await response.text().catch(() => '')).slice(0, 400) || `HTTP ${response.status}`;
      return { ok: false, latency, error };
    }

    const payload = (await response.json().catch(() => null)) as any;
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return { ok: false, latency, error: 'La respuesta del proveedor no tiene la forma esperada (choices[0].message.content)' };
    }
    type Veredicto = ReturnType<typeof testAnswerSchema.safeParse>;
    let contestacion: Veredicto;
    try {
      contestacion = testAnswerSchema.safeParse(extractJsonObject(content));
    } catch {
      return {
        ok: false,
        latency,
        error: `El modelo no devolvió el JSON pedido: ${content.slice(0, 200)}`
      };
    }
    if (!contestacion.success) {
      return {
        ok: false,
        latency,
        error: `El modelo no devolvió el JSON pedido: ${content.slice(0, 200)}`
      };
    }
    return { ok: true, latency, message: contestacion.data.message };
  } catch (error) {
    const latency = Date.now() - startTime;
    const mensaje = error instanceof Error ? error.message : String(error);
    return { ok: false, latency, error: mensaje };
  }
}
