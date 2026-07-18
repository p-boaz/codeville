import { describe, expect, it } from 'vitest';

import { parseCodevilleResult, sanitizeDebriefText } from './debrief';

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
    '/Users/private/project/src/file.ts changed',
    'See https://example.com/result',
    'Use `pnpm test` next',
    'Token sk-private-secret',
    'Call project.healthSummary now',
    'const leaked = true;',
  ])('rejects path-like, code-shaped, or secret-shaped text: %s', (value) => {
    expect(sanitizeDebriefText(value)).toBeNull();
  });

  it.each([
    'ordinary final answer',
    'CODEVILLE_RESULT: nope',
    'CODEVILLE_RESULT: {"status":"completed","landed":"/tmp/leak","followUp":"none","followUpRecommended":false}',
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
