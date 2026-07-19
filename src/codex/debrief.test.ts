import { describe, expect, it } from 'vitest';

import { parseCodevilleResult, parseRawCompletionAccount, sanitizeDebriefText, sanitizeDeskAccountText } from './debrief';

describe('CODEVILLE_RESULT privacy boundary', () => {
  it('extracts a validated completed result', () => {
    expect(parseCodevilleResult('Done.\nCODEVILLE_RESULT: {"status":"completed","landed":"Health summary now passes every check.","followUp":"No follow-up recommended.","followUpRecommended":false}')).toEqual({
      status: 'completed',
      debrief: { landed: 'Health summary now passes every check.', followUp: 'No follow-up recommended.', followUpRecommended: false },
    });
  });

  it('extracts a bounded waiting result without treating it as completion', () => {
    expect(parseCodevilleResult('CODEVILLE_RESULT: {"status":"waiting_for_input","question":"Which release channel should I target?","choices":["Stable","Preview"]}')).toEqual({
      status: 'waiting_for_input',
      pendingInput: {
        source: 'terminal',
        title: 'Builder needs direction',
        questions: [{ id: 'reply', header: 'Reply', question: 'Which release channel should I target?', isSecret: false, choices: ['Stable', 'Preview'] }],
      },
    });
  });

  it.each([
    'Tightened retry logic in src/kalshi/strategy.ts',
    'Renamed health.js and updated package.json',
  ])('allows debriefs that name files and dotted identifiers: %s', (value) => {
    expect(sanitizeDebriefText(value)).toBe(value);
  });

  it.each([
    'See https://example.com/result',
    'Use `pnpm test` next',
    'Token sk-private-secret',
    'const leaked = true;',
  ])('still rejects URL, code-shaped, or secret-shaped text: %s', (value) => {
    expect(sanitizeDebriefText(value)).toBeNull();
  });

  it.each([
    'ordinary final answer',
    'CODEVILLE_RESULT: nope',
    'CODEVILLE_RESULT: {"status":"completed","question":"Contradictory"}',
    'CODEVILLE_RESULT: {"status":"waiting_for_input","question":"Missing choices type","choices":"yes"}',
    `CODEVILLE_RESULT: {"status":"waiting_for_input","question":"${'x'.repeat(241)}"}`,
  ])('returns null for missing, malformed, contradictory, unsafe, or oversized results', (text) => {
    expect(parseCodevilleResult(text)).toBeNull();
  });

  it('normalizes a contradictory no-follow-up flag', () => {
    const result = parseCodevilleResult('CODEVILLE_RESULT: {"status":"completed","landed":"Checks pass.","followUp":"No follow-up recommended.","followUpRecommended":true}');
    expect(result).toEqual({ status: 'completed', debrief: { landed: 'Checks pass.', followUp: 'No follow-up recommended.', followUpRecommended: false } });
  });
});

describe('desk-register account', () => {
  it('parses the raw account transiently, stripping control characters and bounding length', () => {
    const raw = parseRawCompletionAccount('CODEVILLE_RESULT: {"status":"completed","landed":"Rewrote src/health.js\\u0007 fully.","followUp":"None.","followUpRecommended":false}');
    expect(raw).toEqual({ landed: 'Rewrote src/health.js  fully.', followUp: 'None.', followUpRecommended: false });
    expect(parseRawCompletionAccount('no marker here')).toBeNull();
    expect(parseRawCompletionAccount('CODEVILLE_RESULT: {"status":"waiting_for_input","question":"x"}')).toBeNull();
  });

  it('allows dotted tokens only when they name a file the session actually changed', () => {
    const changed = ['src/health.js', 'package.json'];
    expect(sanitizeDeskAccountText('Implemented summarizeProject in src/health.js and updated package.json.', changed))
      .toBe('Implemented summarizeProject in src/health.js and updated package.json.');
    expect(sanitizeDeskAccountText('Implemented health.js counting rules.', changed)).toBe('Implemented health.js counting rules.');
    expect(sanitizeDeskAccountText('Also touched secrets.env for you.', changed)).toBeNull();
    expect(sanitizeDeskAccountText('Edited /etc/passwd entries.', changed)).toBeNull();
  });

  it.each([
    'See https://example.com for details',
    'Your api_key is compromised',
    'const answer = 42;',
    'Run `npm test` [now]',
  ])('keeps the strict rules for non-path hazards: %s', (value) => {
    expect(sanitizeDeskAccountText(value, ['src/health.js'])).toBeNull();
  });

  it('keeps plain prose unchanged and bounds it at 240 characters', () => {
    expect(sanitizeDeskAccountText('Health summaries now count files and report status correctly.', [])).toBe('Health summaries now count files and report status correctly.');
    expect(sanitizeDeskAccountText('x'.repeat(241), [])).toBeNull();
  });
});
