import type { CodevilleResult, CompletionDebrief, SafePendingInput } from '../shared/village-events';

const marker = 'CODEVILLE_RESULT:';
const maxQuestionLength = 240;
const maxChoiceLength = 80;

export const debriefDeveloperInstructions = `Every final answer must end with exactly one line beginning ${marker} followed by one JSON object. Use {"status":"completed","landed":"A plain-language outcome under 96 characters.","followUp":"One next step under 96 characters, or No follow-up recommended.","followUpRecommended":true} only when the requested work is complete. Use {"status":"waiting_for_input","question":"One bounded question under 240 characters.","choices":["Optional choice under 80 characters"]} when you intentionally stop for user direction. Do not claim completion without a valid completed marker. Do not include paths, URLs, commands, code, identifiers, secrets, or markdown in any field.`;

export function parseCodevilleResult(text: string | null | undefined): CodevilleResult | null {
  if (!text) return null;
  const index = text.lastIndexOf(marker);
  if (index < 0) return null;
  const line = text.slice(index + marker.length).split(/\r?\n/, 1)[0]?.trim();
  if (!line) return null;
  try {
    const value = JSON.parse(line) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (candidate.status === 'completed') return parseCompleted(candidate);
    if (candidate.status === 'waiting_for_input') return parseWaiting(candidate);
    return null;
  } catch {
    return null;
  }
}

function parseCompleted(candidate: Record<string, unknown>): CodevilleResult | null {
  if (
    typeof candidate.landed !== 'string' ||
    typeof candidate.followUp !== 'string' ||
    typeof candidate.followUpRecommended !== 'boolean'
  ) return null;
  const landed = sanitizeDebriefText(candidate.landed);
  const followUp = sanitizeDebriefText(candidate.followUp);
  if (!landed || !followUp) return null;
  const explicitlyNone = /^no follow-up (?:is )?recommended[.!]?$/i.test(followUp);
  return {
    status: 'completed',
    debrief: { landed, followUp, followUpRecommended: explicitlyNone ? false : candidate.followUpRecommended },
  };
}

function parseWaiting(candidate: Record<string, unknown>): CodevilleResult | null {
  if (typeof candidate.question !== 'string') return null;
  const question = sanitizePromptText(candidate.question, maxQuestionLength);
  if (!question) return null;
  if (candidate.choices !== undefined && !Array.isArray(candidate.choices)) return null;
  const rawChoices = candidate.choices ?? [];
  if (rawChoices.length > 6) return null;
  const choices = rawChoices.map((choice) => typeof choice === 'string' ? sanitizePromptText(choice, maxChoiceLength) : null);
  if (choices.some((choice) => !choice)) return null;
  return {
    status: 'waiting_for_input',
    pendingInput: {
      source: 'terminal',
      title: 'Builder needs direction',
      questions: [{ id: 'reply', header: 'Reply', question, isSecret: false, choices: choices as string[] }],
    },
  };
}

export function sanitizeDebriefText(value: string): string | null {
  return sanitizeSafeText(value, 96);
}

export function sanitizePromptText(value: string, maxLength = maxQuestionLength): string | null {
  return sanitizeSafeText(value, maxLength);
}

function sanitizeSafeText(value: string, maxLength: number): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maxLength) return null;
  if (/[\\/`$<>{}|]/.test(normalized) || normalized.includes('[') || normalized.includes(']')) return null;
  if (/https?:|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(normalized)) return null;
  if (/\b(sk-[a-z0-9_-]+|api[_-]?key|secret|token|password)\b/i.test(normalized)) return null;
  if (/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/.test(normalized)) return null;
  if (/\b(?:const|let|var|function|class|import|export|SELECT|INSERT|DELETE|UPDATE)\b|=>|;\s*$/i.test(normalized)) return null;
  return normalized;
}

/** Compatibility helper for persisted historical callers. Missing markers are intentionally not successful. */
export function parseCompletionDebrief(text: string | null | undefined): CompletionDebrief | null {
  const result = parseCodevilleResult(text);
  return result?.status === 'completed' ? result.debrief : null;
}

export function resumablePendingInput(): SafePendingInput {
  return {
    source: 'resumable',
    title: 'Builder is waiting',
    questions: [{
      id: 'reply',
      header: 'Reply',
      question: 'The previous question expired when Codeville closed. Reply with the direction the builder needs.',
      isSecret: false,
      choices: [],
    }],
  };
}
