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
    .prepare('SELECT * FROM ai_configs WHERE user_id = ? AND is_active = 1')
    .get(userId) as AiConfigRow | undefined;
}

function endpoint(baseUrl: string): string {
  // Una barra de mas en el `base_url` escrito a mano en Ajustes es lo normal;
  // normalizar aqui evita que cada llamante tenga que acordarse.
  return `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`;
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
      body: JSON.stringify({
        model: active.model,
        messages,
        temperature: active.temperature,
        max_tokens: active.max_tokens,
        top_p: active.top_p,
        frequency_penalty: active.frequency_penalty,
        presence_penalty: active.presence_penalty
      }),
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
