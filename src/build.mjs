#!/usr/bin/env node
/**
 * Builds the poster for every locale (or only those given as arguments):
 *   dist/tea-club-rules-<lang>.pdf          print-ready A4
 *   dist/tea-club-rules-<lang>-print.png    300 dpi raster
 *   dist/tea-club-rules-<lang>-screen.png   for screens and messengers
 *   dist/tea-club-rules-<lang>.docx         editable text (+ review table for translations)
 *
 * Usage: npm run build [-- ka ru]
 *        npm run preview [-- ka]    only writes build/<lang>/poster.html, no checks
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { outputName, paths, pngExports } from './config.mjs';
import {
  listLocales,
  loadLayout,
  loadLocale,
  resolveDocument,
  validateLocale,
  iconNames,
} from './content.mjs';
import { exportPoster, launchBrowser } from './export-browser.mjs';
import { renderDocx } from './render-docx.mjs';
import { renderPoster } from './render-html.mjs';

async function loadIcons() {
  const files = (await readdir(paths.icons)).filter((f) => f.endsWith('.svg'));
  const entries = await Promise.all(
    files.map(async (file) => {
      const svg = (await readFile(path.join(paths.icons, file), 'utf8'))
        .replace(/\s(width|height|class)="[^"]*"/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return [path.basename(file, '.svg'), svg.replace('<svg ', '<svg aria-hidden="true" ')];
    }),
  );
  return new Map(entries);
}

async function loadDocuments(layout, langs) {
  const errors = [];
  const docs = new Map();
  for (const lang of await listLocales()) {
    const locale = await loadLocale(lang);
    errors.push(...validateLocale(layout, locale, lang));
    docs.set(lang, locale);
  }
  const unknown = langs.filter((lang) => !docs.has(lang));
  if (unknown.length) errors.push(`no locale file for: ${unknown.join(', ')}`);
  if (errors.length) throw new Error(`Content errors:\n  ${errors.join('\n  ')}`);
  return new Map([...docs].map(([lang, locale]) => [lang, resolveDocument(layout, locale)]));
}

async function main() {
  const args = process.argv.slice(2);
  const htmlOnly = args.includes('--html-only');
  const requested = args.filter((arg) => !arg.startsWith('--'));
  const layout = await loadLayout();
  const docs = await loadDocuments(layout, requested);
  const langs = requested.length ? requested : [...docs.keys()];
  const source = [...docs.values()].find((doc) => doc.meta.role === 'source');

  const icons = await loadIcons();
  const missingIcons = iconNames(layout).filter((name) => !icons.has(name));
  if (missingIcons.length) throw new Error(`Missing icons in assets/icons: ${missingIcons.join(', ')}`);

  const css = await readFile(paths.styles, 'utf8');
  await mkdir(paths.dist, { recursive: true });
  const browser = htmlOnly ? null : await launchBrowser();
  try {
    for (const lang of langs) {
      const doc = docs.get(lang);
      const htmlDir = path.join(paths.build, lang);
      await mkdir(htmlDir, { recursive: true });
      const htmlFile = path.join(htmlDir, 'poster.html');
      const assetsHref = path.relative(htmlDir, paths.assets).split(path.sep).join('/');
      await writeFile(htmlFile, renderPoster(doc, { css, icons, assetsHref }));
      if (htmlOnly) {
        console.log(`✓ ${lang}: ${path.relative(paths.root, htmlFile)}`);
        continue;
      }

      const out = (ext, suffix) => path.join(paths.dist, outputName(lang, ext, suffix));
      await exportPoster(browser, htmlFile, {
        pdfFile: out('pdf'),
        pngs: pngExports.map(({ suffix, widthPx }) => ({ file: out('png', suffix), widthPx })),
      });
      await writeFile(out('docx'), await renderDocx(doc, { source }));
      console.log(`✓ ${lang}: ${path.relative(paths.root, out('pdf'))}, PNG ×${pngExports.length}, DOCX`);
    }
  } finally {
    await browser?.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
