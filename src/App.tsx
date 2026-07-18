import { useEffect, useMemo, useRef, useState } from 'react';

import { ApprovalDialog } from './features/task/ApprovalDialog';
import { BatchLaunchDialog } from './features/task/BatchLaunchDialog';
import { TaskPanel } from './features/task/TaskPanel';
import { ProjectRail } from './features/village/ProjectRail';
import { VillageCanvas } from './game/VillageCanvas';
import type { ApprovalRequestView, BatchLaunchProject, ConnectionProof, EnvironmentStatus, InputResponse, PendingInputView, PendingScaffoldView, ProgressionData, ProjectProgress, ProjectSelection, SessionDiffView, VillageLot } from './shared/village-events';
import { beginSession, initialSessionState, projectProgress, reduceSession, resetSession, type SessionState } from './state/session-machine';
import { batchLaunchProjects, updateProjectTask } from './state/project-tasks';
import { chimeForEvent, playChime } from './game/chimes';

const mutedStorageKey = 'codeville-muted';

const emptyProgression: ProgressionData = {
  version: 2,
  lots: [0, 1, 2, 3, 4].map((slot) => ({ slot, projectId: null, path: null, name: null, isDemo: false })) as ProgressionData['lots'],
  projects: {},
};
const demoTask = 'Implement summarizeProject in src/health.js so every existing test passes. Do not change the tests. Run npm test to verify the work.';
const activePhases: SessionState['phase'][] = ['starting', 'planning', 'reading', 'editing', 'testing', 'approval', 'input'];

export function App() {
  const [environment, setEnvironment] = useState<EnvironmentStatus | null>(null);
  const [progression, setProgression] = useState<ProgressionData>(emptyProgression);
  const [selectedSlot, setSelectedSlot] = useState<VillageLot['slot']>(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [pendingBatch, setPendingBatch] = useState<BatchLaunchProject[] | null>(null);
  const [approval, setApproval] = useState<ApprovalRequestView | null>(null);
  const [inputs, setInputs] = useState<Record<string, PendingInputView>>({});
  const [inputSubmitting, setInputSubmitting] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [proof, setProof] = useState<ConnectionProof | null>(null);
  const [scaffoldViews, setScaffoldViews] = useState<Record<string, PendingScaffoldView>>({});
  const [sessionDiff, setSessionDiff] = useState<SessionDiffView | null>(null);
  const [landingBusy, setLandingBusy] = useState(false);
  const [landingError, setLandingError] = useState<string | null>(null);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const [wallMode, setWallMode] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem(mutedStorageKey) === '1');
  const mutedRef = useRef(muted);
  const [error, setError] = useState<string | null>(null);
  const [projectErrors, setProjectErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    void Promise.all([window.codeville.getEnvironment(), window.codeville.getProgression()]).then(([nextEnvironment, nextProgression]) => {
      setEnvironment(nextEnvironment);
      setProgression(nextProgression);
      setSessions(Object.fromEntries(Object.entries(nextProgression.projects).map(([projectId, project]) => [projectId, restoredSession(project)])));
      setInputs(Object.fromEntries(Object.entries(nextProgression.projects).flatMap(([projectId, project]) => project.pendingInput ? [[projectId, { ...project.pendingInput, projectId, requestId: null }]] : [])));
      const first = nextProgression.lots.find((lot) => lot.projectId);
      if (first) { setSelectedSlot(first.slot); setSelectedProjectId(first.projectId); }
      for (const lot of nextProgression.lots) {
        if (!lot.projectId) continue;
        const projectId = lot.projectId;
        void window.codeville.getPendingScaffold(projectId).then((view) => {
          if (view) setScaffoldViews((current) => ({ ...current, [projectId]: view }));
        }).catch(() => undefined);
      }
    });
    const unsubscribeEvent = window.codeville.onVillageEvent(({ projectId, event }) => {
      setSessions((current) => ({ ...current, [projectId]: reduceSession(current[projectId] ?? initialSessionState, event) }));
      const chime = chimeForEvent(event);
      if (chime && !mutedRef.current) playChime(chime);
      if (event.type === 'session_completed') void window.codeville.getProgression().then(setProgression);
      if (event.type === 'diff_ready') {
        void window.codeville.getPendingScaffold(projectId).then((view) => {
          if (view) setScaffoldViews((current) => ({ ...current, [projectId]: view }));
        }).catch(() => undefined);
      }
      if (event.type === 'session_applied' || event.type === 'session_kept' || event.type === 'session_discarded') {
        setScaffoldViews((current) => { const next = { ...current }; delete next[projectId]; return next; });
        void window.codeville.getProgression().then(setProgression);
      }
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
    const unsubscribeInput = window.codeville.onInputRequest(({ projectId, request }) => {
      setInputs((current) => {
        const next = { ...current };
        if (request) next[projectId] = request; else delete next[projectId];
        return next;
      });
      if (request) {
        setSessions((current) => {
          const existing = current[projectId] ?? initialSessionState;
          return { ...current, [projectId]: { ...existing, phase: request.source === 'native' ? 'input' : 'waiting' } };
        });
        setSelectedProjectId(projectId);
        setProgression((current) => {
          const lot = current.lots.find((candidate) => candidate.projectId === projectId);
          if (lot) setSelectedSlot(lot.slot);
          return current;
        });
      }
    });
    const unsubscribeFocus = window.codeville.onFocusProject((projectId) => {
      setSelectedProjectId(projectId);
      setProgression((current) => {
        const lot = current.lots.find((candidate) => candidate.projectId === projectId);
        if (lot) setSelectedSlot(lot.slot);
        return current;
      });
    });
    return () => { unsubscribeEvent(); unsubscribeApproval(); unsubscribeInput(); unsubscribeFocus(); };
  }, []);

  useEffect(() => { mutedRef.current = muted; localStorage.setItem(mutedStorageKey, muted ? '1' : '0'); }, [muted]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'w' || event.key === 'W') {
        setWallMode((current) => {
          void window.codeville.setWallMode(!current);
          return !current;
        });
      }
      if (['1', '2', '3', '4', '5'].includes(event.key)) {
        const slot = (Number(event.key) - 1) as VillageLot['slot'];
        setSelectedSlot(slot);
        setProgression((current) => { setSelectedProjectId(current.lots[slot].projectId); return current; });
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
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
  const pendingInput = selectedProjectId ? inputs[selectedProjectId] ?? null : null;
  const allDemo = progression.lots.every((lot) => lot.isDemo && lot.projectId);
  const canStartAll = Boolean(environment?.codexAvailable && allDemo && progression.lots.some((lot) => lot.projectId && !activePhases.includes(sessions[lot.projectId]?.phase ?? 'idle')));
  const selectedBatchProjects = batchLaunchProjects(progression, tasks, sessions, batchSelected, demoTask);
  const canStartSelected = Boolean(environment?.codexAvailable && selectedBatchProjects.length > 0);

  useEffect(() => {
    if (!selectedProjectId) return;
    void window.codeville.getConnectionProof(selectedProjectId).then(setProof).catch(() => setProof(null));
  }, [selectedProjectId, session.phase, progression]);

  function selectLot(slot: VillageLot['slot'], projectId: string | null) {
    setSelectedSlot(slot);
    setSelectedProjectId(projectId);
    setSessionDiff(null);
    setLandingError(null);
    setError(null);
  }

  async function loadDiff() {
    if (!selectedProjectId) return;
    setLandingBusy(true); setLandingError(null);
    try { setSessionDiff(await window.codeville.getSessionDiff(selectedProjectId)); }
    catch (cause) { setLandingError(cause instanceof Error ? cause.message : 'The diff could not be loaded.'); }
    finally { setLandingBusy(false); }
  }

  async function addOrder(task: string) {
    if (!selectedProjectId) return;
    setError(null);
    try { setProgression(await window.codeville.addWorkOrder(selectedProjectId, task)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The work order could not be added.'); }
  }

  async function deleteOrder(orderId: string) {
    if (!selectedProjectId) return;
    try { setProgression(await window.codeville.deleteWorkOrder(selectedProjectId, orderId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The work order could not be removed.'); }
  }

  async function startNextOrder() {
    if (!selectedProject || !selectedProjectId) return;
    const order = progression.projects[selectedProjectId]?.queue[0];
    if (!order) return;
    setError(null);
    try {
      await startProject(selectedProject, order.task);
      setProgression(await window.codeville.deleteWorkOrder(selectedProjectId, order.id));
    } catch {
      setError('The next work order could not start. It stays queued; review the workshop error.');
    }
  }

  async function steerSession(message: string) {
    if (!selectedProjectId) return;
    await window.codeville.steerSession(selectedProjectId, message);
  }

  function openScaffold() {
    if (!selectedProjectId) return;
    void window.codeville.openScaffold(selectedProjectId).catch((cause) => setLandingError(cause instanceof Error ? cause.message : 'The working copy could not be opened.'));
  }

  async function landSession(action: 'apply' | 'keep' | 'discard') {
    if (!selectedProjectId) return;
    const projectId = selectedProjectId;
    setLandingBusy(true); setLandingError(null);
    try {
      if (action === 'apply') await window.codeville.applySession(projectId);
      else if (action === 'keep') await window.codeville.keepSession(projectId);
      else await window.codeville.discardSession(projectId);
      setSessionDiff(null);
      setScaffoldViews((current) => { const next = { ...current }; delete next[projectId]; return next; });
      setProgression(await window.codeville.getProgression());
    } catch (cause) {
      setLandingError(cause instanceof Error ? cause.message : 'The landing action failed. The scaffold branch is unchanged.');
    } finally { setLandingBusy(false); }
  }

  async function chooseProject() {
    setError(null);
    try {
      const selection = await window.codeville.selectProject(selectedSlot);
      if (!selection) return;
      setProgression(await window.codeville.getProgression());
      setSelectedProjectId(selection.projectId);
      setSessions((current) => ({ ...current, [selection.projectId]: resetSession() }));
      setBatchSelected((current) => new Set(current).add(selection.projectId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The repository could not be assigned.');
    }
  }

  async function useDemoVillage() {
    setError(null);
    try {
      const projects = await window.codeville.prepareDemoVillage();
      const nextProgression = await window.codeville.getProgression();
      setProgression(nextProgression);
      setTasks(Object.fromEntries(projects.map((project) => [project.projectId, demoTask])));
      setSessions(Object.fromEntries(projects.map((project) => [project.projectId, resetSession()])));
      setBatchSelected(new Set());
      setSelectedSlot(0);
      setSelectedProjectId(projects[0]?.projectId ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The demo village could not be prepared.');
    }
  }

  async function startProject(project: ProjectSelection, projectTask: string): Promise<void> {
    if (!projectTask.trim()) return;
    setProjectErrors((current) => { const next = { ...current }; delete next[project.projectId]; return next; });
    setSessions((current) => ({ ...current, [project.projectId]: beginSession(current[project.projectId] ?? initialSessionState) }));
    try {
      await window.codeville.startSession({ projectId: project.projectId, projectPath: project.path, projectName: project.name, task: projectTask.trim() });
    } catch (cause) {
      setSessions((current) => ({ ...current, [project.projectId]: reduceSession(current[project.projectId] ?? initialSessionState, { type: 'session_failed', at: new Date().toISOString(), recoverable: true }) }));
      setProjectErrors((current) => ({ ...current, [project.projectId]: 'Codex could not start or continue this project. Review its repository and try again.' }));
      throw cause;
    }
  }

  async function startSession() {
    if (!selectedProject || !task.trim()) return;
    setError(null);
    try { await startProject(selectedProject, task); }
    catch { setError('Codex could not start this task. The selected project is paused; other builders are unaffected.'); }
  }

  function reviewSelected() {
    if (!canStartSelected) return;
    setPendingBatch(selectedBatchProjects);
  }

  function reviewAllDemo() {
    const demoIds = new Set(progression.lots.flatMap((lot) => lot.projectId && lot.isDemo ? [lot.projectId] : []));
    const projects = batchLaunchProjects(progression, tasks, sessions, demoIds, demoTask);
    if (projects.length) setPendingBatch(projects);
  }

  async function confirmBatch() {
    const projects = pendingBatch;
    setPendingBatch(null);
    if (!projects?.length) return;
    setError(null);
    const assigned = new Map(progression.lots.flatMap((lot) => lot.projectId && lot.path && lot.name
      ? [[lot.projectId, { projectId: lot.projectId, path: lot.path, name: lot.name, slot: lot.slot, isDemo: lot.isDemo }] as const]
      : []));
    const results = await Promise.allSettled(projects.map((project) => {
      const selection = assigned.get(project.projectId);
      if (!selection || selection.path !== project.projectPath) return Promise.reject(new Error('Project assignment changed before launch'));
      return startProject(selection, project.task);
    }));
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

  async function submitInput(answers: InputResponse[]) {
    if (!pendingInput || !selectedProjectId) return;
    setInputSubmitting(true); setInputError(null); setHandoffNotice(null);
    try {
      if (pendingInput.requestId) await window.codeville.respondToInput(selectedProjectId, pendingInput.requestId, answers);
      else {
        setSessions((current) => ({ ...current, [selectedProjectId]: beginSession(current[selectedProjectId] ?? initialSessionState) }));
        await window.codeville.continueSession(selectedProjectId, answers[0]?.answers[0] ?? '');
      }
      setInputs((current) => { const next = { ...current }; delete next[selectedProjectId]; return next; });
      setProgression(await window.codeville.getProgression());
    } catch (cause) {
      setInputError(cause instanceof Error ? cause.message : 'The reply could not be sent safely.');
    } finally { setInputSubmitting(false); }
  }

  async function handoffToGhostty() {
    if (!selectedProjectId || !window.confirm('Hand control of this saved Codex conversation to Ghostty? Codeville will stop sending turns until you explicitly reclaim it.')) return;
    setError(null); setHandoffNotice(null);
    try {
      const result = await window.codeville.handoffToGhostty(selectedProjectId);
      setHandoffNotice(result.message + (result.launched ? '' : ` Command: ${result.command}`));
      setProgression(await window.codeville.getProgression());
      setSessions((current) => ({ ...current, [selectedProjectId]: reduceSession(current[selectedProjectId] ?? initialSessionState, { type: 'session_external', at: new Date().toISOString() }) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The Ghostty handoff failed.'); }
  }

  async function reclaimFromGhostty() {
    if (!selectedProjectId || !window.confirm('Confirm the Ghostty Codex session is closed. Return control to Codeville?')) return;
    setError(null); setHandoffNotice(null);
    try {
      await window.codeville.reclaimFromGhostty(selectedProjectId);
      setProgression(await window.codeville.getProgression());
      setSessions((current) => ({ ...current, [selectedProjectId]: resetSession() }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Codeville could not reclaim the conversation.'); }
  }

  function newTask() {
    if (!selectedProjectId) return;
    setSessions((current) => ({ ...current, [selectedProjectId]: resetSession() }));
    setProjectErrors((current) => { const next = { ...current }; delete next[selectedProjectId]; return next; });
    setError(null);
  }

  async function resetVillage() {
    setProgression(await window.codeville.resetProgression());
    setSessions({}); setTasks({}); setProjectErrors({}); setBatchSelected(new Set()); setPendingBatch(null); setSelectedSlot(0); setSelectedProjectId(null); setError(null);
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
    <main className={`app-shell${wallMode ? ' wall-mode' : ''}`}>
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">C</span><div><strong>Codeville</strong><small>A living world for your coding agents</small></div></div>
        <div className="topbar-status">
          <button className="wall-toggle" onClick={() => setMuted((current) => !current)} title={muted ? 'Unmute chimes' : 'Mute chimes'} aria-label={muted ? 'Unmute chimes' : 'Mute chimes'}>{muted ? 'Muted' : 'Chimes on'}</button>
          <button className="wall-toggle" onClick={() => { setWallMode((current) => { void window.codeville.setWallMode(!current); return !current; }); }} title="Toggle wall mode (W) — safe fleet display, desk hidden">{wallMode ? 'Exit wall mode' : 'Wall mode'}</button>
          <span className={`status-dot ${environment?.codexAvailable ? 'ready' : 'offline'}`} /><span>{environment?.codexAvailable ? environment.model : 'Codex unavailable'}</span>{environment?.codexVersion && <span className="version-tag">{environment.codexVersion}</span>}
        </div>
      </header>
      <section className="workspace">
        {!wallMode && <ProjectRail progression={progression} sessions={sessions} tasks={tasks} selectedSlot={selectedSlot} batchSelected={batchSelected} canStartAll={canStartAll} canStartSelected={canStartSelected} onSelect={selectLot} onToggleBatch={(projectId) => setBatchSelected((current) => { const next = new Set(current); if (next.has(projectId)) next.delete(projectId); else next.add(projectId); return next; })} onStartAll={reviewAllDemo} onStartSelected={reviewSelected} />}
        <div className="village-stage">
          <VillageCanvas projects={snapshots} onSelectSlot={wallMode ? undefined : (slot) => selectLot(slot, progression.lots[slot].projectId)} />
          <div className="stage-heading"><span className="eyebrow">Willow Ward · Five live lots</span><h1>{allDemo ? 'The whole village is awake' : 'Your agents, building side by side'}</h1><p>Every movement comes from a real, project-scoped Codex event.</p></div>
          {!progression.lots.some((lot) => lot.projectId) && <div className="empty-village-cta"><strong>Build a five-project demo village</strong><span>Five isolated repositories. Five real Codex builders. One living map.</span><button onClick={useDemoVillage}>Create demo village <span>→</span></button></div>}
        </div>
        {!wallMode && <TaskPanel environment={environment} project={selectedProject} task={task} session={session} progress={progress} sessionActive={sessionActive} pendingInput={pendingInput} inputSubmitting={inputSubmitting} inputError={inputError} pendingScaffold={selectedProjectId ? scaffoldViews[selectedProjectId] ?? null : null} sessionDiff={sessionDiff} landingBusy={landingBusy} landingError={landingError} onLoadDiff={loadDiff} onCloseDiff={() => setSessionDiff(null)} onApply={() => landSession('apply')} onKeep={() => landSession('keep')} onDiscard={() => landSession('discard')} onAddOrder={addOrder} onDeleteOrder={deleteOrder} onStartNextOrder={startNextOrder} onSteer={steerSession} onOpenScaffold={openScaffold} proof={proof} handoffNotice={handoffNotice} error={(selectedProjectId && projectErrors[selectedProjectId]) || error} onTaskChange={(value) => selectedProjectId && setTasks((current) => updateProjectTask(current, selectedProjectId, value))} onChooseProject={chooseProject} onUseDemoVillage={useDemoVillage} onStart={startSession} onInterrupt={interruptSession} onSubmitInput={submitInput} onHandoff={handoffToGhostty} onReclaim={reclaimFromGhostty} onNewTask={newTask} onResetVillage={resetVillage} />}
      </section>
      {approval && <ApprovalDialog request={approval} onDecision={respondToApproval} />}
      {pendingBatch && <BatchLaunchDialog projects={pendingBatch} onCancel={() => setPendingBatch(null)} onConfirm={confirmBatch} />}
    </main>
  );
}

function restoredSession(project: ProjectProgress): SessionState {
  if (project.conversationStatus === 'waiting' && project.pendingInput) {
    return reduceSession(initialSessionState, { type: 'input_required', at: project.lastTurnStartedAt ?? new Date(0).toISOString(), input: project.pendingInput });
  }
  if (project.conversationStatus === 'needs_review') return reduceSession(initialSessionState, { type: 'session_needs_review', at: project.lastTurnStartedAt ?? new Date(0).toISOString() });
  if (project.conversationStatus === 'external') return reduceSession(initialSessionState, { type: 'session_external', at: project.handoffAt ?? new Date(0).toISOString() });
  // A completed workshop keeps its lit windows and speech bubble across relaunch.
  if (project.lastDebrief) return { ...initialSessionState, phase: 'completed', debrief: project.lastDebrief };
  return initialSessionState;
}
