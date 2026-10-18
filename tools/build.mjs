// 빌드: 모든 코드와 이미지를 dist/index.html 하나에 묶는다 (더블클릭으로 실행 가능)
// 사용법: npm run build   |   npm run dev (http://localhost:5173, 저장 시 자동 재빌드)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serve = process.argv.includes('--serve');
const outFile = path.join(root, 'dist', 'index.html');

function emit(result) {
  if (!result.outputFiles?.length) return;
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = fs
    .readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<script type="module" src="./main.js"></script>', () => `<script>${js}</script>`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  console.log(`[build] ${path.relative(root, outFile)} (${(html.length / 1024).toFixed(0)} KB)`);
}

const options = {
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  legalComments: 'none',
  loader: { '.png': 'dataurl', '.mp3': 'dataurl' },
  write: false,
  logLevel: 'warning',
};

if (!serve) {
  emit(await esbuild.build(options));
} else {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{ name: 'emit', setup(b) { b.onEnd((r) => { if (!r.errors.length) emit(r); }); } }],
  });
  await ctx.watch();
  http
    .createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(outFile));
    })
    .listen(5173, () => console.log('[dev] http://localhost:5173'));
}
