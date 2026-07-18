import type { CompletionDebrief } from '../shared/village-events';

const marker = 'CODEVILLE_DEBRIEF:';
const fallback: CompletionDebrief = {
  landed: 'Improvement completed.',
  followUp: 'Review the completed work before the next task.',
  followUpRecommended: true,
};

export const debriefDeveloperInstructions = `At the end of your final answer, append exactly one line in this format: ${marker} {"landed":"A plain-language outcome under 96 characters.","followUp":"One next step under 96 characters, or No follow-up recommended.","followUpRecommended":true}. Do not include paths, URLs, commands, code, identifiers, secrets, or markdown in either string.`;

export function parseCompletionDebrief(text: string | null | undefined): CompletionDebrief {
  if (!text) return fallback;
  const index = text.lastIndexOf(marker);
  if (index < 0) return fallback;
  const line = text.slice(index + marker.length).split(/\r?\n/, 1)[0]?.trim();
  if (!line) return fallback;
  try {
    const value = JSON.parse(line) as unknown;
    if (!value || typeof value !== 'object') return fallback;
    const candidate = value as Partial<CompletionDebrief>;
    if (
      typeof candidate.landed !== 'string' ||
      typeof candidate.followUp !== 'string' ||
      typeof candidate.followUpRecommended !== 'boolean'
    ) return fallback;
    const landed = sanitizeDebriefText(candidate.landed);
    const followUp = sanitizeDebriefText(candidate.followUp);
    if (!landed || !followUp) return fallback;
    const explicitlyNone = /^no follow-up (?:is )?recommended[.!]?$/i.test(followUp);
    return { landed, followUp, followUpRecommended: explicitlyNone ? false : candidate.followUpRecommended };
  } catch {
    return fallback;
  }
}

export function sanitizeDebriefText(value: string): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 96) return null;
  if (/[\\/`$<>{}|]/.test(normalized) || normalized.includes('[') || normalized.includes(']')) return null;
  if (/https?:|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(normalized)) return null;
  if (/\b(sk-[a-z0-9_-]+|api[_-]?key|secret|token|password)\b/i.test(normalized)) return null;
  if (/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/.test(normalized)) return null;
  return normalized;
}
