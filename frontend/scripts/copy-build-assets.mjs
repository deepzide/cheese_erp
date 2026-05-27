import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const distDir = path.join(frontendRoot, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const distIndex = path.join(distDir, 'index.html');
const publicFrontendDir = path.join(repoRoot, 'cheese', 'public', 'frontend');
const publicAssetsDir = path.join(publicFrontendDir, 'assets');
const publicIndex = path.join(publicFrontendDir, 'index.html');
const wwwIndex = path.join(repoRoot, 'cheese', 'www', 'cheese.html');
const htmlOnly = process.argv.includes('--html-only');

function ensureInsideRepo(targetPath) {
  const relative = path.relative(repoRoot, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside repo: ${targetPath}`);
  }
}

function requireFile(targetPath) {
  if (!existsSync(targetPath)) {
    throw new Error(`Missing build output: ${targetPath}`);
  }
}

function copyHtmlEntries() {
  requireFile(distIndex);
  const html = readFileSync(distIndex, 'utf8').replace(/\r\n/g, '\n');
  writeFileSync(distIndex, html);
  mkdirSync(publicFrontendDir, { recursive: true });
  mkdirSync(path.dirname(wwwIndex), { recursive: true });
  writeFileSync(publicIndex, html);
  writeFileSync(wwwIndex, html);
}

ensureInsideRepo(publicFrontendDir);
ensureInsideRepo(wwwIndex);

if (!htmlOnly) {
  requireFile(distAssetsDir);
  mkdirSync(publicFrontendDir, { recursive: true });
  if (existsSync(publicAssetsDir)) {
    rmSync(publicAssetsDir, { recursive: true, force: true });
  }
  cpSync(distAssetsDir, publicAssetsDir, { recursive: true });
}

copyHtmlEntries();
