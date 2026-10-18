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
  const [c, ctx] = canvas(512, 512);
  const r = rng(7);
  ctx.fillStyle = '#77756f';
  ctx.fillRect(0, 0, 512, 512);
  const T = 64;
  for (let y = 0; y < 512; y += T) {
    for (let x = 0; x < 512; x += T) {
      const v = 196 + Math.floor(r() * 26);
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
      if (r() < 0.12) { // 깨진 타일
        ctx.strokeStyle = 'rgba(40,40,40,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        let px = x + r() * T, py = y + 2;
        ctx.moveTo(px, py);
        for (let i = 0; i < 4; i++) { px += (r() - 0.5) * 30; py += T / 4; ctx.lineTo(px, py); }
        ctx.stroke();
      }
    }
  }
  grime(ctx, 512, 512, r, 40, 0.35);
  // 아래로 흐른 얼룩
  for (let i = 0; i < 14; i++) {
    const x = r() * 512, len = 60 + r() * 300;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(30,25,20,0.25)');
    g.addColorStop(1, 'rgba(30,25,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, r() * 200, 2 + r() * 5, len);
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
  ctx.fillText('출입금지', 128, 152);
  ctx.font = '16px "Malgun Gothic", sans-serif';
  ctx.fillText('관계자 외', 128, 178);
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

/** 모든 층 엘리베이터 표시기가 공유하는 텍스처 */
export class IndicatorTexture {
  constructor() {
    const [c, ctx] = canvas(256, 128);
    this.canvas = c;
    this.ctx = ctx;
    this.texture = toTexture(c, false);
    this.last = '';
    this.draw('1', 0, false, false);
  }

  /** dir: 1 위, -1 아래, 0 정지 */
  draw(text, dir, err, red) {
    const key = `${text}|${dir}|${err}|${red}`;
    if (key === this.last) return;
    this.last = key;
    const ctx = this.ctx;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 122);
    const on = red ? '#ff3030' : '#43ff59';
    const off = '#1a1a1a';
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dir > 0 && !err ? on : off;
    ctx.fillText('▲', 46, 42);
    ctx.fillStyle = dir < 0 && !err ? on : off;
    ctx.fillText('▼', 46, 92);
    ctx.font = 'bold 76px "Courier New", monospace';
    ctx.fillStyle = err ? '#3a1010' : on;
    ctx.shadowColor = err ? 'transparent' : on;
    ctx.shadowBlur = 14;
    ctx.fillText(err ? 'Err' : text, 160, 68);
    ctx.shadowBlur = 0;
    this.texture.needsUpdate = true;
  }
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
