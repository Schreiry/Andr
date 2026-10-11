import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { page as pageSize, textFit } from './config.mjs';

const MM_TO_CSS_PX = 96 / 25.4;
const viewport = {
  width: Math.ceil(pageSize.widthMm * MM_TO_CSS_PX),
  height: Math.ceil(pageSize.heightMm * MM_TO_CSS_PX),
};

/** Runs inside the page: lists every element that does not fit its box. */
function findOverflow() {
  const TOLERANCE = 0.5; // px
  const problems = [];
  const describe = (el) =>
    el.closest('[data-item]')?.dataset.item ?? el.closest('[data-section]')?.dataset.section ?? el.className;
  const check = (container, label) => {
    const box = container.getBoundingClientRect();
    const style = getComputedStyle(container);
    const inner = {
      top: box.top + parseFloat(style.paddingTop) - TOLERANCE,
      bottom: box.bottom - parseFloat(style.paddingBottom) + TOLERANCE,
      left: box.left - TOLERANCE,
      right: box.right + TOLERANCE,
    };
    for (const el of container.querySelectorAll('*')) {
      if (el.closest('svg') && el.tagName !== 'svg') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.bottom > inner.bottom || r.right > inner.right || r.left < inner.left) {
        problems.push(
          `${label}: "${describe(el)}" sticks out by ${Math.round(Math.max(r.bottom - inner.bottom, r.right - inner.right, inner.left - r.left))}px`,
        );
        break;
      }
    }
  };
  check(document.querySelector('.page'), 'page');
  for (const el of document.querySelectorAll('[data-fit]')) check(el, el.className);
  return problems;
}

/** Runs inside the page: sets the text scale and re-aligns the background pattern. */
function applyScale(scale) {
  document.documentElement.style.setProperty('--scale', String(scale));
  window.alignPatterns();
}

/**
 * Binary search for the largest text scale at which nothing overflows.
 * Returns { scale, problems }; problems is non-empty when even minScale does not fit.
 */
async function fitTextScale(tab, { minScale, maxScale, steps }) {
  const problemsAt = async (scale) => {
    await tab.evaluate(applyScale, scale);
    return tab.evaluate(findOverflow);
  };
  const atMin = await problemsAt(minScale);
  if (atMin.length) return { scale: minScale, problems: atMin };
  let [fits, overflows] = [minScale, maxScale];
  if ((await problemsAt(maxScale)).length === 0) fits = maxScale;
  else {
    for (let i = 0; i < steps; i += 1) {
      const mid = (fits + overflows) / 2;
      if ((await problemsAt(mid)).length === 0) fits = mid;
      else overflows = mid;
    }
  }
  const scale = Math.floor(fits * 1000) / 1000;
  await tab.evaluate(applyScale, scale);
  return { scale, problems: [] };
}

/**
 * Opens one HTML poster, fits the text to the page and writes the requested files.
 * Returns the text scale that was used.
 */
export async function exportPoster(browser, htmlFile, { pdfFile, pngs = [] }) {
  const url = pathToFileURL(htmlFile).href;
  const open = async (deviceScaleFactor = 1) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor });
    const tab = await context.newPage();
    await tab.goto(url, { waitUntil: 'load' });
    await tab.waitForSelector('html[data-ready]');
    return { context, tab };
  };

  const { context, tab } = await open();
  const { scale, problems } = await fitTextScale(tab, textFit);
  if (problems.length) {
    await context.close();
    throw new Error(
      `Layout does not fit even at text scale ${textFit.minScale} (${htmlFile}):\n  ${problems.join('\n  ')}`,
    );
  }
  if (pdfFile) {
    await tab.pdf({ path: pdfFile, preferCSSPageSize: true, printBackground: true });
  }
  await context.close();

  for (const { file, widthPx } of pngs) {
    const shot = await open(widthPx / (pageSize.widthMm * MM_TO_CSS_PX));
    await shot.tab.evaluate(applyScale, scale);
    await shot.tab.locator('.page').screenshot({ path: file });
    await shot.context.close();
  }
  return scale;
}

export const launchBrowser = () => chromium.launch();
