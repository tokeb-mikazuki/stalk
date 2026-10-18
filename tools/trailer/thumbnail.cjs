// 트레일러 썸네일(1280x720): node tools/trailer/thumbnail.cjs <배경 프레임.jpg> <출력.png>
// 트레일러 프레임 한 장(엘리베이터 안의 실루엣) 위에 제목을 얹는다.
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }

(async () => {
  const bg = path.resolve(process.argv[2]);
  const out = path.resolve(process.argv[3] || 'thumbnail.png');
  const img = 'data:image/jpeg;base64,' + fs.readFileSync(bg).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700;900&family=Noto+Sans+KR:wght@300;400;700&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #000; }
  .bg { position: absolute; inset: 0; background: url(${img}) no-repeat; background-size: 1800px auto;
    background-position: -470px -120px; filter: brightness(1.25) contrast(1.2) saturate(0.6) blur(0.4px); }
  .shade { position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,.78) 56%, rgba(0,0,0,.9) 100%),
                radial-gradient(ellipse at 28% 45%, rgba(0,0,0,0) 30%, rgba(0,0,0,.75) 85%); }
  .red { position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 50%, rgba(0,0,0,0) 45%, rgba(120,0,0,.28) 100%); mix-blend-mode: multiply; }
  .grain { position: absolute; inset: 0; opacity: .13; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
  .title { position: absolute; right: 64px; top: 196px; text-align: right; }
  .title h1 { margin: 0; font-family: 'Noto Serif KR', serif; font-weight: 900; font-size: 104px; line-height: 1.08; letter-spacing: .02em; color: #f1ebe2;
    text-shadow: 4px 0 0 rgba(220,20,20,.55), -3px 0 0 rgba(40,160,255,.25), 0 0 40px rgba(170,0,0,.55), 0 4px 18px rgba(0,0,0,.9); }
  .title h1 .br { font-weight: 400; color: #b5261e; text-shadow: 0 0 24px rgba(180,0,0,.6); }
  .title .ot { margin-top: 26px; font-family: 'Noto Sans KR', sans-serif; font-weight: 700; font-size: 34px; letter-spacing: .42em; color: #e9e3da; padding-left: .42em; }
  .title .ot::before { content: ''; display: inline-block; width: 70px; height: 4px; background: #c4231a; vertical-align: middle; margin-right: 22px; }
  .rule { position: absolute; left: 46px; bottom: 40px; font-family: 'Noto Serif KR', serif; font-size: 25px; color: #ddd6ca; letter-spacing: .06em; text-shadow: 0 0 10px #000, 0 0 3px #000; }
  .rule .n { color: #c4231a; font-weight: 700; margin-right: .45em; }
  .rule .hd { display: block; font-family: 'Noto Sans KR', sans-serif; font-size: 13px; color: #8f897e; letter-spacing: .5em; margin-bottom: 10px; }
  .rec { position: absolute; left: 46px; top: 36px; font-family: monospace; font-size: 20px; color: #ff3b3b; letter-spacing: .15em; }
</style></head><body>
<div class="bg"></div><div class="shade"></div><div class="red"></div><div class="grain"></div>
<div class="rec">● REC 06F</div>
<div class="title"><h1><span class="br">「</span>공포의<br>송신계단<span class="br">」</span></h1><div class="ot">OFFICIAL TRAILER</div></div>
<div class="rule"><span class="hd">송신아파트 비상계단 이용 수칙</span><span class="n">12.</span>엘리베이터 문이 열리면, 눈을 감으십시오.</div>
</body></html>`;
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.screenshot({ path: out });
  await browser.close();
  console.log('thumbnail:', out);
})();
