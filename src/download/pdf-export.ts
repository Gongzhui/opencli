import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';
import { sanitizeFilename } from './index.js';

export interface PdfImageAsset {
  alt?: string;
  src: string;
}

export interface PdfDocument {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  paragraphs?: string[];
  images?: PdfImageAsset[];
  sourceUrl?: string;
}

export interface ExportPdfOptions {
  output: string;
  filename?: string;
  chromeExecutable?: string;
  timeoutMs?: number;
}

export interface ExportPdfResult {
  pdfPath: string;
  size: number;
}

const MAC_CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
] as const;

const LINUX_CHROME_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
] as const;

const WINDOWS_CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Chromium\\Application\\chrome.exe',
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPdfHtml(doc: PdfDocument): string {
  const title = escapeHtml(doc.title);
  const subtitle = doc.subtitle ? `<div class="subtitle">${escapeHtml(doc.subtitle)}</div>` : '';
  const meta = (doc.meta ?? [])
    .filter((item) => item.label && item.value)
    .map((item) => `<div class="meta-row"><span class="meta-label">${escapeHtml(item.label)}</span><span class="meta-value">${escapeHtml(item.value)}</span></div>`)
    .join('');
  const source = doc.sourceUrl
    ? `<div class="source"><a href="${escapeHtml(doc.sourceUrl)}">${escapeHtml(doc.sourceUrl)}</a></div>`
    : '';
  const paragraphs = (doc.paragraphs ?? [])
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('\n');
  const images = (doc.images ?? [])
    .filter((img) => img.src)
    .map((img) => {
      const alt = escapeHtml(img.alt || doc.title);
      const src = path.isAbsolute(img.src) ? pathToFileURL(img.src).toString() : img.src;
      return `<figure><img src="${escapeHtml(src)}" alt="${alt}" /></figure>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light;
      --text: #1f2328;
      --muted: #5b6470;
      --line: #e7eaee;
      --bg: #ffffff;
      --panel: #f6f8fa;
      --accent: #e63946;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
      line-height: 1.7;
    }
    main {
      max-width: 860px;
      margin: 0 auto;
      padding: 40px 36px 56px;
    }
    header {
      border-bottom: 2px solid var(--line);
      margin-bottom: 28px;
      padding-bottom: 18px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.35;
    }
    .subtitle {
      margin-top: 10px;
      color: var(--muted);
      font-size: 15px;
    }
    .meta {
      display: grid;
      gap: 8px;
      margin-top: 18px;
      padding: 14px 16px;
      background: var(--panel);
      border-radius: 12px;
    }
    .meta-row {
      display: flex;
      gap: 10px;
      font-size: 13px;
    }
    .meta-label {
      min-width: 72px;
      color: var(--muted);
    }
    .source {
      margin-top: 12px;
      font-size: 12px;
      word-break: break-all;
    }
    .source a {
      color: var(--accent);
      text-decoration: none;
    }
    .content p {
      margin: 0 0 14px;
      white-space: pre-wrap;
    }
    .gallery {
      display: grid;
      gap: 18px;
      margin-top: 30px;
    }
    figure {
      margin: 0;
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid var(--line);
      border-radius: 14px;
      overflow: hidden;
      background: #fff;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
    }
    @page {
      size: A4;
      margin: 14mm 12mm;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${title}</h1>
      ${subtitle}
      <section class="meta">${meta || '<div class="meta-row"><span class="meta-label">来源</span><span class="meta-value">小红书笔记导出</span></div>'}</section>
      ${source}
    </header>
    <section class="content">
      ${paragraphs}
    </section>
    <section class="gallery">
      ${images}
    </section>
  </main>
</body>
</html>`;
}

export function getChromeCandidates(platform: NodeJS.Platform = process.platform): string[] {
  switch (platform) {
    case 'darwin':
      return [...MAC_CHROME_CANDIDATES];
    case 'win32':
      return [...WINDOWS_CHROME_CANDIDATES];
    default:
      return [...LINUX_CHROME_CANDIDATES];
  }
}

export function resolveChromeExecutable(
  envExecutable: string | undefined,
  platform: NodeJS.Platform = process.platform,
  exists: (target: string) => boolean = fs.existsSync,
): string | null {
  if (envExecutable && exists(envExecutable)) return envExecutable;
  for (const candidate of getChromeCandidates(platform)) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

function writeHtmlAssets(doc: PdfDocument, workdir: string): string {
  fs.mkdirSync(workdir, { recursive: true });
  const htmlPath = path.join(workdir, 'document.html');
  fs.writeFileSync(htmlPath, buildPdfHtml(doc), 'utf8');
  return htmlPath;
}

async function spawnChromeToPdf(chromeExecutable: string, htmlPath: string, pdfPath: string, timeoutMs: number): Promise<void> {
  const userDataDir = path.join(os.tmpdir(), 'opencli-chrome-profile', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    await new Promise<void>((resolve, reject) => {
      fs.mkdirSync(userDataDir, { recursive: true });

      const args = [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--allow-file-access-from-files',
        `--user-data-dir=${userDataDir}`,
        `--print-to-pdf=${pdfPath}`,
        '--no-pdf-header-footer',
        pathToFileURL(htmlPath).toString(),
      ];

      const proc = spawn(chromeExecutable, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';
      let settled = false;
      let lastSize = -1;
      let stableChecks = 0;
      const timer = setTimeout(() => {
        settled = true;
        proc.kill('SIGKILL');
        reject(new Error(`Chrome PDF export timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const poller = setInterval(() => {
        if (settled || !fs.existsSync(pdfPath)) return;
        const size = fs.statSync(pdfPath).size;
        if (size > 0 && size === lastSize) {
          stableChecks += 1;
        } else {
          stableChecks = 0;
          lastSize = size;
        }

        if (size > 0 && stableChecks >= 2) {
          settled = true;
          clearTimeout(timer);
          clearInterval(poller);
          proc.kill('SIGTERM');
          resolve();
        }
      }, 500);

      const cleanup = () => {
        clearTimeout(timer);
        clearInterval(poller);
      };

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      proc.on('error', (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });

      proc.on('exit', (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) {
          resolve();
          return;
        }
        if (code !== 0) {
          reject(new Error(stderr.trim() || `Chrome exited with code ${code}`));
          return;
        }
        reject(new Error('Chrome exited before producing a PDF file'));
      });
    });
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

export async function exportPdfDocument(doc: PdfDocument, options: ExportPdfOptions): Promise<ExportPdfResult> {
  const chromeExecutable = resolveChromeExecutable(options.chromeExecutable ?? process.env.OPENCLI_BROWSER_EXECUTABLE_PATH);
  if (!chromeExecutable) {
    throw new Error(
      'Chrome executable not found. Set OPENCLI_BROWSER_EXECUTABLE_PATH or install Google Chrome/Chromium.'
    );
  }

  const safeBase = sanitizeFilename(options.filename || doc.title || 'document', 120);
  const outputDir = options.output;
  const pdfPath = path.join(outputDir, `${safeBase}.pdf`);
  const tempRoot = path.join(os.tmpdir(), 'opencli-pdf-export', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const workdir = path.join(tempRoot, safeBase);

  fs.mkdirSync(outputDir, { recursive: true });

  try {
    const htmlPath = writeHtmlAssets(doc, workdir);
    await spawnChromeToPdf(chromeExecutable, htmlPath, pdfPath, options.timeoutMs ?? 90_000);
    const stat = fs.statSync(pdfPath);
    return { pdfPath, size: stat.size };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
