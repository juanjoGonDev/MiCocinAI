import { expect, test } from './fixtures';

test.skip(process.env.E2E_NGINX_INGRESS !== '1', 'requiere el runner aislado con Nginx real');

test('el ingress Nginx aislado alcanza el backend de pruebas', async ({ page }) => {
  const healthResponse = await page.goto('/api/health');
  expect(healthResponse?.status()).toBe(200);
});
