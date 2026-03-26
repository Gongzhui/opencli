import * as fs from 'node:fs';
import * as path from 'node:path';
import { URL } from 'node:url';
import { ConfigError, EmptyResultError } from '../../errors.js';
import { httpDownload, sanitizeFilename, formatCookieHeader } from '../../download/index.js';
import { exportPdfDocument } from '../../download/pdf-export.js';
import { formatBytes } from '../../download/progress.js';
import { cli, Strategy } from '../../registry.js';

type XhsNoteContent = {
  noteId: string;
  title: string;
  author: string;
  publishTime: string;
  paragraphs: string[];
  imageUrls: string[];
  sourceUrl: string;
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function cleanMediaUrl(rawUrl: string): string {
  return rawUrl.split('|')[0]?.split('?')[0] ?? rawUrl;
}

function normalizeXhsNoteInput(input: string): { noteId: string; url: string } {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    const withoutQuery = `${parsed.origin}${parsed.pathname}`;
    const matched =
      withoutQuery.match(/\/user\/profile\/[^/]+\/([a-zA-Z0-9]+)/) ||
      withoutQuery.match(/\/explore\/([a-zA-Z0-9]+)/) ||
      withoutQuery.match(/\/search_result\/([a-zA-Z0-9]+)/);
    if (!matched?.[1]) {
      throw new ConfigError('Unsupported Xiaohongshu note URL', 'Please pass a full note URL or note ID');
    }
    return { noteId: matched[1], url: trimmed };
  }

  const noteId = trimmed.replace(/[?#].*$/, '');
  return {
    noteId,
    url: `https://www.xiaohongshu.com/explore/${noteId}`,
  };
}

async function extractNoteContent(page: any, noteUrl: string, noteId: string): Promise<XhsNoteContent> {
  await page.goto(noteUrl);
  await page.wait(5);

  const data = await page.evaluate(`
    (() => {
      const clean = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const title = clean(
        document.querySelector('.title, #detail-title, .note-content .title, meta[property="og:title"]')?.textContent ||
        document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
        document.title.replace(/\\s*-\\s*小红书$/, '')
      );
      const author = clean(
        document.querySelector('.username, .author-name, .name, .author .name')?.textContent || ''
      );
      const bodyText = document.body.innerText || '';
      const publishMatch = bodyText.match(/\\b\\d{4}-\\d{2}-\\d{2}\\b(?:\\s+\\d{2}:\\d{2})?/);
      const descRaw =
        document.querySelector('#detail-desc, .note-desc, .desc, [class*="desc"]')?.textContent || '';
      const desc = clean(descRaw);
      const paragraphs = descRaw
        .split(/\\n+/)
        .map((line) => clean(line))
        .filter(Boolean);

      const urls = [];
      const seen = new Set();
      const push = (raw) => {
        const value = (raw || '').trim();
        if (!value) return;
        if (!/xhscdn|xiaohongshu/.test(value)) return;
        if (/avatar|emoji|icon|note-content-emoji/.test(value)) return;
        const normalized = value.split('|')[0].split('?')[0];
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        urls.push(normalized);
      };

      document.querySelectorAll('.swiper-slide img, .carousel-image img, .note-slider img, .note-image img, .media-container img, img').forEach((img) => {
        push(img.getAttribute('src') || '');
        push(img.getAttribute('data-src') || '');
      });

      if (urls.length === 0) {
        document.querySelectorAll('video[poster], source[src], video[src]').forEach((node) => {
          push(node.getAttribute('poster') || '');
          push(node.getAttribute('src') || '');
        });
      }

      return {
        title,
        author,
        publishTime: publishMatch?.[0] || '',
        paragraphs,
        imageUrls: urls,
        bodyText: clean(bodyText),
        href: location.href,
      };
    })()
  `) as Record<string, unknown>;

  const bodyText = String(data.bodyText || '');
  if (
    String(data.href || '').includes('/website-login/') ||
    /Sorry, This Page Isn't Available Right Now|请打开小红书App扫码查看/.test(bodyText)
  ) {
    throw new EmptyResultError(
      'xiaohongshu export-pdf',
      'This note requires a full accessible Xiaohongshu note URL. Bare note IDs often redirect to the QR-only page.'
    );
  }

  const title = cleanText(data.title) || noteId;
  const paragraphs = Array.isArray(data.paragraphs)
    ? data.paragraphs.map((line) => cleanText(line)).filter(Boolean)
    : [];
  const imageUrls = Array.isArray(data.imageUrls)
    ? data.imageUrls.map((url) => cleanMediaUrl(String(url))).filter(Boolean)
    : [];

  if (!title || (paragraphs.length === 0 && imageUrls.length === 0)) {
    throw new EmptyResultError(
      'xiaohongshu export-pdf',
      'Could not extract note content. The page structure may have changed or the note is inaccessible.'
    );
  }

  return {
    noteId,
    title,
    author: cleanText(data.author) || 'unknown',
    publishTime: cleanText(data.publishTime),
    paragraphs,
    imageUrls,
    sourceUrl: String(data.href || noteUrl),
  };
}

async function downloadNoteImages(imageUrls: string[], targetDir: string, cookieHeader: string): Promise<Array<{ src: string; alt?: string }>> {
  fs.mkdirSync(targetDir, { recursive: true });
  const results: Array<{ src: string; alt?: string }> = [];

  for (let index = 0; index < imageUrls.length; index += 1) {
    const imageUrl = imageUrls[index];
    const ext = path.extname(new URL(imageUrl).pathname).replace(/^\./, '') || 'jpg';
    const filename = `image_${String(index + 1).padStart(3, '0')}.${ext}`;
    const filepath = path.join(targetDir, filename);

    const result = await httpDownload(imageUrl, filepath, {
      cookies: cookieHeader,
      headers: {
        Referer: 'https://www.xiaohongshu.com/',
      },
      timeout: 30000,
    });

    if (result.success) {
      results.push({ src: filepath, alt: `配图 ${index + 1}` });
    }
  }

  return results;
}

cli({
  site: 'xiaohongshu',
  name: 'export-pdf',
  description: '将单篇小红书笔记导出为 PDF（含文字和图片）',
  domain: 'www.xiaohongshu.com',
  strategy: Strategy.COOKIE,
  navigateBefore: false,
  timeoutSeconds: 180,
  args: [
    { name: 'note', positional: true, required: true, help: 'Full note URL (preferred) or note ID' },
    { name: 'output', default: './xiaohongshu-pdf', help: 'Output directory for exported PDFs' },
  ],
  columns: ['title', 'author', 'images', 'status', 'file', 'size'],
  func: async (page, kwargs) => {
    const { noteId, url } = normalizeXhsNoteInput(String(kwargs.note));
    const output = String(kwargs.output || './xiaohongshu-pdf');
    const tempDir = path.join(output, '.tmp', sanitizeFilename(noteId, 80));

    try {
      const note = await extractNoteContent(page, url, noteId);
      const cookies = formatCookieHeader(await page.getCookies({ domain: 'xiaohongshu.com' }));
      const images = await downloadNoteImages(note.imageUrls, tempDir, cookies);
      const pdf = await exportPdfDocument(
        {
          title: note.title,
          subtitle: '小红书单篇笔记导出',
          meta: [
            { label: '作者', value: note.author },
            { label: '发布时间', value: note.publishTime },
            { label: '笔记 ID', value: note.noteId },
          ],
          paragraphs: note.paragraphs,
          images,
          sourceUrl: note.sourceUrl,
        },
        {
          output,
          filename: `${note.title}-${note.noteId}`,
        }
      );

      return [{
        title: note.title,
        author: note.author,
        images: images.length,
        status: 'success',
        file: pdf.pdfPath,
        size: formatBytes(pdf.size),
      }];
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  },
});
