import { useEffect, useMemo, useState } from 'react';

import { ApprovalDialog } from './features/task/ApprovalDialog';
import { TaskPanel } from './features/task/TaskPanel';
import { VillageCanvas } from './game/VillageCanvas';
import type {
  ApprovalRequestView,
  EnvironmentStatus,
  ProgressionData,
} from './shared/village-events';
import {
  beginSession,
  initialSessionState,
  projectProgress,
  reduceSession,
  resetSession,
} from './state/session-machine';

interface ProjectSelection {
  path: string;
  name: string;
}

const emptyProgression: ProgressionData = { version: 1, projects: {} };

export function App() {
  const [environment, setEnvironment] = useState<EnvironmentStatus | null>(null);
  const [project, setProject] = useState<ProjectSelection | null>(null);
  const [task, setTask] = useState('Add a small project health summary and verify it with tests.');
  const [session, setSession] = useState(initialSessionState);
  const [progression, setProgression] = useState<ProgressionData>(emptyProgression);
  const [approval, setApproval] = useState<ApprovalRequestView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([window.codeville.getEnvironment(), window.codeville.getProgression()]).then(
      ([nextEnvironment, nextProgression]) => {
        setEnvironment(nextEnvironment);
        setProgression(nextProgression);
      },
    );

    const unsubscribeEvent = window.codeville.onVillageEvent((event) => {
      setSession((current) => reduceSession(current, event));
      if (event.type === 'session_completed') {
        void window.codeville.getProgression().then(setProgression);
      }
    });
    const unsubscribeApproval = window.codeville.onApprovalRequest(setApproval);
    return () => {
      unsubscribeEvent();
      unsubscribeApproval();
    };
  }, []);

  const progress = useMemo(
    () => projectProgress(progression, project?.path ?? null),
    [progression, project],
  );

  const sessionActive = [
    'starting',
    'planning',
    'reading',
    'editing',
    'testing',
    'approval',
  ].includes(session.phase);

  async function chooseProject() {
    setError(null);
    const selection = await window.codeville.selectProject();
    if (selection) {
      setProject(selection);
      setSession(resetSession());
    }
  }

  async function useDemoProject() {
    setError(null);
    try {
      setProject(await window.codeville.prepareDemoProject());
      setTask('Implement summarizeProject in src/health.js so every existing test passes. Do not change the tests. Run npm test to verify the work.');
      setSession(resetSession());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The demo project could not be prepared.');
    }
  }

  async function startSession() {
    if (!project || !task.trim()) return;
    setError(null);
    setSession((current) => beginSession(current));
    try {
      await window.codeville.startSession({
        projectPath: project.path,
        projectName: project.name,
        task: task.trim(),
      });
    } catch (cause) {
      setSession((current) =>
        reduceSession(current, {
          type: 'session_failed',
          at: new Date().toISOString(),
          recoverable: true,
        }),
      );
      setError(cause instanceof Error ? cause.message : 'Codex could not start this task.');
    }
  }

  async function interruptSession() {
    setError(null);
    try {
      await window.codeville.interruptSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The session could not be interrupted.');
    }
  }

  async function respondToApproval(decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel') {
    if (!approval) return;
    setError(null);
    try {
      await window.codeville.respondToApproval(approval.requestId, decision);
      setApproval(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The approval response failed.');
    }
  }

  function newTask() {
    setSession(resetSession());
    setError(null);
  }

  async function resetVillage() {
    setProgression(await window.codeville.resetProgression());
    setSession(resetSession());
    setError(null);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">C</span>
          <div>
            <strong>Codeville</strong>
            <small>A living world for your coding agents</small>
          </div>
        </div>
        <div className="topbar-status">
          <span className={`status-dot ${environment?.codexAvailable ? 'ready' : 'offline'}`} />
          <span>{environment?.codexAvailable ? environment.model : 'Codex unavailable'}</span>
          {environment?.codexVersion && <span className="version-tag">{environment.codexVersion}</span>}
        </div>
      </header>

      <section className="workspace">
        <div className="village-stage">
          <VillageCanvas
            phase={session.phase}
            level={progress.level}
            projectName={project?.name ?? 'Unclaimed Workshop'}
          />
          <div className="stage-heading">
            <span className="eyebrow">Willow Ward · Lot 01</span>
            <h1>{project?.name ?? 'Choose a project to wake the village'}</h1>
            <p>
              {session.phase === 'completed'
                ? 'The improvement is complete. Your village will remember it.'
                : 'Every movement below comes from a real, local Codex event.'}
            </p>
          </div>
          <div className="progress-badge" aria-label={`${progress.completedSessions} completed sessions`}>
            <span>Workshop level</span>
            <strong>{progress.level}</strong>
          </div>
          <div className="privacy-badge">
            <span aria-hidden="true">◇</span>
            Local-only project data
          </div>
        </div>

        <TaskPanel
          environment={environment}
          project={project}
          task={task}
          session={session}
          sessionActive={sessionActive}
          error={error}
          onTaskChange={setTask}
          onChooseProject={chooseProject}
          onUseDemoProject={useDemoProject}
          onStart={startSession}
          onInterrupt={interruptSession}
          onNewTask={newTask}
          onResetVillage={resetVillage}
        />
      </section>

      {approval && <ApprovalDialog request={approval} onDecision={respondToApproval} />}
    </main>
  );
}
