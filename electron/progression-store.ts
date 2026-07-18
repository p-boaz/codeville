import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { CompletionDebrief, ProgressionData, ProjectSelection, VillageLot } from '../src/shared/village-events';

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

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'progression.json');
  }

  async read(): Promise<ProgressionData> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      if (validateProgression(parsed)) return parsed;
      if (validateProgressionV1(parsed)) {
        const migrated = migrateProgression(parsed);
        await this.write(migrated);
        return migrated;
      }
      return emptyProgression();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyProgression();
      throw error;
    }
  }

  async assignProject(selection: Omit<ProjectSelection, 'projectId'> & { projectId?: string }): Promise<ProjectSelection> {
    const data = await this.read();
    const existing = data.lots.find((lot) => lot.path === selection.path);
    const projectId = existing?.projectId ?? selection.projectId ?? randomUUID();
    const previousLot = data.lots[selection.slot];
    if (previousLot.projectId && previousLot.projectId !== projectId) delete data.projects[previousLot.projectId];
    for (const lot of data.lots) {
      if (lot.projectId === projectId) Object.assign(lot, { projectId: null, path: null, name: null, isDemo: false });
    }
    data.lots[selection.slot] = { ...selection, projectId };
    data.projects[projectId] ??= {
      projectId,
      level: 0,
      completedSessions: 0,
      lastCompletedAt: null,
      lastDebrief: null,
    };
    await this.write(data);
    return { ...selection, projectId };
  }

  async recordCompletion(projectId: string, at: string, debrief: CompletionDebrief): Promise<ProgressionData> {
    const data = await this.read();
    const current = data.projects[projectId];
    if (!current) throw new Error('The completed project is not assigned to this village');
    data.projects[projectId] = {
      ...current,
      level: current.level + 1,
      completedSessions: current.completedSessions + 1,
      lastCompletedAt: at,
      lastDebrief: debrief,
    };
    await this.write(data);
    return data;
  }

  async reset(): Promise<ProgressionData> {
    const data = emptyProgression();
    await this.write(data);
    return data;
  }

  private async write(data: ProgressionData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }
}

export function validateProgression(value: unknown): value is ProgressionData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProgressionData>;
  if (candidate.version !== 2 || !Array.isArray(candidate.lots) || candidate.lots.length !== 5 || !candidate.projects || typeof candidate.projects !== 'object') return false;
  if (!candidate.lots.every((lot, index) => validateLot(lot, index))) return false;
  return Object.entries(candidate.projects).every(([id, project]) =>
    project?.projectId === id && Number.isInteger(project.level) && project.level >= 0 &&
    Number.isInteger(project.completedSessions) && project.completedSessions >= 0 &&
    (project.lastCompletedAt === null || typeof project.lastCompletedAt === 'string') &&
    (project.lastDebrief === null || validateDebrief(project.lastDebrief)),
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
    data.projects[projectId] = { projectId, ...prior, lastDebrief: null };
  }
  return data;
}

function validateLot(lot: VillageLot, index: number): boolean {
  if (!lot || lot.slot !== index || typeof lot.isDemo !== 'boolean') return false;
  if (lot.projectId === null) return lot.path === null && lot.name === null;
  return typeof lot.projectId === 'string' && typeof lot.path === 'string' && typeof lot.name === 'string';
}

function validateDebrief(value: CompletionDebrief): boolean {
  return typeof value.landed === 'string' && value.landed.length <= 96 && typeof value.followUp === 'string' && value.followUp.length <= 96 && typeof value.followUpRecommended === 'boolean';
}
