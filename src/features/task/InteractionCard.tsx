import { useState } from 'react';

import type { InputResponse, PendingInputView } from '../../shared/village-events';

interface InteractionCardProps {
  request: PendingInputView;
  submitting: boolean;
  error: string | null;
  onSubmit(answers: InputResponse[]): void;
}

export function InteractionCard({ request, submitting, error, onSubmit }: InteractionCardProps) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const answers = request.questions.map((question) => ({
    questionId: question.id,
    answers: [selected[question.id] === '__other__' || !question.choices.length ? other[question.id] ?? '' : selected[question.id] ?? ''],
  }));
  const complete = answers.every((answer) => answer.answers[0].trim());

  return (
    <section className="interaction-card" aria-label="Codex input request">
      <span className="eyebrow">{request.title}</span>
      {request.context && <p className="interaction-context">{request.context}</p>}
      {request.questions.map((question) => {
        const useText = !question.choices.length || selected[question.id] === '__other__';
        return (
          <fieldset key={question.id}>
            <legend><strong>{question.header}</strong><span>{question.question}</span></legend>
            {question.choices.map((choice) => (
              <label className="input-choice" key={choice}>
                <input type="radio" name={question.id} checked={selected[question.id] === choice} onChange={() => setSelected((current) => ({ ...current, [question.id]: choice }))} />
                <span>{choice}</span>
              </label>
            ))}
            {question.choices.length > 0 && (
              <label className="input-choice">
                <input type="radio" name={question.id} checked={selected[question.id] === '__other__'} onChange={() => setSelected((current) => ({ ...current, [question.id]: '__other__' }))} />
                <span>Other</span>
              </label>
            )}
            {useText && <input aria-label={`${question.header} answer`} type={question.isSecret ? 'password' : 'text'} autoComplete="off" value={other[question.id] ?? ''} onChange={(event) => setOther((current) => ({ ...current, [question.id]: event.target.value }))} />}
          </fieldset>
        );
      })}
      {error && <div className="error-banner" role="alert">{error}</div>}
      <button className="primary-button" disabled={!complete || submitting} onClick={() => onSubmit(answers)}>{submitting ? 'Sending…' : 'Send reply'} <span aria-hidden="true">→</span></button>
      <small>Replies stay in memory and are sent only to this Codex thread. Secret answers remain masked.</small>
    </section>
  );
}
