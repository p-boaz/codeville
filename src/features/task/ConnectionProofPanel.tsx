import type { ConnectionProof } from '../../shared/village-events';

export function ConnectionProofPanel({ proof }: { proof: ConnectionProof | null }) {
  return (
    <details className="proof-panel">
      <summary><span>Codex connection proof</span><strong>{proof?.connected ? 'Connected' : 'Not connected'}</strong></summary>
      {proof ? <dl>
        <div><dt>App-server</dt><dd>{proof.connected ? `PID ${proof.appServerPid ?? 'starting'}` : 'Offline'}</dd></div>
        <div><dt>Codex</dt><dd>{proof.codexVersion ?? 'Unavailable'}</dd></div>
        <div><dt>Model</dt><dd>{proof.model}</dd></div>
        <div><dt>Repository</dt><dd>{proof.repositoryName}</dd></div>
        <div><dt>Path</dt><dd title={proof.repositoryPath}>{proof.repositoryPath}</dd></div>
        <div><dt>Thread</dt><dd>{proof.threadId ?? 'Not started'}</dd></div>
        <div><dt>Active turn</dt><dd>{proof.activeTurnId ?? 'None'}</dd></div>
        <div><dt>Safe events</dt><dd>{proof.safeEventCount}</dd></div>
        <div><dt>Connected at</dt><dd>{formatTimestamp(proof.connectedAt)}</dd></div>
        <div><dt>Turn started</dt><dd>{formatTimestamp(proof.turnStartedAt)}</dd></div>
      </dl> : <p>Start a project to establish a verifiable connection.</p>}
      <p className="proof-privacy">Metadata only. Prompts, code, commands, output, diffs, reasoning, and agent prose are excluded.</p>
    </details>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
}
