import { describe, expect, it } from 'vitest';

import { parseCompletionDebrief, sanitizeDebriefText } from './debrief';

describe('completion debrief privacy boundary', () => {
  it('extracts a safe structured debrief from the final marker', () => {
    expect(parseCompletionDebrief('Done.\nCODEVILLE_DEBRIEF: {"landed":"Health summary now passes every check.","followUp":"No follow-up recommended.","followUpRecommended":false}')).toEqual({
      landed: 'Health summary now passes every check.',
      followUp: 'No follow-up recommended.',
      followUpRecommended: false,
    });
  });

  it.each([
    '/Users/private/project/src/file.ts changed',
    'See https://example.com/result',
    'Use `pnpm test` next',
    'Token sk-private-secret',
    'Call project.healthSummary now',
  ])('rejects unsafe text: %s', (value) => {
    expect(sanitizeDebriefText(value)).toBeNull();
  });

  it('falls back when the payload is missing, malformed, or unsafe', () => {
    const expected = {
      landed: 'Improvement completed.',
      followUp: 'Review the completed work before the next task.',
      followUpRecommended: true,
    };
    expect(parseCompletionDebrief('ordinary final answer')).toEqual(expected);
    expect(parseCompletionDebrief('CODEVILLE_DEBRIEF: nope')).toEqual(expected);
    expect(parseCompletionDebrief('CODEVILLE_DEBRIEF: {"landed":"/tmp/leak","followUp":"none","followUpRecommended":false}')).toEqual(expected);
  });

  it('normalizes a contradictory no-follow-up response', () => {
    expect(parseCompletionDebrief('CODEVILLE_DEBRIEF: {"landed":"Checks pass.","followUp":"No follow-up recommended.","followUpRecommended":true}').followUpRecommended).toBe(false);
  });
});
