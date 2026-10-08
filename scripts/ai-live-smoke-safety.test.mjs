import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

import {
  WEB_API_ORIGIN,
  createAiLiveSmokeRunnerEnvironment,
  prepareAiLiveSmokeSession,
  createAiLiveProxy,
  isSuccessfulAiLiveSmokeResult,
  isolatedProcessEnvironments,
  selectAiLiveModel,
  validateAiLiveSmokeOptIn,
  validateAiLiveSmokeRunner
} from './ai-live-smoke-safety.mjs';
import { AI_LIVE_SMOKE_DEADLINES } from './ai-live-smoke-contract.mjs';

test('requires explicit opt-in and rejects CI before any live setup', () => {
  assert.throws(() => validateAiLiveSmokeOptIn({}), /explicit opt-in/i);
  assert.throws(() => validateAiLiveSmokeOptIn({ HOGARIA_AI_REAL_SMOKE: '1', CI: 'true' }), /CI/i);
  assert.doesNotThrow(() => validateAiLiveSmokeOptIn({ HOGARIA_AI_REAL_SMOKE: '1', CI: '' }));
});

test('dedicated runner accepts only the opt-in isolated config/spec and can route its bearer server-only', () => {
  const args = ['--config=playwright.ai-real-smoke.config.ts', 'tests/e2e/ai-real-smoke.spec.ts'];
  const env = {
    HOGARIA_AI_REAL_SMOKE: '1',
    HOGARIA_AI_REAL_SMOKE_RUNNER: '1',
    HOGARIA_AI_REAL_SMOKE_PROXY_TOKEN: 'synthetic-local-proxy-token',
    HOGARIA_AI_REAL_SMOKE_PROXY_URL: 'http://127.0.0.1:41000/v1',
    HOGARIA_AI_REAL_SMOKE_MODEL: 'gpt-5',
    CI: ''
  };
  assert.equal(validateAiLiveSmokeRunner(env, args), true);
  assert.throws(() => validateAiLiveSmokeRunner({ ...env, CI: 'true' }, args), /CI/i);
  assert.throws(
    () =>
      validateAiLiveSmokeRunner(
        { ...env, HOGARIA_AI_REAL_SMOKE_PROVIDER_TOKEN: 'webapi-bearer-secret' },
        args
      ),
    /WebAPI bearer.*coordinator/i
  );
  assert.throws(
    () => validateAiLiveSmokeRunner({ ...env, HOGARIA_AI_REAL_SMOKE_PROXY_TOKEN: '' }, args),
    /proxy credential/i
  );
  assert.throws(() => validateAiLiveSmokeRunner(env, [...args, '--grep=unsafe']), /only accepts/i);
  assert.throws(
    () =>
      validateAiLiveSmokeRunner({ HOGARIA_AI_REAL_SMOKE_PROVIDER_TOKEN: 'synthetic-token' }, []),
    /dedicated AI smoke runner/i
  );
  assert.equal(validateAiLiveSmokeRunner({}, ['tests/e2e/ai-real-smoke.spec.ts']), false);
});

test('receipt-only runner requires a private source directory and selected JPEG ordinal', () => {
  const args = ['--config=playwright.ai-real-smoke.config.ts', 'tests/e2e/ai-real-smoke.spec.ts'];
  const env = {
    HOGARIA_AI_REAL_SMOKE: '1',
    HOGARIA_AI_REAL_SMOKE_RUNNER: '1',
    HOGARIA_AI_REAL_SMOKE_PROXY_TOKEN: 'synthetic-local-proxy-token',
    HOGARIA_AI_REAL_SMOKE_PROXY_URL: 'http://127.0.0.1:41000/v1',
    HOGARIA_AI_REAL_SMOKE_MODEL: 'gpt-5',
    HOGARIA_AI_REAL_SMOKE_RECEIPTS_ONLY: '1',
    HOGARIA_AI_REAL_SMOKE_RECEIPT_DIRECTORY: 'C:/Users/example/tickets',
    HOGARIA_AI_REAL_SMOKE_PREFERRED_JPEG_ORDINAL: '2',
    CI: ''
  };

  assert.equal(validateAiLiveSmokeRunner(env, args), true);
  assert.throws(
    () =>
      validateAiLiveSmokeRunner(
        { ...env, HOGARIA_AI_REAL_SMOKE_PREFERRED_JPEG_ORDINAL: '5' },
        args
      ),
    /JPEG.*index/i
  );
  assert.throws(
    () =>
      validateAiLiveSmokeRunner(
        { ...env, HOGARIA_AI_REAL_SMOKE_RECEIPT_DIRECTORY: undefined },
        args
      ),
    /receipt directory/i
  );
  assert.throws(
    () => validateAiLiveSmokeRunner({ ...env, HOGARIA_AI_REAL_SMOKE_RECEIPTS_ONLY: 'true' }, args),
    /receipt-only mode/i
  );
  assert.throws(
    () =>
      validateAiLiveSmokeRunner({ ...env, HOGARIA_AI_REAL_SMOKE_RECEIPTS_ONLY: undefined }, args),
    /source inputs require receipt-only mode/i
  );
});

test('disables all WebAPI prompt capture before token/model setup and restores temporary settings', async () => {
  const originalSettings = {
    captureDetails: true,
    enabled: true,
    maxBodyChars: 4096,
    maxHeaderValueChars: 256,
    maxHeaders: 20
  };
  const requests = [];
  let currentLogging = { ...originalSettings };
  let sessionRecording = true;
  let diagnosticHtml = true;
  let tokenCreatedWithCaptureDisabled = false;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const method = options.method ?? 'GET';
    requests.push({ path, method, options });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (method === 'PATCH') {
      const value = JSON.parse(options.body);
      if (path === '/admin/api/runtime-controls/request-logging') {
        currentLogging = value;
        return Response.json({ settings: currentLogging });
      }
      if (path === '/admin/api/settings/session-recording') {
        sessionRecording = value.enabled;
        return Response.json({ enabled: sessionRecording });
      }
      if (path === '/admin/api/settings/diagnostic-html') {
        diagnosticHtml = value.enabled;
        return Response.json({ enabled: diagnosticHtml });
      }
    }
    if (method === 'POST' && path === '/admin/api/tokens') {
      tokenCreatedWithCaptureDisabled =
        currentLogging.enabled === false &&
        currentLogging.captureDetails === false &&
        sessionRecording === false &&
        diagnosticHtml === false;
    }
    if (path === '/admin/api/runtime-controls') {
      return Response.json({ requestLogging: { settings: currentLogging } });
    }
    if (path === '/admin/api/settings/session-recording') {
      return Response.json({ enabled: sessionRecording });
    }
    if (path === '/admin/api/settings/diagnostic-html') {
      return Response.json({ enabled: diagnosticHtml });
    }
    const values = {
      '/': { name: 'web-api' },
      '/health/ready': { ok: true },
      '/admin/api/chatgpt/session': { state: 'ready' },
      '/admin/api/tokens': {
        record: { id: 'synthetic-token-id' },
        token: 'synthetic-live-token-secret'
      },
      '/v1/models': {
        data: [{ id: 'gpt-5', status: 'active', modalities: { input: ['text', 'image'] } }]
      }
    };
    const payload = values[path];
    return payload
      ? Response.json(payload, {
          status: method === 'POST' && path === '/admin/api/tokens' ? 201 : 200
        })
      : new Response(null, { status: 404 });
  };

  const session = await prepareAiLiveSmokeSession({
    origin: WEB_API_ORIGIN,
    fetchImpl,
    now: () => 1000
  });
  assert.equal(tokenCreatedWithCaptureDisabled, true);
  assert.equal(session.model, 'gpt-5');
  assert.equal(session.token, 'synthetic-live-token-secret');
  const modelRequest = requests.find(({ path }) => path === '/v1/models');
  assert.equal(modelRequest.options.headers.authorization, 'Bearer synthetic-live-token-secret');
  assert.equal(
    requests
      .find(({ method, path }) => method === 'POST' && path === '/admin/api/tokens')
      .options.body.includes('secret'),
    false
  );
  const createTokenRequest = requests.find(
    ({ method, path }) => method === 'POST' && path === '/admin/api/tokens'
  );
  assert.equal(JSON.parse(createTokenRequest.options.body).expiresAt, 1000 + 30 * 60 * 1000);

  await session.cleanup();
  assert.deepEqual(
    requests
      .filter(
        ({ method, path }) =>
          method === 'PATCH' && path === '/admin/api/runtime-controls/request-logging'
      )
      .map(({ options }) => JSON.parse(options.body)),
    [{ ...originalSettings, captureDetails: false, enabled: false }, originalSettings]
  );
  assert.deepEqual(
    requests
      .filter(
        ({ method, path }) => method === 'PATCH' && path === '/admin/api/settings/session-recording'
      )
      .map(({ options }) => JSON.parse(options.body)),
    [{ enabled: false }, { enabled: true }]
  );
  assert.deepEqual(
    requests
      .filter(
        ({ method, path }) => method === 'PATCH' && path === '/admin/api/settings/diagnostic-html'
      )
      .map(({ options }) => JSON.parse(options.body)),
    [{ enabled: false }, { enabled: true }]
  );
  assert.equal(
    requests.some(
      ({ method, path }) => method === 'DELETE' && path === '/admin/api/tokens/synthetic-token-id'
    ),
    true
  );
});

test('rejects any WebAPI origin outside the supervised loopback without making a request', async () => {
  let requested = false;
  const fetchImpl = async () => {
    requested = true;
    return Response.json({});
  };
  await assert.rejects(
    prepareAiLiveSmokeSession({ origin: 'http://localhost:3001', fetchImpl }),
    /allowlist/i
  );
  await assert.rejects(prepareAiLiveSmokeSession({ fetchImpl }), /attested local WebAPI/i);
  assert.equal(requested, false);
});

test('aborts session setup and rolls back its token and privacy settings after cancellation', async () => {
  const controller = new AbortController();
  const originalLogging = {
    captureDetails: true,
    enabled: true,
    maxBodyChars: 2048,
    maxHeaderValueChars: 128,
    maxHeaders: 10
  };
  let logging = { ...originalLogging };
  let sessionRecording = true;
  let diagnosticHtml = true;
  let tokenCreated = false;
  let tokenDeleted = false;
  let tokenName = '';
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const method = options.method ?? 'GET';
    requests.push({ path, method, body: options.body, signal: options.signal });
    if (method === 'DELETE' && path === '/admin/api/tokens/synthetic-token-id') {
      tokenDeleted = true;
      return new Response(null, { status: 204 });
    }
    if (method === 'PATCH') {
      const value = JSON.parse(options.body);
      if (path === '/admin/api/runtime-controls/request-logging') {
        logging = value;
        return Response.json({ settings: logging });
      }
      if (path === '/admin/api/settings/session-recording') {
        sessionRecording = value.enabled;
        return Response.json({ enabled: sessionRecording });
      }
      if (path === '/admin/api/settings/diagnostic-html') {
        diagnosticHtml = value.enabled;
        return Response.json({ enabled: diagnosticHtml });
      }
    }
    if (method === 'POST' && path === '/admin/api/tokens') {
      tokenCreated = true;
      tokenName = JSON.parse(options.body).name;
      controller.abort();
      return Response.json(
        { record: { id: 'synthetic-token-id' }, token: 'synthetic-live-token-secret' },
        { status: 201 }
      );
    }
    if (path === '/admin/api/tokens' && method === 'GET') {
      return Response.json([{ id: 'synthetic-token-id', name: tokenName }]);
    }
    if (path === '/admin/api/runtime-controls') {
      return Response.json({ requestLogging: { settings: logging } });
    }
    if (path === '/admin/api/settings/session-recording') {
      return Response.json({ enabled: sessionRecording });
    }
    if (path === '/admin/api/settings/diagnostic-html') {
      return Response.json({ enabled: diagnosticHtml });
    }
    const payloads = {
      '/': { name: 'web-api' },
      '/health/ready': { ok: true },
      '/admin/api/chatgpt/session': { state: 'ready' },
      '/v1/models': {
        data: [{ id: 'gpt-5', status: 'active', modalities: { input: ['text', 'image'] } }]
      }
    };
    return payloads[path] ? Response.json(payloads[path]) : new Response(null, { status: 404 });
  };

  let session;
  try {
    await assert.rejects(
      (async () => {
        session = await prepareAiLiveSmokeSession({
          origin: WEB_API_ORIGIN,
          fetchImpl,
          signal: controller.signal,
          now: () => 1000
        });
      })(),
      /cancel/i
    );
    assert.equal(tokenCreated, true);
    assert.equal(tokenDeleted, true);
    assert.deepEqual(logging, originalLogging);
    assert.equal(sessionRecording, true);
    assert.equal(diagnosticHtml, true);
    assert.equal(
      requests.filter(({ method, path }) => method === 'PATCH' && path.includes('request-logging'))
        .length,
      2
    );
    assert.equal(
      requests
        .filter(({ method, body }) => {
          if (method === 'DELETE') return true;
          if (method !== 'PATCH') return false;
          const payload = JSON.parse(body);
          return payload.enabled === true || payload.captureDetails === true;
        })
        .every(({ signal }) => signal?.aborted !== true),
      true
    );
  } finally {
    if (session) await session.cleanup();
  }
});

test('rolls back the token and every privacy setting when the model catalog is unusable', async () => {
  const originalSettings = {
    captureDetails: true,
    enabled: true,
    maxBodyChars: 4096,
    maxHeaderValueChars: 256,
    maxHeaders: 20
  };
  const requests = [];
  let currentLogging = { ...originalSettings };
  let sessionRecording = true;
  let diagnosticHtml = true;
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const method = options.method ?? 'GET';
    requests.push({ path, method, body: options.body });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (method === 'PATCH') {
      const value = JSON.parse(options.body);
      if (path === '/admin/api/runtime-controls/request-logging') {
        currentLogging = value;
        return Response.json({ settings: currentLogging });
      }
      if (path === '/admin/api/settings/session-recording') {
        sessionRecording = value.enabled;
        return Response.json({ enabled: sessionRecording });
      }
      if (path === '/admin/api/settings/diagnostic-html') {
        diagnosticHtml = value.enabled;
        return Response.json({ enabled: diagnosticHtml });
      }
    }
    if (path === '/admin/api/runtime-controls') {
      return Response.json({ requestLogging: { settings: currentLogging } });
    }
    if (path === '/admin/api/settings/session-recording')
      return Response.json({ enabled: sessionRecording });
    if (path === '/admin/api/settings/diagnostic-html')
      return Response.json({ enabled: diagnosticHtml });
    const values = {
      '/': [200, { name: 'web-api' }],
      '/health/ready': [200, {}],
      '/admin/api/chatgpt/session': [200, { state: 'ready' }],
      '/admin/api/tokens': [
        201,
        { record: { id: 'rollback-token-id' }, token: 'synthetic-token-long' }
      ],
      '/v1/models': [200, { data: [] }]
    };
    const [status, body] = values[path] ?? [404, {}];
    return Response.json(body, { status });
  };

  await assert.rejects(
    prepareAiLiveSmokeSession({ origin: WEB_API_ORIGIN, fetchImpl, now: () => 1000 }),
    /could not be completed safely/i
  );
  assert.equal(sessionRecording, true);
  assert.equal(diagnosticHtml, true);
  assert.deepEqual(
    requests
      .filter(
        ({ method, path }) =>
          method === 'PATCH' && path === '/admin/api/runtime-controls/request-logging'
      )
      .map(({ body }) => JSON.parse(body)),
    [{ ...originalSettings, captureDetails: false, enabled: false }, originalSettings]
  );
  assert.equal(
    requests.some(
      ({ method, path }) => method === 'DELETE' && path === '/admin/api/tokens/rollback-token-id'
    ),
    true
  );
});

test('selects only an active image-capable model returned by the local model catalog', () => {
  const models = [
    { id: 'fake/gpt-test', status: 'active', modalities: { input: ['text', 'image'] } },
    { id: 'gpt-5', status: 'active', modalities: { input: ['text', 'image'] } },
    { id: 'image-only', status: 'active', modalities: { input: ['image'] } },
    { id: 'text-only', status: 'active', modalities: { input: ['text'] } },
    { id: 'disabled-vision', status: 'disabled', modalities: { input: ['image'] } }
  ];

  assert.equal(selectAiLiveModel(models), 'gpt-5');
  assert.equal(selectAiLiveModel(models, 'gpt-5'), 'gpt-5');
  assert.throws(() => selectAiLiveModel(models, 'not-listed'), /not available/i);
  assert.throws(() => selectAiLiveModel(models, 'image-only'), /text and image/i);
  assert.throws(() => selectAiLiveModel(models, 'text-only'), /text and image/i);
});

test('keeps the WebAPI bearer out of browser and Playwright environments', () => {
  const source = {
    HOGARIA_AI_REAL_SMOKE_PROVIDER_TOKEN: 'sentinel-private-token',
    HOGARIA_AI_REAL_SMOKE_PROXY_TOKEN: 'sentinel-local-proxy-token',
    HOGARIA_AI_REAL_SMOKE_RECEIPT_PATH: 'C:/Downloads/private-ticket.jpeg',
    HOGARIA_AI_REAL_SMOKE_RECEIPT_DIRECTORY: 'C:/Downloads/private-tickets',
    HOGARIA_AI_REAL_SMOKE_PREFERRED_JPEG_ORDINAL: '2',
    HOGARIA_AI_REAL_SMOKE_RECEIPTS_ONLY: '1',
    HOGARIA_AI_REAL_SMOKE: '1',
    E2E_BASE_URL: 'http://127.0.0.1:45678'
  };
  const separated = isolatedProcessEnvironments(source);

  assert.equal('HOGARIA_AI_REAL_SMOKE_PROVIDER_TOKEN' in separated.server, false);
  assert.equal(separated.server.HOGARIA_AI_REAL_SMOKE_PROXY_TOKEN, 'sentinel-local-proxy-token');
  assert.equal('HOGARIA_AI_REAL_SMOKE_PROVIDER_TOKEN' in separated.browser, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_PROXY_TOKEN' in separated.browser, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_PROVIDER_TOKEN' in separated.playwright, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_PROXY_TOKEN' in separated.playwright, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_RECEIPT_PATH' in separated.server, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_RECEIPT_PATH' in separated.browser, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_RECEIPT_DIRECTORY' in separated.server, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_PREFERRED_JPEG_ORDINAL' in separated.server, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_RECEIPTS_ONLY' in separated.server, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_RECEIPT_DIRECTORY' in separated.browser, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_PREFERRED_JPEG_ORDINAL' in separated.browser, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_RECEIPTS_ONLY' in separated.browser, false);
  assert.equal(
    separated.playwright.HOGARIA_AI_REAL_SMOKE_RECEIPT_PATH,
    'C:/Downloads/private-ticket.jpeg'
  );
  assert.equal(
    separated.playwright.HOGARIA_AI_REAL_SMOKE_RECEIPT_DIRECTORY,
    'C:/Downloads/private-tickets'
  );
  assert.equal(separated.playwright.HOGARIA_AI_REAL_SMOKE_PREFERRED_JPEG_ORDINAL, '2');
  assert.equal(separated.playwright.HOGARIA_AI_REAL_SMOKE_RECEIPTS_ONLY, '1');
  assert.equal(separated.browser.E2E_BASE_URL, source.E2E_BASE_URL);
});

test('builds a minimal live-runner environment without inherited provider credentials or hooks', () => {
  const env = createAiLiveSmokeRunnerEnvironment(
    {
      PATH: 'C:/Windows/System32',
      SystemRoot: 'C:/Windows',
      TEMP: 'C:/Temp',
      PLAYWRIGHT_BROWSERS_PATH: 'C:/pw-browsers',
      E2E_CHROME_BIN: 'C:/Chrome/chrome.exe',
      HOGARIA_AI_REAL_SMOKE_RECEIPT_DIRECTORY: 'C:/Downloads/private-tickets',
      HOGARIA_AI_REAL_SMOKE_PREFERRED_JPEG_ORDINAL: '2',
      HOGARIA_AI_REAL_SMOKE_RECEIPTS_ONLY: '1',
      HOGARIA_AI_REAL_SMOKE_ALLOW_REDACTED_REQUEST_LOGS: '1',
      CI: 'true',
      OPENAI_API_KEY: 'sentinel-openai-secret',
      HOGARIA_AI_REAL_SMOKE_PROVIDER_TOKEN: 'sentinel-webapi-bearer',
      NODE_OPTIONS: '--require=untrusted-hook'
    },
    {
      proxyToken: 'synthetic-local-proxy-token',
      proxyUrl: 'http://127.0.0.1:41000/v1',
      model: 'gpt-5',
      deadlines: AI_LIVE_SMOKE_DEADLINES
    }
  );

  assert.equal(env.PATH, 'C:/Windows/System32');
  assert.equal(env.CI, '');
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, 'C:/pw-browsers');
  assert.equal(env.E2E_CHROME_BIN, 'C:/Chrome/chrome.exe');
  assert.equal(env.HOGARIA_AI_REAL_SMOKE_RECEIPT_DIRECTORY, 'C:/Downloads/private-tickets');
  assert.equal(env.HOGARIA_AI_REAL_SMOKE_PREFERRED_JPEG_ORDINAL, '2');
  assert.equal(env.HOGARIA_AI_REAL_SMOKE_RECEIPTS_ONLY, '1');
  assert.equal(env.HOGARIA_AI_REAL_SMOKE_PROXY_TOKEN, 'synthetic-local-proxy-token');
  assert.equal(env.HOGARIA_AI_REAL_SMOKE_RECIPE_MAX_TOKENS, '4096');
  assert.equal(env.HOGARIA_AI_REAL_SMOKE_CONFIG_TIMEOUT_MS, '240000');
  assert.equal(env.HOGARIA_AI_REAL_SMOKE_REQUEST_TIMEOUT_MS, '270000');
  assert.equal(env.HOGARIA_AI_REAL_SMOKE_TEST_TIMEOUT_MS, '1200000');
  assert.equal(env.HOGARIA_AI_REAL_SMOKE_GLOBAL_TIMEOUT_MS, '1260000');
  assert.equal('OPENAI_API_KEY' in env, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_PROVIDER_TOKEN' in env, false);
  assert.equal('HOGARIA_AI_REAL_SMOKE_ALLOW_REDACTED_REQUEST_LOGS' in env, false);
  assert.equal('NODE_OPTIONS' in env, false);
  assert.equal(
    validateAiLiveSmokeRunner(env, [
      '--config=playwright.ai-real-smoke.config.ts',
      'tests/e2e/ai-real-smoke.spec.ts'
    ]),
    true
  );
});

test('accepts only a fully successful run with nine or ten live completions', () => {
  const calls = (count) => Array.from({ length: count }, () => ({ status: 200 }));
  const runnerExit = { code: 0, timedOut: false, cancelled: false, runnerCleaned: true };

  assert.equal(
    isSuccessfulAiLiveSmokeResult({ runnerExit, cleanupFailed: false, calls: calls(9) }),
    true
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({ runnerExit, cleanupFailed: false, calls: calls(10) }),
    true
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({ runnerExit, cleanupFailed: false, calls: calls(8) }),
    false
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({ runnerExit, cleanupFailed: false, calls: calls(11) }),
    false
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit,
      cleanupFailed: false,
      calls: [...calls(9), { status: 500 }]
    }),
    false
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit: { code: 1 },
      cleanupFailed: false,
      calls: calls(9)
    }),
    false
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit: { ...runnerExit, cancelled: true },
      cleanupFailed: false,
      calls: calls(9)
    }),
    false
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit: { code: 0, timedOut: false },
      cleanupFailed: false,
      calls: calls(9)
    }),
    false
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({ runnerExit, cleanupFailed: true, calls: calls(9) }),
    false
  );
});

test('accepts four receipt jobs with at most one immediate stream fallback each', () => {
  const runnerExit = { code: 0, timedOut: false, cancelled: false, runnerCleaned: true };
  const receipts = Array.from({ length: 4 }, () => ({
    status: 200,
    stream: true,
    schemaName: 'receipt'
  }));
  const withFallback = [
    ...receipts.slice(0, 2),
    { status: 400, stream: true, schemaName: 'receipt' },
    { status: 200, stream: false, schemaName: 'receipt' },
    ...receipts.slice(3)
  ];

  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit,
      cleanupFailed: false,
      calls: receipts,
      receiptsOnly: true
    }),
    true
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit,
      cleanupFailed: false,
      calls: withFallback,
      receiptsOnly: true
    }),
    true
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit,
      cleanupFailed: false,
      calls: receipts.slice(0, 3),
      receiptsOnly: true
    }),
    false
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit,
      cleanupFailed: false,
      calls: [
        ...receipts.slice(0, 1),
        { status: 400, stream: true, schemaName: 'receipt' },
        { status: 500, stream: false, schemaName: 'receipt' },
        ...receipts.slice(1)
      ],
      receiptsOnly: true
    }),
    false
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit,
      cleanupFailed: false,
      calls: [...receipts, { status: 200, schemaName: 'recipe' }],
      receiptsOnly: true
    }),
    false
  );
});

test('accepts only the failed streaming receipt attempt when its strict non-stream fallback succeeds', () => {
  const runnerExit = { code: 0, timedOut: false, cancelled: false, runnerCleaned: true };
  const calls = Array.from({ length: 8 }, () => ({ status: 200 }));
  calls.splice(
    7,
    0,
    { status: 400, stream: true, schemaName: 'receipt' },
    { status: 200, stream: false, schemaName: 'receipt' }
  );

  assert.equal(isSuccessfulAiLiveSmokeResult({ runnerExit, cleanupFailed: false, calls }), true);
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit,
      cleanupFailed: false,
      calls: calls.map((call) =>
        call.status === 400 ? { ...call, schemaName: 'shopping_photo' } : call
      )
    }),
    false
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit,
      cleanupFailed: false,
      calls: calls.map((call) => (call.status === 400 ? { ...call, status: 500 } : call))
    }),
    false
  );
  assert.equal(
    isSuccessfulAiLiveSmokeResult({
      runnerExit,
      cleanupFailed: false,
      calls: calls.map((call, index) =>
        call.schemaName === 'receipt' && call.status === 200 && index > 7
          ? { ...call, schemaName: 'recipe' }
          : call
      )
    }),
    false
  );
});

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

function postJson(url, bearer, payload) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: Number(target.port),
        path: target.pathname,
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
          connection: 'close'
        },
        agent: false
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    request.once('error', reject);
    request.end(JSON.stringify(payload));
  });
}

const SYNTHETIC_STRICT_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'synthetic_answer',
    strict: true,
    schema: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false
    }
  }
};

test('proxy authenticates its isolated app credential, forwards the WebAPI bearer, redacts it and enforces a budget', async () => {
  const bearer = 'synthetic-webapi-bearer-secret';
  const started = [];
  const completed = [];
  let localProxyCredential = '';
  const upstreamRequests = [];
  const upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    upstreamRequests.push({
      authorization: request.headers.authorization,
      path: request.url,
      body: Buffer.concat(chunks).toString('utf8')
    });
    const safeContent =
      upstreamRequests.length === 1 ? `safe ${bearer} ${localProxyCredential}` : '{"status":"ok"}';
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [{ message: { content: safeContent }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 }
      })
    );
  });
  const upstreamPort = await listen(upstream);
  const proxy = await createAiLiveProxy({
    token: bearer,
    model: 'gpt-5',
    targetOrigin: `http://127.0.0.1:${upstreamPort}`,
    maxCalls: 2,
    onRequest: (event) => started.push(event),
    onCompletion: (event) => completed.push(event)
  });
  localProxyCredential = proxy.clientToken;

  try {
    const actualBearer = await postJson(`${proxy.baseUrl}/chat/completions`, bearer, {
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'synthetic' }]
    });
    assert.equal(actualBearer.status, 401);
    assert.equal(upstreamRequests.length, 0);

    const promptSentinel = 'private smoke prompt sentinel';
    const request = (stream = false) =>
      postJson(`${proxy.baseUrl}/chat/completions`, proxy.clientToken, {
        model: 'gpt-5',
        messages: [{ role: 'user', content: promptSentinel }],
        stream,
        response_format: SYNTHETIC_STRICT_RESPONSE_FORMAT
      });

    const first = await request(true);
    assert.equal(first.status, 200);
    assert.equal(first.text.includes(bearer), false);
    assert.equal(first.text.includes(proxy.clientToken), false);
    assert.deepEqual(proxy.metrics.calls[0].usage, {
      promptTokens: 7,
      completionTokens: 5,
      totalTokens: 12
    });
    assert.deepEqual(proxy.metrics.calls[0].responseFormat, {
      hasChoices: true,
      messageContentType: 'text',
      contentChars: `safe ${bearer} ${localProxyCredential}`.length,
      isJsonObject: false,
      finishReason: 'stop'
    });
    assert.equal(JSON.stringify(proxy.metrics.calls[0].responseFormat).includes(bearer), false);
    assert.deepEqual(
      { stream: proxy.metrics.calls[0].stream, schemaName: proxy.metrics.calls[0].schemaName },
      { stream: true, schemaName: 'synthetic_answer' }
    );
    assert.equal(JSON.stringify(proxy.metrics.calls[0]).includes(promptSentinel), false);
    assert.deepEqual(started, [{ ordinal: 1 }]);
    assert.equal(completed.length, 1);
    assert.deepEqual(
      { ordinal: completed[0].ordinal, status: completed[0].status },
      { ordinal: 1, status: 200 }
    );
    assert.deepEqual(completed[0].responseFormat, proxy.metrics.calls[0].responseFormat);
    assert.equal(Number.isFinite(completed[0].elapsedMs), true);

    assert.equal((await request()).status, 200);
    assert.equal(proxy.metrics.calls[1].responseFormat.isJsonObject, true);
    const overBudget = await request();
    assert.equal(overBudget.status, 429);
    assert.equal(upstreamRequests.length, 2);
    assert.equal(upstreamRequests[0].authorization, `Bearer ${bearer}`);
    assert.equal(upstreamRequests[0].path, '/v1/chat/completions');
    assert.equal(proxy.metrics.calls.length, 2);
  } finally {
    await proxy.close();
    await new Promise((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('live proxy rejects JSON requests without strict response_format before spending its completion budget', async () => {
  let upstreamCalls = 0;
  const upstream = createServer((_request, response) => {
    upstreamCalls += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
  });
  const upstreamPort = await listen(upstream);
  const proxy = await createAiLiveProxy({
    token: 'synthetic-provider-token',
    model: 'gpt-5',
    targetOrigin: `http://127.0.0.1:${upstreamPort}`,
    maxCalls: 1
  });
  const request = (response_format) =>
    postJson(`${proxy.baseUrl}/chat/completions`, proxy.clientToken, {
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'synthetic JSON request' }],
      ...(response_format === undefined ? {} : { response_format })
    });

  try {
    const missing = await request();
    assert.equal(missing.status, 400);
    assert.equal(upstreamCalls, 0);

    const loose = await request({ type: 'json_object' });
    assert.equal(loose.status, 400);
    assert.equal(upstreamCalls, 0);

    const nonStrictSchema = await request({
      type: 'json_schema',
      json_schema: {
        name: 'synthetic_answer',
        strict: false,
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
          additionalProperties: false
        }
      }
    });
    assert.equal(nonStrictSchema.status, 400);
    assert.equal(upstreamCalls, 0);

    const incompleteStrictSchema = await request({
      type: 'json_schema',
      json_schema: {
        name: 'synthetic_answer',
        strict: true,
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: [],
          additionalProperties: false
        }
      }
    });
    assert.equal(incompleteStrictSchema.status, 400);
    assert.equal(upstreamCalls, 0);

    const nestedLooseSchema = await request({
      type: 'json_schema',
      json_schema: {
        name: 'synthetic_answer',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              properties: { ok: { type: 'boolean' } },
              required: ['ok']
            }
          },
          required: ['nested'],
          additionalProperties: false
        }
      }
    });
    assert.equal(nestedLooseSchema.status, 400);
    assert.equal(upstreamCalls, 0);

    const strict = await request({
      type: 'json_schema',
      json_schema: {
        name: 'synthetic_answer',
        strict: true,
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
          additionalProperties: false
        }
      }
    });
    assert.equal(strict.status, 200);
    assert.equal(upstreamCalls, 1);
    assert.equal(proxy.metrics.calls.length, 1);
  } finally {
    await proxy.close();
    await new Promise((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('proxy rejects host/path redirects and mismatched models without following or logging them', async () => {
  let upstreamCalls = 0;
  const upstream = createServer((_request, response) => {
    upstreamCalls += 1;
    response.writeHead(302, { location: 'https://example.invalid/secret-destination' }).end();
  });
  const upstreamPort = await listen(upstream);
  const token = 'synthetic-token-long';
  const proxy = await createAiLiveProxy({
    token,
    model: 'gpt-5',
    targetOrigin: `http://127.0.0.1:${upstreamPort}`,
    maxCalls: 2
  });

  try {
    const wrongModel = await postJson(`${proxy.baseUrl}/chat/completions`, proxy.clientToken, {
      model: 'another-model',
      messages: []
    });
    assert.equal(wrongModel.status, 400);
    assert.equal(upstreamCalls, 0);

    const redirected = await postJson(`${proxy.baseUrl}/chat/completions`, proxy.clientToken, {
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'synthetic' }],
      response_format: SYNTHETIC_STRICT_RESPONSE_FORMAT
    });
    assert.equal(redirected.status, 502);
    assert.equal(redirected.text.includes('example.invalid'), false);
    assert.equal(upstreamCalls, 1);
  } finally {
    await proxy.close();
    await new Promise((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('proxy budgets concurrent attempts atomically and drains oversized requests safely', async () => {
  let upstreamCalls = 0;
  const upstream = createServer(async (_request, response) => {
    upstreamCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  const upstreamPort = await listen(upstream);
  const token = 'synthetic-provider-token';
  const proxy = await createAiLiveProxy({
    token,
    model: 'gpt-5',
    targetOrigin: `http://127.0.0.1:${upstreamPort}`,
    maxCalls: 2,
    maxRequestBytes: 512
  });

  try {
    const concurrent = await Promise.all(
      Array.from({ length: 3 }, () =>
        postJson(`${proxy.baseUrl}/chat/completions`, proxy.clientToken, {
          model: 'gpt-5',
          messages: [{ role: 'user', content: 'synthetic' }],
          response_format: SYNTHETIC_STRICT_RESPONSE_FORMAT
        })
      )
    );
    assert.deepEqual(concurrent.map(({ status }) => status).sort(), [200, 200, 429]);
    assert.equal(upstreamCalls, 2);

    const oversized = await postJson(`${proxy.baseUrl}/chat/completions`, proxy.clientToken, {
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'x'.repeat(1024) }]
    });
    assert.equal(oversized.status, 413);
    assert.equal(upstreamCalls, 2);
  } finally {
    await proxy.close();
    await new Promise((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('closing the proxy aborts in-flight upstream work', async () => {
  let releaseUpstreamRequest;
  const upstreamSeen = new Promise((resolve) => {
    releaseUpstreamRequest = resolve;
  });
  const upstream = createServer((request, _response) => releaseUpstreamRequest(request));
  const upstreamPort = await listen(upstream);
  const token = 'synthetic-provider-token';
  const proxy = await createAiLiveProxy({
    token,
    model: 'gpt-5',
    targetOrigin: `http://127.0.0.1:${upstreamPort}`
  });
  const target = new URL(`${proxy.baseUrl}/chat/completions`);
  const client = httpRequest(
    {
      hostname: target.hostname,
      port: Number(target.port),
      path: target.pathname,
      method: 'POST',
      headers: {
        authorization: `Bearer ${proxy.clientToken}`,
        'content-type': 'application/json',
        connection: 'close'
      },
      agent: false
    },
    () => undefined
  );
  client.on('error', () => undefined);
  client.end(
    JSON.stringify({
      model: 'gpt-5',
      messages: [{ role: 'user', content: 'synthetic' }],
      response_format: SYNTHETIC_STRICT_RESPONSE_FORMAT
    })
  );

  try {
    const upstreamRequest = await upstreamSeen;
    await proxy.close();
    const didAbort = await Promise.race([
      once(upstreamRequest, 'aborted').then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 500))
    ]);
    assert.equal(didAbort, true);
  } finally {
    client.destroy();
    await proxy.close().catch(() => undefined);
    upstream.closeAllConnections();
    await new Promise((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
