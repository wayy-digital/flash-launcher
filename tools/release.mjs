#!/usr/bin/env node
// Writes the update manifest (server/releases.json) for a new Flash Launcher version from the
// signed bundles the build left in src-tauri/target/release/bundle (and, for Windows builds made
// on another machine, from the folder given with --win).
//
//   node tools/release.mjs --url https://github.com/wayy-digital/flash-launcher/releases/download/v0.4.0 \
//        --notes "• Что нового" [--win C:/path/to/nsis] [--out server/releases.json]
//
// Then upload the listed files to --url and redeploy the server (server/): every launcher that
// starts or is open sees the new version within 30 minutes.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
if (!args.url) {
  console.error('нужно: --url <адрес папки с файлами релиза>');
  process.exit(1);
}
const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
const version = conf.version;
const bundle = new URL('../src-tauri/target/release/bundle/', import.meta.url).pathname;
const base = args.url.replace(/\/$/, '');
const platforms = {};
const files = [];

/** Adds one signed artifact: `dir/<name>` with its `.sig` next to it. */
function add(key, dir, test) {
  if (!dir || !existsSync(dir)) return;
  const file = readdirSync(dir).find((f) => test(f) && existsSync(join(dir, f + '.sig')));
  if (!file) return;
  const safe = file.replace(/ /g, '.');
  platforms[key] = { url: `${base}/${encodeURIComponent(safe)}`, signature: readFileSync(join(dir, file + '.sig'), 'utf8').trim() };
  files.push(`${join(dir, file)}  →  загрузить как ${safe}`);
}

add('linux-x86_64-appimage', join(bundle, 'appimage'), (f) => f.endsWith(`_${version}_amd64.AppImage`));
add('linux-x86_64-deb', join(bundle, 'deb'), (f) => f.endsWith(`_${version}_amd64.deb`));
add('windows-x86_64-nsis', args.win ?? join(bundle, 'nsis'), (f) => f.endsWith(`_${version}_x64-setup.exe`));
if (!Object.keys(platforms).length) {
  console.error(`Подписанных сборок ${version} не найдено. Соберите с TAURI_SIGNING_PRIVATE_KEY.`);
  process.exit(1);
}

const release = { version, notes: args.notes ?? '', pub_date: new Date().toISOString(), platforms };
const out = args.out ?? new URL('../server/releases.json', import.meta.url).pathname;
writeFileSync(out, JSON.stringify(release, null, 2) + '\n');
console.log(`releases.json → ${out}\nВерсия ${version}: ${Object.keys(platforms).join(', ')}\n\nЗагрузите в ${base}/:\n  ${files.join('\n  ')}`);
