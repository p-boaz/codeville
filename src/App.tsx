import { useEffect, useMemo, useState } from 'react';

import { ApprovalDialog } from './features/task/ApprovalDialog';
import { TaskPanel } from './features/task/TaskPanel';
import { ProjectRail } from './features/village/ProjectRail';
import { VillageCanvas } from './game/VillageCanvas';
import type { ApprovalRequestView, EnvironmentStatus, ProgressionData, ProjectSelection, VillageLot } from './shared/village-events';
import { beginSession, initialSessionState, projectProgress, reduceSession, resetSession, type SessionState } from './state/session-machine';

const emptyProgression: ProgressionData = {
  version: 2,
  lots: [0, 1, 2, 3, 4].map((slot) => ({ slot, projectId: null, path: null, name: null, isDemo: false })) as ProgressionData['lots'],
  projects: {},
};
const demoTask = 'Implement summarizeProject in src/health.js so every existing test passes. Do not change the tests. Run npm test to verify the work.';
const activePhases: SessionState['phase'][] = ['starting', 'planning', 'reading', 'editing', 'testing', 'approval'];

export function App() {
  const [environment, setEnvironment] = useState<EnvironmentStatus | null>(null);
  const [progression, setProgression] = useState<ProgressionData>(emptyProgression);
  const [selectedSlot, setSelectedSlot] = useState<VillageLot['slot']>(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
  const [approval, setApproval] = useState<ApprovalRequestView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([window.codeville.getEnvironment(), window.codeville.getProgression()]).then(([nextEnvironment, nextProgression]) => {
      setEnvironment(nextEnvironment);
      setProgression(nextProgression);
      const first = nextProgression.lots.find((lot) => lot.projectId);
      if (first) { setSelectedSlot(first.slot); setSelectedProjectId(first.projectId); }
    });
    const unsubscribeEvent = window.codeville.onVillageEvent(({ projectId, event }) => {
      setSessions((current) => ({ ...current, [projectId]: reduceSession(current[projectId] ?? initialSessionState, event) }));
      if (event.type === 'session_completed') void window.codeville.getProgression().then(setProgression);
    });
    const unsubscribeApproval = window.codeville.onApprovalRequest((request) => {
      setApproval(request);
      if (request) {
        setSelectedProjectId(request.projectId);
        setProgression((current) => {
          const lot = current.lots.find((candidate) => candidate.projectId === request.projectId);
          if (lot) setSelectedSlot(lot.slot);
          return current;
        });
      }
    });
    return () => { unsubscribeEvent(); unsubscribeApproval(); };
  }, []);

  const selectedLot = progression.lots[selectedSlot];
  const selectedProject = useMemo<ProjectSelection | null>(() => {
    if (!selectedLot.projectId || !selectedLot.path || !selectedLot.name) return null;
    return { projectId: selectedLot.projectId, path: selectedLot.path, name: selectedLot.name, slot: selectedLot.slot, isDemo: selectedLot.isDemo };
  }, [selectedLot]);
  const session = selectedProjectId ? sessions[selectedProjectId] ?? initialSessionState : initialSessionState;
  const progress = projectProgress(progression, selectedProjectId);
  const task = selectedProjectId ? tasks[selectedProjectId] ?? (selectedProject?.isDemo ? demoTask : '') : '';
  const sessionActive = activePhases.includes(session.phase);
  const allDemo = progression.lots.every((lot) => lot.isDemo && lot.projectId);
  const canStartAll = Boolean(environment?.codexAvailable && allDemo && progression.lots.some((lot) => lot.projectId && !activePhases.includes(sessions[lot.projectId]?.phase ?? 'idle')));

  function selectLot(slot: VillageLot['slot'], projectId: string | null) {
    setSelectedSlot(slot);
    setSelectedProjectId(projectId);
    setError(null);
  }

  async function chooseProject() {
    setError(null);
    const selection = await window.codeville.selectProject(selectedSlot);
    if (!selection) return;
    setProgression(await window.codeville.getProgression());
    setSelectedProjectId(selection.projectId);
    setSessions((current) => ({ ...current, [selection.projectId]: resetSession() }));
  }

  async function useDemoVillage() {
    setError(null);
    try {
      const projects = await window.codeville.prepareDemoVillage();
      const nextProgression = await window.codeville.getProgression();
      setProgression(nextProgression);
      setTasks(Object.fromEntries(projects.map((project) => [project.projectId, demoTask])));
      setSessions(Object.fromEntries(projects.map((project) => [project.projectId, resetSession()])));
      setSelectedSlot(0);
      setSelectedProjectId(projects[0]?.projectId ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The demo village could not be prepared.');
    }
  }

  async function startProject(project: ProjectSelection, projectTask: string): Promise<void> {
    if (!projectTask.trim()) return;
    setSessions((current) => ({ ...current, [project.projectId]: beginSession(current[project.projectId] ?? initialSessionState) }));
    try {
      await window.codeville.startSession({ projectId: project.projectId, projectPath: project.path, projectName: project.name, task: projectTask.trim() });
    } catch (cause) {
      setSessions((current) => ({ ...current, [project.projectId]: reduceSession(current[project.projectId] ?? initialSessionState, { type: 'session_failed', at: new Date().toISOString(), recoverable: true }) }));
      throw cause;
    }
  }

  async function startSession() {
    if (!selectedProject || !task.trim()) return;
    setError(null);
    try { await startProject(selectedProject, task); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Codex could not start this task.'); }
  }

  async function startAll() {
    setError(null);
    const projects = progression.lots.flatMap((lot) => lot.projectId && lot.path && lot.name
      ? [{ projectId: lot.projectId, path: lot.path, name: lot.name, slot: lot.slot, isDemo: lot.isDemo }]
      : []);
    const results = await Promise.allSettled(projects.filter((project) => !activePhases.includes(sessions[project.projectId]?.phase ?? 'idle')).map((project) => startProject(project, tasks[project.projectId] ?? demoTask)));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) setError(`${failures.length} builder${failures.length === 1 ? '' : 's'} could not start. The others are still running.`);
  }

  async function interruptSession() {
    if (!selectedProjectId) return;
    setError(null);
    try { await window.codeville.interruptSession(selectedProjectId); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The session could not be interrupted.'); }
  }

  async function respondToApproval(decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel') {
    if (!approval) return;
    setError(null);
    try { await window.codeville.respondToApproval(approval.requestId, decision); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The approval response failed.'); }
  }

  function newTask() {
    if (!selectedProjectId) return;
    setSessions((current) => ({ ...current, [selectedProjectId]: resetSession() }));
    setError(null);
  }

  async function resetVillage() {
    setProgression(await window.codeville.resetProgression());
    setSessions({}); setTasks({}); setSelectedSlot(0); setSelectedProjectId(null); setError(null);
  }

  const snapshots = progression.lots.map((lot) => ({
    slot: lot.slot,
    projectId: lot.projectId,
    projectName: lot.name ?? 'Unclaimed Workshop',
    phase: lot.projectId ? sessions[lot.projectId]?.phase ?? (progression.projects[lot.projectId]?.lastDebrief ? 'completed' : 'idle') : 'idle',
    level: lot.projectId ? progression.projects[lot.projectId]?.level ?? 0 : 0,
    debrief: lot.projectId ? sessions[lot.projectId]?.debrief ?? progression.projects[lot.projectId]?.lastDebrief ?? null : null,
    selected: selectedSlot === lot.slot,
  }));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">C</span><div><strong>Codeville</strong><small>A living world for your coding agents</small></div></div>
        <div className="topbar-status"><span className={`status-dot ${environment?.codexAvailable ? 'ready' : 'offline'}`} /><span>{environment?.codexAvailable ? environment.model : 'Codex unavailable'}</span>{environment?.codexVersion && <span className="version-tag">{environment.codexVersion}</span>}</div>
      </header>
      <section className="workspace">
        <ProjectRail progression={progression} sessions={sessions} selectedSlot={selectedSlot} canStartAll={canStartAll} onSelect={selectLot} onStartAll={startAll} />
        <div className="village-stage">
          <VillageCanvas projects={snapshots} />
          <div className="stage-heading"><span className="eyebrow">Willow Ward · Five live lots</span><h1>{allDemo ? 'The whole village is awake' : 'Your agents, building side by side'}</h1><p>Every movement comes from a real, project-scoped Codex event.</p></div>
          {!progression.lots.some((lot) => lot.projectId) && <div className="empty-village-cta"><strong>Build a five-project demo village</strong><span>Five isolated repositories. Five real Codex builders. One living map.</span><button onClick={useDemoVillage}>Create demo village <span>→</span></button></div>}
        </div>
        <TaskPanel environment={environment} project={selectedProject} task={task} session={session} progress={progress} sessionActive={sessionActive} error={error} onTaskChange={(value) => selectedProjectId && setTasks((current) => ({ ...current, [selectedProjectId]: value }))} onChooseProject={chooseProject} onUseDemoVillage={useDemoVillage} onStart={startSession} onInterrupt={interruptSession} onNewTask={newTask} onResetVillage={resetVillage} />
      </section>
      {approval && <ApprovalDialog request={approval} onDecision={respondToApproval} />}
    </main>
  );
}
