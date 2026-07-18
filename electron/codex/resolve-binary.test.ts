import { describe, expect, it, vi } from 'vitest';

import { resolveCodexBinary } from './resolve-binary';

describe('resolveCodexBinary', () => {
  it('prefers an explicit override', () => {
    const canExecute = vi.fn(() => true);
    const result = resolveCodexBinary({
      env: { CODEVILLE_CODEX_BINARY: '/custom/codex', PATH: '/bin' },
      home: '/Users/judge',
      platform: 'darwin',
      canExecute,
    });

    expect(result).toBe('/custom/codex');
    expect(canExecute).toHaveBeenCalledTimes(1);
  });

  it('finds Homebrew Codex when a GUI process has no useful PATH', () => {
    const result = resolveCodexBinary({
      env: { PATH: '/usr/bin' },
      home: '/Users/judge',
      platform: 'darwin',
      canExecute: (path) => path === '/opt/homebrew/bin/codex',
    });

    expect(result).toBe('/opt/homebrew/bin/codex');
  });

  it('returns null when Codex is not installed', () => {
    expect(
      resolveCodexBinary({
        env: {},
        home: '/Users/judge',
        platform: 'linux',
        canExecute: () => false,
      }),
    ).toBeNull();
  });
});
