import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const angularWorkspace = JSON.parse(readFileSync(join(repoRoot, 'frontend/angular.json'), 'utf8'));
const frontendPackage = JSON.parse(readFileSync(join(repoRoot, 'frontend/package.json'), 'utf8'));
const testTarget = angularWorkspace.projects.hogaria.architect.test;

test('the standard Angular test target loads the repository Karma config', () => {
  assert.equal(testTarget.options.karmaConfig, 'karma.conf.js');
  assert.match(frontendPackage.scripts.test, /--code-coverage/);
  assert.match(frontendPackage.scripts['test:coverage'], /--code-coverage/);
});

test('Karma keeps the 80% gate and CI default while exposing a local Chrome launcher', () => {
  const require = createRequire(import.meta.url);
  const configureKarma = require('../frontend/karma.conf.js');
  let options;
  configureKarma({
    LOG_INFO: 'INFO',
    set(config) {
      options = config;
    }
  });

  assert.deepEqual(options.coverageReporter.check.global, {
    statements: 80,
    branches: 80,
    functions: 80,
    lines: 80
  });
  assert.deepEqual(options.browsers, ['ChromeHeadless']);
  assert.equal(options.customLaunchers?.ChromeHeadlessLocal?.base, 'ChromeHeadless');
  assert.ok(options.customLaunchers.ChromeHeadlessLocal.flags.includes('--use-angle=swiftshader'));
});
