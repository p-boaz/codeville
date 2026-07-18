import { execFile } from 'node:child_process';
import { access, cp, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import { app, BrowserWindow, dialog, ipcMain } from 'electron';

import { translateCodexMessage } from '../src/codex/translator';
import type {
  ApprovalDecision,
  ApprovalRequestView,
  EnvironmentStatus,
  StartSessionInput,
} from '../src/shared/village-events';
import type { ServerNotification } from './codex/generated/ServerNotification';
import type { ServerRequest } from './codex/generated/ServerRequest';
import { AppServerClient } from './codex/app-server-client';
import { ProgressionStore } from './progression-store';

const executeFile = promisify(execFile);
const model = 'gpt-5.6-sol';
const isDevelopment = !app.isPackaged;

if (process.env.CODEVILLE_USER_DATA_DIR) {
  app.setPath('userData', process.env.CODEVILLE_USER_DATA_DIR);
}

let window: BrowserWindow | null = null;
let client: AppServerClient | null = null;
let store: ProgressionStore;
let activeSession: { threadId: string; turnId: string; projectPath: string } | null = null;
const pendingApprovals = new Map<string, ServerRequest>();

function createWindow(): void {
  window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#112e2c',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDevelopment) void window.loadURL('http://127.0.0.1:5173');
  else void window.loadFile(join(__dirname, '../dist/index.html'));

  window.on('closed', () => {
    window = null;
  });
}

async function getEnvironment(): Promise<EnvironmentStatus> {
  try {
    const { stdout } = await executeFile('codex', ['--version'], { timeout: 5_000 });
    return {
      codexAvailable: true,
      codexVersion: stdout.trim(),
      model,
      platform: process.platform,
    };
  } catch {
    return { codexAvailable: false, codexVersion: null, model, platform: process.platform };
  }
}

function sendVillageEvents(notification: ServerNotification): void {
  const events = translateCodexMessage(notification, { model });
  for (const event of events) {
    if (event.type === 'session_completed' && activeSession) {
      const completedSession = activeSession;
      activeSession = null;
      void store.recordCompletion(completedSession.projectPath, event.at).then(() => {
        window?.webContents.send('village:event', event);
      });
    } else {
      window?.webContents.send('village:event', event);
      if (event.type === 'session_failed' || event.type === 'session_interrupted') {
        activeSession = null;
      }
    }
  }
}

function handleServerRequest(request: ServerRequest): void {
  const requestId = String(request.id);
  pendingApprovals.set(requestId, request);
  const events = translateCodexMessage(request, { model });
  for (const event of events) window?.webContents.send('village:event', event);
  window?.webContents.send('approval:request', approvalView(request));
}

function approvalView(request: ServerRequest): ApprovalRequestView {
  const requestId = String(request.id);
  switch (request.method) {
    case 'item/commandExecution/requestApproval':
      return {
        requestId,
        category: 'command',
        title: 'Codex wants to run a command',
        explanation: request.params.reason ?? 'Review the exact local command before allowing it.',
        command: request.params.command ?? undefined,
        cwd: request.params.cwd ?? undefined,
      };
    case 'item/fileChange/requestApproval':
      return {
        requestId,
        category: 'file_change',
        title: 'Codex needs permission to change files',
        explanation: request.params.reason ?? 'Review this request before allowing the file change.',
      };
    case 'item/permissions/requestApproval':
      return {
        requestId,
        category: 'permissions',
        title: 'Codex requested additional permissions',
        explanation: request.params.reason ?? 'Review the requested local permission expansion.',
        cwd: request.params.cwd,
      };
    default:
      throw new Error(`Unsupported interactive Codex request: ${request.method}`);
  }
}

function respondToApproval(requestId: string, decision: ApprovalDecision): void {
  const request = pendingApprovals.get(requestId);
  if (!request || !client) throw new Error('This approval request is no longer active');

  switch (request.method) {
    case 'item/commandExecution/requestApproval':
    case 'item/fileChange/requestApproval':
      client.respond(request.id, { decision });
      break;
    case 'item/permissions/requestApproval': {
      const accepted = decision === 'accept' || decision === 'acceptForSession';
      client.respond(request.id, {
        permissions: accepted
          ? {
              ...(request.params.permissions.network ? { network: request.params.permissions.network } : {}),
              ...(request.params.permissions.fileSystem ? { fileSystem: request.params.permissions.fileSystem } : {}),
            }
          : {},
        scope: decision === 'acceptForSession' ? 'session' : 'turn',
      });
      break;
    }
    default:
      throw new Error(`Unsupported approval response: ${request.method}`);
  }

  pendingApprovals.delete(requestId);
  window?.webContents.send('approval:request', null);
}

async function ensureClient(): Promise<AppServerClient> {
  if (client) return client;
  const next = new AppServerClient({
    onNotification: sendVillageEvents,
    onServerRequest: handleServerRequest,
    onDiagnostic: (message) => console.warn(`[codex] ${message}`),
  });
  await next.start();
  client = next;
  return next;
}

function registerIpc(): void {
  ipcMain.handle('environment:get', getEnvironment);
  ipcMain.handle('project:select', async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: 'Choose a project for Codeville',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const path = result.filePaths[0];
    await access(path);
    return { path, name: basename(path) };
  });
  ipcMain.handle('project:demo', async () => {
    const source = isDevelopment
      ? join(app.getAppPath(), 'fixtures/demo-repo')
      : join(process.resourcesPath, 'demo-repo');
    const destination = join(app.getPath('userData'), 'demo-project');
    await access(source);
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    await cp(source, destination, { recursive: true });
    await executeFile('git', ['init', '-b', 'main'], { cwd: destination });
    await executeFile('git', ['add', '.'], { cwd: destination });
    await executeFile(
      'git',
      ['-c', 'user.name=Codeville Demo', '-c', 'user.email=demo@codeville.local', 'commit', '-m', 'chore: seed demo project'],
      { cwd: destination },
    );
    return { path: destination, name: 'Acorn Tasks' };
  });
  ipcMain.handle('progression:get', () => store.read());
  ipcMain.handle('progression:reset', () => store.reset());
  ipcMain.handle('session:start', async (_event, input: StartSessionInput) => {
    if (activeSession) throw new Error('A Codex session is already active');
    if (!input.projectPath || !input.task.trim()) throw new Error('Choose a project and enter a task');
    await access(input.projectPath);
    const appServer = await ensureClient();
    const thread = await appServer.startThread(input.projectPath, model);
    const turn = await appServer.startTurn(thread.thread.id, input.task.trim());
    activeSession = {
      threadId: thread.thread.id,
      turnId: turn.turn.id,
      projectPath: input.projectPath,
    };
    return { threadId: thread.thread.id, turnId: turn.turn.id, model: thread.model };
  });
  ipcMain.handle('session:interrupt', async () => {
    if (!activeSession || !client) return;
    await client.interruptTurn(activeSession.threadId, activeSession.turnId);
  });
  ipcMain.handle('approval:respond', (_event, requestId: string, decision: ApprovalDecision) => {
    respondToApproval(requestId, decision);
  });
}

app.whenReady().then(() => {
  store = new ProgressionStore(app.getPath('userData'));
  registerIpc();
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  void client?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
