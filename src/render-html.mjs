import { fontFaces, fontStackFor } from './config.mjs';
import { headingCase, parseInline, typeset } from './typography.mjs';

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Rich text ("**bold**") to HTML with typographic spaces. */
const rich = (text, lang) =>
  parseInline(typeset(text, lang))
    .map(({ text: t, bold }) => (bold ? `<strong>${escapeHtml(t)}</strong>` : escapeHtml(t)))
    .join('');

const icon = (icons, name) => {
  const svg = icons.get(name);
  if (!svg) throw new Error(`Unknown icon "${name}"`);
  return svg;
};

/** One renderer per section kind. A new kind = a new entry, nothing else changes. */
const sectionRenderers = {
  columns: (section, { meta }) => `
    <section class="services" data-section="${section.id}">
      <h2 class="heading heading--section">${escapeHtml(headingCase(section.title, meta))}</h2>
      <div class="services__columns">
        ${section.columns
          .map(
            (column) => `<div class="services__column">
              ${column.map((item) => `<p class="rule" data-item="${item.id}">${rich(item.text, meta.lang)}</p>`).join('')}
            </div>`,
          )
          .join('')}
      </div>
    </section>`,

  forbidden: (section, { meta, icons }) => `
    <section class="forbidden" data-section="${section.id}">
      <svg class="forbidden__frame" aria-hidden="true"><rect /></svg>
      <h2 class="forbidden__title" data-pattern="paper">${escapeHtml(section.title)}</h2>
      <ul class="forbidden__list">
        ${section.items
          .map(
            (item) => `<li class="forbidden__item" data-item="${item.id}">
              <span class="badge">${icon(icons, item.icon)}</span>
              <span>${rich(item.text, meta.lang)}</span>
            </li>`,
          )
          .join('')}
      </ul>
    </section>`,

  inline: (section, { meta, icons }) => `
    <section class="inline-note" data-section="${section.id}">
      <strong class="inline-note__title">${rich(section.title, meta.lang)}</strong>
      ${section.items
        .map(
          (item) => `<span class="inline-note__item" data-item="${item.id}">
            <span class="icon icon--small">${icon(icons, item.icon)}</span>${rich(item.text, meta.lang)}
          </span>`,
        )
        .join('')}
    </section>`,

  iconList: (section, { meta, icons }) => `
    <section class="block" data-section="${section.id}">
      <h2 class="heading heading--block">${escapeHtml(headingCase(section.title, meta))}</h2>
      <ul class="icon-list">
        ${section.items
          .map(
            (item) => `<li class="icon-list__item" data-item="${item.id}">
              <span class="icon">${icon(icons, item.icon)}</span>
              <span>${rich(item.text, meta.lang)}</span>
            </li>`,
          )
          .join('')}
      </ul>
    </section>`,
};

const renderSection = (section, ctx) => {
  const render = sectionRenderers[section.kind];
  if (!render) throw new Error(`No renderer for section kind "${section.kind}"`);
  return render(section, ctx);
};

const fontFaceCss = (fontsHref) =>
  fontFaces
    .map(
      ({ family, file, weight, stretch }) => `@font-face {
        font-family: "${family}";
        src: url("${fontsHref}/${file}") format("truetype");
        font-weight: ${weight};
        font-stretch: ${stretch}%;
      }`,
    )
    .join('\n');

/**
 * Builds the self-contained poster page.
 * @param doc       document model from resolveDocument()
 * @param css       contents of template/poster.css
 * @param icons     Map<iconName, svgMarkup>
 * @param assetsHref URL of the assets folder relative to the HTML file
 */
export function renderPoster(doc, { css, icons, assetsHref }) {
  const { meta } = doc;
  const ctx = { meta, icons };
  const region = (name) =>
    doc.sections
      .filter((s) => s.region === name)
      .map((s) => renderSection(s, ctx))
      .join('');
  const fontStack = fontStackFor(meta.lang)
    .map((f) => `"${f}"`)
    .join(', ');
  const [firstLine, ...otherLines] = doc.title.map((line) => escapeHtml(headingCase(line, meta)));

  return `<!doctype html>
<html lang="${meta.lang}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.title.join(' '))}</title>
<style>
${fontFaceCss(`${assetsHref}/fonts`)}
:root {
  --font: ${fontStack}, sans-serif;
  --pattern-paper: url("${assetsHref}/img/pattern-paper.jpg");
  --pattern-panel: url("${assetsHref}/img/pattern-panel.jpg");
}
${css}
</style>
</head>
<body>
<main class="page" data-pattern="paper">
  <img class="logo" src="${assetsHref}/img/logo.png" alt="">
  <header class="masthead">
    <h1 class="title">
      <span class="title__line">${firstLine}<img class="title__leaf" src="${assetsHref}/img/leaf.png" alt=""></span>
      ${otherLines.map((line) => `<span class="title__line">${line}</span>`).join('')}
    </h1>
    <p class="intro"><strong class="intro__lead">${rich(doc.intro.lead, meta.lang)}</strong> ${rich(doc.intro.body, meta.lang)}</p>
  </header>
  <div class="content">
    <div class="main" data-fit>${region('main')}</div>
    <aside class="panel" data-pattern="panel" data-fit>${region('panel')}</aside>
  </div>
</main>
<script>
  // Elements that repeat the page pattern get it shifted so it lines up with the page.
  // Called again by the export after it changes the text scale.
  window.alignPatterns = () => {
    const page = document.querySelector('.page').getBoundingClientRect();
    for (const el of document.querySelectorAll('[data-pattern]')) {
      const box = el.getBoundingClientRect();
      el.style.backgroundPosition = (page.left - box.left) + 'px ' + (page.top - box.top) + 'px';
    }
  };
  document.fonts.ready.then(() => {
    window.alignPatterns();
    document.documentElement.dataset.ready = 'true';
  });
</script>
</body>
</html>`;
}
