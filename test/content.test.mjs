import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { paths } from '../src/config.mjs';
import {
  iconNames,
  listLocales,
  loadLayout,
  loadLocale,
  resolveDocument,
  textEntries,
  validateLocale,
} from '../src/content.mjs';

const layout = await loadLayout();
const langs = await listLocales();
const docs = new Map(
  await Promise.all(langs.map(async (lang) => [lang, resolveDocument(layout, await loadLocale(lang))])),
);

const QUOTES = { ru: ['«', '»'], ka: ['„', '“'] };
const FOREIGN_LETTERS = {
  ka: /[A-Za-zА-Яа-яЁё]/,
  ru: /[A-Za-z\u10A0-\u10FF\u1C90-\u1CBF]/,
  en: /[А-Яа-яЁё\u10A0-\u10FF\u1C90-\u1CBF]/,
};

describe('layout', () => {
  it('uses unique section and item ids', () => {
    const sectionIds = layout.sections.map((s) => s.id);
    assert.equal(new Set(sectionIds).size, sectionIds.length);
    for (const section of layout.sections) {
      const ids = section.columns?.flat() ?? section.items.map((i) => i.id);
      assert.equal(new Set(ids).size, ids.length, `duplicate item in ${section.id}`);
    }
  });

  it('references only icons that exist', async () => {
    const files = new Set((await readdir(paths.icons)).map((f) => path.basename(f, '.svg')));
    for (const name of iconNames(layout)) assert.ok(files.has(name), `missing icon ${name}.svg`);
  });

  it('has exactly one source locale', async () => {
    const roles = await Promise.all(langs.map(async (lang) => (await loadLocale(lang)).meta.role));
    assert.equal(roles.filter((r) => r === 'source').length, 1);
  });
});

for (const lang of langs) {
  describe(`locale ${lang}`, () => {
    const doc = docs.get(lang);
    const entries = textEntries(doc);

    it('has every text the layout needs and nothing else', async () => {
      assert.deepEqual(validateLocale(layout, await loadLocale(lang), lang), []);
    });

    it('uses typographic punctuation', () => {
      for (const [key, text] of entries) {
        assert.doesNotMatch(text, /"/, `${key}: straight quote`);
        assert.doesNotMatch(text, /'/, `${key}: straight apostrophe, use "’"`);
        assert.doesNotMatch(text, / {2}|^\s|\s$/, `${key}: stray spaces`);
        assert.doesNotMatch(text, / - /, `${key}: hyphen used as a dash, use "—"`);
        assert.doesNotMatch(text, /\.\./, `${key}: double period`);
        assert.doesNotMatch(text, /_{3,}/, `${key}: placeholder left in a printed section`);
      }
    });

    it('balances its quotation marks', () => {
      const [open, close] = QUOTES[lang] ?? ['“', '”'];
      for (const [key, text] of entries) {
        assert.equal(text.split(open).length, text.split(close).length, `${key}: unbalanced quotes`);
      }
    });

    it('contains no letters of another script', () => {
      const foreign = FOREIGN_LETTERS[lang];
      if (!foreign) return;
      for (const [key, text] of entries) assert.doesNotMatch(text, foreign, `${key}: foreign letters`);
    });

    it('ends list items consistently', () => {
      for (const section of doc.sections) {
        for (const item of section.items) {
          const sentence = section.kind === 'columns';
          assert.equal(
            /[.]$/.test(item.text),
            sentence,
            `${section.id}.${item.id}: ${sentence ? 'paragraphs end with a period' : 'list items have no final period'}`,
          );
        }
      }
    });
  });
}
