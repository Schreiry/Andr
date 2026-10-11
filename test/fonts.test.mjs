import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fontFaces, fontStackFor, paths } from '../src/config.mjs';
import { listLocales, loadLayout, loadLocale, resolveDocument, textEntries } from '../src/content.mjs';
import { readCodePoints } from '../src/font-coverage.mjs';
import { headingCase, typeset } from '../src/typography.mjs';

const layout = await loadLayout();
const langs = await listLocales();

describe('font coverage', () => {
  it('every face listed in faces.json exists and is readable', async () => {
    for (const face of fontFaces) {
      const points = await readCodePoints(path.join(paths.assets, 'fonts', face.file));
      assert.ok(points.size > 100, `${face.file} looks empty`);
    }
  });

  for (const lang of langs) {
    it(`fonts for "${lang}" can draw every character of its texts`, async () => {
      const doc = resolveDocument(layout, await loadLocale(lang));
      const covered = new Set();
      for (const family of fontStackFor(lang)) {
        for (const face of fontFaces.filter((f) => f.family === family)) {
          for (const cp of await readCodePoints(path.join(paths.assets, 'fonts', face.file))) covered.add(cp);
        }
      }
      // Check what is actually printed: typographic spaces and heading capitals included.
      const printed = textEntries(doc)
        .map(([, text]) => `${typeset(text, lang)} ${headingCase(text, doc.meta)}`)
        .join(' ');
      const missing = [...new Set(printed.replace(/\*\*/g, ''))].filter(
        (ch) => !/\s/.test(ch) && ch !== ' ' && !covered.has(ch.codePointAt(0)),
      );
      assert.deepEqual(missing, [], `characters without a glyph: ${missing.join(' ')}`);
    });
  }
});
