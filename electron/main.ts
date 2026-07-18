import { execFile } from 'node:child_process';
import { access, cp, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import { app, BrowserWindow, dialog, ipcMain } from 'electron';

import { parseCompletionDebrief } from '../src/codex/debrief';
import { translateCodexMessage } from '../src/codex/translator';
import type {
  ApprovalDecision,
  ApprovalRequestView,
  EnvironmentStatus,
  ProjectSelection,
  StartSessionInput,
  VillageLot,
} from '../src/shared/village-events';
import type { ServerNotification } from './codex/generated/ServerNotification';
import type { ServerRequest } from './codex/generated/ServerRequest';
import { AppServerClient } from './codex/app-server-client';
import { resolveCodexBinary } from './codex/resolve-binary';
import { ProgressionStore } from './progression-store';

const executeFile = promisify(execFile);
const model = 'gpt-5.6-sol';
const isDevelopment = !app.isPackaged;
const useDevelopmentRenderer = isDevelopment && process.env.CODEVILLE_E2E !== '1';
const demoNames = ['Acorn Tasks', 'Lantern API', 'Mossy Docs', 'Pine Tests', 'Willow UI'] as const;

if (process.env.CODEVILLE_USER_DATA_DIR) app.setPath('userData', process.env.CODEVILLE_USER_DATA_DIR);

interface ProjectRuntime {
  projectId: string;
  threadId: string;
  turnId: string | null;
  lastAgentMessage: string | null;
}

let window: BrowserWindow | null = null;
let client: AppServerClient | null = null;
let store: ProgressionStore;
const sessionsByThreadId = new Map<string, ProjectRuntime>();
const threadIdByProjectId = new Map<string, string>();
const pendingApprovals = new Map<string, { request: ServerRequest; projectId: string }>();
const approvalQueue: string[] = [];
let visibleApprovalId: string | null = null;

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
  const codexBinary = resolveCodexBinary();
  if (!codexBinary) return { codexAvailable: false, codexVersion: null, model, platform: process.platform };
  try {
    const { stdout } = await executeFile(codexBinary, ['--version'], { timeout: 5_000 });
    return { codexAvailable: true, codexVersion: stdout.trim(), model, platform: process.platform };
  } catch {
    return { codexAvailable: false, codexVersion: null, model, platform: process.platform };
  }
}

function messageThreadId(message: ServerNotification | ServerRequest): string | null {
  const params = message.params as { threadId?: unknown };
  return typeof params.threadId === 'string' ? params.threadId : null;
}

function sendVillageEvents(notification: ServerNotification): void {
  const threadId = messageThreadId(notification);
  if (!threadId) return;
  const runtime = sessionsByThreadId.get(threadId);
  if (!runtime) return;
  if (notification.method === 'item/completed' && notification.params.item.type === 'agentMessage') {
    runtime.lastAgentMessage = notification.params.item.text;
  }
  const completionDebrief = notification.method === 'turn/completed'
    ? parseCompletionDebrief(runtime.lastAgentMessage)
    : undefined;
  const events = translateCodexMessage(notification, { model, completionDebrief });
  for (const event of events) {
    if (event.type === 'session_completed') {
      cleanupRuntime(runtime);
      void store.recordCompletion(runtime.projectId, event.at, event.debrief).then(() => {
        window?.webContents.send('village:event', { projectId: runtime.projectId, event });
      });
    } else {
      window?.webContents.send('village:event', { projectId: runtime.projectId, event });
      if (event.type === 'session_failed' || event.type === 'session_interrupted') cleanupRuntime(runtime);
    }
  }
}

function cleanupRuntime(runtime: ProjectRuntime): void {
  sessionsByThreadId.delete(runtime.threadId);
  threadIdByProjectId.delete(runtime.projectId);
  runtime.lastAgentMessage = null;
}

function handleServerRequest(request: ServerRequest): void {
  const threadId = messageThreadId(request);
  const runtime = threadId ? sessionsByThreadId.get(threadId) : undefined;
  if (!runtime) {
    client?.respond(request.id, { decision: 'cancel' });
    return;
  }
  const requestId = String(request.id);
  pendingApprovals.set(requestId, { request, projectId: runtime.projectId });
  approvalQueue.push(requestId);
  for (const event of translateCodexMessage(request, { model })) {
    window?.webContents.send('village:event', { projectId: runtime.projectId, event });
  }
  showNextApproval();
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

function approvalView(request: ServerRequest, projectId: string): ApprovalRequestView {
  const base = { requestId: String(request.id), projectId };
  switch (request.method) {
    case 'item/commandExecution/requestApproval':
      return { ...base, category: 'command', title: 'Codex wants to run a command', explanation: request.params.reason ?? 'Review the exact local command before allowing it.', command: request.params.command ?? undefined, cwd: request.params.cwd ?? undefined };
    case 'item/fileChange/requestApproval':
      return { ...base, category: 'file_change', title: 'Codex needs permission to change files', explanation: request.params.reason ?? 'Review this request before allowing the file change.' };
    case 'item/permissions/requestApproval':
      return { ...base, category: 'permissions', title: 'Codex requested additional permissions', explanation: request.params.reason ?? 'Review the requested local permission expansion.', cwd: request.params.cwd };
    default:
      throw new Error(`Unsupported interactive Codex request: ${request.method}`);
  }
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
  showNextApproval();
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
    await access(path);
    return store.assignProject({ path, name: basename(path), slot, isDemo: false });
  });
  ipcMain.handle('project:demo-village', prepareDemoVillage);
  ipcMain.handle('progression:get', () => store.read());
  ipcMain.handle('progression:reset', () => store.reset());
  ipcMain.handle('session:start', async (_event, input: StartSessionInput) => {
    if (threadIdByProjectId.has(input.projectId)) throw new Error('This project already has an active builder');
    if (!input.projectPath || !input.task.trim()) throw new Error('Choose a project and enter a task');
    const lot = (await store.read()).lots.find((candidate) => candidate.projectId === input.projectId && candidate.path === input.projectPath);
    if (!lot) throw new Error('This project is not assigned to the village');
    await access(input.projectPath);
    const appServer = await ensureClient();
    const thread = await appServer.startThread(input.projectPath, model);
    const runtime: ProjectRuntime = { projectId: input.projectId, threadId: thread.thread.id, turnId: null, lastAgentMessage: null };
    sessionsByThreadId.set(runtime.threadId, runtime);
    threadIdByProjectId.set(runtime.projectId, runtime.threadId);
    try {
      const turn = await appServer.startTurn(runtime.threadId, input.task.trim());
      runtime.turnId = turn.turn.id;
      return { threadId: runtime.threadId, turnId: turn.turn.id, model: thread.model };
    } catch (error) {
      cleanupRuntime(runtime);
      throw error;
    }
  });
  ipcMain.handle('session:interrupt', async (_event, projectId: string) => {
    const threadId = threadIdByProjectId.get(projectId);
    const runtime = threadId ? sessionsByThreadId.get(threadId) : undefined;
    if (!runtime?.turnId || !client) return;
    await client.interruptTurn(runtime.threadId, runtime.turnId);
  });
  ipcMain.handle('approval:respond', (_event, requestId: string, decision: ApprovalDecision) => respondToApproval(requestId, decision));
}

app.whenReady().then(() => { store = new ProgressionStore(app.getPath('userData')); registerIpc(); createWindow(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('before-quit', () => { void client?.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
