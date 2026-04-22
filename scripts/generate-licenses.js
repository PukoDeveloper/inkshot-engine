#!/usr/bin/env node
// scripts/generate-licenses.js
//
// Scans every production dependency listed in package-lock.json and collects
// their license text from node_modules. The result is written to
// THIRD_PARTY_LICENSES.md so that distributing the engine bundle (which no
// longer embeds license texts inline) still satisfies MIT/ISC/BSD attribution
// requirements.
//
// Usage:  node scripts/generate-licenses.js
// The script is also called automatically by `npm run build:bundle`.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(__dirname, '..');

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return the text of the first LICENSE-like file found in a package dir. */
function readLicenseFile(pkgDir) {
  const candidates = [
    'LICENSE', 'LICENSE.md', 'LICENSE.txt',
    'License', 'License.md', 'License.txt',
    'license', 'license.md', 'license.txt',
    'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  ];
  for (const name of candidates) {
    const p = join(pkgDir, name);
    if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  }
  return null;
}

/** Derive a human-readable SPDX expression from package.json `license` field. */
function licenseId(pkgJson) {
  const raw = pkgJson.license ?? pkgJson.licenses?.[0]?.type ?? 'UNKNOWN';
  return typeof raw === 'string' ? raw : raw.type ?? 'UNKNOWN';
}

// ── collect own package ───────────────────────────────────────────────────────

const ownPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const ownLicense = readFileSync(join(root, 'LICENSE'), 'utf8').trim();

const entries = [
  {
    name: ownPkg.name,
    version: ownPkg.version,
    license: ownPkg.license ?? 'UNKNOWN',
    homepage: ownPkg.homepage ?? ownPkg.repository?.url ?? '',
    text: ownLicense,
  },
];

// ── collect production dependencies ──────────────────────────────────────────

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

for (const [key, meta] of Object.entries(lock.packages)) {
  // Skip the root entry and any dev-only packages.
  if (key === '' || meta.dev) continue;
  if (!key.startsWith('node_modules/')) continue;

  const pkgDir = join(root, key);
  let pkgJson;
  try {
    pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  } catch {
    console.warn(`[generate-licenses] Warning: could not read package.json for ${key}`);
    continue;
  }

  const text = readLicenseFile(pkgDir);
  if (!text) {
    console.warn(`[generate-licenses] Warning: no LICENSE file found for ${key}`);
  }

  entries.push({
    name: pkgJson.name ?? key.replace('node_modules/', ''),
    version: pkgJson.version ?? meta.version ?? '?',
    license: licenseId(pkgJson),
    homepage: pkgJson.homepage ?? pkgJson.repository?.url ?? '',
    text: text ?? `(license text not found — SPDX: ${licenseId(pkgJson)})`,
  });
}

// Sort alphabetically, own package first.
entries.sort((a, b) => {
  if (a.name === ownPkg.name) return -1;
  if (b.name === ownPkg.name) return 1;
  return a.name.localeCompare(b.name);
});

// ── render Markdown ──────────────────────────────────────────────────────────

const divider = '---';

const lines = [
  `# Third-Party Licenses`,
  ``,
  `This file lists the license notices for **${ownPkg.name}** and all of its`,
  `production dependencies (including transitive ones).`,
  `It was generated automatically by \`npm run generate-licenses\`.`,
  ``,
  `| Package | Version | License |`,
  `|---------|---------|---------|`,
  ...entries.map(
    (e) => `| ${e.name} | ${e.version} | ${e.license} |`
  ),
  ``,
  divider,
  ``,
];

for (const e of entries) {
  lines.push(
    `## ${e.name} (${e.version})`,
    ``,
    `**License:** ${e.license}`,
    ...(e.homepage ? [`**Homepage:** <${e.homepage}>`] : []),
    ``,
    '```',
    e.text,
    '```',
    ``,
    divider,
    ``,
  );
}

const output = lines.join('\n');
const outPath = join(root, 'THIRD_PARTY_LICENSES.md');
writeFileSync(outPath, output, 'utf8');
console.log(`[generate-licenses] Written ${entries.length} entries → ${outPath}`);
