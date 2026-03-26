import { describe, expect, it } from 'vitest';
import { buildPdfHtml, getChromeCandidates, resolveChromeExecutable } from './pdf-export.js';

describe('buildPdfHtml', () => {
  it('renders text, metadata, and images into a printable HTML document', () => {
    const html = buildPdfHtml({
      title: '义乌攻略',
      subtitle: '小红书单篇笔记导出',
      meta: [
        { label: '作者', value: '测试作者' },
        { label: '发布时间', value: '2026-03-24' },
      ],
      paragraphs: ['第一段', '第二段'],
      images: [{ src: 'images/001.jpg', alt: '配图 1' }],
      sourceUrl: 'https://example.com/note/1',
    });

    expect(html).toContain('<h1>义乌攻略</h1>');
    expect(html).toContain('测试作者');
    expect(html).toContain('<p>第一段</p>');
    expect(html).toContain('images/001.jpg');
    expect(html).toContain('https://example.com/note/1');
  });
});

describe('resolveChromeExecutable', () => {
  it('prefers the environment override when it exists', () => {
    const resolved = resolveChromeExecutable(
      '/custom/chrome',
      'darwin',
      (target) => target === '/custom/chrome'
    );
    expect(resolved).toBe('/custom/chrome');
  });

  it('falls back to platform candidates', () => {
    const firstCandidate = getChromeCandidates('linux')[0];
    const resolved = resolveChromeExecutable(
      undefined,
      'linux',
      (target) => target === firstCandidate
    );
    expect(resolved).toBe(firstCandidate);
  });

  it('returns null when no candidate exists', () => {
    const resolved = resolveChromeExecutable(
      undefined,
      'win32',
      () => false
    );
    expect(resolved).toBeNull();
  });
});
