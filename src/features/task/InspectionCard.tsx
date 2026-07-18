import { useState } from 'react';

import type { PendingScaffoldView, SessionDiffView } from '../../shared/village-events';

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
}

/**
 * Desk-register surface for a landable improvement: verified counts from the
 * scaffold branch, the full diff on demand, and the three landing verbs.
 * Nothing reaches the user's checkout until Apply.
 */
export function InspectionCard({ scaffold, diff, busy, error, onLoadDiff, onCloseDiff, onApply, onKeep, onDiscard }: InspectionCardProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  return (
    <section className="inspection-card" aria-label="Improvement ready for inspection">
      <span className="eyebrow">Site inspection</span>
      <div className="inspection-stats" aria-label="Verified change size">
        <strong>{scaffold.filesChanged} file{scaffold.filesChanged === 1 ? '' : 's'} changed</strong>
        <span className="diff-insertions">+{scaffold.insertions}</span>
        <span className="diff-deletions">−{scaffold.deletions}</span>
      </div>
      <p className="inspection-base">On branch <code>{scaffold.branch}</code>, built from “{scaffold.baseSubject}”. Your checkout is untouched until you apply.</p>

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
        <button className="secondary-button" onClick={onLoadDiff} disabled={busy}>Inspect the diff</button>
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
