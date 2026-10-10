import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './fixtures';
import { registerAndGoto } from './helpers/auth';

test.describe('authenticated mobile navigation drawer', () => {
  test('supports keyboard and existing close paths across breakpoint edges', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await registerAndGoto(page, '/dashboard', 'Drawer Escape');

    const menuButton = page.locator('.header__menu');
    const overlay = page.locator('.sidebar-overlay');
    const sidebar = page.locator('.sidebar');
    const bottomNav = page.locator('.bottom-nav');

    for (const viewport of [
      { width: 393, height: 851 },
      { width: 320, height: 568 },
      { width: 568, height: 320 },
      { width: 1023, height: 768 }
    ]) {
      await page.setViewportSize(viewport);
      await expect(menuButton).toBeVisible();
      await expect(menuButton).toHaveAttribute('aria-controls', 'primary-sidebar');
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      await expect(bottomNav).toBeVisible();

      const mobileNavigation = await page.evaluate(() => {
        const nav = document.querySelector<HTMLElement>('.bottom-nav');
        const main = document.querySelector<HTMLElement>('main.main');
        if (!nav || !main) throw new Error('Falta la navegación móvil o el contenido principal');

        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;padding-bottom:env(safe-area-inset-bottom, 0px)';
        document.body.append(probe);
        const safeAreaInset = Number.parseFloat(getComputedStyle(probe).paddingBottom);
        probe.remove();

        const rect = nav.getBoundingClientRect();
        return {
          position: getComputedStyle(nav).position,
          bottom: rect.bottom,
          safeAreaInset,
          navSafeAreaPadding: Number.parseFloat(getComputedStyle(nav).paddingBottom),
          mainBottomPadding: Number.parseFloat(getComputedStyle(main).paddingBottom),
          targets: Array.from(nav.querySelectorAll<HTMLElement>('.bottom-nav__item')).map(
            (item) => {
              const itemRect = item.getBoundingClientRect();
              return { width: itemRect.width, height: itemRect.height };
            }
          )
        };
      });
      expect(mobileNavigation.position).toBe('fixed');
      expect(Math.abs(mobileNavigation.bottom - viewport.height)).toBeLessThanOrEqual(1);
      expect(mobileNavigation.navSafeAreaPadding).toBe(mobileNavigation.safeAreaInset);
      expect(mobileNavigation.mainBottomPadding).toBeGreaterThanOrEqual(
        64 + mobileNavigation.safeAreaInset
      );
      expect(mobileNavigation.targets.length).toBeGreaterThan(0);
      for (const target of mobileNavigation.targets) {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      }

      await menuButton.focus();
      await page.keyboard.press('Enter');
      await expect(overlay).toBeVisible();
      await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(overlay).toHaveCount(0);
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      await expect(menuButton).toBeFocused();

      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth).toBeLessThanOrEqual(viewport.width);

      if (viewport.height === 320) {
        const nav = page.locator('.sidebar__nav');
        const dimensions = await nav.evaluate((element) => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight
        }));
        expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
        await nav.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        expect(await nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      }

      // The visible close button, outside click, and navigation still dismiss the drawer.
      await menuButton.click();
      await expect(overlay).toBeVisible();
      await page.locator('.sidebar__close').click();
      await expect(overlay).toHaveCount(0);

      await menuButton.click();
      await expect(overlay).toBeVisible();
      const outsidePoint = await page.evaluate(() => {
        const overlayElement = document.querySelector<HTMLElement>('.sidebar-overlay');
        const sidebarElement = document.querySelector<HTMLElement>('.sidebar');
        if (!overlayElement || !sidebarElement) throw new Error('Falta el drawer móvil');

        const overlayRect = overlayElement.getBoundingClientRect();
        const sidebarRect = sidebarElement.getBoundingClientRect();
        const outsideStart = Math.max(overlayRect.left, sidebarRect.right);
        return {
          x: Math.floor((outsideStart + overlayRect.right) / 2),
          y: Math.floor((overlayRect.top + overlayRect.bottom) / 2)
        };
      });
      expect(
        await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('sidebar-overlay'),
          outsidePoint
        )
      ).toBe(true);
      await page.mouse.click(outsidePoint.x, outsidePoint.y);
      await expect(overlay).toHaveCount(0);

      await menuButton.click();
      await page.locator('.sidebar__nav').getByRole('link', { name: 'Recetas' }).click();
      await expect(page).toHaveURL(/\/recipes/);
      await expect(overlay).toHaveCount(0);
      await page.goto('/dashboard');
    }

    for (const width of [1024, 1025, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(menuButton).toBeHidden();
      await expect(sidebar).toBeVisible();
      await expect(overlay).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(sidebar).toBeVisible();
      expect((await sidebar.boundingBox())?.x).toBe(0);
    }

    const screenshotDirectory = process.env.E2E_SCREENSHOT_DIR;
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({
        path: join(screenshotDirectory, 'main-layout-drawer-desktop.png'),
        animations: 'disabled'
      });
      await page.setViewportSize({ width: 393, height: 851 });
      await menuButton.click();
      await expect(overlay).toBeVisible();
      await page.screenshot({
        path: join(screenshotDirectory, 'main-layout-drawer-mobile.png'),
        animations: 'disabled'
      });
    }
  });

  test('navigating from the drawer account action closes it without hiding desktop navigation', async ({
    page
  }, testInfo) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await registerAndGoto(page, '/dashboard', 'Drawer profile navigation');

    const accountName = page.locator('#account-name');
    const screenshotDirectory = process.env.E2E_SCREENSHOT_DIR;
    for (const viewport of [
      { width: 393, height: 851 },
      { width: 320, height: 568 },
      { width: 568, height: 320 },
      { width: 1023, height: 768 }
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/dashboard');
      const menuButton = page.locator('.header__menu');
      const overlay = page.locator('.sidebar-overlay');
      const sidebar = page.locator('.sidebar');
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      await expect(overlay).toHaveCount(0);

      await menuButton.click();
      await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      await expect(overlay).toBeVisible();
      await page.locator('.sidebar__account-main').click();

      await expect(page).toHaveURL(/\/account/);
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      await expect(overlay).toHaveCount(0);
      await expect(sidebar).not.toBeInViewport();
      await accountName.scrollIntoViewIfNeeded();
      await expect(accountName).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width
      );

      if (screenshotDirectory && viewport.width === 393) {
        mkdirSync(screenshotDirectory, { recursive: true });
        await page.screenshot({
          path: join(screenshotDirectory, `${testInfo.project.name}-account-mobile-closed.png`),
          animations: 'disabled',
          fullPage: false
        });
      }
    }

    for (const width of [1024, 1025, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('.header__menu')).toBeHidden();
      const sidebar = page.locator('.sidebar');
      await expect(sidebar).toBeInViewport();
      await expect.poll(async () => (await sidebar.boundingBox())?.x).toBe(0);
      await expect(page.locator('.sidebar-overlay')).toHaveCount(0);
      await expect(accountName).toBeVisible();
      if (screenshotDirectory && width === 1440) {
        await page.screenshot({
          path: join(screenshotDirectory, `${testInfo.project.name}-account-desktop.png`),
          animations: 'disabled',
          fullPage: false
        });
      }
    }
  });

  test('mobile and desktop navigation preserve direct routes and browser history', async ({
    page
  }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await registerAndGoto(page, '/dashboard', 'Shell browser history');

    const mobileRecipes = page.locator('.bottom-nav__item[href="/recipes"]');
    await expect(mobileRecipes).toBeVisible();
    await mobileRecipes.click();
    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.locator('app-recipes')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('app-dashboard')).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.locator('app-recipes')).toBeVisible();

    // Deep links and the desktop sidebar must reach the same routed views.
    await page.goto('/dashboard');
    await expect(page.locator('app-dashboard')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopPantry = page.locator('.sidebar__nav .sidebar__item[href="/pantry"]');
    await expect(desktopPantry).toBeVisible();
    await desktopPantry.click();
    await expect(page).toHaveURL(/\/pantry$/);
    await expect(page.locator('app-pantry')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('app-dashboard')).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/pantry$/);
    await expect(page.locator('app-pantry')).toBeVisible();
  });
});
