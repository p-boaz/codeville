import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);

/** Session outcome: telemetry facts plus the diffstat-verified desk account. */
export interface ScaffoldOutcome {
  testsPassed: boolean | null;
  durationMs: number | null;
  deskLanded: string | null;
  deskFollowUp: string | null;
  followUpRecommended: boolean;
}

export interface ScaffoldRecord {
  projectId: string;
  sessionId: string;
  repositoryPath: string;
  scaffoldPath: string;
  branch: string;
  baseCommit: string;
  baseSubject: string;
  createdAt: string;
  outcome?: ScaffoldOutcome | null;
}

export interface ScaffoldDiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  changedPaths: string[];
}

export interface ScaffoldFileDiff {
  path: string;
  insertions: number;
  deletions: number;
  patch: string;
}

export class ScaffoldError extends Error {}

/**
 * Every Codex session runs inside a scaffold: a git worktree on its own
 * `codeville/<sessionId>` branch. The user's checkout is never written until an
 * explicit Apply, and the branch remains a plain-git audit record throughout.
 */
export class ScaffoldManager {
  private readonly recordsDir: string;
  /** Serializes repo-mutating git ops so several workshops can share one repository. */
  private readonly repoLocks = new Map<string, Promise<void>>();

  constructor(private readonly root: string) {
    this.recordsDir = join(root, 'records');
  }

  private async withRepoLock<T>(repositoryPath: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.repoLocks.get(repositoryPath) ?? Promise.resolve();
    let release = () => {};
    const tail = previous.then(() => new Promise<void>((resolveGate) => { release = resolveGate; }));
    this.repoLocks.set(repositoryPath, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.repoLocks.get(repositoryPath) === tail) this.repoLocks.delete(repositoryPath);
    }
  }

  async create(repositoryPath: string, projectId: string, sessionId: string): Promise<ScaffoldRecord> {
    return this.withRepoLock(repositoryPath, () => this.createLocked(repositoryPath, projectId, sessionId));
  }

  private async createLocked(repositoryPath: string, projectId: string, sessionId: string): Promise<ScaffoldRecord> {
    const baseCommit = await this.revParseHead(repositoryPath);
    const { stdout: subject } = await git(repositoryPath, ['log', '-1', '--format=%s', baseCommit]);
    const scaffoldPath = join(this.root, projectId, sessionId);
    const branch = `codeville/${sessionId}`;
    await mkdir(join(this.root, projectId), { recursive: true });
    await git(repositoryPath, ['worktree', 'add', '-b', branch, scaffoldPath, baseCommit]);
    const record: ScaffoldRecord = {
      projectId,
      sessionId,
      repositoryPath,
      scaffoldPath,
      branch,
      baseCommit,
      baseSubject: subject.trim(),
      createdAt: new Date().toISOString(),
    };
    await mkdir(this.recordsDir, { recursive: true });
    await writeFile(this.recordPath(sessionId), JSON.stringify(record, null, 2), { mode: 0o600 });
    return record;
  }

  /** Commit all agent work in the scaffold so the branch is the complete record. */
  async checkpoint(record: ScaffoldRecord): Promise<void> {
    const { stdout } = await git(record.scaffoldPath, ['status', '--porcelain']);
    if (!stdout.trim()) return;
    await git(record.scaffoldPath, ['add', '-A']);
    await git(record.scaffoldPath, [
      '-c', 'user.name=Codeville', '-c', 'user.email=codeville@local',
      'commit', '-m', `Codeville session ${record.sessionId}`,
    ]);
  }

  async diffStats(record: ScaffoldRecord): Promise<ScaffoldDiffStats> {
    const { stdout } = await git(record.scaffoldPath, ['diff', '--numstat', `${record.baseCommit}..HEAD`]);
    const stats: ScaffoldDiffStats = { filesChanged: 0, insertions: 0, deletions: 0, changedPaths: [] };
    for (const line of stdout.split('\n')) {
      const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!match) continue;
      stats.filesChanged += 1;
      stats.insertions += match[1] === '-' ? 0 : Number(match[1]);
      stats.deletions += match[2] === '-' ? 0 : Number(match[2]);
      stats.changedPaths.push(match[3]);
    }
    return stats;
  }

  /** Full per-file patches. Desk register only — must never reach the village event channel. */
  async diff(record: ScaffoldRecord): Promise<ScaffoldFileDiff[]> {
    const stats = await this.diffStats(record);
    const files: ScaffoldFileDiff[] = [];
    for (const path of stats.changedPaths) {
      const [{ stdout: patch }, { stdout: numstat }] = await Promise.all([
        git(record.scaffoldPath, ['diff', `${record.baseCommit}..HEAD`, '--', path]),
        git(record.scaffoldPath, ['diff', '--numstat', `${record.baseCommit}..HEAD`, '--', path]),
      ]);
      const match = numstat.match(/^(\d+|-)\t(\d+|-)\t/);
      files.push({
        path,
        insertions: match && match[1] !== '-' ? Number(match[1]) : 0,
        deletions: match && match[2] !== '-' ? Number(match[2]) : 0,
        patch,
      });
    }
    return files;
  }

  /** Squash-merge the scaffold branch into the user's checkout as one commit. */
  async apply(record: ScaffoldRecord, message: string): Promise<{ commit: string }> {
    return this.withRepoLock(record.repositoryPath, () => this.applyLocked(record, message));
  }

  private async applyLocked(record: ScaffoldRecord, message: string): Promise<{ commit: string }> {
    const { stdout: tracked } = await git(record.repositoryPath, ['status', '--porcelain', '--untracked-files=no']);
    if (tracked.trim()) {
      throw new ScaffoldError(
        'This repository has uncommitted changes. Commit or stash them, then apply — Codeville never mixes agent work into a dirty tree.',
      );
    }
    const stats = await this.diffStats(record);
    if (stats.filesChanged === 0) throw new ScaffoldError('This session changed no files, so there is nothing to apply.');
    const { stdout: untracked } = await git(record.repositoryPath, ['ls-files', '--others', '--exclude-standard']);
    const collisions = untracked.split('\n').filter((path) => path && stats.changedPaths.includes(path));
    if (collisions.length) {
      throw new ScaffoldError(
        `Untracked files are in the way of this improvement: ${collisions.join(', ')}. Move or commit them, then apply.`,
      );
    }
    try {
      await git(record.repositoryPath, ['merge', '--squash', record.branch]);
      const { stdout: commit } = await git(record.repositoryPath, [
        '-c', 'user.name=Codeville', '-c', 'user.email=codeville@local',
        'commit', '-m', message, '--no-verify',
      ]);
      void commit;
    } catch (cause) {
      await git(record.repositoryPath, ['reset', '--merge']).catch(() => undefined);
      throw new ScaffoldError(
        'The improvement conflicts with changes made since the builder started. The branch is kept — resolve the merge manually or discard the session.',
        { cause },
      );
    }
    const { stdout: sha } = await git(record.repositoryPath, ['rev-parse', 'HEAD']);
    return { commit: sha.trim() };
  }

  /** Remove the worktree but keep the branch for the user's own merge/PR flow. */
  async keep(record: ScaffoldRecord): Promise<void> {
    await this.withRepoLock(record.repositoryPath, async () => {
      await this.removeWorktree(record);
      await this.forget(record.sessionId);
    });
  }

  /** Remove the worktree AND the branch. The only destructive verb in the app. */
  async discard(record: ScaffoldRecord): Promise<void> {
    await this.withRepoLock(record.repositoryPath, async () => {
      await this.removeWorktree(record);
      await git(record.repositoryPath, ['branch', '-D', record.branch]).catch(() => undefined);
      await this.forget(record.sessionId);
    });
  }

  async saveOutcome(record: ScaffoldRecord, outcome: ScaffoldOutcome): Promise<ScaffoldRecord> {
    const next = { ...record, outcome };
    await writeFile(this.recordPath(record.sessionId), JSON.stringify(next, null, 2), { mode: 0o600 });
    return next;
  }

  /** True when the repository's HEAD has moved since this scaffold was created. */
  async isBaseStale(record: ScaffoldRecord): Promise<boolean> {
    try {
      return (await this.revParseHead(record.repositoryPath)) !== record.baseCommit;
    } catch {
      return false;
    }
  }

  /**
   * Rebase the scaffold branch onto the repository's current HEAD so a stale
   * pending improvement can land cleanly instead of conflict-landing. On
   * conflict the rebase is aborted and the scaffold is left exactly as it was.
   */
  async refresh(record: ScaffoldRecord): Promise<{ record: ScaffoldRecord; upToDate: boolean }> {
    return this.withRepoLock(record.repositoryPath, async () => {
      const head = await this.revParseHead(record.repositoryPath);
      if (head === record.baseCommit) return { record, upToDate: true };
      try {
        await git(record.scaffoldPath, [
          '-c', 'user.name=Codeville', '-c', 'user.email=codeville@local',
          'rebase', head,
        ]);
      } catch (cause) {
        await git(record.scaffoldPath, ['rebase', '--abort']).catch(() => undefined);
        throw new ScaffoldError(
          'This improvement conflicts with the latest repository changes, so it cannot be refreshed automatically. Land it as-is to see the conflict, keep the branch for a manual rebase, or discard it.',
          { cause },
        );
      }
      const { stdout: subject } = await git(record.repositoryPath, ['log', '-1', '--format=%s', head]);
      const next = { ...record, baseCommit: head, baseSubject: subject.trim() };
      await writeFile(this.recordPath(record.sessionId), JSON.stringify(next, null, 2), { mode: 0o600 });
      return { record: next, upToDate: false };
    });
  }

  /** Paths changed by BOTH scaffolds — the files where whichever lands second may conflict. */
  async sharedChangedPaths(record: ScaffoldRecord, other: ScaffoldRecord): Promise<string[]> {
    const [mine, theirs] = await Promise.all([this.diffStats(record), this.diffStats(other)]);
    const ours = new Set(mine.changedPaths);
    return theirs.changedPaths.filter((path) => ours.has(path));
  }

  /** The project's live scaffold, if any. One scaffold per project is the invariant. */
  async forProject(projectId: string): Promise<ScaffoldRecord | null> {
    const records = await this.listOrphans(new Set());
    const matches = records.filter((record) => record.projectId === projectId);
    matches.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return matches[0] ?? null;
  }

  async load(sessionId: string): Promise<ScaffoldRecord | null> {
    try {
      return JSON.parse(await readFile(this.recordPath(sessionId), 'utf8')) as ScaffoldRecord;
    } catch {
      return null;
    }
  }

  /** Records whose sessions are not active — survivors of a crash or quit. Never silently deleted. */
  async listOrphans(activeSessionIds: Set<string>): Promise<ScaffoldRecord[]> {
    let entries: string[];
    try {
      entries = await readdir(this.recordsDir);
    } catch {
      return [];
    }
    const orphans: ScaffoldRecord[] = [];
    for (const entry of entries) {
      const sessionId = entry.replace(/\.json$/, '');
      if (activeSessionIds.has(sessionId)) continue;
      const record = await this.load(sessionId);
      if (record) orphans.push(record);
    }
    return orphans;
  }

  private async removeWorktree(record: ScaffoldRecord): Promise<void> {
    await git(record.repositoryPath, ['worktree', 'remove', '--force', record.scaffoldPath]).catch(async () => {
      await rm(record.scaffoldPath, { recursive: true, force: true });
      await git(record.repositoryPath, ['worktree', 'prune']).catch(() => undefined);
    });
  }

  private async forget(sessionId: string): Promise<void> {
    await unlink(this.recordPath(sessionId)).catch(() => undefined);
  }

  private recordPath(sessionId: string): string {
    return join(this.recordsDir, `${sessionId}.json`);
  }

  private async revParseHead(repositoryPath: string): Promise<string> {
    try {
      const { stdout } = await git(repositoryPath, ['rev-parse', '--verify', 'HEAD']);
      return stdout.trim();
    } catch {
      throw new ScaffoldError('This repository has no commits yet. Make an initial commit, then start a builder.');
    }
  }
}

async function git(cwd: string, args: string[]): Promise<{ stdout: string }> {
  const { stdout } = await executeFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 });
  return { stdout };
}
