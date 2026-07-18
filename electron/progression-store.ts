import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { resumablePendingInput } from '../src/codex/debrief';
import type { CompletionDebrief, ProgressionData, ProjectSelection, SafePendingInput, VillageLot } from '../src/shared/village-events';

type ProgressionV1 = {
  version: 1;
  projects: Record<string, { level: number; completedSessions: number; lastCompletedAt: string | null }>;
};

const slots = [0, 1, 2, 3, 4] as const;

export const emptyProgression = (): ProgressionData => ({
  version: 2,
  lots: slots.map((slot) => ({ slot, projectId: null, path: null, name: null, isDemo: false })) as ProgressionData['lots'],
  projects: {},
});

export class ProgressionStore {
  private readonly filePath: string;
  private firstRead = true;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'progression.json');
  }

  async read(): Promise<ProgressionData> {
    await this.mutationTail;
    return this.readNow();
  }

  private async readNow(): Promise<ProgressionData> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      if (validateProgression(parsed)) {
        const { data, changed } = normalizeProgression(parsed, this.firstRead);
        this.firstRead = false;
        if (changed) await this.write(data);
        return data;
      }
      if (validateProgressionV1(parsed)) {
        const migrated = migrateProgression(parsed);
        await this.write(migrated);
        return migrated;
      }
      return emptyProgression();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { this.firstRead = false; return emptyProgression(); }
      throw error;
    }
  }

  async assignProject(selection: Omit<ProjectSelection, 'projectId'> & { projectId?: string }): Promise<ProjectSelection> {
    return this.enqueueMutation(async () => {
    const data = await this.readNow();
    const existing = Object.values(data.projects).find((project) => project.repositoryPath === selection.path);
    const projectId = existing?.projectId ?? selection.projectId ?? randomUUID();
    for (const lot of data.lots) {
      if (lot.projectId === projectId) Object.assign(lot, { projectId: null, path: null, name: null, isDemo: false });
    }
    data.lots[selection.slot] = { ...selection, projectId };
    data.projects[projectId] ??= {
      projectId,
      repositoryPath: selection.path,
      repositoryName: selection.name,
      isDemo: selection.isDemo,
      level: 0,
      completedSessions: 0,
      lastCompletedAt: null,
      lastDebrief: null,
      lastThreadId: null,
      conversationStatus: 'idle',
      pendingInput: null,
      handoffAt: null,
      safeEventCount: 0,
      lastTurnStartedAt: null,
    };
    Object.assign(data.projects[projectId], {
      repositoryPath: selection.path,
      repositoryName: selection.name,
      isDemo: selection.isDemo,
    });
    await this.write(data);
    return { ...selection, projectId };
    });
  }

  async recordCompletion(projectId: string, at: string, debrief: CompletionDebrief, safeEventCount?: number, turnStartedAt?: string | null): Promise<ProgressionData> {
    return this.enqueueMutation(async () => {
    const data = await this.readNow();
    const current = data.projects[projectId];
    if (!current) throw new Error('The completed project is not assigned to this village');
    data.projects[projectId] = {
      ...current,
      level: current.level + 1,
      completedSessions: current.completedSessions + 1,
      lastCompletedAt: at,
      lastDebrief: debrief,
      conversationStatus: 'idle',
      pendingInput: null,
      handoffAt: null,
      ...(safeEventCount === undefined ? {} : { safeEventCount }),
      ...(turnStartedAt === undefined ? {} : { lastTurnStartedAt: turnStartedAt }),
    };
    await this.write(data);
    return data;
    });
  }

  async recordThread(projectId: string, threadId: string, turnStartedAt: string, safeEventCount = 0): Promise<ProgressionData> {
    return this.updateConversation(projectId, { lastThreadId: threadId, conversationStatus: 'idle', pendingInput: null, handoffAt: null, safeEventCount, lastTurnStartedAt: turnStartedAt });
  }

  async recordWaiting(projectId: string, threadId: string, pendingInput: SafePendingInput, safeEventCount = 0, turnStartedAt: string | null = null): Promise<ProgressionData> {
    return this.updateConversation(projectId, { lastThreadId: threadId, conversationStatus: 'waiting', pendingInput, handoffAt: null, safeEventCount, lastTurnStartedAt: turnStartedAt });
  }

  async recordNeedsReview(projectId: string, threadId: string, safeEventCount = 0, turnStartedAt: string | null = null): Promise<ProgressionData> {
    return this.updateConversation(projectId, { lastThreadId: threadId, conversationStatus: 'needs_review', pendingInput: null, handoffAt: null, safeEventCount, lastTurnStartedAt: turnStartedAt });
  }

  async recordExternal(projectId: string, at: string): Promise<ProgressionData> {
    return this.updateConversation(projectId, { conversationStatus: 'external', pendingInput: null, handoffAt: at });
  }

  async recordReclaimed(projectId: string): Promise<ProgressionData> {
    return this.updateConversation(projectId, { conversationStatus: 'idle', pendingInput: null, handoffAt: null });
  }

  async reset(): Promise<ProgressionData> {
    return this.enqueueMutation(async () => {
      const data = emptyProgression();
      await this.write(data);
      return data;
    });
  }

  private async write(data: ProgressionData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  private async updateConversation(projectId: string, update: Partial<Pick<ProgressionData['projects'][string], 'lastThreadId' | 'conversationStatus' | 'pendingInput' | 'handoffAt' | 'safeEventCount' | 'lastTurnStartedAt'>>): Promise<ProgressionData> {
    return this.enqueueMutation(async () => {
    const data = await this.readNow();
    const current = data.projects[projectId];
    if (!current) throw new Error('The project is not assigned to this village');
    data.projects[projectId] = { ...current, ...update };
    await this.write(data);
    return data;
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export function validateProgression(value: unknown): value is ProgressionData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProgressionData>;
  if (candidate.version !== 2 || !Array.isArray(candidate.lots) || candidate.lots.length !== 5 || !candidate.projects || typeof candidate.projects !== 'object') return false;
  if (!candidate.lots.every((lot, index) => validateLot(lot, index))) return false;
  return Object.entries(candidate.projects).every(([id, project]) =>
    project?.projectId === id && Number.isInteger(project.level) && project.level >= 0 &&
    (project.repositoryPath === undefined || typeof project.repositoryPath === 'string') &&
    (project.repositoryName === undefined || typeof project.repositoryName === 'string') &&
    (project.isDemo === undefined || typeof project.isDemo === 'boolean') &&
    Number.isInteger(project.completedSessions) && project.completedSessions >= 0 &&
    (project.lastCompletedAt === null || typeof project.lastCompletedAt === 'string') &&
    (project.lastDebrief === null || validateDebrief(project.lastDebrief)) &&
    (project.lastThreadId === undefined || project.lastThreadId === null || typeof project.lastThreadId === 'string') &&
    (project.conversationStatus === undefined || ['idle', 'waiting', 'needs_review', 'external'].includes(project.conversationStatus)) &&
    (project.pendingInput === undefined || project.pendingInput === null || validatePendingInput(project.pendingInput)) &&
    (project.handoffAt === undefined || project.handoffAt === null || typeof project.handoffAt === 'string') &&
    Number.isInteger(project.safeEventCount ?? 0) && (project.safeEventCount ?? 0) >= 0 &&
    (project.lastTurnStartedAt === undefined || project.lastTurnStartedAt === null || typeof project.lastTurnStartedAt === 'string')
  );
}

function validateProgressionV1(value: unknown): value is ProgressionV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProgressionV1>;
  return candidate.version === 1 && Boolean(candidate.projects) && typeof candidate.projects === 'object';
}

function migrateProgression(value: ProgressionV1): ProgressionData {
  const data = emptyProgression();
  for (const [index, [path, prior]] of Object.entries(value.projects).slice(0, 5).entries()) {
    const projectId = randomUUID();
    data.lots[index] = { slot: index as VillageLot['slot'], projectId, path, name: path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Migrated project', isDemo: false };
    data.projects[projectId] = { projectId, repositoryPath: path, repositoryName: data.lots[index].name!, isDemo: false, ...prior, lastDebrief: null, lastThreadId: null, conversationStatus: 'idle', pendingInput: null, handoffAt: null, safeEventCount: 0, lastTurnStartedAt: null };
  }
  return data;
}

function normalizeProgression(data: ProgressionData, restoreInterruptedNative = false): { data: ProgressionData; changed: boolean } {
  let changed = false;
  const normalized = structuredClone(data);
  for (const project of Object.values(normalized.projects)) {
    const lot = normalized.lots.find((candidate) => candidate.projectId === project.projectId);
    if (typeof project.repositoryPath !== 'string') { project.repositoryPath = lot?.path ?? ''; changed = true; }
    if (typeof project.repositoryName !== 'string') { project.repositoryName = lot?.name ?? 'Saved project'; changed = true; }
    if (typeof project.isDemo !== 'boolean') { project.isDemo = lot?.isDemo ?? false; changed = true; }
    if (project.lastThreadId === undefined) { project.lastThreadId = null; changed = true; }
    if (project.conversationStatus === undefined) { project.conversationStatus = 'idle'; changed = true; }
    if (project.pendingInput === undefined) { project.pendingInput = null; changed = true; }
    if (project.handoffAt === undefined) { project.handoffAt = null; changed = true; }
    if (project.safeEventCount === undefined) { project.safeEventCount = 0; changed = true; }
    if (project.lastTurnStartedAt === undefined) { project.lastTurnStartedAt = null; changed = true; }
    if (restoreInterruptedNative && project.pendingInput?.source === 'native') {
      project.pendingInput = resumablePendingInput();
      project.conversationStatus = 'waiting';
      changed = true;
    }
  }
  return { data: normalized, changed };
}

function validateLot(lot: VillageLot, index: number): boolean {
  if (!lot || lot.slot !== index || typeof lot.isDemo !== 'boolean') return false;
  if (lot.projectId === null) return lot.path === null && lot.name === null;
  return typeof lot.projectId === 'string' && typeof lot.path === 'string' && typeof lot.name === 'string';
}

function validateDebrief(value: CompletionDebrief): boolean {
  return typeof value.landed === 'string' && value.landed.length <= 96 && typeof value.followUp === 'string' && value.followUp.length <= 96 && typeof value.followUpRecommended === 'boolean';
}

function validatePendingInput(value: SafePendingInput): boolean {
  return Boolean(value && ['native', 'terminal', 'resumable'].includes(value.source) && typeof value.title === 'string' && value.title.length <= 80 &&
    Array.isArray(value.questions) && value.questions.length > 0 && value.questions.length <= 3 && value.questions.every((question) =>
      question && typeof question.id === 'string' && typeof question.header === 'string' && typeof question.question === 'string' &&
      typeof question.isSecret === 'boolean' && Array.isArray(question.choices) && question.choices.every((choice) => typeof choice === 'string')));
}
