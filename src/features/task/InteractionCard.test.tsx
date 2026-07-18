import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InteractionCard } from './InteractionCard';

describe('InteractionCard', () => {
  it('supports multiple questions, choices, free-form Other, and masked secrets', () => {
    const onSubmit = vi.fn();
    render(<InteractionCard submitting={false} error={null} onSubmit={onSubmit} request={{
      requestId: 'request-1', projectId: 'project-1', source: 'native', title: 'Codex needs your input',
      questions: [
        { id: 'channel', header: 'Channel', question: 'Which channel?', isSecret: false, choices: ['Stable', 'Preview'] },
        { id: 'credential', header: 'Credential', question: 'Enter a credential.', isSecret: true, choices: [] },
      ],
    }} />);
    fireEvent.click(screen.getByLabelText('Preview'));
    const secret = screen.getByLabelText('Credential answer');
    expect(secret).toHaveAttribute('type', 'password');
    fireEvent.change(secret, { target: { value: 'private-value' } });
    fireEvent.click(screen.getByRole('button', { name: /send reply/i }));
    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: 'channel', answers: ['Preview'] },
      { questionId: 'credential', answers: ['private-value'] },
    ]);
  });

  it('shows safe errors and never renders a secret answer as text', () => {
    render(<InteractionCard submitting={false} error="The request expired safely." onSubmit={vi.fn()} request={{
      requestId: null, projectId: 'project-1', source: 'terminal', title: 'Builder needs direction',
      questions: [{ id: 'reply', header: 'Reply', question: 'What should happen next?', isSecret: false, choices: [] }],
    }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('expired safely');
    expect(screen.getByRole('button', { name: /send reply/i })).toBeDisabled();
  });
});
