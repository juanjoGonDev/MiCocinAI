import type { Locator, Page } from '@playwright/test';

const NEW_LIST_ACTIONS = '[data-test="new-list"]:visible, [data-test="new-list-text"]:visible';

/** Returns the create-list control currently exposed by the responsive UI. */
export function shoppingNewListAction(page: Page): Locator {
  return page.locator(NEW_LIST_ACTIONS).first();
}

/** Uses the navigation that is in the viewport at the app-shell breakpoint. */
export function shoppingNavigationLink(page: Page): Locator {
  const width = page.viewportSize()?.width ?? 1024;
  const navigation = width < 1024 ? '.bottom-nav' : '.sidebar__nav';
  return page.locator(`${navigation} a[href="/shopping"]`);
}
