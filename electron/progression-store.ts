import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ProgressionData } from '../src/shared/village-events';

export const emptyProgression = (): ProgressionData => ({ version: 1, projects: {} });

export class ProgressionStore {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'progression.json');
  }

  async read(): Promise<ProgressionData> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      return validateProgression(parsed) ? parsed : emptyProgression();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyProgression();
      throw error;
    }
  }

  async recordCompletion(projectPath: string, at: string): Promise<ProgressionData> {
    const data = await this.read();
    const current = data.projects[projectPath] ?? {
      level: 0,
      completedSessions: 0,
      lastCompletedAt: null,
    };
    data.projects[projectPath] = {
      level: current.level + 1,
      completedSessions: current.completedSessions + 1,
      lastCompletedAt: at,
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
  if (candidate.version !== 1 || !candidate.projects || typeof candidate.projects !== 'object') return false;
  return Object.values(candidate.projects).every(
    (project: ProgressionData['projects'][string]) =>
      project &&
      Number.isInteger(project.level) &&
      project.level >= 0 &&
      Number.isInteger(project.completedSessions) &&
      project.completedSessions >= 0 &&
      (project.lastCompletedAt === null || typeof project.lastCompletedAt === 'string'),
  );
}
