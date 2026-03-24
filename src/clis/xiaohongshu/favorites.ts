import { AuthRequiredError, EmptyResultError, SelectorError } from '../../errors.js';
import { cli, Strategy } from '../../registry.js';
import { extractXhsFavoriteNotes, normalizeXhsUserId } from './user-helpers.js';

type XhsFavoritesSnapshot = {
  href?: string;
  favorites?: unknown;
  emptyState?: boolean;
  loginWall?: boolean;
  captchaWall?: boolean;
};

async function readExploreState(page: any) {
  return await page.evaluate(`
    (() => {
      const normalizeUrl = (href) => {
        if (!href) return '';
        if (href.startsWith('http://') || href.startsWith('https://')) return href;
        if (href.startsWith('/')) return location.origin + href;
        return '';
      };

      const me = Array.from(document.querySelectorAll('a[href*="/user/profile/"]')).find((el) => {
        const title = (el.getAttribute('title') || '').trim();
        const text = (el.textContent || '').replace(/\\s+/g, '').trim();
        return title === '我' || text === '我';
      });

      const href = location.href;
      return {
        href,
        meHref: normalizeUrl(me?.getAttribute('href') || ''),
        loginWall: /登录/.test(document.body.innerText || ''),
        captchaWall: href.includes('/website-login/') || href.includes('/captcha'),
      };
    })()
  `);
}

async function clickProfileLink(page: any) {
  return await page.evaluate(`
    (() => {
      const me = Array.from(document.querySelectorAll('a[href*="/user/profile/"]')).find((el) => {
        const title = (el.getAttribute('title') || '').trim();
        const text = (el.textContent || '').replace(/\\s+/g, '').trim();
        return title === '我' || text === '我';
      });
      if (!me) return { ok: false };
      me.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return { ok: true };
    })()
  `);
}

async function clickFavoritesTab(page: any) {
  return await page.evaluate(`
    (() => {
      const clean = (value) => (value || '').replace(/\\s+/g, '').trim();
      const nodes = Array.from(document.querySelectorAll('.reds-tab-item, .sub-tab-list, div, span, button, a'));
      const target =
        nodes.find((el) => String(el.className || '').includes('sub-tab-list') && clean(el.textContent) === '收藏') ||
        nodes.find((el) => clean(el.textContent) === '收藏');
      if (!target) return { ok: false };
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return { ok: true };
    })()
  `);
}

async function readFavoritesSnapshot(page: any): Promise<XhsFavoritesSnapshot> {
  return await page.evaluate(`
    (() => {
      const href = location.href;
      const notes = window.__INITIAL_STATE__?.user?.notes?._value || window.__INITIAL_STATE__?.user?.notes || [];
      const safeClone = (value) => {
        try {
          return JSON.parse(JSON.stringify(value ?? []));
        } catch {
          return [];
        }
      };
      return {
        href,
        favorites: safeClone(Array.isArray(notes[1]) ? notes[1] : []),
        emptyState: /你还没有收藏任何内容哦/.test(document.body.innerText || ''),
        loginWall: /登录/.test(document.body.innerText || ''),
        captchaWall: href.includes('/website-login/') || href.includes('/captcha'),
      };
    })()
  `);
}

cli({
  site: 'xiaohongshu',
  name: 'favorites',
  description: '查看我收藏的小红书笔记',
  domain: 'www.xiaohongshu.com',
  strategy: Strategy.COOKIE,
  navigateBefore: false,
  args: [
    { name: 'limit', type: 'int', default: 20, help: 'Number of favorite notes to return' },
  ],
  columns: ['rank', 'title', 'author', 'likes', 'type', 'url'],
  func: async (page, kwargs) => {
    const limit = Math.max(1, Number(kwargs.limit ?? 20));

    await page.goto('https://www.xiaohongshu.com/explore');
    await page.wait(3);

    const exploreState = await readExploreState(page) as Record<string, unknown>;
    if (exploreState.captchaWall || exploreState.loginWall || !exploreState.meHref) {
      throw new AuthRequiredError(
        'www.xiaohongshu.com',
        'Xiaohongshu favorites require an active logged-in session in Chrome'
      );
    }

    const selfUserId = normalizeXhsUserId(String(exploreState.meHref));
    const openProfile = await clickProfileLink(page) as { ok?: boolean };
    if (!openProfile?.ok) {
      throw new SelectorError('小红书“我”入口');
    }

    let profileReady = false;
    for (let i = 0; i < 8; i += 1) {
      await page.wait(1);
      const snapshot = await readFavoritesSnapshot(page);
      if (snapshot.captchaWall || snapshot.loginWall) {
        throw new AuthRequiredError(
          'www.xiaohongshu.com',
          'Xiaohongshu redirected to a login or captcha page while opening your profile'
        );
      }
      if (String(snapshot.href || '').includes('/user/profile/')) {
        profileReady = true;
        break;
      }
    }

    if (!profileReady) {
      throw new EmptyResultError('xiaohongshu favorites', 'Failed to open your Xiaohongshu profile page');
    }

    let snapshot = await readFavoritesSnapshot(page);
    let favoritesReady = false;

    for (let i = 0; i < 5; i += 1) {
      const openFavorites = await clickFavoritesTab(page) as { ok?: boolean };
      if (!openFavorites?.ok) {
        throw new SelectorError('小红书“收藏”标签');
      }

      await page.wait(1 + i);
      snapshot = await readFavoritesSnapshot(page);
      if (snapshot.captchaWall || snapshot.loginWall) {
        throw new AuthRequiredError(
          'www.xiaohongshu.com',
          'Xiaohongshu redirected to a login or captcha page while loading favorites'
        );
      }

      const currentCount = Array.isArray(snapshot.favorites) ? snapshot.favorites.length : 0;
      if (String(snapshot.href || '').includes('tab=fav') || currentCount > 0 || snapshot.emptyState) {
        favoritesReady = true;
        break;
      }
    }

    if (!favoritesReady) {
      throw new EmptyResultError('xiaohongshu favorites', 'Failed to open the 收藏 tab on your Xiaohongshu profile');
    }

    let stableCount = 0;
    let previousCount = Array.isArray(snapshot.favorites) ? snapshot.favorites.length : 0;

    for (let i = 0; i < 6; i += 1) {
      if (snapshot.captchaWall || snapshot.loginWall) {
        throw new AuthRequiredError(
          'www.xiaohongshu.com',
          'Xiaohongshu redirected to a login or captcha page while loading favorites'
        );
      }

      if (snapshot.emptyState || previousCount >= limit) break;

      await page.autoScroll({ times: 1, delayMs: 1500 });
      await page.wait(2);

      snapshot = await readFavoritesSnapshot(page);
      const currentCount = Array.isArray(snapshot.favorites) ? snapshot.favorites.length : 0;
      if (currentCount <= previousCount) {
        stableCount += 1;
        if (stableCount >= 2) break;
      } else {
        stableCount = 0;
      }
      previousCount = currentCount;
    }

    const rows = extractXhsFavoriteNotes({ noteGroups: [[], Array.isArray(snapshot.favorites) ? snapshot.favorites : []] }, selfUserId);
    if (rows.length === 0 && !snapshot.emptyState) {
      throw new EmptyResultError(
        'xiaohongshu favorites',
        'Could not read favorite notes. Xiaohongshu may have changed the page structure or triggered anti-bot checks'
      );
    }

    return rows.slice(0, limit).map((item, index) => ({
      rank: index + 1,
      ...item,
    }));
  },
});
