import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { textEntries } from './content.mjs';
import { parseInline } from './typography.mjs';

const BULLETS = 'rules-bullets';

const runs = (text, extra = {}) =>
  parseInline(text).map(({ text: t, bold }) => new TextRun({ text: t, bold: bold || extra.bold }));

const heading = (text, level) => new Paragraph({ heading: level, children: [new TextRun(text)] });

/** Plain editable text of the poster: same order and emphasis as the PDF. */
function posterText(doc) {
  return [
    heading(doc.title.join(' '), HeadingLevel.HEADING_1),
    new Paragraph({
      children: [...runs(doc.intro.lead, { bold: true }), new TextRun(' '), ...runs(doc.intro.body)],
    }),
    ...doc.sections.flatMap((section) => [
      heading(section.title, HeadingLevel.HEADING_2),
      ...section.items.map(
        (item) => new Paragraph({ numbering: { reference: BULLETS, level: 0 }, children: runs(item.text) }),
      ),
    ]),
  ];
}

const cell = (text, { header = false } = {}) =>
  new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: header ? { type: ShadingType.CLEAR, fill: 'F6EAD5', color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: header ? [new TextRun({ text, bold: true })] : runs(text) })],
  });

/** Side-by-side source/translation table for proofreading. */
function reviewTable(source, doc) {
  const sourceTexts = new Map(textEntries(source));
  return [
    new Paragraph({
      pageBreakBefore: true,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(`${source.meta.name} — ${doc.meta.name}`)],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [cell(source.meta.name, { header: true }), cell(doc.meta.name, { header: true })],
        }),
        ...textEntries(doc).map(
          ([key, text]) =>
            new TableRow({ cantSplit: true, children: [cell(sourceTexts.get(key)), cell(text)] }),
        ),
      ],
    }),
  ];
}

/**
 * Editable DOCX with the poster text. For a translation, a review table with
 * the source text side by side is appended.
 */
export function renderDocx(doc, { source } = {}) {
  const { meta } = doc;
  const document = new Document({
    creator: 'tea-club-rules',
    title: doc.title.join(' '),
    styles: {
      default: {
        document: { run: { font: meta.docxFont, size: 22, language: { value: meta.bcp47 } } },
        heading1: {
          run: { font: meta.docxFont, size: 32, bold: true },
          paragraph: { spacing: { after: 200 } },
        },
        heading2: {
          run: { font: meta.docxFont, size: 26, bold: true },
          paragraph: { spacing: { before: 280, after: 120 } },
        },
      },
      paragraphStyles: [{ id: 'Normal', name: 'Normal', paragraph: { spacing: { after: 100, line: 300 } } }],
    },
    numbering: {
      config: [
        {
          reference: BULLETS,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 400, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      { children: [...posterText(doc), ...(source && source !== doc ? reviewTable(source, doc) : [])] },
    ],
  });
  return Packer.toBuffer(document);
}
