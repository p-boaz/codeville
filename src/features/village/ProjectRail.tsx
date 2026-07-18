import type { ProgressionData, VillageLot } from '../../shared/village-events';
import type { SessionState } from '../../state/session-machine';

interface ProjectRailProps {
  progression: ProgressionData;
  sessions: Record<string, SessionState>;
  tasks: Record<string, string>;
  selectedSlot: VillageLot['slot'];
  batchSelected: ReadonlySet<string>;
  canStartAll: boolean;
  canStartSelected: boolean;
  onSelect(slot: VillageLot['slot'], projectId: string | null): void;
  onToggleBatch(projectId: string): void;
  onStartAll(): void;
  onStartSelected(): void;
}

const phaseLabels: Record<SessionState['phase'], string> = {
  idle: 'Ready', starting: 'Arriving', planning: 'Planning', reading: 'Reading', editing: 'Building',
  testing: 'Testing', approval: 'Needs approval', completed: 'Complete', failed: 'Failed', interrupted: 'Interrupted',
  input: 'Needs input', waiting: 'Waiting', needs_review: 'Needs review', external: 'In Ghostty', reviewing: 'Inspect',
};

export function ProjectRail({ progression, sessions, tasks, selectedSlot, batchSelected, canStartAll, canStartSelected, onSelect, onToggleBatch, onStartAll, onStartSelected }: ProjectRailProps) {
  const activeCount = Object.values(sessions).filter((session) => ['starting', 'planning', 'reading', 'editing', 'testing', 'approval', 'input'].includes(session.phase)).length;
  return (
    <nav className="project-rail" aria-label="Village projects">
      <div className="rail-heading">
        <span className="eyebrow">Willow Ward</span>
        <strong>Five workshops</strong>
        <small>{activeCount ? `${activeCount} builders active` : 'Village ready'}</small>
      </div>
      <div className="project-list">
        {progression.lots.map((lot) => {
          const session = lot.projectId ? sessions[lot.projectId] : undefined;
          const progress = lot.projectId ? progression.projects[lot.projectId] : undefined;
          const phase = session?.phase ?? (progress?.lastDebrief ? 'completed' : 'idle');
          return (
            <div className="project-tab-row" key={lot.slot}>
              <button
                className={`project-tab ${selectedSlot === lot.slot ? 'selected' : ''} phase-${phase}`}
                onClick={() => onSelect(lot.slot, lot.projectId)}
                aria-current={selectedSlot === lot.slot ? 'page' : undefined}
              >
                <span className="lot-number">{String(lot.slot + 1).padStart(2, '0')}</span>
                <span className="project-tab-copy">
                  <strong>{lot.name ?? 'Empty lot'}</strong>
                  <small>{lot.projectId ? phaseLabels[phase] : 'Choose repository'}</small>
                </span>
                <span className="phase-indicator" aria-hidden="true" />
              </button>
              {lot.projectId && !lot.isDemo && (
                <label className="batch-select" title={tasks[lot.projectId]?.trim() ? 'Include in selected launch' : 'Add a task before batch launch'}>
                  <input type="checkbox" checked={batchSelected.has(lot.projectId)} onChange={() => onToggleBatch(lot.projectId!)} />
                  <span className="sr-only">Select {lot.name} for batch launch</span>
                </label>
              )}
            </div>
          );
        })}
      </div>
      {canStartAll && <button className="start-all-button" onClick={onStartAll}>Start all builders <span>→</span></button>}
      {progression.lots.some((lot) => lot.projectId && !lot.isDemo) && <button className="start-selected-button" disabled={!canStartSelected} onClick={onStartSelected}>Start selected builders <span>→</span></button>}
      <div className="rail-privacy"><span>◇</span> Local-only project data</div>
    </nav>
  );
}
