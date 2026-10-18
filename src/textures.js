// 캔버스로 그리는 절차적 텍스처 (외부 이미지 없이 동작)
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function grime(ctx, w, h, r, count, alpha) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, rad = 10 + r() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(20,18,16,${alpha * r()})`);
    g.addColorStop(1, 'rgba(20,18,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

function speckle(ctx, w, h, r, n, light) {
  for (let i = 0; i < n; i++) {
    const v = light ? 180 + r() * 60 : r() * 50;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.15 + r() * 0.3})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/** 참고 이미지 상단의 흰 정사각 타일 벽 */
export function tileTexture() {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const r = rng(7);
  ctx.fillStyle = '#6f6d67';
  ctx.fillRect(0, 0, S, S);
  const T = 128;
  for (let y = 0; y < S; y += T) {
    for (let x = 0; x < S; x += T) {
      const v = 196 + Math.floor(r() * 26);
      // 타일 가장자리를 살짝 둥글게 (노멀맵에서 볼록하게 보임)
      const g = ctx.createRadialGradient(x + T / 2, y + T / 2, T * 0.2, x + T / 2, y + T / 2, T * 0.75);
      g.addColorStop(0, `rgb(${v},${v - 2},${v - 6})`);
      g.addColorStop(1, `rgb(${v - 18},${v - 20},${v - 24})`);
      ctx.fillStyle = g;
      ctx.fillRect(x + 4, y + 4, T - 8, T - 8);
      if (r() < 0.12) { // 깨진 타일
        ctx.strokeStyle = 'rgba(40,40,40,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        let px = x + r() * T, py = y + 4;
        ctx.moveTo(px, py);
        for (let i = 0; i < 6; i++) { px += (r() - 0.5) * 40; py += T / 6; ctx.lineTo(px, py); }
        ctx.stroke();
      }
    }
  }
  speckle(ctx, S, S, r, 6000, false);
  grime(ctx, S, S, r, 80, 0.35);
  // 아래로 흐른 얼룩
  for (let i = 0; i < 28; i++) {
    const x = r() * S, len = 120 + r() * 600;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(30,25,20,0.25)');
    g.addColorStop(1, 'rgba(30,25,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, r() * 400, 3 + r() * 8, len);
  }
  return toTexture(c);
}

export function concreteTexture(base = 92, seed = 3) {
  const [c, ctx] = canvas(256, 256);
  const r = rng(seed);
  ctx.fillStyle = `rgb(${base},${base},${base - 3})`;
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, r, 2500, false);
  speckle(ctx, 256, 256, r, 900, true);
  grime(ctx, 256, 256, r, 18, 0.3);
  return toTexture(c);
}

/** 계단 디딤판: v=0 쪽(앞 모서리)에 밝은 논슬립 띠 */
export function stepTexture() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(11);
  ctx.fillStyle = '#4e4d4a';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, r, 2000, false);
  speckle(ctx, 256, 256, r, 600, true);
  grime(ctx, 256, 256, r, 10, 0.4);
  // flipY 때문에 캔버스 아래쪽이 v=0
  ctx.fillStyle = '#8d8b85';
  ctx.fillRect(0, 230, 256, 26);
  ctx.fillStyle = 'rgba(30,30,30,0.6)';
  for (let x = 0; x < 256; x += 6) ctx.fillRect(x, 234, 2, 18);
  // 발자국 마모 (가운데)
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0.0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.07)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 230);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function metalTexture() {
  const [c, ctx] = canvas(128, 256);
  const r = rng(5);
  ctx.fillStyle = '#7a7b7c';
  ctx.fillRect(0, 0, 128, 256);
  for (let x = 0; x < 128; x++) {
    const v = 100 + r() * 50;
    ctx.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    ctx.fillRect(x, 0, 1, 256);
  }
  grime(ctx, 128, 256, r, 10, 0.4);
  // 손자국
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(40,30,30,${0.1 + r() * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(20 + r() * 90, 100 + r() * 60, 6, 9, r(), 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}

/** 벽에 칠해진 층 번호 */
export function floorSignTexture(floor, isRoof) {
  const [c, ctx] = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.font = 'bold 150px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(28,28,30,0.92)';
  ctx.fillText(`${floor}`, 128, 110);
  ctx.font = 'bold 54px "Arial Black", Impact, sans-serif';
  ctx.fillText('F', 128, 200);
  if (isRoof) {
    ctx.font = 'bold 26px "Malgun Gothic", sans-serif';
    ctx.fillText('▶ 옥상', 128, 243);
  }
  // 페인트 벗겨짐
  const r = rng(floor * 31 + 1);
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`;
    ctx.fillRect(r() * 256, r() * 256, 1 + r() * 7, 1 + r() * 4);
  }
  ctx.globalCompositeOperation = 'source-over';
  return toTexture(c, false);
}

export function glitchSignTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.font = 'bold 120px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(70,0,0,0.9)';
  ctx.fillText('송신', 128, 128);
  return toTexture(c, false);
}

export function fireDoorTexture() {
  const [c, ctx] = canvas(256, 512);
  const r = rng(21);
  ctx.fillStyle = '#4a4f4b';
  ctx.fillRect(0, 0, 256, 512);
  grime(ctx, 256, 512, r, 25, 0.5);
  speckle(ctx, 256, 512, r, 1200, false);
  ctx.strokeStyle = 'rgba(20,20,20,0.7)';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 496);
  // 손잡이
  ctx.fillStyle = '#9a9a96';
  ctx.fillRect(196, 250, 40, 12);
  // 경고문
  ctx.fillStyle = '#d9d6cc';
  ctx.fillRect(48, 120, 160, 70);
  ctx.fillStyle = '#7a1010';
  ctx.font = 'bold 28px "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('비 상 문', 128, 152);
  ctx.font = '16px "Malgun Gothic", sans-serif';
  ctx.fillText('항상 닫아 두십시오', 128, 178);
  return toTexture(c, false);
}

export function roofDoorTexture() {
  const [c, ctx] = canvas(256, 512);
  const r = rng(33);
  ctx.fillStyle = '#5a5c5e';
  ctx.fillRect(0, 0, 256, 512);
  grime(ctx, 256, 512, r, 30, 0.5);
  ctx.strokeStyle = 'rgba(20,20,20,0.8)';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 240, 496);
  ctx.fillStyle = '#d8d4c5';
  ctx.fillRect(38, 90, 180, 90);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 44px "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('옥 상', 128, 140);
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText('ROOF  EXIT', 128, 170);
  ctx.fillStyle = '#b8b8b0';
  ctx.fillRect(30, 260, 50, 16);
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(55, 300, 7, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(c, false);
}

export function startWallTexture() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(44);
  ctx.fillStyle = '#3d3b38';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, r, 1500, false);
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 5;
  for (let x = 10; x < 256; x += 22) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }
  ctx.fillStyle = '#c9c4b0';
  ctx.fillRect(58, 96, 140, 56);
  ctx.fillStyle = '#6b0d0d';
  ctx.font = 'bold 26px "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('B1 폐쇄', 128, 134);
  return toTexture(c, false);
}

export function paperTexture(seed) {
  const [c, ctx] = canvas(128, 160);
  const r = rng(seed);
  ctx.fillStyle = '#e4dfd0';
  ctx.fillRect(0, 0, 128, 160);
  grime(ctx, 128, 160, r, 6, 0.25);
  ctx.fillStyle = 'rgba(40,40,60,0.7)';
  for (let y = 22; y < 150; y += 12) ctx.fillRect(12, y, 60 + r() * 44, 2);
  return toTexture(c, false);
}

// 엘리베이터 표시기용 도트 글꼴 (7×13, 2도트 굵기 — 실제 승강장 LED 처럼)
const LED_GLYPHS = {
  0: ['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  1: ['...##..', '..###..', '.####..', '...##..', '...##..', '...##..', '...##..', '...##..', '...##..', '...##..', '...##..', '...##..', '.######'],
  2: ['.#####.', '##...##', '.....##', '.....##', '.....##', '....##.', '...##..', '..##...', '.##....', '##.....', '##.....', '##.....', '#######'],
  3: ['.#####.', '##...##', '.....##', '.....##', '.....##', '..####.', '.....##', '.....##', '.....##', '.....##', '.....##', '##...##', '.#####.'],
  4: ['....##.', '...###.', '..####.', '.##.##.', '##..##.', '##..##.', '#######', '....##.', '....##.', '....##.', '....##.', '....##.', '....##.'],
  5: ['#######', '##.....', '##.....', '##.....', '######.', '.....##', '.....##', '.....##', '.....##', '.....##', '.....##', '##...##', '.#####.'],
  6: ['..####.', '.##....', '##.....', '##.....', '##.....', '######.', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  7: ['#######', '.....##', '.....##', '....##.', '....##.', '...##..', '...##..', '..##...', '..##...', '..##...', '..##...', '..##...', '..##...'],
  8: ['.#####.', '##...##', '##...##', '##...##', '##...##', '.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '##...##', '.#####.'],
  9: ['.#####.', '##...##', '##...##', '##...##', '##...##', '##...##', '.######', '.....##', '.....##', '.....##', '.....##', '....##.', '.####..'],
  '-': ['.......', '.......', '.......', '.......', '.......', '.#####.', '.#####.', '.......', '.......', '.......', '.......', '.......', '.......'],
};
const LED_ARROW_UP = ['....#....', '...###...', '..#####..', '.#######.', '#########', '...###...', '...###...', '...###...', '...###...'];
const LED_COLS = 21, LED_ROWS = 30;

/** 모든 층 승강장 패널이 공유하는 빨간 LED 도트 표시기 (방향 화살표 + 층수) */
export class IndicatorTexture {
  constructor() {
    const [c, ctx] = canvas(120, 180);
    this.canvas = c;
    this.ctx = ctx;
    this.dots = new Uint8Array(LED_COLS * LED_ROWS);
    this.texture = toTexture(c, false);
    this.last = '';
    this.draw('1', 0, false, false);
  }

  /** 도트 글꼴 한 글자를 (x0, y0) 에 찍는다 */
  stamp(rows, x0, y0, flipY = false) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[flipY ? rows.length - 1 - r : r];
      for (let c = 0; c < row.length; c++) {
        const x = x0 + c, y = y0 + r;
        if (row[c] === '#' && x >= 0 && x < LED_COLS && y >= 0 && y < LED_ROWS) this.dots[y * LED_COLS + x] = 1;
      }
    }
  }

  /** dir: 1 위, -1 아래, 0 정지 */
  draw(text, dir, err, red) {
    const key = `${text}|${dir}|${err}|${red}`;
    if (key === this.last) return;
    this.last = key;
    this.dots.fill(0);
    // 화살표 (위쪽 1~9행)
    if (dir !== 0) this.stamp(LED_ARROW_UP, 6, 1, dir < 0);
    // 층수 (아래쪽 14~26행) — 7도트 글자, 글자 사이 2도트
    const chars = [...(err ? '--' : text)].filter((ch) => LED_GLYPHS[ch]);
    const w = chars.length * 7 + (chars.length - 1) * 2;
    let x = Math.floor((LED_COLS - w) / 2);
    for (const ch of chars) {
      this.stamp(LED_GLYPHS[ch], x, 14);
      x += 9;
    }

    const ctx = this.ctx;
    ctx.fillStyle = '#060404';
    ctx.fillRect(0, 0, 120, 180);
    const on = red ? '#ff2a1a' : '#ff3b26';
    const sx = 120 / LED_COLS, sy = 180 / LED_ROWS;
    for (let y = 0; y < LED_ROWS; y++) {
      for (let x2 = 0; x2 < LED_COLS; x2++) {
        const lit = this.dots[y * LED_COLS + x2] === 1;
        ctx.fillStyle = lit ? on : '#1c0806';
        ctx.beginPath();
        ctx.arc(sx * (x2 + 0.5), sy * (y + 0.5), lit ? 2.4 : 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 유리 반사
    const gl = ctx.createLinearGradient(0, 0, 120, 180);
    gl.addColorStop(0, 'rgba(255,255,255,0.06)');
    gl.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, 120, 180);
    this.texture.needsUpdate = true;
  }
}

/** 승강장 호출 버튼 면 (원 안에 화살표) */
export function callButtonTexture(dir) {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(28, 26, 4, 32, 32, 32);
  g.addColorStop(0, '#dcdcdc');
  g.addColorStop(1, '#8e8e8e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a5a5a';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (dir > 0) { ctx.moveTo(20, 40); ctx.lineTo(32, 22); ctx.lineTo(44, 40); }
  else { ctx.moveTo(20, 24); ctx.lineTo(32, 42); ctx.lineTo(44, 24); }
  ctx.stroke();
  return toTexture(c, false);
}

/** 부드러운 원형 글로우 */
export function glowTexture() {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

/** 비상구 표시등 (열 수 있는 방 = 켜짐, 잠긴 방 = 꺼짐) */
export function exitSignTexture(on) {
  const [c, ctx] = canvas(256, 100);
  ctx.fillStyle = on ? '#0f7a3a' : '#122018';
  ctx.fillRect(0, 0, 256, 100);
  ctx.strokeStyle = on ? '#bfffd0' : '#2a3a30';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 92);
  ctx.fillStyle = on ? '#eafff0' : '#2c3a32';
  // 달리는 사람
  ctx.beginPath();
  ctx.arc(46, 28, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(42, 40); ctx.lineTo(36, 62); ctx.lineTo(22, 80);
  ctx.moveTo(36, 62); ctx.lineTo(54, 72); ctx.lineTo(58, 88);
  ctx.moveTo(42, 46); ctx.lineTo(62, 54);
  ctx.moveTo(42, 46); ctx.lineTo(26, 52);
  ctx.stroke();
  ctx.font = 'bold 44px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('비상구', 160, 52);
  return toTexture(c, false);
}

/** 송신의 뒷모습: 원본 실루엣을 머리카락 색으로 채움 */
export function silhouetteTexture(image) {
  const [c, ctx] = canvas(image.width, image.height);
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  const g = ctx.createLinearGradient(0, 0, 0, image.height);
  g.addColorStop(0, '#0d0c0c');
  g.addColorStop(0.7, '#141212');
  g.addColorStop(1, '#2a221e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, image.width, image.height);
  // 머리카락 결
  ctx.globalCompositeOperation = 'source-atop';
  const r = rng(77);
  for (let i = 0; i < 260; i++) {
    const x = r() * image.width;
    ctx.strokeStyle = `rgba(${40 + r() * 30},${36 + r() * 20},${34 + r() * 20},${0.25 + r() * 0.3})`;
    ctx.lineWidth = 1 + r() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, r() * image.height * 0.3);
    ctx.quadraticCurveTo(x + (r() - 0.5) * 30, image.height * 0.4, x + (r() - 0.5) * 20, image.height * (0.5 + r() * 0.4));
    ctx.stroke();
  }
  return toTexture(c, false);
}

/** 색 텍스처의 밝기를 높이로 보고 노멀맵 생성 (어두운 곳 = 움푹 들어감) */
export function normalMapFrom(tex, strength = 2) {
  const src = tex.image;
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d');
  const d = sctx.getImageData(0, 0, w, h).data;
  const hgt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hgt[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const [c, ctx] = canvas(w, h);
  const out = ctx.createImageData(w, h);
  const H = (x, y) => hgt[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      out.data[o] = (-dx / len * 0.5 + 0.5) * 255;
      out.data[o + 1] = (dy / len * 0.5 + 0.5) * 255;
      out.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  t.repeat.copy(tex.repeat);
  t.anisotropy = tex.anisotropy;
  return t;
}

/** 밝은 곳은 매끈하게(광택), 어두운 곳은 거칠게 — 타일 광택 표현용 */
export function roughnessMapFrom(tex, smooth = 0.25, rough = 0.95) {
  const src = tex.image;
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, ctx] = canvas(w, h);
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const l = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
    const v = (rough + (smooth - rough) * Math.min(1, Math.max(0, (l - 0.35) / 0.45))) * 255;
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  return t;
}

/** 손전등 빛 무늬: 가운데가 밝고 가장자리로 갈수록 아주 부드럽게 사라짐 */
export function torchCookieTexture() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // 가운데 밝은 영역은 좁게, 바깥으로는 길게 서서히 사라지는 감쇠
  g.addColorStop(0.0, 'rgb(255,255,255)');
  g.addColorStop(0.12, 'rgb(248,248,248)');
  g.addColorStop(0.17, 'rgb(212,212,212)'); // 반사판이 만드는 은은한 고리
  g.addColorStop(0.23, 'rgb(222,222,222)');
  g.addColorStop(0.36, 'rgb(150,150,150)');
  g.addColorStop(0.52, 'rgb(78,78,78)');
  g.addColorStop(0.7, 'rgb(28,28,28)');
  g.addColorStop(0.86, 'rgb(6,6,6)');
  g.addColorStop(1.0, 'rgb(0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- 엘리베이터 (스테인리스)
/** 헤어라인 스테인리스: 한 방향으로 아주 가늘게 긁힌 결 + 희미한 지문 */
export function stainlessTexture(seed = 21, vertical = true, base = 168) {
  const [c, ctx] = canvas(256, 512);
  const r = rng(seed);
  ctx.fillStyle = `rgb(${base},${base + 2},${base + 5})`;
  ctx.fillRect(0, 0, 256, 512);
  // 헤어라인 결
  for (let i = 0; i < 1400; i++) {
    const v = base - 30 + r() * 70;
    ctx.fillStyle = `rgba(${v},${v + 1},${v + 4},${0.08 + r() * 0.12})`;
    if (vertical) ctx.fillRect(r() * 256, r() * 512 - 60, 1, 80 + r() * 300);
    else ctx.fillRect(r() * 256 - 60, r() * 512, 80 + r() * 300, 1);
  }
  // 넓게 번지는 광택 띠
  const gl = ctx.createLinearGradient(0, 0, 256, 0);
  gl.addColorStop(0, 'rgba(255,255,255,0)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.07)');
  gl.addColorStop(0.55, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, 256, 512);
  // 지문·손때 (손이 닿는 높이에 몇 개)
  for (let i = 0; i < 6; i++) {
    const x = 30 + r() * 196, y = 220 + r() * 110;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, 9 + r() * 6);
    gr.addColorStop(0, 'rgba(70,64,60,0.18)');
    gr.addColorStop(1, 'rgba(70,64,60,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - 16, y - 16, 32, 32);
  }
  return toTexture(c);
}

/** 엘리베이터 칸 벽: 세로 이음매로 나뉜 스테인리스 판 + 아래 걸레받이 */
export function carWallTexture(seed = 33) {
  const [c, ctx] = canvas(512, 512);
  const base = stainlessTexture(seed, true, 176).image;
  ctx.drawImage(base, 0, 0, 512, 512);
  // 판 이음매 (3장)
  for (const x of [0, 170, 341, 511]) {
    ctx.fillStyle = 'rgba(30,32,36,0.85)';
    ctx.fillRect(x - 1, 0, 3, 512);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 2, 0, 1, 512);
  }
  // 걸레받이 (아래 6%)
  ctx.fillStyle = '#4a4c50';
  ctx.fillRect(0, 481, 512, 31);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 481, 512, 2);
  return toTexture(c, false);
}

/** 조작반: 층 버튼(숫자) + 열림/닫힘 + 비상 호출 */
export function copTexture(floors) {
  const [c, ctx] = canvas(256, 768);
  const base = stainlessTexture(41, true, 186).image;
  ctx.drawImage(base, 0, 0, 256, 768);
  ctx.strokeStyle = 'rgba(40,40,44,0.8)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 244, 756);
  const cols = 3, rows = Math.ceil(floors / cols);
  const bw = 62, bh = Math.min(62, 470 / rows), x0 = 128 - (cols * bw) / 2, y0 = 120;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const button = (cx, cy, rad, label, ring = '#2a2c30') => {
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(cx, cy, rad + 4, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 1, cx, cy, rad);
    g.addColorStop(0, '#e9eaec');
    g.addColorStop(1, '#a8abb0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#26282c';
    ctx.font = `bold ${Math.round(rad * 0.95)}px Arial, sans-serif`;
    ctx.fillText(label, cx, cy + 1);
  };
  for (let i = 0; i < floors; i++) {
    const row = rows - 1 - Math.floor(i / cols), col = i % cols;
    button(x0 + col * bw + bw / 2, y0 + row * bh + bh / 2, Math.min(20, bh * 0.36), String(i + 1));
  }
  const yb = y0 + rows * bh + 40;
  button(84, yb, 22, '◀▶');
  button(172, yb, 22, '▶◀');
  // 비상 호출 (노란 종)
  ctx.fillStyle = '#2a2c30';
  ctx.beginPath(); ctx.arc(128, yb + 70, 28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8b81f';
  ctx.beginPath(); ctx.arc(128, yb + 70, 24, 0, Math.PI * 2); ctx.fill();
  // 종 모양
  ctx.fillStyle = '#2a2620';
  ctx.beginPath();
  ctx.moveTo(116, yb + 80);
  ctx.quadraticCurveTo(116, yb + 56, 128, yb + 56);
  ctx.quadraticCurveTo(140, yb + 56, 140, yb + 80);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(112, yb + 79, 32, 4);
  ctx.beginPath(); ctx.arc(128, yb + 86, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.font = '15px "Noto Sans KR", sans-serif';
  ctx.fillStyle = '#3a3c40';
  ctx.fillText('비상호출', 128, yb + 112);
  // 위쪽 작은 표시창 자리 (어둡게)
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(58, 30, 140, 56);
  return toTexture(c, false);
}

/** 정원·적재하중 표지판 */
export function capacityPlateTexture() {
  const [c, ctx] = canvas(256, 128);
  ctx.fillStyle = '#1d2a3c';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#c9ced6';
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, 246, 118);
  ctx.fillStyle = '#e8ebef';
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
  ctx.fillText('정원 15인', 128, 46);
  ctx.font = '20px "Noto Sans KR", sans-serif';
  ctx.fillText('적재하중 1,000 kg', 128, 78);
  ctx.font = '13px "Noto Sans KR", sans-serif';
  ctx.fillStyle = '#9fb0c6';
  ctx.fillText('승강기 안전인증 · 송신아파트', 128, 106);
  return toTexture(c, false);
}

/** 칸 바닥: 짙은 화강석 무늬 타일 */
export function carFloorTexture() {
  const [c, ctx] = canvas(256, 256);
  const r = rng(77);
  ctx.fillStyle = '#3a3836';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = 30 + r() * 90;
    ctx.fillStyle = `rgba(${v},${v - 2},${v - 4},0.5)`;
    ctx.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  ctx.strokeStyle = 'rgba(15,15,15,0.7)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);
  ctx.strokeRect(128, 0, 0.1, 256);
  ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 256); ctx.moveTo(0, 128); ctx.lineTo(256, 128); ctx.stroke();
  return toTexture(c, false);
}

/** 천장 조명: 격자 틀 + 젖빛 LED 판 */
export function carCeilingTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#2b2d30';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const g = ctx.createRadialGradient(42 + x * 86, 42 + y * 86, 4, 42 + x * 86, 42 + y * 86, 52);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#d9dde4');
      ctx.fillStyle = g;
      ctx.fillRect(8 + x * 86, 8 + y * 86, 70, 70);
    }
  }
  return toTexture(c, false);
}

/** 문턱 (홈이 파인 알루미늄) */
export function sillTexture() {
  const [c, ctx] = canvas(256, 32);
  ctx.fillStyle = '#9a9c9f';
  ctx.fillRect(0, 0, 256, 32);
  for (let y = 4; y < 32; y += 7) {
    ctx.fillStyle = '#3b3c3e';
    ctx.fillRect(0, y, 256, 3);
  }
  return toTexture(c);
}
