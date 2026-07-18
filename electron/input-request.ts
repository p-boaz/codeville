import { sanitizePromptText } from '../src/codex/debrief';
import type { InputResponse, PendingInputView, SafeInputQuestion } from '../src/shared/village-events';
import type { ServerRequest } from './codex/generated/ServerRequest';
import type { ToolRequestUserInputResponse } from './codex/generated/v2/ToolRequestUserInputResponse';

type InputRequest = Extract<ServerRequest, { method: 'item/tool/requestUserInput' }>;

export function inputRequestView(request: InputRequest, projectId: string): PendingInputView {
  return {
    requestId: String(request.id),
    projectId,
    source: 'native',
    title: 'Codex needs your input',
    questions: request.params.questions.slice(0, 3).map((question, index): SafeInputQuestion => ({
      id: safeIdentifier(question.id, index),
      header: sanitizePromptText(question.header, 40) ?? `Question ${index + 1}`,
      question: sanitizePromptText(question.question, 240) ?? 'Codex needs a private answer to continue this task.',
      isSecret: question.isSecret,
      choices: (question.options ?? []).slice(0, 6).flatMap((option) => {
        const label = sanitizePromptText(option.label, 80);
        return label ? [label] : [];
      }),
    })),
  };
}

export function inputResponse(request: InputRequest, answers: InputResponse[]): ToolRequestUserInputResponse {
  const submitted = new Map(answers.map((answer) => [answer.questionId, answer.answers]));
  const response: ToolRequestUserInputResponse = { answers: {} };
  for (const [index, question] of request.params.questions.entries()) {
    const values = submitted.get(safeIdentifier(question.id, index));
    if (!values?.length || values.some((value) => typeof value !== 'string' || !value.trim() || value.length > 2_000)) {
      throw new Error('Answer every question before continuing');
    }
    response.answers[question.id] = { answers: values.map((value) => value.trim()) };
  }
  return response;
}

function safeIdentifier(value: string, index: number): string {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : `question-${index + 1}`;
}
