import type { BatchLaunchProject } from '../../shared/village-events';

interface BatchLaunchDialogProps {
  projects: BatchLaunchProject[];
  onCancel(): void;
  onConfirm(): void;
}

export function BatchLaunchDialog({ projects, onCancel, onConfirm }: BatchLaunchDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="batch-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-launch-title">
        <div className="batch-warning" aria-hidden="true">!</div>
        <span className="eyebrow">Explicit launch confirmation</span>
        <h2 id="batch-launch-title">Start {projects.length} selected builders?</h2>
        <p>Codex will receive each task and may modify files inside each listed repository with workspace-write access. Nothing starts until you confirm.</p>
        <ol className="batch-project-list">
          {projects.map((project) => (
            <li key={project.projectId}>
              <strong>{project.projectName}</strong>
              <code>{project.projectPath}</code>
              <span>{project.task}</span>
            </li>
          ))}
        </ol>
        <div className="batch-actions">
          <button className="secondary-button" onClick={onCancel}>Cancel</button>
          <button className="danger-confirm-button" onClick={onConfirm}>Confirm and start builders</button>
        </div>
      </section>
    </div>
  );
}

