import { appendFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import {
  AI_LIVE_SMOKE_RUNNER_PROGRESS_MESSAGE,
  AI_LIVE_SMOKE_RUNNER_SHUTDOWN_MESSAGE,
  sendAiLiveSmokeRunnerCompletion
} from './ai-live-smoke-runner-control.mjs';
import { isolatedProcessEnvironments, validateAiLiveSmokeRunner } from './ai-live-smoke-safety.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const liveSmoke = validateAiLiveSmokeRunner(process.env, args);
const fullStack = args.some((arg, index) => {
  if (arg.startsWith('--config=')) return arg.includes('playwright.full-stack.config.ts');
  return arg === '--config' && args[index + 1]?.includes('playwright.full-stack.config.ts');
});
const runDir = mkdtempSync(join(tmpdir(), 'hogaria-e2e-'));
const playwrightCli = join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const readyFile = join(runDir, 'server.ready');
let ownedPorts = [];
let testProcess;
let stackProcess;
let stopStackPromise;
let exitCode = 1;
let preserve = !liveSmoke;
let shutdownRequested = false;
let runnerCleanupVerified = false;

function reportSmokeProgress(phase) {
  if (!liveSmoke || !process.connected) return;
  try {
    process.send({ type: AI_LIVE_SMOKE_RUNNER_PROGRESS_MESSAGE, phase }, () => {});
  } catch {
    // Progress is diagnostic only and must not affect isolation or cleanup.
  }
}

function reportLastLiveSmokeTestPhase() {
  if (!liveSmoke) return;
  try {
    const phase = readFileSync(join(runDir, 'ai-live-smoke-phase'), 'utf8').trim();
    reportSmokeProgress(`test-phase:${phase}`);
  } catch {
    // Tests that fail before their first milestone still report the runner exit status.
  }
}

async function availablePort(excluded = new Set()) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const server = createServer();
    const port = await new Promise((resolvePort, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolvePort(server.address().port));
    });
    await new Promise((resolveClose, reject) =>
      server.close((error) => (error ? reject(error) : resolveClose()))
    );
    if (!excluded.has(port) && port !== 3000 && port !== 4200) return port;
  }
  throw new Error('Could not reserve a non-default ephemeral loopback port for Playwright.');
}

function waitForExit(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', resolveExit);
  });
}

async function waitForProcessExitOrTimeout(exitPromise, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      exitPromise.then(() => true),
      new Promise((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout(false), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function isPortClosed(port) {
  const server = createServer();
  try {
    await new Promise((resolvePort, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolvePort);
    });
    await new Promise((resolveClose, reject) =>
      server.close((error) => (error ? reject(error) : resolveClose()))
    );
    return true;
  } catch {
    server.close();
    return false;
  }
}

async function waitForOwnedPortsToClose(ports) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await Promise.all(ports.map(isPortClosed))).every(Boolean)) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  return false;
}

async function waitForReady(baseUrl, apiPort) {
  let processError;
  stackProcess.once('error', (error) => {
    processError = error;
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (processError) throw processError;
    if (stackProcess.exitCode !== null || stackProcess.signalCode !== null) {
      throw new Error(
        `The isolated app process stopped during startup (code=${stackProcess.exitCode}, signal=${stackProcess.signalCode}).`
      );
    }
    if (existsSync(readyFile)) {
      const [pid, port] = readFileSync(readyFile, 'utf8').trim().split(':').map(Number);
      if (!Number.isInteger(pid) || pid <= 0 || port !== apiPort) {
        throw new Error('The app wrote an invalid isolated-server readiness marker.');
      }
      try {
        const response = await fetch(`${baseUrl}/api/health`, {
          signal: AbortSignal.timeout(1_000)
        });
        if (response.status === 200) return;
      } catch {
        // The dev frontend may still be compiling; poll without contacting shared ports.
      }
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('The isolated UI/API did not become ready within 120 seconds.');
}

function writeWorkflowOutputs(paths) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `e2e_run_dir=${paths.runDir}\ne2e_results_file=${paths.resultsFile}\ne2e_report_dir=${paths.reportDir}\ne2e_output_dir=${paths.outputDir}\n`,
    'utf8'
  );
}

function startStack(fullStack, env, quiet = false) {
  if (fullStack) {
    const serverEntry = join(root, 'server', 'dist', 'index.js');
    if (!existsSync(serverEntry)) {
      throw new Error('Full-stack E2E requires a completed server/frontend build before launch.');
    }
    return spawn(process.execPath, [serverEntry], {
      cwd: root,
      env: {
        ...env,
        PORT: env.E2E_API_PORT,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        CORS_ORIGIN: env.E2E_BASE_URL,
        DISABLE_RATE_LIMIT: '0'
      },
      stdio: quiet ? 'ignore' : 'inherit',
      windowsHide: true
    });
  }
  return spawn(process.execPath, [join(root, 'scripts', 'e2e-dev-stack.mjs')], {
    cwd: root,
    env: { ...env, DISABLE_RATE_LIMIT: env.E2E_RATE_LIMIT === 'on' ? '0' : '1' },
    stdio: quiet ? ['ignore', 'ignore', 'ignore', 'ipc'] : ['ignore', 'inherit', 'inherit', 'ipc'],
    windowsHide: true
  });
}

function stopStack() {
  if (!stopStackPromise) {
    stopStackPromise = (async () => {
      if (!stackProcess || stackProcess.exitCode !== null || stackProcess.signalCode !== null)
        return true;
      const exited = waitForExit(stackProcess);
      if (!fullStack && stackProcess.connected) {
        stackProcess.send({ type: 'shutdown' }, (error) => {
          if (error && stackProcess.exitCode === null && stackProcess.signalCode === null) {
            stackProcess.kill('SIGTERM');
          }
        });
      } else {
        stackProcess.kill('SIGTERM');
      }

      const graceful = await waitForProcessExitOrTimeout(exited, 15_000);
      if (graceful) return true;

      if (stackProcess.exitCode === null && stackProcess.signalCode === null) {
        stackProcess.kill('SIGKILL');
      }
      return waitForProcessExitOrTimeout(exited, 5_000);
    })();
  }
  return stopStackPromise;
}

function requestShutdown(signal = 'SIGINT') {
  if (shutdownRequested) return;
  shutdownRequested = true;
  if (testProcess && testProcess.exitCode === null && testProcess.signalCode === null) {
    testProcess.kill(signal);
  }
  void stopStack();
}

async function main() {
  if (shutdownRequested) throw new Error('The isolated E2E run was cancelled before startup.');
  if (!existsSync(playwrightCli)) {
    throw new Error('Playwright CLI is missing; install the repository dependencies first.');
  }

  const appPort = await availablePort();
  if (shutdownRequested) throw new Error('The isolated E2E run was cancelled before startup.');
  const apiPort = fullStack ? appPort : await availablePort(new Set([appPort]));
  if (shutdownRequested) throw new Error('The isolated E2E run was cancelled before startup.');
  ownedPorts = fullStack ? [appPort] : [appPort, apiPort];
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const paths = {
    runDir,
    databasePath: join(runDir, 'hogaria.sqlite'),
    resultsFile: join(runDir, 'results.json'),
    reportDir: join(runDir, 'playwright-report'),
    outputDir: join(runDir, 'artifacts')
  };
  const env = {
    ...process.env,
    E2E_RUN_DIR: runDir,
    E2E_STACK: fullStack ? 'full-stack' : 'dev',
    E2E_EXTERNAL_STACK: '1',
    E2E_RATE_LIMIT: process.env.E2E_RATE_LIMIT ?? (fullStack ? 'on' : 'off'),
    E2E_BASE_URL: baseUrl,
    E2E_FRONTEND_PORT: String(appPort),
    E2E_API_PORT: String(apiPort),
    E2E_API_URL: `http://127.0.0.1:${apiPort}`,
    E2E_SEED: `qa-${basename(runDir)}`,
    E2E_READY_FILE: readyFile,
    E2E_RESULTS_FILE: paths.resultsFile,
    E2E_REPORT_DIR: paths.reportDir,
    E2E_OUTPUT_DIR: paths.outputDir,
    DATABASE_PATH: paths.databasePath,
    PANTRY_IMAGE_SEARCH_FIXTURE: '1'
  };
  const processEnvs = liveSmoke
    ? isolatedProcessEnvironments(env)
    : { server: env, browser: env, playwright: env };
  if (!liveSmoke) writeWorkflowOutputs(paths);

  if (shutdownRequested) throw new Error('The isolated E2E run was cancelled before startup.');
  reportSmokeProgress('isolated-stack-starting');
  stackProcess = startStack(fullStack, processEnvs.server, liveSmoke);
  await waitForReady(baseUrl, apiPort);
  if (shutdownRequested) throw new Error('The isolated E2E run was cancelled before Playwright.');
  reportSmokeProgress('isolated-stack-ready');

  const playwrightArgs = ['test', ...args];
  if (!liveSmoke) {
    console.log(
      `[hogaria] isolated Playwright (${env.E2E_STACK}) at ${baseUrl}; SQLite and artifacts are under OS temp.`
    );
  }
  reportSmokeProgress('playwright-starting');
  testProcess = spawn(process.execPath, [playwrightCli, ...playwrightArgs], {
    cwd: root,
    env: processEnvs.playwright,
    stdio: liveSmoke ? 'ignore' : 'inherit',
    windowsHide: true
  });
  exitCode = await new Promise((resolveExit, reject) => {
    testProcess.once('error', reject);
    testProcess.once('exit', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
  reportLastLiveSmokeTestPhase();
  reportSmokeProgress(exitCode === 0 ? 'playwright-passed' : 'playwright-failed');

  if (!(await stopStack())) {
    throw new Error('The isolated app process did not stop; preserving its temporary data.');
  }
  const portsClosed = await waitForOwnedPortsToClose(ownedPorts);
  if (!portsClosed) {
    throw new Error(
      'An isolated app port is still listening; preserving its temp data and not attempting to stop an unknown process.'
    );
  }
  preserve = liveSmoke ? false : exitCode !== 0 || process.env.CI === 'true';
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => requestShutdown(signal));
}
process.on('message', (message) => {
  if (liveSmoke && message?.type === AI_LIVE_SMOKE_RUNNER_SHUTDOWN_MESSAGE) {
    requestShutdown('SIGINT');
  }
});

function sendSmokeRunnerCompletion(cleaned) {
  if (!liveSmoke || !process.connected) return;
  sendAiLiveSmokeRunnerCompletion({ cleaned });
}

try {
  reportSmokeProgress('run-dir-created');
  await main();
} catch (error) {
  if (liveSmoke) {
    reportSmokeProgress('runner-error');
    console.error('[hogaria] isolated AI smoke runner failed.');
  } else console.error(error instanceof Error ? error.message : String(error));
  preserve = !liveSmoke;
  exitCode = 1;
} finally {
  if (testProcess && testProcess.exitCode === null && testProcess.signalCode === null) {
    testProcess.kill('SIGINT');
    let stopped = await waitForProcessExitOrTimeout(waitForExit(testProcess), 15_000);
    if (!stopped && testProcess.exitCode === null && testProcess.signalCode === null) {
      testProcess.kill('SIGTERM');
      stopped = await waitForProcessExitOrTimeout(waitForExit(testProcess), 10_000);
    }
    if (!stopped) {
      preserve = true;
      exitCode = 1;
    }
  }
  if (!(await stopStack())) {
    preserve = true;
    exitCode = 1;
  }
  if (ownedPorts.length > 0 && !(await waitForOwnedPortsToClose(ownedPorts))) {
    preserve = true;
    exitCode = 1;
    if (!liveSmoke) {
      console.error(
        'An isolated app port is still listening; preserving its temp data and not attempting to stop an unknown process.'
      );
    }
  }

  const tempRoot = resolve(tmpdir());
  const target = resolve(runDir);
  const pathFromTemp = relative(tempRoot, target);
  const isOwned =
    basename(target).startsWith('hogaria-e2e-') &&
    pathFromTemp !== '' &&
    pathFromTemp !== '..' &&
    !pathFromTemp.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromTemp);
  if (!isOwned || lstatSync(runDir).isSymbolicLink()) {
    console.error(
      liveSmoke
        ? '[hogaria] refusing unsafe AI smoke cleanup.'
        : 'Refusing to clean an unowned or redirected E2E temp directory.'
    );
    exitCode = 1;
  } else if (preserve) {
    if (!liveSmoke) {
      console.log(`[hogaria] isolated artifacts preserved for inspection: ${runDir}`);
    }
  } else {
    try {
      rmSync(runDir, { recursive: true, force: false });
      runnerCleanupVerified = true;
      if (!liveSmoke) {
        console.log(
          '[hogaria] isolated database and artifacts cleaned after the owned app process stopped.'
        );
      }
    } catch {
      exitCode = 1;
      console.error(
        liveSmoke
          ? '[hogaria] isolated AI smoke data cleanup failed.'
          : 'The isolated E2E temp directory could not be cleaned.'
      );
    }
  }
  sendSmokeRunnerCompletion(runnerCleanupVerified);
}

process.exitCode = exitCode;
