import { useEffect, useRef } from 'react';

import type { ApprovalDecision, ApprovalRequestView } from '../../shared/village-events';

interface ApprovalDialogProps {
  request: ApprovalRequestView;
  onDecision(decision: ApprovalDecision): void;
}

export function ApprovalDialog({ request, onDecision }: ApprovalDialogProps) {
  const declineRef = useRef<HTMLButtonElement>(null);
  // The dialog must own the keyboard: focus lands on the safe action, Escape declines.
  useEffect(() => { declineRef.current?.focus(); }, [request.requestId]);
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="approval-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        onKeyDown={(event) => { if (event.key === 'Escape') onDecision('decline'); }}
      >
        <div className="approval-illustration" aria-hidden="true">!</div>
        <span className="eyebrow">The builder needs you</span>
        <h2 id="approval-title">{request.title}</h2>
        <p>{request.explanation}</p>
        {(request.command || request.cwd) && (
          <div className="approval-details">
            {request.command && <code>{request.command}</code>}
            {request.cwd && <small>Working directory: {request.cwd}</small>}
          </div>
        )}
        <p className="approval-warning">This exact information is shown only in this secure local panel.</p>
        <div className="approval-actions">
          <button ref={declineRef} className="secondary-button" onClick={() => onDecision('decline')}>Decline</button>
          <button className="secondary-button" onClick={() => onDecision('acceptForSession')}>Allow for session</button>
          <button className="primary-button" onClick={() => onDecision('accept')}>Allow once</button>
        </div>
      </section>
    </div>
  );
}
