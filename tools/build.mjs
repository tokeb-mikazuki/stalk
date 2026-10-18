// 빌드: 모든 코드와 이미지를 HTML 파일 하나에 묶는다 (더블클릭으로 실행 가능) — 두 판을 함께 만든다
//   dist/index.html        공포의 송신계단 (원작)
//   dist/channel-yugi.html 공포의 채널유기 (피구공)
// 사용법: npm run build   |   npm run dev (http://localhost:5173, 저장 시 자동 재빌드 — 송신계단 판, THEME=yugi 면 채널유기 판)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serve = process.argv.includes('--serve');
// 두 판을 만든다: 공포의 송신계단(원작) / 공포의 채널유기(피구공)
const EDITIONS = {
  songshin: { file: 'index.html' },
  yugi: { file: 'channel-yugi.html' },
};
// 소스 글자는 채널유기 판 기준 — 송신계단 판은 이름을 되돌린다 (긴 것부터)
const TO_SONGSHIN = [
  ['공포의 채널유기', '공포의 송신계단'],
  ['CHANNEL YUGI', 'SONGSHIN STAIRWELL'],
  ['채널유기', '송신계단'],
  ['피구공', '송신'],
];
const only = process.env.THEME; // THEME=yugi npm run dev — 한 판만
const themes = only ? [only] : Object.keys(EDITIONS);

function emit(theme, result) {
  if (!result.outputFiles?.length) return;
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  let html = fs
    .readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<script type="module" src="./main.js"></script>', () => `<script>${js}</script>`);
  if (theme === 'songshin') for (const [a, b] of TO_SONGSHIN) html = html.split(a).join(b);
  const outFile = path.join(root, 'dist', EDITIONS[theme].file);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  console.log(`[build] ${path.relative(root, outFile)} (${(html.length / 1024).toFixed(0)} KB)`);
  // GitHub Pages 용 사본 (Settings → Pages → 이 브랜치의 /docs) — 링크만 열면 바로 실행된다
  if (!serve) {
    const docs = path.join(root, 'docs');
    fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(path.join(docs, EDITIONS[theme].file), html);
    fs.writeFileSync(path.join(docs, '.nojekyll'), '');
  }
  return outFile;
}

const options = {
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  legalComments: 'none',
  loader: { '.png': 'dataurl', '.webp': 'dataurl', '.mp3': 'dataurl' },
  write: false,
  logLevel: 'warning',
};

const optionsFor = (theme) => ({ ...options, define: { __THEME__: JSON.stringify(theme) } });

if (!serve) {
  for (const t of themes) emit(t, await esbuild.build(optionsFor(t)));
} else {
  const t = themes[0];
  let outFile = null;
  const ctx = await esbuild.context({
    ...optionsFor(t),
    plugins: [{ name: 'emit', setup(b) { b.onEnd((r) => { if (!r.errors.length) outFile = emit(t, r); }); } }],
  });
  await ctx.watch();
  http
    .createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(outFile ? fs.readFileSync(outFile) : 'building…');
    })
    .listen(5173, () => console.log(`[dev] http://localhost:5173 (${t})`));
}
