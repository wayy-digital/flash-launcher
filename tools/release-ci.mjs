#!/usr/bin/env node
// CI: from the signed bundles of every runner (downloaded into <dir>), make the GitHub Release's
// upload folder (names without spaces) and server/releases.json, the update manifest.
//   node tools/release-ci.mjs artifacts https://github.com/OWNER/REPO/releases/download/vX.Y.Z
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [dir, base] = process.argv.slice(2);
const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const all = walk(dir);
mkdirSync('upload', { recursive: true });

const kinds = [
  ['windows-x86_64-nsis', (f) => f.endsWith(`_${version}_x64-setup.exe`)],
  ['linux-x86_64-appimage', (f) => f.endsWith(`_${version}_amd64.AppImage`)],
  ['linux-x86_64-deb', (f) => f.endsWith(`_${version}_amd64.deb`)],
];
const platforms = {};
for (const [key, test] of kinds) {
  const file = all.find((f) => test(f) && existsSync(f + '.sig'));
  if (!file) continue;
  const name = basename(file).replace(/ /g, '.');
  copyFileSync(file, join('upload', name));
  platforms[key] = { url: `${base.replace(/\/$/, '')}/${name}`, signature: readFileSync(file + '.sig', 'utf8').trim() };
}
if (!Object.keys(platforms).length) throw new Error(`no signed bundles for ${version} in ${dir}`);
const notes = existsSync('release-notes.md') ? readFileSync('release-notes.md', 'utf8').trim() : '';
writeFileSync('server/releases.json', JSON.stringify({ version, notes, pub_date: new Date().toISOString(), platforms }, null, 2) + '\n');
console.log(`Flash Launcher ${version}: ${Object.keys(platforms).join(', ')}`);
