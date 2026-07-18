import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

export interface ResolveCodexBinaryOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  platform?: NodeJS.Platform;
  canExecute?: (path: string) => boolean;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveCodexBinary(options: ResolveCodexBinaryOptions = {}): string | null {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const platform = options.platform ?? process.platform;
  const canExecute = options.canExecute ?? isExecutable;
  const binaryName = platform === 'win32' ? 'codex.exe' : 'codex';

  const candidates = [
    env.CODEVILLE_CODEX_BINARY,
    ...(env.PATH ?? '').split(delimiter).filter(Boolean).map((directory) => join(directory, binaryName)),
    join(home, '.local', 'bin', binaryName),
    join(home, '.npm-global', 'bin', binaryName),
    platform === 'darwin' ? `/opt/homebrew/bin/${binaryName}` : null,
    platform === 'darwin' ? `/usr/local/bin/${binaryName}` : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate, index) => candidates.indexOf(candidate) === index && canExecute(candidate)) ?? null;
}
