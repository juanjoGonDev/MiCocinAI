export const AI_LIVE_SMOKE_DEADLINES = Object.freeze({
  recipeMaxTokens: 4096,
  configMs: 240_000,
  proxyMs: 255_000,
  requestMs: 270_000,
  testMs: 20 * 60_000,
  globalMs: 21 * 60_000,
  watchdogMs: 22 * 60_000
});

const DEADLINE_KEYS = ['configMs', 'proxyMs', 'requestMs', 'testMs', 'globalMs', 'watchdogMs'];

export function assertAiLiveSmokeDeadlineContract(deadlines = AI_LIVE_SMOKE_DEADLINES) {
  if (
    !deadlines ||
    typeof deadlines !== 'object' ||
    DEADLINE_KEYS.some((key) => !Number.isSafeInteger(deadlines[key]) || deadlines[key] <= 0) ||
    !Number.isSafeInteger(deadlines.recipeMaxTokens) ||
    deadlines.recipeMaxTokens <= 0
  ) {
    throw new Error('Live AI smoke deadlines must be positive safe integers.');
  }
  if (
    deadlines.configMs > 240_000 ||
    deadlines.recipeMaxTokens > 4096 ||
    !DEADLINE_KEYS.every(
      (key, index, keys) => index === 0 || deadlines[key] > deadlines[keys[index - 1]]
    )
  ) {
    throw new Error('Live AI smoke deadlines must be strictly increasing and within API limits.');
  }
  return true;
}
