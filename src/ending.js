// 탈출 엔딩 — 옥상 문을 열고 나가면 펼쳐지는 새벽 풍경
// 계단실과는 완전히 다른 별도 장면: 해 뜨는 하늘, 아침 안개 속 도시, 구름, 새, 우리 아파트 옥상.
// 카메라는 계단 오두막 문간에서 난간 쪽으로 천천히 걸어 나가 해를 바라본다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const SUN_DIR = new THREE.Vector3(0.1, 0.12, 1).normalize(); // 지평선 바로 위의 해 (정면 +z)

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 해 뜨는 하늘 (방향에 따른 그라데이션 + 해 원반과 번짐) */
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uSun: { value: SUN_DIR.clone() }, uTime: { value: 0 }, uRise: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uSun; uniform float uTime, uRise; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        float s = max(dot(d, uSun), 0.0);
        vec3 zenith = vec3(0.13, 0.22, 0.42);
        vec3 mid = vec3(0.52, 0.55, 0.78);
        vec3 horizonWarm = vec3(1.25, 0.62, 0.32);
        vec3 horizonPink = vec3(0.95, 0.6, 0.62);
        vec3 horizon = mix(horizonPink, horizonWarm, pow(s, 3.0));
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, zenith, smoothstep(0.2, 0.75, h));
        // 지평선 아래 (먼 안개)
        col = mix(col, vec3(0.62, 0.5, 0.5), smoothstep(0.0, -0.08, h));
        // 해 번짐 + 원반 (밝게 — 블룸이 받아 준다)
        col += vec3(1.6, 0.85, 0.4) * pow(s, 24.0) * 0.9;
        col += vec3(1.2, 0.7, 0.4) * pow(s, 6.0) * 0.35;
        col += vec3(6.0, 4.6, 3.0) * smoothstep(0.99935, 0.99965, s);
        col *= 0.75 + 0.25 * uRise;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------- 도시 (실제 건물처럼)
// 외벽 텍스처 한 장 = 가로 BAYS 칸 × 세로 FLOORS 층. 건물 크기에 맞춰 UV를 늘려 창 크기를 실제 비율로 유지한다.
const BAYS = 8, TEX_FLOORS = 16;
const KINDS = {
  // 한국식 판상형 아파트: 베이지 외벽, 층마다 발코니 창과 난간 띠
  apt: { bay: 3.4, floor: 2.9, wall: '#d9d2c4', wall2: '#cfc6b6', glass: '#3c4656', frame: '#eeeae2', lit: 0.1 },
  // 유리 커튼월 오피스
  office: { bay: 3.0, floor: 3.8, wall: '#4f6577', wall2: '#5d7688', glass: '#2c3d4e', frame: '#8ea1ae', lit: 0.05 },
  // 오래된 상가·빌라
  old: { bay: 3.2, floor: 3.0, wall: '#9a8576', wall2: '#8d796b', glass: '#2e3238', frame: '#b8aa9c', lit: 0.08 },
};

function facadeTextures(kind) {
  const K = KINDS[kind];
  const W = 512, H = 1024, bw = W / BAYS, fh = H / TEX_FLOORS;
  const lit = [];
  const map = canvasTex(W, H, (ctx) => {
    ctx.fillStyle = K.wall;
    ctx.fillRect(0, 0, W, H);
    for (let f = 0; f < TEX_FLOORS; f++) {
      const y = f * fh;
      if (kind === 'office') {
        // 층 띠 + 유리 + 멀리언
        const g = ctx.createLinearGradient(0, y, 0, y + fh);
        g.addColorStop(0, '#6e8798');
        g.addColorStop(1, K.glass);
        ctx.fillStyle = g;
        ctx.fillRect(0, y + fh * 0.12, W, fh * 0.8);
        ctx.fillStyle = K.frame;
        ctx.fillRect(0, y, W, fh * 0.12);
        for (let b = 0; b <= BAYS * 2; b++) ctx.fillRect(b * (bw / 2) - 1, y, 2, fh);
      } else {
        // 층 슬래브 줄눈
        ctx.fillStyle = K.wall2;
        ctx.fillRect(0, y + fh - 6, W, 6);
        for (let b = 0; b < BAYS; b++) {
          const x = b * bw;
          if (kind === 'apt') {
            // 발코니 창 (넓게) + 난간 띠
            ctx.fillStyle = K.frame;
            ctx.fillRect(x + bw * 0.08, y + fh * 0.16, bw * 0.84, fh * 0.6);
            ctx.fillStyle = K.glass;
            ctx.fillRect(x + bw * 0.12, y + fh * 0.2, bw * 0.36, fh * 0.52);
            ctx.fillRect(x + bw * 0.52, y + fh * 0.2, bw * 0.36, fh * 0.52);
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(x + bw * 0.06, y + fh * 0.62, bw * 0.88, fh * 0.05);
          } else {
            ctx.fillStyle = K.frame;
            ctx.fillRect(x + bw * 0.25, y + fh * 0.22, bw * 0.5, fh * 0.5);
            ctx.fillStyle = K.glass;
            ctx.fillRect(x + bw * 0.29, y + fh * 0.26, bw * 0.42, fh * 0.42);
          }
        }
      }
      for (let b = 0; b < BAYS; b++) if (Math.random() < K.lit) lit.push([b, f]);
    }
    // 오염·얼룩 (빗물 자국)
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(40,35,30,${0.03 + Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 40 + Math.random() * 200);
    }
  }, true);
  // 새벽에도 불이 켜진 몇 집 (발광 맵)
  const emissive = canvasTex(W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    for (const [b, f] of lit) {
      const warm = kind === 'office' ? 'rgba(220,235,255,0.85)' : `rgba(255,${180 + Math.random() * 50},110,0.95)`;
      ctx.fillStyle = warm;
      if (kind === 'apt') ctx.fillRect(b * bw + bw * 0.12, f * fh + fh * 0.2, bw * 0.76, fh * 0.52);
      else if (kind === 'office') ctx.fillRect(b * bw, f * fh + fh * 0.14, bw, fh * 0.76);
      else ctx.fillRect(b * bw + bw * 0.29, f * fh + fh * 0.26, bw * 0.42, fh * 0.42);
    }
  }, true);
  for (const t of [map, emissive]) t.anisotropy = 8;
  return { map, emissive };
}

/** 상자 하나를 실제 크기에 맞는 UV 로 만든다 (옆면 = 외벽 텍스처, 윗면 = 지붕색 한 점) */
function buildingBox(w, h, d, kind, x, y, z, ry) {
  const K = KINDS[kind];
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const ou = Math.floor(Math.random() * BAYS) / BAYS, ov = Math.floor(Math.random() * TEX_FLOORS) / TEX_FLOORS;
  // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z (면마다 정점 4개)
  const faceW = [d, d, w, w, w, d];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      if (f === 2 || f === 3) {
        uv.setXY(idx, 0.001, 0.999); // 지붕·바닥: 외벽색 한 점
        continue;
      }
      const u0 = uv.getX(idx), v0 = uv.getY(idx);
      uv.setXY(idx, ou + (u0 * faceW[f]) / (K.bay * BAYS), ov + (v0 * h) / (K.floor * TEX_FLOORS));
    }
  }
  geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}

/** 한국 아파트 옆면에 크게 칠해진 동 번호 */
function blockNumberTexture(num) {
  return canvasTex(256, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(70,90,120,0.85)';
    ctx.font = 'bold 120px "Noto Sans KR", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), w / 2, h * 0.16);
    // 단지 로고 같은 띠
    ctx.fillStyle = 'rgba(120,150,110,0.7)';
    ctx.fillRect(w * 0.18, h * 0.3, w * 0.64, 10);
  });
}

function cloudTexture() {
  return canvasTex(256, 128, (ctx, w, h) => {
    for (let i = 0; i < 40; i++) {
      const x = w * (0.1 + Math.random() * 0.8), y = h * (0.35 + Math.random() * 0.3), r = 18 + Math.random() * 36;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

function birdTexture() {
  return canvasTex(64, 32, (ctx) => {
    ctx.strokeStyle = '#1b1a22';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(4, 10);
    ctx.quadraticCurveTo(18, 4, 32, 18);
    ctx.quadraticCurveTo(46, 4, 60, 10);
    ctx.stroke();
  });
}

export class Ending {
  constructor(concreteMap) {
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(0xb48a86, 60, 420);
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 900);
    scene.add(this.camera);

    // 하늘
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMaterial());
    scene.add(this.sky);

    // 빛: 낮게 깔린 아침 해 + 하늘빛
    const sun = new THREE.DirectionalLight(0xffc89a, 3.0);
    sun.position.copy(SUN_DIR).multiplyScalar(100);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xb7c4ea, 0x8a6a5a, 1.5));

    // 옥상 바닥과 난간벽
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xc4bdb4, roughness: 0.92, map: concreteMap || null });
    if (roofMat.map) {
      roofMat.map = roofMat.map.clone();
      roofMat.map.repeat.set(6, 6);
      roofMat.map.needsUpdate = true;
    }
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), roofMat);
    roof.rotation.x = -Math.PI / 2;
    roof.position.z = 6;
    scene.add(roof);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.9 });
    const parapet = (w, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.05, 0.25), wallMat);
      m.position.set(x, 0.52, z);
      m.rotation.y = ry;
      scene.add(m);
    };
    parapet(26, 0, 19, 0);
    parapet(26, -13, 6, Math.PI / 2);
    parapet(26, 13, 6, Math.PI / 2);
    // 난간 (가는 쇠파이프)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5, metalness: 0.7 });
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 26, 8), railMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 1.25, 18.9);
    scene.add(rail);
    for (let x = -12.5; x <= 12.5; x += 1.6) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 6), railMat);
      post.position.set(x, 1.12, 18.9);
      scene.add(post);
    }
    // 우리가 나온 계단실 오두막 (등 뒤)
    const hut = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3.4), wallMat);
    hut.position.set(0, 1.5, -1.9);
    scene.add(hut);
    // 물탱크와 안테나
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 20), new THREE.MeshStandardMaterial({ color: 0x5c6e7c, roughness: 0.6, metalness: 0.3 }));
    tank.position.set(-7.5, 1.6, 8);
    scene.add(tank);
    const legMat = railMat;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), legMat);
      leg.position.set(-7.5 + dx * 0.9, 0.2, 8 + dz * 0.9);
      scene.add(leg);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 7, 8), railMat);
    mast.position.set(8.5, 3.5, 11);
    scene.add(mast);
    // 빨래줄에 걸린 수건 하나 — 누군가 사는 곳
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardMaterial({ color: 0xd9c9a8, side: THREE.DoubleSide, roughness: 1 }));
    towel.position.set(5.2, 1.55, 6.5);
    towel.rotation.y = 0.5;
    scene.add(towel);
    this.towel = towel;

    // 아침 안개 속 도시 — 판상형 아파트 단지, 유리 오피스, 오래된 상가. 해 쪽으로는 강이 열려 있다.
    this.buildCity(scene);

    // 먼 산 능선
    const hillMat = new THREE.MeshBasicMaterial({ color: 0x6d5a70, fog: true });
    const sunA = Math.atan2(SUN_DIR.x, SUN_DIR.z);
    for (let i = 0; i < 9; i++) {
      const ang = (i / 8 - 0.5) * Math.PI * 1.5;
      if (Math.abs(ang - sunA) < 0.3) continue; // 해 뜨는 자리는 비워 둔다
      const hill = new THREE.Mesh(new THREE.ConeGeometry(120 + Math.random() * 120, 50 + Math.random() * 40, 6), hillMat);
      hill.position.set(Math.sin(ang) * 600, -40, Math.cos(ang) * 600);
      scene.add(hill);
    }

    // 구름 (해 쪽은 금빛으로 물든다)
    const cTex = cloudTexture();
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: cTex, transparent: true, depthWrite: false, fog: false, opacity: 0.55 + Math.random() * 0.3 });
      const ang = (Math.random() - 0.5) * Math.PI * 1.3;
      const warm = Math.max(0, Math.cos(ang - 0.12));
      mat.color.setRGB(1.0 + 0.5 * warm, 0.72 + 0.2 * warm, 0.7 + 0.05 * warm);
      const c = new THREE.Mesh(new THREE.PlaneGeometry(220 + Math.random() * 160, 60 + Math.random() * 30), mat);
      const dist = 520 + Math.random() * 150;
      c.position.set(Math.sin(ang) * dist, 70 + Math.random() * 120, Math.cos(ang) * dist);
      c.lookAt(0, c.position.y, 0);
      scene.add(c);
      this.clouds.push({ m: c, ang, dist, speed: 0.002 + Math.random() * 0.003 });
    }

    // 새 떼
    const bTex = birdTexture();
    this.birds = [];
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bTex, transparent: true, fog: false, depthWrite: false }));
      s.scale.set(1.6, 0.8, 1);
      scene.add(s);
      this.birds.push({ s, off: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 8), ph: Math.random() * 6 });
    }

    this.t = 0;
    this.look = new THREE.Vector3();
  }

  buildCity(scene) {
    const GROUND = -46; // 우리 옥상 아래 지면 높이
    const sunAng = Math.atan2(SUN_DIR.x, SUN_DIR.z);
    const parts = { apt: [], office: [], old: [] };
    const roofParts = [];
    this.beacons = [];
    const numbers = [];
    const place = (kind, dist, ang, w, d, h, ry) => {
      const x = Math.sin(ang) * dist, z = Math.cos(ang) * dist;
      parts[kind].push(buildingBox(w, h, d, kind, x, GROUND + h / 2, z, ry));
      // 옥상 설비 (기계실, 물탱크, 난간)
      const top = GROUND + h;
      const c = Math.cos(ry), s2 = Math.sin(ry);
      const rel = (lx, lz) => [x + lx * c + lz * s2, z - lx * s2 + lz * c];
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const bw = 2 + Math.random() * 5, bd = 2 + Math.random() * 4, bh = 1.5 + Math.random() * 3;
        const [rx, rz] = rel((Math.random() - 0.5) * (w - bw), (Math.random() - 0.5) * (d - bd));
        const g = new THREE.BoxGeometry(bw, bh, bd);
        g.rotateY(ry);
        g.translate(rx, top + bh / 2, rz);
        roofParts.push(g);
      }
      if (h > 70 && Math.random() < 0.7) {
        const [bx, bz] = rel(0, 0);
        const mast = new THREE.CylinderGeometry(0.25, 0.35, 8, 6);
        mast.translate(bx, top + 4, bz);
        roofParts.push(mast);
        this.beacons.push(new THREE.Vector3(bx, top + 8.3, bz));
      }
      return { x, z, top, w, d, ry };
    };
    const blocked = (ang, dist) => Math.abs(ang - sunAng) < 0.2 + 8 / dist; // 해 쪽 강 위로는 짓지 않는다

    // 1) 가까운 아파트 단지: 판상형 동들이 줄지어 (거의 남향)
    let num = 101;
    for (let row = 0; row < 3; row++) {
      for (let col = -6; col <= 6; col++) {
        const ang = col * 0.12 + (Math.random() - 0.5) * 0.04 + (row % 2) * 0.06;
        const dist = 125 + row * 48 + Math.random() * 12;
        if (blocked(ang, dist) || Math.random() < 0.15) continue;
        const floors = 12 + Math.floor(Math.random() * 10);
        const h = floors * KINDS.apt.floor + 3;
        const w = 40 + Math.random() * 25, d = 12;
        const b = place('apt', dist, ang, w, d, h, ang + (Math.random() - 0.5) * 0.08);
        if (row < 2 && numbers.length < 10) numbers.push({ ...b, num: num++ });
      }
    }
    // 2) 중간: 섞인 동네 (낮은 상가·빌라 + 가끔 오피스)
    for (let i = 0; i < 90; i++) {
      const ang = (Math.random() - 0.5) * Math.PI * 1.5;
      const dist = 60 + Math.random() * 240;
      if (blocked(ang, dist)) continue;
      if (dist < 140 && Math.abs(ang) < 0.75) continue; // 단지 자리
      const kind = Math.random() < 0.7 ? 'old' : 'office';
      const h = kind === 'old' ? 9 + Math.random() * 18 : 40 + Math.random() * 60;
      place(kind, dist, ang, 14 + Math.random() * 16, 12 + Math.random() * 14, h, ang + (Math.random() - 0.5) * 0.5);
    }
    // 3) 먼 도심: 높은 유리 빌딩들 (안개 속으로 흐려진다)
    for (let i = 0; i < 70; i++) {
      const ang = (Math.random() - 0.5) * Math.PI * 1.3;
      const dist = 300 + Math.random() * 260;
      if (blocked(ang, dist)) continue;
      const h = 70 + Math.pow(Math.random(), 1.6) * 170;
      const w = 22 + Math.random() * 20;
      place(Math.random() < 0.8 ? 'office' : 'apt', dist, ang, w, w * (0.7 + Math.random() * 0.5), h, ang + (Math.random() - 0.5) * 0.6);
    }

    for (const kind of Object.keys(parts)) {
      if (!parts[kind].length) continue;
      const tex = facadeTextures(kind);
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: kind === 'office' ? 0.6 : 1.2,
        roughness: kind === 'office' ? 0.35 : 0.85, metalness: kind === 'office' ? 0.35 : 0.0,
      });
      scene.add(new THREE.Mesh(mergeGeometries(parts[kind]), mat));
    }
    scene.add(new THREE.Mesh(mergeGeometries(roofParts), new THREE.MeshStandardMaterial({ color: 0x6d6a6a, roughness: 0.9 })));
    // 동 번호
    for (const b of numbers) {
      const mat = new THREE.MeshBasicMaterial({ map: blockNumberTexture(b.num), transparent: true, depthWrite: false, fog: true });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 20), mat);
      // 옆면(짧은 쪽) 바깥으로, 카메라 쪽 옆면을 고른다
      const side = Math.sign(-(b.x * Math.cos(b.ry) - b.z * Math.sin(b.ry))) || 1;
      const lx = side * (b.w / 2 + 0.05);
      m.position.set(b.x + lx * Math.cos(b.ry), b.top - 12, b.z - lx * Math.sin(b.ry));
      m.rotation.y = b.ry + side * Math.PI / 2;
      scene.add(m);
    }
    // 항공 장애등 (빨갛게 깜빡)
    const beaconMat = new THREE.SpriteMaterial({ color: 0xff2a1a, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.beaconSprites = this.beacons.map((p) => {
      const sp = new THREE.Sprite(beaconMat);
      sp.position.copy(p);
      sp.scale.setScalar(2.2);
      scene.add(sp);
      return sp;
    });
    this.beaconMat = beaconMat;
    // 지면과 해 쪽으로 흐르는 강
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x3d3638, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND - 0.1;
    scene.add(ground);
    const river = new THREE.Mesh(new THREE.PlaneGeometry(120, 1400), new THREE.MeshStandardMaterial({ color: 0xc89a8a, roughness: 0.15, metalness: 0.85 }));
    river.rotation.x = -Math.PI / 2;
    river.rotation.z = -sunAng;
    river.position.set(Math.sin(sunAng) * 700, GROUND, Math.cos(sunAng) * 700);
    scene.add(river);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    this.t = 0;
  }

  /** t: 엔딩이 시작된 뒤 지난 시간 */
  update(dt) {
    this.t += dt;
    const t = this.t;
    const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    // 계단실 문간 → 난간 쪽으로 몇 걸음 (발걸음에 맞춘 흔들림), 다 걸으면 숨 고르듯 아주 조금 흔들림
    const walk = ease(t / 8.5);
    const z = -0.2 + walk * 16.4;
    const stepPhase = t * 6.2;
    const moving = 1 - ease((t - 7.5) / 1.5);
    const bobY = Math.abs(Math.sin(stepPhase)) * 0.045 * moving;
    const sway = Math.sin(stepPhase * 0.5) * 0.03 * moving;
    this.camera.position.set(0.4 + sway + Math.sin(t * 0.3) * 0.05, 1.62 + bobY + Math.sin(t * 0.7) * 0.01, z);
    // 처음엔 눈부신 듯 아래를 보다가 서서히 고개를 들어 해와 하늘을 본다
    const lift = ease((t - 1) / 6);
    const target = this.look.set(SUN_DIR.x * 100 - 6 + lift * 6, -4 + lift * 18 + ease((t - 9) / 6) * 10, 100);
    this.camera.lookAt(target);
    this.camera.rotation.z += Math.sin(t * 0.4) * 0.004;

    this.sky.material.uniforms.uRise.value = ease(t / 14);
    this.sky.position.copy(this.camera.position);
    for (const c of this.clouds) {
      c.ang += c.speed * dt;
      c.m.position.x = Math.sin(c.ang) * c.dist;
      c.m.position.z = Math.cos(c.ang) * c.dist;
      c.m.lookAt(0, c.m.position.y, 0);
    }
    // 새 떼: 해 쪽 하늘을 가로질러 날아간다 (4초 뒤부터)
    const ft = Math.max(0, t - 4);
    const flock = new THREE.Vector3(-90 + ft * 9, 26 + Math.sin(ft * 0.3) * 4, 120 - ft * 1.5);
    for (const b of this.birds) {
      b.s.position.copy(flock).add(b.off);
      b.s.position.y += Math.sin(ft * 2 + b.ph) * 0.4;
      b.s.scale.y = 0.8 * (0.45 + 0.55 * Math.abs(Math.sin(ft * 7 + b.ph))); // 날갯짓
      b.s.visible = t > 4;
    }
    this.towel.rotation.y = 0.5 + Math.sin(t * 1.3) * 0.12; // 바람
    if (this.beaconMat) this.beaconMat.opacity = Math.sin(t * 3.2) > 0.2 ? 0.95 : 0.08;
  }
}
