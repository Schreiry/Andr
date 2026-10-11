import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** All filesystem locations used by the build. Nothing else hard-codes paths. */
export const paths = {
  root,
  layout: path.join(root, 'content', 'layout.json'),
  locales: path.join(root, 'content', 'locales'),
  assets: path.join(root, 'assets'),
  icons: path.join(root, 'assets', 'icons'),
  styles: path.join(root, 'template', 'poster.css'),
  build: path.join(root, 'build'),
  dist: path.join(root, 'dist'),
};

/**
 * Static font faces from assets/fonts/faces.json (shared with the Python tool
 * that generates them). Each face: { family, file, weight, stretch }.
 */
const faceSpec = JSON.parse(readFileSync(path.join(root, 'assets', 'fonts', 'faces.json'), 'utf8'));
export const fontFaces = Object.entries(faceSpec.families).flatMap(([family, stem]) =>
  faceSpec.instances.map((inst) => ({
    family,
    file: `static/${stem}-${inst.name}.ttf`,
    weight: inst.wght,
    stretch: inst.wdth,
  })),
);

/** Font stack per language, first font wins for the glyphs it has. */
export const fontStacks = {
  ka: ['Noto Sans Georgian', 'Noto Sans'],
  default: ['Noto Sans'],
};

export const fontStackFor = (lang) => fontStacks[lang] ?? fontStacks.default;

/** Physical page of the poster. */
export const page = { widthMm: 210, heightMm: 297 };

/**
 * Raster exports. `widthPx` is the output width; height follows the A4 ratio.
 * Add an entry here to get another PNG size, no code changes needed.
 */
export const pngExports = [
  { suffix: 'print', widthPx: 2480 }, // 300 dpi, for print shops and large screens
  { suffix: 'screen', widthPx: 1080 }, // messengers, social networks, tablets
];

/** Output file name for a locale and format, e.g. "tea-club-rules-ka.pdf". */
export const outputName = (lang, ext, suffix = '') =>
  `tea-club-rules-${lang}${suffix ? `-${suffix}` : ''}.${ext}`;
