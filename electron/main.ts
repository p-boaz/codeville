import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, cp, mkdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import { app, BrowserWindow, clipboard, dialog, ipcMain, Notification, shell } from 'electron';

import { parseCodevilleResult, parseRawCompletionAccount, sanitizeDeskAccountText } from '../src/codex/debrief';
import { translateCodexMessage } from '../src/codex/translator';
import type {
  ApprovalDecision,
  EnvironmentStatus,
  InputResponse,
  PendingInputView,
  ProjectSelection,
  StartSessionInput,
  VillageLot,
} from '../src/shared/village-events';
import type { ServerNotification } from './codex/generated/ServerNotification';
import type { ServerRequest } from './codex/generated/ServerRequest';
import { AppServerClient } from './codex/app-server-client';
import { approvalView } from './approval-request';
import { inputRequestView, inputResponse } from './input-request';
import { resolveCodexBinary } from './codex/resolve-binary';
import { ProgressionStore } from './progression-store';
import { ProjectRuntimeRegistry, type ProjectRuntime } from './project-runtime-registry';
import { ScaffoldManager, type ScaffoldRecord } from './scaffold-manager';

const executeFile = promisify(execFile);
const model = 'gpt-5.6-sol';
const isDevelopment = !app.isPackaged;
const useDevelopmentRenderer = isDevelopment && process.env.CODEVILLE_E2E !== '1';
const demoNames = ['Acorn Tasks', 'Lantern API', 'Mossy Docs', 'Pine Tests', 'Willow UI'] as const;

if (process.env.CODEVILLE_USER_DATA_DIR) app.setPath('userData', process.env.CODEVILLE_USER_DATA_DIR);
// E2E runs several Electron instances back-to-back; software rendering keeps the
// renderer alive under GPU pressure. Production rendering is unaffected.
if (process.env.CODEVILLE_E2E === '1') app.disableHardwareAcceleration();

let window: BrowserWindow | null = null;
let client: AppServerClient | null = null;
let store: ProgressionStore;
let scaffolds: ScaffoldManager;
const runtimes = new ProjectRuntimeRegistry();
const pendingApprovals = new Map<string, { request: ServerRequest; projectId: string }>();
const pendingInputs = new Map<string, { request: Extract<ServerRequest, { method: 'item/tool/requestUserInput' }>; view: PendingInputView }>();
const approvalQueue: string[] = [];
let visibleApprovalId: string | null = null;
let environmentCache: EnvironmentStatus | null = null;
let wallModeActive = false;

function createWindow(): void {
  window = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1080,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#112e2c',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (useDevelopmentRenderer) void window.loadURL('http://127.0.0.1:5173');
  else void window.loadFile(join(__dirname, '../dist/index.html'));
  window.on('closed', () => { window = null; });
}

async function getEnvironment(): Promise<EnvironmentStatus> {
  if (environmentCache) return environmentCache;
  const codexBinary = resolveCodexBinary();
  if (!codexBinary) return environmentCache = { codexAvailable: false, codexVersion: null, model, platform: process.platform };
  try {
    const { stdout } = await executeFile(codexBinary, ['--version'], { timeout: 5_000 });
    return environmentCache = { codexAvailable: true, codexVersion: stdout.trim(), model, platform: process.platform };
  } catch {
    return environmentCache = { codexAvailable: false, codexVersion: null, model, platform: process.platform };
  }
}

function messageThreadId(message: ServerNotification | ServerRequest): string | null {
  const params = message.params as { threadId?: unknown };
  return typeof params.threadId === 'string' ? params.threadId : null;
}

function sendVillageEvents(notification: ServerNotification): void {
  const threadId = messageThreadId(notification);
  if (!threadId) return;
  const runtime = runtimes.forThread(threadId);
  if (!runtime) return;
  if (notification.method === 'turn/completed' && !runtime.turnId) return;
  if (notification.method === 'serverRequest/resolved') {
    resolveServerRequest(String(notification.params.requestId));
  }
  if (notification.method === 'item/completed' && notification.params.item.type === 'agentMessage') {
    runtime.lastAgentMessage = notification.params.item.text;
  }
  const completionResult = notification.method === 'turn/completed'
    ? parseCodevilleResult(runtime.lastAgentMessage)
    : undefined;
  if (notification.method === 'turn/completed') {
    runtime.rawCompletion = parseRawCompletionAccount(runtime.lastAgentMessage);
    runtime.lastAgentMessage = null;
  }
  const events = translateCodexMessage(notification, { model, completionResult });
  for (const event of events) {
    runtime.safeEventCount += 1;
    if (event.type === 'tests_passed') runtime.testsPassed = true;
    if (event.type === 'tests_failed') runtime.testsPassed = false;
    if (event.type === 'session_completed') {
      runtime.turnId = null;
      void store.recordCompletion(runtime.projectId, event.at, event.debrief, runtime.safeEventCount, runtime.turnStartedAt, runtime.sessionId ?? null).then(async () => {
        window?.webContents.send('village:event', { projectId: runtime.projectId, event });
        await announceDiffReady(runtime);
        cleanupRuntime(runtime);
      });
    } else if (event.type === 'input_required' && notification.method === 'turn/completed') {
      runtime.turnId = null;
      const view: PendingInputView = { ...event.input, requestId: null, projectId: runtime.projectId };
      void store.recordWaiting(runtime.projectId, runtime.threadId, event.input, runtime.safeEventCount, runtime.turnStartedAt).then(() => {
        window?.webContents.send('input:request', { projectId: runtime.projectId, request: view });
        window?.webContents.send('village:event', { projectId: runtime.projectId, event });
      });
    } else if (event.type === 'session_needs_review') {
      runtime.turnId = null;
      void store.recordNeedsReview(runtime.projectId, runtime.threadId, runtime.safeEventCount, runtime.turnStartedAt, runtime.sessionId ?? null).then(async () => {
        window?.webContents.send('village:event', { projectId: runtime.projectId, event });
        await announceDiffReady(runtime);
        cleanupRuntime(runtime);
      });
    } else {
      window?.webContents.send('village:event', { projectId: runtime.projectId, event });
      if (event.type === 'session_failed' || event.type === 'session_interrupted') {
        // Seal partial work so it is inspectable (or auto-discarded when empty)
        // instead of invisibly blocking the lot until the next relaunch.
        runtime.turnId = null;
        if (event.type === 'session_failed') void notifyAttention(runtime.projectId, 'Construction paused — the builder hit an error.');
        void announceDiffReady(runtime).then(() => {
          cleanupRuntime(runtime);
          void updateAttentionBadge();
        });
      }
    }
  }
}

function cleanupRuntime(runtime: ProjectRuntime): void {
  runtimes.remove(runtime);
}

/**
 * Seal the finished session's scaffold: commit the agent's work on its branch,
 * then tell the renderer how big the landable diff is (counts only — the safe
 * register never carries paths or patches). An untouched scaffold is discarded
 * so the lot returns to a startable state.
 */
async function announceDiffReady(runtime: ProjectRuntime): Promise<void> {
  const projectId = runtime.projectId;
  try {
    const record = await scaffolds.forProject(projectId);
    if (!record) return;
    await scaffolds.checkpoint(record);
    const stats = await scaffolds.diffStats(record);
    if (stats.filesChanged === 0) {
      await scaffolds.discard(record);
      return;
    }
    // Desk account: model prose survives only where the diffstat vouches for it.
    const raw = runtime.rawCompletion ?? null;
    runtime.rawCompletion = null;
    const durationMs = runtime.turnStartedAt ? Math.max(0, Date.now() - Date.parse(runtime.turnStartedAt)) : null;
    await scaffolds.saveOutcome(record, {
      testsPassed: runtime.testsPassed ?? null,
      durationMs,
      deskLanded: raw ? sanitizeDeskAccountText(raw.landed, stats.changedPaths) : null,
      deskFollowUp: raw ? sanitizeDeskAccountText(raw.followUp, stats.changedPaths) : null,
      followUpRecommended: raw?.followUpRecommended ?? true,
    });
    await store.updateSessionStats(projectId, record.sessionId, {
      filesChanged: stats.filesChanged,
      insertions: stats.insertions,
      deletions: stats.deletions,
      testsPassed: runtime.testsPassed ?? null,
      durationMs,
    });
    window?.webContents.send('village:event', {
      projectId,
      event: { type: 'diff_ready', at: new Date().toISOString(), filesChanged: stats.filesChanged, insertions: stats.insertions, deletions: stats.deletions },
    });
    void notifyAttention(projectId, `Improvement ready for inspection: ${stats.filesChanged} file${stats.filesChanged === 1 ? '' : 's'} changed, +${stats.insertions} −${stats.deletions}.`);
    void updateAttentionBadge();
  } catch (cause) {
    console.warn(`[scaffold] finalize failed for ${projectId}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

async function requireScaffold(projectId: string): Promise<ScaffoldRecord> {
  const record = await scaffolds.forProject(projectId);
  if (!record) throw new Error('This project has no pending improvement to inspect');
  return record;
}

/** Dock badge = decisions waiting on the operator: approvals, replies, uninspected improvements. */
async function updateAttentionBadge(): Promise<void> {
  try {
    const landable = (await scaffolds.listOrphans(new Set())).filter((record) => record.outcome).length;
    app.setBadgeCount(pendingApprovals.size + pendingInputs.size + landable);
  } catch {
    // The badge is a convenience; never let it break session flow.
  }
}

/** Safe-register notification when the window is in the background. Click focuses the lot. */
async function notifyAttention(projectId: string, body: string): Promise<void> {
  if (!Notification.isSupported() || (window && window.isFocused())) return;
  const name = (await store.read()).projects[projectId]?.repositoryName ?? 'A workshop';
  const notification = new Notification({ title: `Codeville — ${name}`, body });
  notification.on('click', () => {
    window?.show();
    window?.focus();
    window?.webContents.send('village:focus-project', projectId);
  });
  notification.show();
}

function handleServerRequest(request: ServerRequest): void {
  const threadId = messageThreadId(request);
  const runtime = threadId ? runtimes.forThread(threadId) : undefined;
  if (!runtime) {
    client?.respond(request.id, { decision: 'cancel' });
    return;
  }
  if (request.method === 'item/tool/requestUserInput') {
    const view = inputRequestView(request, runtime.projectId);
    pendingInputs.set(String(request.id), { request, view });
    runtime.safeEventCount += 1;
    const event = { type: 'input_required' as const, at: new Date().toISOString(), input: { source: view.source, title: view.title, questions: view.questions } };
    void store.recordWaiting(runtime.projectId, runtime.threadId, event.input, runtime.safeEventCount, runtime.turnStartedAt);
    window?.webContents.send('input:request', { projectId: runtime.projectId, request: view });
    window?.webContents.send('village:event', { projectId: runtime.projectId, event });
    void notifyAttention(runtime.projectId, 'The builder needs your input to continue.');
    void updateAttentionBadge();
    return;
  }
  const requestId = String(request.id);
  pendingApprovals.set(requestId, { request, projectId: runtime.projectId });
  approvalQueue.push(requestId);
  for (const event of translateCodexMessage(request, { model })) {
    window?.webContents.send('village:event', { projectId: runtime.projectId, event });
  }
  void notifyAttention(runtime.projectId, 'The builder is waiting for your approval.');
  void updateAttentionBadge();
  showNextApproval();
}

function resolveServerRequest(requestId: string): void {
  const input = pendingInputs.get(requestId);
  if (input) {
    pendingInputs.delete(requestId);
    window?.webContents.send('input:request', { projectId: input.view.projectId, request: null });
  }
  if (pendingApprovals.delete(requestId)) {
    if (visibleApprovalId === requestId) visibleApprovalId = null;
    showNextApproval();
  }
  void updateAttentionBadge();
}

function showNextApproval(): void {
  if (visibleApprovalId) return;
  const requestId = approvalQueue.shift();
  if (!requestId) {
    window?.webContents.send('approval:request', null);
    return;
  }
  const pending = pendingApprovals.get(requestId);
  if (!pending) return showNextApproval();
  visibleApprovalId = requestId;
  window?.webContents.send('approval:request', approvalView(pending.request, pending.projectId));
}

function respondToApproval(requestId: string, decision: ApprovalDecision): void {
  const pending = pendingApprovals.get(requestId);
  if (!pending || !client) throw new Error('This approval request is no longer active');
  const { request } = pending;
  if (request.method === 'item/commandExecution/requestApproval' || request.method === 'item/fileChange/requestApproval') {
    client.respond(request.id, { decision });
  } else if (request.method === 'item/permissions/requestApproval') {
    const accepted = decision === 'accept' || decision === 'acceptForSession';
    client.respond(request.id, {
      permissions: accepted ? {
        ...(request.params.permissions.network ? { network: request.params.permissions.network } : {}),
        ...(request.params.permissions.fileSystem ? { fileSystem: request.params.permissions.fileSystem } : {}),
      } : {},
      scope: decision === 'acceptForSession' ? 'session' : 'turn',
    });
  } else throw new Error(`Unsupported approval response: ${request.method}`);
  pendingApprovals.delete(requestId);
  if (visibleApprovalId === requestId) visibleApprovalId = null;
  void updateAttentionBadge();
  showNextApproval();
}

async function respondToInput(projectId: string, requestId: string | null, answers: InputResponse[]): Promise<void> {
  if (!requestId) throw new Error('This stopped turn must be continued with a desk reply');
  const pending = pendingInputs.get(requestId);
  if (!pending || pending.view.projectId !== projectId || !client) throw new Error('This input request is no longer active');
  const runtime = runtimes.forProject(projectId);
  client.respond(pending.request.id, inputResponse(pending.request, answers));
  pendingInputs.delete(requestId);
  void updateAttentionBadge();
  window?.webContents.send('input:request', { projectId, request: null });
  if (runtime) await store.recordThread(projectId, runtime.threadId, runtime.turnStartedAt ?? new Date().toISOString(), runtime.safeEventCount);
  window?.webContents.send('village:event', { projectId, event: { type: 'input_resolved', at: new Date().toISOString() } });
}

async function ensureClient(): Promise<AppServerClient> {
  if (client) return client;
  const binary = resolveCodexBinary();
  if (!binary) throw new Error('Codex CLI was not found. Install Codex, sign in, and reopen Codeville.');
  const next = new AppServerClient({ binary, onNotification: sendVillageEvents, onServerRequest: handleServerRequest, onDiagnostic: (message) => console.warn(`[codex] ${message}`) });
  await next.start();
  client = next;
  return next;
}

async function initializeRepository(destination: string): Promise<void> {
  await executeFile('git', ['init', '-b', 'main'], { cwd: destination });
  await executeFile('git', ['add', '.'], { cwd: destination });
  await executeFile('git', ['-c', 'user.name=Codeville Demo', '-c', 'user.email=demo@codeville.local', 'commit', '-m', 'chore: seed demo project'], { cwd: destination });
}

async function prepareDemoVillage(): Promise<ProjectSelection[]> {
  const source = isDevelopment ? join(app.getAppPath(), 'fixtures/demo-repo') : join(process.resourcesPath, 'demo-repo');
  const root = join(app.getPath('userData'), 'demo-village');
  await access(source);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const projects: ProjectSelection[] = [];
  for (const [slot, name] of demoNames.entries()) {
    const destination = join(root, `lot-${slot + 1}`);
    await cp(source, destination, { recursive: true });
    await initializeRepository(destination);
    projects.push(await store.assignProject({ path: destination, name, slot: slot as VillageLot['slot'], isDemo: true }));
  }
  return projects;
}

function registerIpc(): void {
  ipcMain.handle('environment:get', getEnvironment);
  ipcMain.handle('project:select', async (_event, slot: VillageLot['slot']) => {
    const result = await dialog.showOpenDialog(window!, { title: 'Choose a project for Codeville', properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    const path = result.filePaths[0];
    if (!(await stat(path)).isDirectory()) throw new Error('Choose a repository directory');
    try { await access(join(path, '.git')); }
    catch { throw new Error('Choose a Git repository. Codeville will not initialize or modify repository metadata.'); }
    return store.assignProject({ path, name: basename(path), slot, isDemo: false });
  });
  ipcMain.handle('project:demo-village', prepareDemoVillage);
  ipcMain.handle('progression:get', () => store.read());
  ipcMain.handle('progression:reset', () => store.reset());
  ipcMain.handle('session:start', async (_event, input: StartSessionInput) => {
    if (runtimes.hasProject(input.projectId)) throw new Error('This project already has an active builder');
    if (!input.projectPath || !input.task.trim()) throw new Error('Choose a project and enter a task');
    const lot = (await store.read()).lots.find((candidate) => candidate.projectId === input.projectId && candidate.path === input.projectPath);
    if (!lot) throw new Error('This project is not assigned to the village');
    await access(input.projectPath);
    const previous = await scaffolds.forProject(input.projectId);
    if (previous) {
      await scaffolds.checkpoint(previous);
      const stats = await scaffolds.diffStats(previous);
      if (stats.filesChanged > 0) throw new Error('This workshop has an uninspected improvement. Apply, keep, or discard it before starting new work.');
      await scaffolds.discard(previous);
    }
    const appServer = await ensureClient();
    const scaffold = await scaffolds.create(input.projectPath, input.projectId, randomUUID());
    let thread;
    try {
      thread = await appServer.startThread(scaffold.scaffoldPath, model);
    } catch (error) {
      await scaffolds.discard(scaffold);
      throw error;
    }
    const startedAt = new Date().toISOString();
    const runtime: ProjectRuntime = { projectId: input.projectId, threadId: thread.thread.id, turnId: null, lastAgentMessage: null, safeEventCount: 0, turnStartedAt: startedAt, sessionId: scaffold.sessionId };
    runtimes.add(runtime);
    try {
      const turn = await appServer.startTurn(runtime.threadId, input.task.trim());
      runtime.turnId = turn.turn.id;
      await store.recordThread(runtime.projectId, runtime.threadId, startedAt);
      return { threadId: runtime.threadId, turnId: turn.turn.id, model: thread.model };
    } catch (error) {
      cleanupRuntime(runtime);
      await scaffolds.discard(scaffold);
      throw error;
    }
  });
  ipcMain.handle('session:interrupt', async (_event, projectId: string) => {
    const runtime = runtimes.forProject(projectId);
    if (!runtime?.turnId || !client) return;
    await client.interruptTurn(runtime.threadId, runtime.turnId);
  });
  ipcMain.handle('session:steer', async (_event, projectId: string, message: string) => {
    if (!message.trim()) throw new Error('Enter a direction before redirecting the builder');
    const runtime = runtimes.forProject(projectId);
    if (!runtime?.turnId || !client) throw new Error('This builder has no active turn to redirect');
    await client.steerTurn(runtime.threadId, runtime.turnId, message.trim());
    window?.webContents.send('village:event', { projectId, event: { type: 'session_redirected', at: new Date().toISOString() } });
  });
  ipcMain.handle('session:continue', async (_event, projectId: string, reply: string) => {
    if (!reply.trim()) throw new Error('Enter a reply before continuing');
    const progress = (await store.read()).projects[projectId];
    if (!progress || progress.conversationStatus !== 'waiting' || !progress.lastThreadId) throw new Error('This project is not waiting for a reply');
    if (progress.pendingInput?.source === 'native') throw new Error('Answer the active Codex questions directly');
    const appServer = await ensureClient();
    let runtime = runtimes.forProject(projectId);
    if (runtime?.turnId) throw new Error('This project already has an active turn');
    if (!runtime) {
      const scaffold = await scaffolds.forProject(projectId);
      const resumed = await appServer.resumeThread(progress.lastThreadId, scaffold?.scaffoldPath ?? progress.repositoryPath, model);
      runtime = { projectId, threadId: progress.lastThreadId, turnId: null, lastAgentMessage: null, safeEventCount: progress.safeEventCount, turnStartedAt: null, sessionId: scaffold?.sessionId ?? null };
      runtimes.add(runtime);
      if (resumed.thread.id !== progress.lastThreadId) throw new Error('Codex resumed an unexpected thread');
    }
    const startedAt = new Date().toISOString();
    runtime.turnStartedAt = startedAt;
    runtime.lastAgentMessage = null;
    const turn = await appServer.startTurn(runtime.threadId, reply.trim());
    runtime.turnId = turn.turn.id;
    await store.recordThread(projectId, runtime.threadId, startedAt, runtime.safeEventCount);
    window?.webContents.send('input:request', { projectId, request: null });
    return { threadId: runtime.threadId, turnId: turn.turn.id, model };
  });
  ipcMain.handle('approval:respond', (_event, requestId: string, decision: ApprovalDecision) => respondToApproval(requestId, decision));
  ipcMain.handle('input:respond', (_event, projectId: string, requestId: string | null, answers: InputResponse[]) => respondToInput(projectId, requestId, answers));
  ipcMain.handle('connection:proof', async (_event, projectId: string) => {
    const progress = (await store.read()).projects[projectId];
    if (!progress) throw new Error('This project is not assigned to the village');
    const runtime = runtimes.forProject(projectId);
    const environment = await getEnvironment();
    return {
      connected: client?.connected ?? false,
      appServerPid: client?.pid ?? null,
      codexVersion: environment.codexVersion,
      model,
      repositoryName: progress.repositoryName,
      repositoryPath: progress.repositoryPath,
      threadId: runtime?.threadId ?? progress.lastThreadId,
      activeTurnId: runtime?.turnId ?? null,
      safeEventCount: runtime?.safeEventCount ?? progress.safeEventCount,
      connectedAt: client?.connectionStartedAt ?? null,
      turnStartedAt: runtime?.turnStartedAt ?? progress.lastTurnStartedAt,
    };
  });
  ipcMain.handle('session:handoff', async (_event, projectId: string) => {
    const progress = (await store.read()).projects[projectId];
    if (!progress?.lastThreadId) throw new Error('No saved Codex thread is available for this project');
    const runtime = runtimes.forProject(projectId);
    if (runtime?.turnId) throw new Error('Stop the active turn before handing it to Ghostty');
    if (progress.conversationStatus === 'external') throw new Error('Ghostty already owns this conversation');
    if (runtime && client) await client.unsubscribeThread(runtime.threadId);
    if (runtime) cleanupRuntime(runtime);
    const binary = resolveCodexBinary();
    if (!binary) throw new Error('Codex CLI was not found');
    const scaffold = await scaffolds.forProject(projectId);
    const commandArgs = [binary, 'resume', progress.lastThreadId, '-C', scaffold?.scaffoldPath ?? progress.repositoryPath];
    const command = commandArgs.map(shellQuote).join(' ');
    const at = new Date().toISOString();
    await store.recordExternal(projectId, at);
    try {
      const testLauncher = process.env.CODEVILLE_GHOSTTY_BINARY;
      if (testLauncher) {
        await access(testLauncher);
        const child = spawn(testLauncher, commandArgs, { detached: true, stdio: 'ignore' });
        child.unref();
        return { launched: true, command, message: 'Ghostty now owns this Codex conversation.' };
      }
      await access('/Applications/Ghostty.app');
      const child = spawn('/usr/bin/open', ['-na', 'Ghostty.app', '--args', '-e', ...commandArgs], { detached: true, stdio: 'ignore' });
      child.unref();
      return { launched: true, command, message: 'Ghostty now owns this Codex conversation.' };
    } catch {
      clipboard.writeText(command);
      return { launched: false, command, message: 'Ghostty is unavailable. The exact resume command was copied.' };
    }
  });
  ipcMain.handle('scaffold:pending', async (_event, projectId: string) => {
    const record = await scaffolds.forProject(projectId);
    if (!record) return null;
    await scaffolds.checkpoint(record);
    const stats = await scaffolds.diffStats(record);
    if (stats.filesChanged === 0) return null;
    return {
      projectId,
      branch: record.branch,
      baseSubject: record.baseSubject,
      createdAt: record.createdAt,
      filesChanged: stats.filesChanged,
      insertions: stats.insertions,
      deletions: stats.deletions,
      outcome: record.outcome ?? null,
    };
  });
  ipcMain.handle('wall:set', (_event, on: boolean) => { wallModeActive = Boolean(on); });
  ipcMain.handle('scaffold:diff', async (_event, projectId: string) => {
    // Defense in depth: the desk register is refused outright while the wall display is up.
    if (wallModeActive) throw new Error('Exit wall mode to inspect diffs');
    const record = await scaffolds.forProject(projectId);
    if (!record) return null;
    await scaffolds.checkpoint(record);
    const [stats, files] = [await scaffolds.diffStats(record), await scaffolds.diff(record)];
    return {
      projectId,
      branch: record.branch,
      baseCommit: record.baseCommit.slice(0, 10),
      baseSubject: record.baseSubject,
      filesChanged: stats.filesChanged,
      insertions: stats.insertions,
      deletions: stats.deletions,
      files,
    };
  });
  ipcMain.handle('scaffold:apply', async (_event, projectId: string) => {
    if (runtimes.forProject(projectId)?.turnId) throw new Error('The builder is still working. Wait for the turn to finish before applying.');
    const record = await requireScaffold(projectId);
    await scaffolds.checkpoint(record);
    const progress = (await store.read()).projects[projectId];
    const summary = progress?.lastDebrief?.landed ?? 'Codeville improvement';
    const result = await scaffolds.apply(record, `${summary}\n\nCodeville session ${record.sessionId}`);
    await scaffolds.discard(record);
    await store.recordLanding(projectId, record.sessionId, 'applied');
    window?.webContents.send('village:event', { projectId, event: { type: 'session_applied', at: new Date().toISOString(), commit: result.commit.slice(0, 10) } });
    void updateAttentionBadge();
    return result;
  });
  ipcMain.handle('scaffold:keep', async (_event, projectId: string) => {
    if (runtimes.forProject(projectId)?.turnId) throw new Error('The builder is still working. Wait for the turn to finish before keeping the branch.');
    const record = await requireScaffold(projectId);
    await scaffolds.checkpoint(record);
    await scaffolds.keep(record);
    await store.recordLanding(projectId, record.sessionId, 'kept');
    window?.webContents.send('village:event', { projectId, event: { type: 'session_kept', at: new Date().toISOString(), branch: record.branch } });
    void updateAttentionBadge();
    return { branch: record.branch };
  });
  ipcMain.handle('scaffold:discard', async (_event, projectId: string) => {
    if (runtimes.forProject(projectId)?.turnId) throw new Error('The builder is still working. Interrupt it before discarding.');
    const record = await requireScaffold(projectId);
    await scaffolds.discard(record);
    await store.recordLanding(projectId, record.sessionId, 'discarded');
    window?.webContents.send('village:event', { projectId, event: { type: 'session_discarded', at: new Date().toISOString() } });
    void updateAttentionBadge();
  });
  ipcMain.handle('scaffold:open', async (_event, projectId: string) => {
    const record = await requireScaffold(projectId);
    const failure = await shell.openPath(record.scaffoldPath);
    if (failure) throw new Error('The working copy could not be opened');
  });
  ipcMain.handle('orders:add', (_event, projectId: string, task: string) => store.addWorkOrder(projectId, task));
  ipcMain.handle('orders:delete', (_event, projectId: string, orderId: string) => store.deleteWorkOrder(projectId, orderId));
  ipcMain.handle('session:reclaim', async (_event, projectId: string) => {
    const progress = (await store.read()).projects[projectId];
    if (!progress?.lastThreadId || progress.conversationStatus !== 'external') throw new Error('This conversation is not owned by Ghostty');
    if (runtimes.hasProject(projectId)) throw new Error('Codeville already owns this conversation');
    const appServer = await ensureClient();
    const scaffold = await scaffolds.forProject(projectId);
    await appServer.resumeThread(progress.lastThreadId, scaffold?.scaffoldPath ?? progress.repositoryPath, model);
    runtimes.add({ projectId, threadId: progress.lastThreadId, turnId: null, lastAgentMessage: null, safeEventCount: progress.safeEventCount, turnStartedAt: progress.lastTurnStartedAt, sessionId: scaffold?.sessionId ?? null });
    await store.recordReclaimed(projectId);
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Quit-during-finalize leaves scaffolds behind: seal work that exists, discard provably-empty ones. */
async function reconcileOrphanScaffolds(): Promise<void> {
  for (const record of await scaffolds.listOrphans(new Set())) {
    try {
      await scaffolds.checkpoint(record);
      const stats = await scaffolds.diffStats(record);
      if (stats.filesChanged === 0) await scaffolds.discard(record);
    } catch (cause) {
      console.warn(`[scaffold] orphan reconcile failed for ${record.sessionId}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
}

app.whenReady().then(() => {
  store = new ProgressionStore(app.getPath('userData'));
  scaffolds = new ScaffoldManager(join(app.getPath('userData'), 'scaffolds'));
  registerIpc();
  createWindow();
  void reconcileOrphanScaffolds().then(updateAttentionBadge);
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => { void client?.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
