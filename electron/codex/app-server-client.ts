import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface as ReadLineInterface } from 'node:readline';

import type { ServerNotification } from './generated/ServerNotification';
import type { ServerRequest } from './generated/ServerRequest';
import type { ThreadStartResponse } from './generated/v2/ThreadStartResponse';
import type { TurnStartResponse } from './generated/v2/TurnStartResponse';

interface JsonRpcSuccess {
  id: number | string;
  result: unknown;
}

interface JsonRpcFailure {
  id: number | string;
  error: { code: number; message: string; data?: unknown };
}

type IncomingMessage = JsonRpcSuccess | JsonRpcFailure | ServerNotification | ServerRequest;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface AppServerClientOptions {
  binary?: string;
  requestTimeoutMs?: number;
  onNotification?: (notification: ServerNotification) => void;
  onServerRequest?: (request: ServerRequest) => void;
  onDiagnostic?: (message: string) => void;
}

export class AppServerClient {
  private readonly binary: string;
  private readonly requestTimeoutMs: number;
  private readonly onNotification?: (notification: ServerNotification) => void;
  private readonly onServerRequest?: (request: ServerRequest) => void;
  private readonly onDiagnostic?: (message: string) => void;
  private process: ChildProcessWithoutNullStreams | null = null;
  private lines: ReadLineInterface | null = null;
  private nextRequestId = 1;
  private pending = new Map<number | string, PendingRequest>();
  private initialized = false;

  constructor(options: AppServerClientOptions = {}) {
    this.binary = options.binary ?? 'codex';
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.onNotification = options.onNotification;
    this.onServerRequest = options.onServerRequest;
    this.onDiagnostic = options.onDiagnostic;
  }

  async start(): Promise<void> {
    if (this.process) return;

    const child = spawn(this.binary, ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    this.process = child;
    this.lines = createInterface({ input: child.stdout });
    this.lines.on('line', (line) => this.handleLine(line));
    child.stderr.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim();
      if (message) this.onDiagnostic?.(message.slice(0, 500));
    });
    child.once('error', (error) => this.failAll(error));
    child.once('exit', (code, signal) => {
      this.failAll(new Error(`Codex app-server exited (${signal ?? code ?? 'unknown'})`));
      this.cleanupProcess();
    });

    await this.request('initialize', {
      clientInfo: { name: 'codeville', title: 'Codeville', version: '0.1.0' },
      capabilities: null,
    });
    this.notify('initialized');
    this.initialized = true;
  }

  async startThread(cwd: string, model: string): Promise<ThreadStartResponse> {
    this.assertInitialized();
    return this.request<ThreadStartResponse>('thread/start', {
      cwd,
      model,
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      serviceName: 'codeville',
      ephemeral: false,
    });
  }

  async startTurn(threadId: string, task: string): Promise<TurnStartResponse> {
    this.assertInitialized();
    return this.request<TurnStartResponse>('turn/start', {
      threadId,
      input: [{ type: 'text', text: task, text_elements: [] }],
    });
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    this.assertInitialized();
    await this.request('turn/interrupt', { threadId, turnId });
  }

  respond(id: number | string, result: unknown): void {
    this.write({ id, result });
  }

  async stop(): Promise<void> {
    const child = this.process;
    if (!child) return;
    this.lines?.close();
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 2_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.cleanupProcess();
  }

  private request<T = unknown>(method: string, params: unknown): Promise<T> {
    const id = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timer,
      });
      this.write({ method, id, params });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params });
  }

  private write(message: unknown): void {
    if (!this.process?.stdin.writable) throw new Error('Codex app-server is not running');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: IncomingMessage;
    try {
      message = JSON.parse(line) as IncomingMessage;
    } catch {
      this.onDiagnostic?.('Ignored malformed JSON from Codex app-server');
      return;
    }

    if ('id' in message && ('result' in message || 'error' in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if ('error' in message) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }

    if ('id' in message) this.onServerRequest?.(message as ServerRequest);
    else this.onNotification?.(message as ServerNotification);
  }

  private assertInitialized(): void {
    if (!this.initialized) throw new Error('Codex app-server is not initialized');
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private cleanupProcess(): void {
    this.lines = null;
    this.process = null;
    this.initialized = false;
  }
}
