import { describe, expect, it, vi } from 'vitest';
import type { IPage } from '../../types.js';
import { getRegistry } from '../../registry.js';
import './favorites.js';

function createPageMock(evaluateResults: any[]): IPage {
  const evaluate = vi.fn();
  for (const result of evaluateResults) {
    evaluate.mockResolvedValueOnce(result);
  }

  return {
    goto: vi.fn().mockResolvedValue(undefined),
    evaluate,
    snapshot: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    pressKey: vi.fn().mockResolvedValue(undefined),
    scrollTo: vi.fn().mockResolvedValue(undefined),
    getFormState: vi.fn().mockResolvedValue({ forms: [], orphanFields: [] }),
    wait: vi.fn().mockResolvedValue(undefined),
    tabs: vi.fn().mockResolvedValue([]),
    closeTab: vi.fn().mockResolvedValue(undefined),
    newTab: vi.fn().mockResolvedValue(undefined),
    selectTab: vi.fn().mockResolvedValue(undefined),
    networkRequests: vi.fn().mockResolvedValue([]),
    consoleMessages: vi.fn().mockResolvedValue([]),
    scroll: vi.fn().mockResolvedValue(undefined),
    autoScroll: vi.fn().mockResolvedValue(undefined),
    installInterceptor: vi.fn().mockResolvedValue(undefined),
    getInterceptedRequests: vi.fn().mockResolvedValue([]),
    getCookies: vi.fn().mockResolvedValue([]),
    screenshot: vi.fn().mockResolvedValue(''),
  };
}

describe('xiaohongshu favorites', () => {
  it('returns ranked favorite notes from the collection tab', async () => {
    const cmd = getRegistry().get('xiaohongshu/favorites');
    expect(cmd?.func).toBeTypeOf('function');

    const page = createPageMock([
      {
        href: 'https://www.xiaohongshu.com/explore',
        meHref: 'https://www.xiaohongshu.com/user/profile/self-user-id',
        loginWall: false,
        captchaWall: false,
      },
      { ok: true },
      {
        href: 'https://www.xiaohongshu.com/user/profile/self-user-id',
        favorites: [],
        emptyState: false,
        loginWall: false,
        captchaWall: false,
      },
      { ok: true },
      {
        href: 'https://www.xiaohongshu.com/user/profile/self-user-id?tab=fav&subTab=note',
        favorites: [
          {
            id: 'note-1',
            xsecToken: 'token-1',
            noteCard: {
              noteId: 'note-1',
              displayTitle: 'First favorite',
              type: 'normal',
              interactInfo: { likedCount: '12' },
              user: { nickname: 'Alice', userId: 'author-1' },
            },
          },
          {
            id: 'note-2',
            noteCard: {
              noteId: 'note-2',
              displayTitle: 'Second favorite',
              type: 'video',
              interactInfo: { likedCount: 8 },
              user: { nickname: 'Bob', userId: 'author-2' },
            },
          },
        ],
        emptyState: false,
        loginWall: false,
        captchaWall: false,
      },
    ]);

    const result = await cmd!.func!(page, { limit: 2 });

    expect(page.goto).toHaveBeenCalledWith('https://www.xiaohongshu.com/explore');
    expect(page.autoScroll).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        rank: 1,
        id: 'note-1',
        title: 'First favorite',
        author: 'Alice',
        type: 'normal',
        likes: '12',
        url: 'https://www.xiaohongshu.com/user/profile/author-1/note-1?xsec_token=token-1&xsec_source=pc_user',
      },
      {
        rank: 2,
        id: 'note-2',
        title: 'Second favorite',
        author: 'Bob',
        type: 'video',
        likes: '8',
        url: 'https://www.xiaohongshu.com/user/profile/author-2/note-2',
      },
    ]);
  });

  it('throws a clear auth error when the current account cannot be detected', async () => {
    const cmd = getRegistry().get('xiaohongshu/favorites');
    expect(cmd?.func).toBeTypeOf('function');

    const page = createPageMock([
      {
        href: 'https://www.xiaohongshu.com/explore',
        meHref: '',
        loginWall: false,
        captchaWall: false,
      },
    ]);

    await expect(cmd!.func!(page, { limit: 5 })).rejects.toThrow(
      'Xiaohongshu favorites require an active logged-in session in Chrome'
    );
  });
});
