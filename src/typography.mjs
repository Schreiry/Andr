const NBSP = '\u00A0';
const NB_HYPHEN = '\u2011';

/**
 * Words that must not be left hanging at the end of a line (they are glued to
 * the next word) and particles that must not start a line (glued to the
 * previous word). Add a language by adding an entry.
 */
const glueRules = {
  ru: { after: /^[а-яё]{1,2}$/i, before: ['же', 'ли', 'бы'] },
  ka: { after: ['და', 'ან', 'თუ', 'არ', 'ნუ', 'რომ'], before: ['კი'] },
};

const matches = (rule, word) => (rule instanceof RegExp ? rule.test(word) : rule.includes(word));

/** Applies non-breaking spaces so that lines break where a typesetter would break them. */
export function typeset(text, lang) {
  const rules = glueRules[lang] ?? { after: [], before: [] };
  const parts = text.split(' ');
  let out = parts[0];
  for (let i = 1; i < parts.length; i += 1) {
    const prev = parts[i - 1].replace(/^[«„(*]+/, '');
    const next = parts[i].replace(/[».,:;!?)*“]+$/, '');
    const glue =
      /\d$/.test(prev) || // 40 minutes
      next === '—' || // never start a line with a dash
      matches(rules.after, prev) ||
      matches(rules.before, next);
    out += (glue ? NBSP : ' ') + parts[i];
  }
  // Short compounds ("собака-поводырь") must not break at the hyphen.
  return out.replace(/(\p{L})-(\p{L})/gu, `$1${NB_HYPHEN}$2`);
}

/** Splits "**bold** text" into runs: [{ text, bold }]. Only **bold** is supported. */
export function parseInline(text) {
  const pieces = text.split('**');
  if (pieces.length % 2 === 0) throw new Error(`Unbalanced "**" in: ${text}`);
  return pieces.map((piece, i) => ({ text: piece, bold: i % 2 === 1 })).filter((run) => run.text);
}

/** Heading case: Mtavruli for Georgian, capitals for Cyrillic/Latin. */
export const headingCase = (text, meta) =>
  meta.uppercaseHeadings ? text.toLocaleUpperCase(meta.lang) : text;
