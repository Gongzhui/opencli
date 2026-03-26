/**
 * Single source of truth for package version.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgJsonPath = path.resolve(__dirname, '..', 'package.json');
const forkVersionPath = path.resolve(__dirname, '..', 'fork-version.json');

export type ForkVersionMeta = {
  forkName: string;
  forkVersion: string;
};

export type VersionInfo = {
  upstreamVersion: string;
  forkName: string | null;
  forkVersion: string | null;
  isFork: boolean;
  displayVersion: string;
};

function readJson(readFile: () => string): unknown {
  return JSON.parse(readFile());
}

export function loadPackageVersion(readFile: () => string): string {
  try {
    const pkg = readJson(readFile) as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function loadForkVersionMeta(readFile: () => string): ForkVersionMeta | null {
  try {
    const raw = readJson(readFile) as { forkName?: unknown; forkVersion?: unknown };
    if (
      typeof raw.forkName !== 'string' ||
      !raw.forkName.trim() ||
      typeof raw.forkVersion !== 'string' ||
      !raw.forkVersion.trim()
    ) {
      return null;
    }

    return {
      forkName: raw.forkName.trim(),
      forkVersion: raw.forkVersion.trim(),
    };
  } catch {
    return null;
  }
}

export function formatCliVersion(upstreamVersion: string, forkMeta: ForkVersionMeta | null = null): string {
  if (!forkMeta) return upstreamVersion;
  return `${upstreamVersion} (fork ${forkMeta.forkName}@${forkMeta.forkVersion})`;
}

export function loadVersionInfo(
  readPkgFile: () => string = () => fs.readFileSync(pkgJsonPath, 'utf-8'),
  readForkFile: () => string = () => fs.readFileSync(forkVersionPath, 'utf-8'),
): VersionInfo {
  const upstreamVersion = loadPackageVersion(readPkgFile);
  const forkMeta = loadForkVersionMeta(readForkFile);

  return {
    upstreamVersion,
    forkName: forkMeta?.forkName ?? null,
    forkVersion: forkMeta?.forkVersion ?? null,
    isFork: !!forkMeta,
    displayVersion: formatCliVersion(upstreamVersion, forkMeta),
  };
}

export const VERSION_INFO: VersionInfo = loadVersionInfo();
export const PKG_VERSION: string = VERSION_INFO.upstreamVersion;
export const CLI_VERSION: string = VERSION_INFO.displayVersion;
