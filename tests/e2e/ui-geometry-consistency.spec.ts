import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from './fixtures';
import { registerAndGoto } from './helpers/auth';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 393, height: 851 },
  { width: 568, height: 320 },
  { width: 767, height: 1024 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 }
];

const GEOMETRY_KEYS = [
  'paddingBlockStart',
  'paddingBlockEnd',
  'paddingInlineStart',
  'paddingInlineEnd',
  'marginBlockStart',
  'marginBlockEnd',
  'marginInlineStart',
  'marginInlineEnd',
  'gap',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'borderStyle',
  'borderWidth',
  'borderRadius'
] as const;

type ButtonGeometry = Record<(typeof GEOMETRY_KEYS)[number], string> & {
  label: string;
  className: string;
  width: number;
  height: number;
};

test('las acciones equivalentes de la cabecera del calendario comparten geometría', async ({
  page
}, testInfo) => {
  await registerAndGoto(page, '/calendar', 'UI geometry calendar');
  await expect(page.getByRole('button', { name: 'Planificar IA', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const observations: Array<{
    viewport: { width: number; height: number };
    controls: ButtonGeometry[];
    datePicker: { width: number; height: number };
    groupGaps: string[];
    dayHeaders: Array<{
      cell: { left: number; right: number; top: number; bottom: number };
      text: Array<{ left: number; right: number; top: number; bottom: number }>;
      addAction?: { left: number; right: number; top: number; bottom: number };
    }>;
  }> = [];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );

    const controls = await page.locator('.cal-top button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const element = button as HTMLButtonElement;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          label: element.innerText.replace(/\s+/g, ' ').trim(),
          className: String(element.className),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
          paddingBlockStart: style.paddingBlockStart,
          paddingBlockEnd: style.paddingBlockEnd,
          paddingInlineStart: style.paddingInlineStart,
          paddingInlineEnd: style.paddingInlineEnd,
          marginBlockStart: style.marginBlockStart,
          marginBlockEnd: style.marginBlockEnd,
          marginInlineStart: style.marginInlineStart,
          marginInlineEnd: style.marginInlineEnd,
          gap: style.gap,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          borderStyle: style.borderTopStyle,
          borderWidth: style.borderWidth,
          borderRadius: style.borderTopLeftRadius
        };
      })
    );
    const datePicker = await page.locator('.cal-top .cal-jump').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: Number(rect.width.toFixed(2)), height: Number(rect.height.toFixed(2)) };
    });
    const groupGaps = await page
      .locator('.cal-top__nav, .cal-top__right')
      .evaluateAll((groups) => groups.map((group) => getComputedStyle(group).columnGap));
    const dayHeaders = await page.locator('.tl__dayhead').evaluateAll((headers) =>
      headers.map((header) => {
        const rect = header.getBoundingClientRect();
        const text = Array.from(header.querySelectorAll<HTMLElement>('.tl__dow, .tl__num')).map(
          (label) => {
            const labelRect = label.getBoundingClientRect();
            return {
              left: labelRect.left,
              right: labelRect.right,
              top: labelRect.top,
              bottom: labelRect.bottom
            };
          }
        );
        const addAction = header.querySelector('app-icon-button')?.getBoundingClientRect();
        return {
          cell: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
          text,
          ...(addAction
            ? {
                addAction: {
                  left: addAction.left,
                  right: addAction.right,
                  top: addAction.top,
                  bottom: addAction.bottom
                }
              }
            : {})
        };
      })
    );

    expect(controls, `controles presentes a ${viewport.width}×${viewport.height}`).toHaveLength(9);
    observations.push({ viewport, controls, datePicker, groupGaps, dayHeaders });
  }

  const mismatches = observations.flatMap(
    ({ viewport, controls, datePicker, groupGaps, dayHeaders }) => {
      const reference = controls.find((control) => control.label === 'Planificar IA');
      if (!reference) return [`Falta Planificar IA a ${viewport.width}×${viewport.height}`];

      const mismatches = controls.flatMap((control) =>
        Math.abs(Number(reference.height) - Number(control.height)) <= 1
          ? []
          : [
              `${viewport.width}×${viewport.height} ${control.className} height: ${control.height} vs ${reference.height}`
            ]
      );
      for (const control of controls.filter((item) => item.className.includes('cal-icon-btn'))) {
        if (Math.abs(Number(control.width) - Number(reference.height)) > 1) {
          mismatches.push(
            `${viewport.width}×${viewport.height} ${control.className} width: ${control.width} vs ${reference.height}`
          );
        }
      }
      if (
        Math.abs(datePicker.height - Number(reference.height)) > 1 ||
        Math.abs(datePicker.width - datePicker.height) > 1
      ) {
        mismatches.push(
          `${viewport.width}×${viewport.height} cal-jump size: ${datePicker.width}×${datePicker.height} vs ${reference.height}px`
        );
      }
      if (new Set(groupGaps).size !== 1) {
        mismatches.push(
          `${viewport.width}×${viewport.height} toolbar gaps differ: ${groupGaps.join(', ')}`
        );
      }
      if (viewport.width <= 720) {
        for (const [index, day] of dayHeaders.entries()) {
          for (const text of day.text) {
            if (text.left < day.cell.left - 1 || text.right > day.cell.right + 1) {
              mismatches.push(
                `${viewport.width}×${viewport.height} day ${index + 1} text escapes its column: ${text.left.toFixed(2)}–${text.right.toFixed(2)} vs ${day.cell.left.toFixed(2)}–${day.cell.right.toFixed(2)}`
              );
            }
          }
          if (
            day.addAction &&
            (day.addAction.left < day.cell.left - 1 || day.addAction.right > day.cell.right + 1)
          ) {
            mismatches.push(
              `${viewport.width}×${viewport.height} day ${index + 1} add action escapes its column`
            );
          }
        }
      }
      const textControls = controls.filter(
        (control) => !control.className.includes('cal-icon-btn')
      );
      const textReference = textControls.find((control) => control.label === 'Planificar IA');
      if (!textReference) return [...mismatches, `Falta Planificar IA en controles de texto`];

      mismatches.push(
        ...textControls
          .filter((control) => control.label !== 'Planificar IA')
          .flatMap((control) =>
            GEOMETRY_KEYS.flatMap((key) =>
              textReference[key] === control[key]
                ? []
                : [
                    `${viewport.width}×${viewport.height} ${control.className} ${key}: ${textReference[key]} vs ${control[key]}`
                  ]
            )
          )
      );

      return mismatches;
    }
  );

  await page.setViewportSize({ width: 320, height: 568 });
  const timelineViewport = page.locator('.tl__viewport');
  const scrollMetrics = await timelineViewport.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);

  const dayButtons = page.locator('.tl__daynum');
  await dayButtons.first().focus();
  for (
    let tab = 0;
    tab < 20 && !(await dayButtons.last().evaluate((e) => e === document.activeElement));
    tab++
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(dayButtons.last()).toBeFocused();
  await expect
    .poll(() => timelineViewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);

  const screenshotDirectory = process.env.E2E_SCREENSHOT_DIR;
  if (screenshotDirectory) {
    mkdirSync(screenshotDirectory, { recursive: true });
    const mobile = testInfo.project.name === 'mobile-chrome';
    await page.setViewportSize(mobile ? { width: 393, height: 851 } : { width: 1440, height: 900 });
    await timelineViewport.evaluate((element) => (element.scrollLeft = 0));
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await page.screenshot({
      path: join(screenshotDirectory, `ui-geometry-${mobile ? 'mobile' : 'desktop'}.png`)
    });
  }

  expect(mismatches, JSON.stringify(observations, null, 2)).toEqual([]);
});
