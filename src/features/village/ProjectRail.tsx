import type { ProgressionData, VillageLot } from '../../shared/village-events';
import type { SessionState } from '../../state/session-machine';

interface ProjectRailProps {
  progression: ProgressionData;
  sessions: Record<string, SessionState>;
  selectedSlot: VillageLot['slot'];
  canStartAll: boolean;
  onSelect(slot: VillageLot['slot'], projectId: string | null): void;
  onStartAll(): void;
}

const phaseLabels: Record<SessionState['phase'], string> = {
  idle: 'Ready', starting: 'Arriving', planning: 'Planning', reading: 'Reading', editing: 'Building',
  testing: 'Testing', approval: 'Needs approval', completed: 'Complete', failed: 'Paused', interrupted: 'Ready',
};

export function ProjectRail({ progression, sessions, selectedSlot, canStartAll, onSelect, onStartAll }: ProjectRailProps) {
  const activeCount = Object.values(sessions).filter((session) => ['starting', 'planning', 'reading', 'editing', 'testing', 'approval'].includes(session.phase)).length;
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
            <button
              key={lot.slot}
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
          );
        })}
      </div>
      {canStartAll && <button className="start-all-button" onClick={onStartAll}>Start all builders <span>→</span></button>}
      <div className="rail-privacy"><span>◇</span> Local-only project data</div>
    </nav>
  );
}
