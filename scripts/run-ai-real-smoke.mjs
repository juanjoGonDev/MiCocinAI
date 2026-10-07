import {
  AI_LIVE_SMOKE_COMPLETION_BUDGET,
  createAiLiveSmokeRunnerEnvironment,
  createAiLiveProxy,
  isSuccessfulAiLiveSmokeResult,
  validateAiLiveSmokeOptIn
} from './ai-live-smoke-safety.mjs';
import { prepareExistingAiLiveSmokeSession } from './ai-live-existing-webapi.mjs';
import { runAiLiveSmokeRunner } from './ai-live-smoke-runner-control.mjs';
import {
  AI_LIVE_SMOKE_DEADLINES,
  assertAiLiveSmokeDeadlineContract
} from './ai-live-smoke-contract.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function safeMetrics(calls) {
  const aggregate = {};
  for (const field of ['promptTokens', 'completionTokens', 'totalTokens']) {
    const values = calls.map((call) => call.usage?.[field]);
    if (values.every((value) => Number.isInteger(value) && value >= 0)) {
      aggregate[field] = values.reduce((sum, value) => sum + value, 0);
    }
  }
  const costs = calls.map((call) => call.usage?.costUsd);
  if (costs.every((value) => Number.isFinite(value) && value >= 0)) {
    aggregate.costUsd = costs.reduce((sum, value) => sum + value, 0);
  }
  return Object.keys(aggregate).length ? aggregate : undefined;
}

const defaultDependencies = {
  prepareExistingAiLiveSmokeSession,
  createAiLiveProxy,
  createAiLiveSmokeRunnerEnvironment,
  runAiLiveSmokeRunner,
  isSuccessfulAiLiveSmokeResult
};

export async function runAiLiveSmoke({
  env = process.env,
  signal,
  dependencies = defaultDependencies,
  writeError = (message) => console.error(message),
  writeProgress = (message) => console.log(message),
  writeSuccess = (message) => console.log(message)
} = {}) {
  validateAiLiveSmokeOptIn(env);
  assertAiLiveSmokeDeadlineContract();
  signal?.throwIfAborted();

  let session;
  let proxy;
  let runnerExit = { code: 1, timedOut: false };
  let cleanupFailed = false;
  try {
    writeProgress('Validando el servicio IA local y sus controles de privacidad.');
    session = await dependencies.prepareExistingAiLiveSmokeSession({ env, signal });
    signal?.throwIfAborted();
    writeProgress('Servicio IA local validado; preparando la prueba aislada.');
    proxy = await dependencies.createAiLiveProxy({
      token: session.token,
      model: session.model,
      targetOrigin: session.origin,
      maxCalls: AI_LIVE_SMOKE_COMPLETION_BUDGET,
      timeoutMs: AI_LIVE_SMOKE_DEADLINES.proxyMs,
      onRequest: ({ ordinal }) => {
        if (
          Number.isInteger(ordinal) &&
          ordinal > 0 &&
          ordinal <= AI_LIVE_SMOKE_COMPLETION_BUDGET
        ) {
          writeProgress(
            `Solicitud IA ${ordinal}/${AI_LIVE_SMOKE_COMPLETION_BUDGET} enviada al servicio local.`
          );
        }
      },
      onCompletion: ({ ordinal, status, responseFormat }) => {
        if (
          Number.isInteger(ordinal) &&
          ordinal > 0 &&
          ordinal <= AI_LIVE_SMOKE_COMPLETION_BUDGET &&
          Number.isInteger(status)
        ) {
          const responseShape =
            responseFormat?.messageContentType === 'text'
              ? responseFormat.isJsonObject === true
                ? 'texto JSON'
                : 'texto no JSON'
              : responseFormat?.messageContentType === 'stream'
                ? 'stream'
                : responseFormat?.messageContentType === 'parts'
                  ? 'partes estructuradas'
                  : 'formato no disponible';
          const safeFinishReasons = new Set([
            'stop',
            'length',
            'tool_calls',
            'function_call',
            'content_filter'
          ]);
          const finishReason = safeFinishReasons.has(responseFormat?.finishReason)
            ? responseFormat.finishReason
            : 'no disponible';
          writeProgress(
            `Respuesta IA ${ordinal}/${AI_LIVE_SMOKE_COMPLETION_BUDGET} completada (HTTP ${status}; ${responseShape}; cierre ${finishReason}).`
          );
        }
      }
    });

    const runnerEnv = dependencies.createAiLiveSmokeRunnerEnvironment(env, {
      proxyToken: proxy.clientToken,
      proxyUrl: proxy.baseUrl,
      model: session.model,
      deadlines: AI_LIVE_SMOKE_DEADLINES
    });
    writeProgress('Iniciando los escenarios contra la aplicación aislada.');
    runnerExit = await dependencies.runAiLiveSmokeRunner({
      env: runnerEnv,
      signal,
      onProgress: writeProgress
    });
    writeProgress('Escenarios aislados terminados; verificando limpieza.');
  } catch {
    runnerExit = { code: 1, cancelled: signal?.aborted === true, timedOut: false };
    writeProgress('La preparación o ejecución no terminó correctamente; limpiando recursos.');
  } finally {
    if (proxy) {
      try {
        await proxy.close();
      } catch {
        cleanupFailed = true;
      }
    }
    if (session) {
      try {
        await session.cleanup();
      } catch {
        cleanupFailed = true;
      }
    }
  }

  const calls = proxy?.metrics.calls ?? [];
  const liveSuccess = dependencies.isSuccessfulAiLiveSmokeResult({
    runnerExit,
    cleanupFailed,
    calls
  });
  if (!liveSuccess) {
    writeError(
      cleanupFailed
        ? 'Smoke real fallido: no se pudo confirmar la limpieza del token propio.'
        : runnerExit.cancelled
          ? 'Smoke real cancelado; se intentó cerrar el runner y limpiar los recursos propios.'
          : runnerExit.timedOut
            ? 'Smoke real fallido: se agotó el límite de tiempo; se intentó cerrar y limpiar.'
            : `Smoke real fallido: resultado del runner=${runnerExit.code}, llamadas=${calls.length}/${AI_LIVE_SMOKE_COMPLETION_BUDGET} (mínimo permitido 9).`
    );
    return 1;
  }

  const usage = safeMetrics(calls);
  const failedReceiptStreamIndex = calls.findIndex(
    (call) => call.status === 400 && call.stream === true && call.schemaName === 'receipt'
  );
  const receiptFallback =
    failedReceiptStreamIndex >= 0
      ? {
          schema: 'receipt',
          streamingStatus: calls[failedReceiptStreamIndex].status,
          nonStreamingStatus: calls[failedReceiptStreamIndex + 1]?.status ?? null
        }
      : undefined;
  writeSuccess(
    JSON.stringify({
      result: 'passed',
      provider: 'local WebAPI :3001',
      model: session.model,
      completions: calls.length,
      elapsedMs: calls.map((call) => call.elapsedMs),
      ...(receiptFallback ? { recoveredFallback: receiptFallback } : {}),
      ...(usage ? { usage } : {})
    })
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    process.exitCode = await runAiLiveSmoke({ env: process.env, signal: cancellation.signal });
  } catch {
    console.error('Smoke real no ejecutado o fallido.');
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}
