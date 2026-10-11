import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { paths } from './config.mjs';

export const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

export const loadLayout = () => readJson(paths.layout);

export const loadLocale = (lang) => readJson(path.join(paths.locales, `${lang}.json`));

/** Language codes of all locale files, e.g. ["ka", "ru"]. */
export async function listLocales() {
  const files = await readdir(paths.locales);
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'))
    .sort();
}

/** Item ids of a layout section in reading order. */
export const itemIds = (section) =>
  section.kind === 'columns' ? section.columns.flat() : section.items.map((item) => item.id);

/** Sections that are printed. A section with "enabled": false is kept ready but skipped. */
export const enabledSections = (layout) => layout.sections.filter((s) => s.enabled !== false);

/** Icon names referenced by the layout. */
export const iconNames = (layout) =>
  layout.sections.flatMap((s) => (s.items ?? []).map((item) => item.icon).filter(Boolean));

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Checks a locale against the layout and returns every problem found
 * (missing texts, texts the layout no longer uses, wrong types).
 */
export function validateLocale(layout, locale, expectedLang) {
  const errors = [];
  const where = `locale "${expectedLang}"`;

  if (locale.meta?.lang !== expectedLang) {
    errors.push(`${where}: meta.lang must be "${expectedLang}", got "${locale.meta?.lang}"`);
  }
  if (!['source', 'translation'].includes(locale.meta?.role)) {
    errors.push(`${where}: meta.role must be "source" or "translation"`);
  }
  if (!Array.isArray(locale.title) || locale.title.length === 0 || !locale.title.every(isText)) {
    errors.push(`${where}: "title" must be a non-empty list of lines`);
  }
  for (const key of ['lead', 'body']) {
    if (!isText(locale.intro?.[key])) errors.push(`${where}: missing intro.${key}`);
  }

  const sections = locale.sections ?? {};
  const layoutIds = new Set(layout.sections.map((s) => s.id));
  for (const id of Object.keys(sections)) {
    if (!layoutIds.has(id)) errors.push(`${where}: section "${id}" is not in the layout`);
  }

  for (const section of layout.sections) {
    const texts = sections[section.id];
    if (!texts && section.enabled === false) continue; // texts can be added when it is switched on
    if (!texts) {
      errors.push(`${where}: missing section "${section.id}"`);
      continue;
    }
    if (!isText(texts.title)) errors.push(`${where}: missing ${section.id}.title`);
    const expected = new Set(itemIds(section));
    for (const id of expected) {
      if (!isText(texts.items?.[id])) errors.push(`${where}: missing ${section.id}.items.${id}`);
    }
    for (const id of Object.keys(texts.items ?? {})) {
      if (!expected.has(id)) errors.push(`${where}: ${section.id}.items.${id} is not in the layout`);
    }
  }
  return errors;
}

/** Merges layout and locale into the document model every renderer consumes. */
export function resolveDocument(layout, locale) {
  const texts = locale.sections;
  return {
    meta: locale.meta,
    title: locale.title,
    intro: locale.intro,
    sections: enabledSections(layout).map((section) => {
      const icons = new Map((section.items ?? []).map((item) => [item.id, item.icon]));
      const toItem = (id) => ({ id, icon: icons.get(id), text: texts[section.id].items[id] });
      return {
        id: section.id,
        kind: section.kind,
        region: section.region,
        title: texts[section.id].title,
        items: itemIds(section).map(toItem),
        columns: section.columns?.map((column) => column.map(toItem)),
      };
    }),
  };
}

/**
 * Every text of a document as flat [key, text] pairs in reading order.
 * Used for side-by-side review tables and text lint checks.
 */
export function textEntries(doc) {
  return [
    ['title', doc.title.join(' ')],
    ['intro.lead', doc.intro.lead],
    ['intro.body', doc.intro.body],
    ...doc.sections.flatMap((s) => [
      [`${s.id}.title`, s.title],
      ...s.items.map((item) => [`${s.id}.${item.id}`, item.text]),
    ]),
  ];
}
