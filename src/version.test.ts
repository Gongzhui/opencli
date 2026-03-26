import { describe, expect, it } from 'vitest';
import { formatCliVersion, loadForkVersionMeta, loadVersionInfo } from './version.js';

describe('formatCliVersion', () => {
  it('returns the upstream version when no fork metadata is present', () => {
    expect(formatCliVersion('1.4.1')).toBe('1.4.1');
  });

  it('includes fork metadata when available', () => {
    expect(formatCliVersion('1.4.1', {
      forkName: 'gongzhui',
      forkVersion: '0.1.0',
    })).toBe('1.4.1 (fork gongzhui@0.1.0)');
  });
});

describe('loadForkVersionMeta', () => {
  it('ignores malformed fork metadata', () => {
    const meta = loadForkVersionMeta(() => '{"forkName":"gongzhui"}');
    expect(meta).toBeNull();
  });

  it('loads valid fork metadata', () => {
    const meta = loadForkVersionMeta(() => '{"forkName":"gongzhui","forkVersion":"0.1.0"}');
    expect(meta).toEqual({
      forkName: 'gongzhui',
      forkVersion: '0.1.0',
    });
  });
});

describe('loadVersionInfo', () => {
  it('returns a combined display version for fork builds', () => {
    const info = loadVersionInfo(
      () => '{"version":"1.4.1"}',
      () => '{"forkName":"gongzhui","forkVersion":"0.1.0"}',
    );

    expect(info).toEqual({
      upstreamVersion: '1.4.1',
      forkName: 'gongzhui',
      forkVersion: '0.1.0',
      isFork: true,
      displayVersion: '1.4.1 (fork gongzhui@0.1.0)',
    });
  });

  it('falls back cleanly when package metadata is unreadable', () => {
    const info = loadVersionInfo(
      () => {
        throw new Error('boom');
      },
      () => {
        throw new Error('boom');
      },
    );

    expect(info).toEqual({
      upstreamVersion: '0.0.0',
      forkName: null,
      forkVersion: null,
      isFork: false,
      displayVersion: '0.0.0',
    });
  });
});
