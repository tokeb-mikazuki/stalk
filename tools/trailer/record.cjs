// 트레일러 프레임 촬영: node tools/trailer/record.cjs <출력폴더> [fps] [width] [height]
// 빌드된 dist/index.html (TR_THEME=yugi 면 dist/channel-yugi.html) 을 헤드리스 Chromium 으로 열고, director.js 를 주입해 한 프레임씩 JPEG 로 저장한다.
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }

(async () => {
  const out = path.resolve(process.argv[2] || 'trailer-frames');
  const fps = +(process.argv[3] || 30);
  const W = +(process.argv[4] || 1280), H = +(process.argv[5] || 720);
  const limit = +(process.env.TR_LIMIT || 1e9);
  const every = +(process.env.TR_EVERY || 1); // 미리보기: N 프레임마다 한 장만 저장
  fs.mkdirSync(out, { recursive: true });
  // TR_GPU=1: GPU 가 있는 로컬 PC 에서 실제 GPU 로 렌더 (훨씬 빠름). 기본은 소프트웨어 렌더(SwiftShader)
  const browser = process.env.TR_GPU
    ? await pw.chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
    : await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(300000); // 소프트웨어 렌더에서는 셰이더 컴파일 한 번에 수십 초가 걸리기도 한다
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  // TR_THEME=yugi: 공포의 채널유기 판 (기본: 공포의 송신계단)
  const html = process.env.TR_THEME === 'yugi' ? 'channel-yugi.html' : 'index.html';
  await page.goto('file://' + path.resolve(__dirname, '../../dist', html));
  await page.waitForTimeout(800);
  await page.mouse.click(W / 2, H / 2);
  await page.waitForFunction(() => document.getElementById('press').classList.contains('on'), null, { timeout: 180000 });
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  await page.click('[data-act=newgame]');
  await page.click('[data-level=normal]');
  await page.waitForTimeout(1200);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.evaluate(([f, from]) => { window.TR_FPS = f; window.TR_FROM = from; }, [fps, +(process.env.TR_FROM || 0)]);
  await page.addScriptTag({ path: path.join(__dirname, 'director.js') });
  let i = 0;
  const t0 = Date.now();
  while (i < limit && (await page.evaluate(() => window.TR.step()))) {
    if (i % every === 0) await page.screenshot({ path: path.join(out, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    i++;
    if (i % 60 === 0) console.log(`frame ${i}  t=${(i / fps).toFixed(1)}s  ${((Date.now() - t0) / i).toFixed(0)}ms/frame`);
  }
  const info = await page.evaluate(() => ({ events: window.TR.events, marks: window.TR.marks, frames: window.TR.frame }));
  fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify({ fps, ...info }, null, 1));
  console.log('done', i, 'frames');
  await browser.close();
})();
