import { useState } from 'react';

import type { PendingScaffoldView, SessionDiffView, SessionOutcome } from '../../shared/village-events';

function factLine(outcome: SessionOutcome): string {
  const parts: string[] = [];
  if (outcome.testsPassed !== null) parts.push(outcome.testsPassed ? 'tests passed' : 'tests failed');
  if (outcome.durationMs !== null) {
    const totalSeconds = Math.round(outcome.durationMs / 1000);
    parts.push(totalSeconds >= 60 ? `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s` : `${totalSeconds}s`);
  }
  return parts.join(' · ');
}

interface InspectionCardProps {
  scaffold: PendingScaffoldView;
  diff: SessionDiffView | null;
  busy: boolean;
  error: string | null;
  onLoadDiff(): void;
  onCloseDiff(): void;
  onApply(): void;
  onKeep(): void;
  onDiscard(): void;
  onOpenScaffold(): void;
}

/**
 * Desk-register surface for a landable improvement: verified counts from the
 * scaffold branch, the full diff on demand, and the three landing verbs.
 * Nothing reaches the user's checkout until Apply.
 */
export function InspectionCard({ scaffold, diff, busy, error, onLoadDiff, onCloseDiff, onApply, onKeep, onDiscard, onOpenScaffold }: InspectionCardProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  return (
    <section className="inspection-card" aria-label="Improvement ready for inspection">
      <span className="eyebrow">Site inspection</span>
      <div className="inspection-stats" aria-label="Verified change size">
        <strong>{scaffold.filesChanged} file{scaffold.filesChanged === 1 ? '' : 's'} changed</strong>
        <span className="diff-insertions">+{scaffold.insertions}</span>
        <span className="diff-deletions">−{scaffold.deletions}</span>
        {scaffold.outcome && <span className="fact-line" aria-label="Verified session facts">{factLine(scaffold.outcome)}</span>}
      </div>
      <p className="inspection-base">On branch <code>{scaffold.branch}</code>, built from “{scaffold.baseSubject}”. Your checkout is untouched until you apply.</p>

      {scaffold.outcome?.deskLanded && (
        <div className="desk-account" aria-label="Builder's verified account">
          <strong>Builder's account</strong>
          <p>{scaffold.outcome.deskLanded}</p>
          {scaffold.outcome.deskFollowUp && <p className="desk-followup">{scaffold.outcome.followUpRecommended ? '↗ ' : ''}{scaffold.outcome.deskFollowUp}</p>}
        </div>
      )}

      {diff ? (
        <div className="diff-view" aria-label="Session diff">
          <button className="text-button" onClick={onCloseDiff}>Hide diff</button>
          {diff.files.map((file) => (
            <details className="diff-file" key={file.path} open={diff.files.length <= 3}>
              <summary><code>{file.path}</code><span><span className="diff-insertions">+{file.insertions}</span> <span className="diff-deletions">−{file.deletions}</span></span></summary>
              <pre>{file.patch}</pre>
            </details>
          ))}
        </div>
      ) : (
        <div className="landing-actions">
          <button className="secondary-button" onClick={onLoadDiff} disabled={busy}>Inspect the diff</button>
          <button className="text-button" onClick={onOpenScaffold} disabled={busy} title="Open the isolated working copy in Finder for a full-IDE look">Open working copy</button>
        </div>
      )}

      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className="landing-actions">
        <button className="primary-button" onClick={onApply} disabled={busy}>Install in repository</button>
        <button className="secondary-button" onClick={onKeep} disabled={busy}>Keep branch only</button>
        {confirmingDiscard ? (
          <button className="danger-button" onClick={() => { setConfirmingDiscard(false); onDiscard(); }} disabled={busy}>Really discard all of it</button>
        ) : (
          <button className="text-button" onClick={() => setConfirmingDiscard(true)} disabled={busy}>Discard…</button>
        )}
      </div>
      <small>Install lands one squash commit. Keep leaves the branch for your own merge. Discard deletes the work permanently.</small>
    </section>
  );
}
