import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { headingCase, parseInline, typeset } from '../src/typography.mjs';

const NBSP = ' ';

describe('parseInline', () => {
  it('splits bold runs', () => {
    assert.deepEqual(parseInline('a **b** c'), [
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c', bold: false },
    ]);
  });

  it('rejects unbalanced markers', () => {
    assert.throws(() => parseInline('a **b'), /Unbalanced/);
  });
});

describe('typeset', () => {
  it('keeps numbers with their unit', () => {
    assert.equal(typeset('до 20 минут', 'ru'), `до${NBSP}20${NBSP}минут`);
    assert.equal(typeset('20 წუთამდე', 'ka'), `20${NBSP}წუთამდე`);
  });

  it('never starts a line with a dash', () => {
    assert.equal(typeset('чай — напиток', 'ru'), `чай${NBSP}— напиток`);
  });

  it('glues short Russian words and Georgian conjunctions to the next word', () => {
    assert.equal(typeset('и в магазин', 'ru'), `и${NBSP}в${NBSP}магазин`);
    assert.equal(typeset('ჩაი და წყალი', 'ka'), `ჩაი და${NBSP}წყალი`);
    assert.equal(typeset('ჩაის სმაზე კი', 'ka'), `ჩაის სმაზე${NBSP}კი`);
  });

  it('sees through bold markers', () => {
    assert.equal(typeset('**за 90 минут**', 'ru'), `**за${NBSP}90${NBSP}минут**`);
  });

  it('does not break short compounds at the hyphen', () => {
    assert.equal(typeset('собака-поводырь', 'ru'), 'собака‑поводырь');
  });
});

describe('headingCase', () => {
  it('turns Georgian into Mtavruli', () => {
    assert.equal(headingCase('წესები', { lang: 'ka', uppercaseHeadings: true }), 'ᲬᲔᲡᲔᲑᲘ');
  });

  it('leaves text alone when the locale does not want capitals', () => {
    assert.equal(headingCase('Правила', { lang: 'ru', uppercaseHeadings: false }), 'Правила');
  });
});
