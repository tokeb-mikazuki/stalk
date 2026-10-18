// 나선형 계단 타워 생성
import * as THREE from 'three';
import {
  TAU, TURNS, FLOOR_PHI, FLOORS, FLOOR_H, R_IN, R_OUT, LANDING, STAIR_ARC, STEPS, RISE,
  DOOR_ANGLE, FIREDOOR_ANGLE, SIGN_ANGLE, DOOR_HALF_W, FIRE_HALF_W, HOLE_H, ROOF_DOOR_PHI, R_MID,
  CORR_L, ROOM_D, ROOM_X0, ROOM_X1, ROOM_H,
  baseY, polar, fromRoomLocal,
} from './config.js';
import {
  tileTexture, concreteTexture, stepTexture, metalTexture, floorSignTexture,
  glitchSignTexture, fireDoorTexture, roofDoorTexture, startWallTexture,
  IndicatorTexture, paperTexture, glowTexture, exitSignTexture, normalMapFrom, roughnessMapFrom, callButtonTexture,
  stainlessTexture, carWallTexture, copTexture, capacityPlateTexture, carFloorTexture,
  carCeilingTexture, sillTexture,
} from './textures.js';

export let TOP_Y = 0;

const pol = (r, phi, y) => [r * Math.cos(phi), y, r * Math.sin(phi)];

class GeoBuilder {
  constructor() {
    this.pos = [];
    this.uv = [];
  }

  tri(a, b, c, ua, ub, uc) {
    this.pos.push(...a, ...b, ...c);
    this.uv.push(...ua, ...ub, ...uc);
  }

  quad(a, b, c, d, ua, ub, uc, ud) {
    this.tri(a, b, c, ua, ub, uc);
    this.tri(a, c, d, ua, uc, ud);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** start..end 를 step 간격으로 샘플링 (끝점 포함) */
function samples(start, end, step) {
  const n = Math.max(1, Math.ceil((end - start) / step));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(start + ((end - start) * i) / n);
  return out;
}

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function faceCenter(obj, r, phi, y) {
  obj.position.set(r * Math.cos(phi), y, r * Math.sin(phi));
  obj.lookAt(0, y, 0); // +Z 가 중앙(계단 쪽)을 향함, +X 는 각도가 커지는 방향
}

export function buildWorld(scene) {
  TOP_Y = (FLOORS - 1) * FLOOR_H + 3.6;
  const tex = {
    tile: tileTexture(),
    concrete: concreteTexture(96, 3),
    concreteDark: concreteTexture(62, 9),
    landing: concreteTexture(120, 15),
    roomWall: concreteTexture(110, 27),
    step: stepTexture(),
    metal: metalTexture(),
    glow: glowTexture(),
    steel: stainlessTexture(21, true, 168),
    sill: sillTexture(),
  };
  tex.sill.repeat.set(3, 1);
  tex.roomWall.repeat.set(2, 1);
  // 노멀맵/거칠기맵: 타일 줄눈이 움푹하고 타일 면은 광택이 돈다
  const nrm = {
    tile: normalMapFrom(tex.tile, 3.5),
    tileRough: roughnessMapFrom(tex.tile, 0.22, 0.95),
    concrete: normalMapFrom(tex.concrete, 2.5),
    concreteDark: normalMapFrom(tex.concreteDark, 2),
    landing: normalMapFrom(tex.landing, 2.5),
    roomWall: normalMapFrom(tex.roomWall, 2.5),
    step: normalMapFrom(tex.step, 3),
    metal: normalMapFrom(tex.metal, 1.2),
    steel: normalMapFrom(tex.steel, 0.5),
  };
  tex.normals = nrm;
  const ns = (v) => new THREE.Vector2(v, v);

  const mat = {
    step: new THREE.MeshStandardMaterial({ map: tex.step, normalMap: nrm.step, normalScale: ns(0.8), roughness: 0.92, side: THREE.DoubleSide }),
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, normalMap: nrm.concrete, normalScale: ns(0.7), roughness: 0.95, side: THREE.DoubleSide }),
    soffit: new THREE.MeshStandardMaterial({ map: tex.concreteDark, normalMap: nrm.concreteDark, normalScale: ns(0.6), roughness: 1, side: THREE.DoubleSide }),
    landing: new THREE.MeshStandardMaterial({ map: tex.landing, normalMap: nrm.landing, normalScale: ns(0.7), roughness: 0.9, side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ map: tex.tile, normalMap: nrm.tile, normalScale: ns(1.1), roughnessMap: nrm.tileRough, roughness: 1, metalness: 0.02, side: THREE.DoubleSide }),
    roomWall: new THREE.MeshStandardMaterial({ map: tex.roomWall, normalMap: nrm.roomWall, normalScale: ns(0.8), color: 0x9a968c, roughness: 0.95 }),
    stringer: new THREE.MeshStandardMaterial({ color: 0x8c8b86, roughness: 0.8, side: THREE.DoubleSide }),
    rail: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.45, metalness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ map: tex.metal, normalMap: nrm.metal, normalScale: ns(0.4), roughness: 0.38, metalness: 0.85 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x3b3c3e, roughness: 0.5, metalness: 0.7 }),
    // 헤어라인 스테인리스 (반사용 envMap 은 main 에서 렌더러로 만들어 붙인다)
    steel: new THREE.MeshStandardMaterial({ map: tex.steel, normalMap: nrm.steel, normalScale: ns(0.2), roughness: 0.28, metalness: 0.9, envMapIntensity: 0.3 }),
    sill: new THREE.MeshStandardMaterial({ map: tex.sill, roughness: 0.45, metalness: 0.8, envMapIntensity: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.8 }),
    // 문의 세로 유리창: 실제로 비쳐 보이는 어두운 청동빛 유리
    glass: new THREE.MeshStandardMaterial({ color: 0x8a8068, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    car: new THREE.MeshStandardMaterial({ map: tex.metal, color: 0x6a6a6a, roughness: 0.4, metalness: 0.6, side: THREE.BackSide }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4a3f33, roughness: 0.9 }),
    cardboard: new THREE.MeshStandardMaterial({ color: 0x5a5046, roughness: 1 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x5b5a55, roughness: 1 }),
  };

  const root = new THREE.Group();
  scene.add(root);

  // ---------- 계단 디딤판 + 챌판 ----------
  const steps = new GeoBuilder();
  const risers = new GeoBuilder();
  const dA = STAIR_ARC / STEPS;
  const width = R_OUT - R_IN;
  for (let k = 0; k < FLOORS - 1; k++) {
    for (let i = 0; i < STEPS; i++) {
      const a0 = k * FLOOR_PHI + LANDING + i * dA;
      const y = k * FLOOR_H + (i + 1) * RISE;
      const segs = 3;
      for (let s = 0; s < segs; s++) {
        const b0 = a0 + (s * dA) / segs, b1 = a0 + ((s + 1) * dA) / segs;
        const v0 = s / segs, v1 = (s + 1) / segs;
        steps.quad(
          pol(R_IN, b0, y), pol(R_OUT, b0, y), pol(R_OUT, b1, y), pol(R_IN, b1, y),
          [0, v0], [1, v0], [1, v1], [0, v1],
        );
      }
      risers.quad(
        pol(R_IN, a0, y - RISE), pol(R_OUT, a0, y - RISE), pol(R_OUT, a0, y), pol(R_IN, a0, y),
        [0, 0], [width / 2, 0], [width / 2, RISE / 2], [0, RISE / 2],
      );
    }
  }
  root.add(mesh(steps.build(), mat.step));

  // ---------- 계단참 ----------
  const landings = new GeoBuilder();
  for (let k = 0; k < FLOORS; k++) {
    const y = k * FLOOR_H;
    const a = samples(k * FLOOR_PHI, k * FLOOR_PHI + LANDING, 0.08);
    for (let j = 0; j < a.length - 1; j++) {
      const p = [pol(R_IN, a[j], y), pol(R_OUT, a[j], y), pol(R_OUT, a[j + 1], y), pol(R_IN, a[j + 1], y)];
      landings.quad(...p, ...p.map((q) => [q[0] / 2.5, q[2] / 2.5]));
    }
    if (k > 0) {
      risers.quad(
        pol(R_IN, k * FLOOR_PHI, y - 0.45), pol(R_OUT, k * FLOOR_PHI, y - 0.45), pol(R_OUT, k * FLOOR_PHI, y), pol(R_IN, k * FLOOR_PHI, y),
        [0, 0], [width / 2, 0], [width / 2, 0.2], [0, 0.2],
      );
    }
  }
  root.add(mesh(landings.build(), mat.landing));
  root.add(mesh(risers.build(), mat.concrete));

  // ---------- 하부 슬래브(소핏) + 안쪽 스트링거 ----------
  const soffit = new GeoBuilder();
  const stringer = new GeoBuilder();
  const S_IN = R_IN - 0.14;
  const phis = samples(0, ROOF_DOOR_PHI, 0.04);
  for (let j = 0; j < phis.length - 1; j++) {
    const p0 = phis[j], p1 = phis[j + 1];
    const y0 = baseY(p0), y1 = baseY(p1);
    const u0 = (p0 * R_IN) / 3, u1 = (p1 * R_IN) / 3;
    soffit.quad(
      pol(S_IN, p0, y0 - 0.45), pol(R_OUT, p0, y0 - 0.45), pol(R_OUT, p1, y1 - 0.45), pol(S_IN, p1, y1 - 0.45),
      [0, u0], [1, u0], [1, u1], [0, u1],
    );
    const top0 = y0 + 0.26, top1 = y1 + 0.26, bot0 = y0 - 0.52, bot1 = y1 - 0.52;
    for (const r of [R_IN, S_IN]) {
      stringer.quad(pol(r, p0, bot0), pol(r, p1, bot1), pol(r, p1, top1), pol(r, p0, top0), [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
    }
    stringer.quad(pol(S_IN, p0, top0), pol(R_IN, p0, top0), pol(R_IN, p1, top1), pol(S_IN, p1, top1), [u0, 0], [u0, 1], [u1, 1], [u1, 0]);
    stringer.quad(pol(S_IN, p0, bot0), pol(R_IN, p0, bot0), pol(R_IN, p1, bot1), pol(S_IN, p1, bot1), [u0, 0], [u0, 1], [u1, 1], [u1, 0]);
  }
  root.add(mesh(soffit.build(), mat.soffit));
  root.add(mesh(stringer.build(), mat.stringer));

  // ---------- 꼭대기: 마지막 한 바퀴 위를 덮는 경사 천장 + 계단 구멍 쪽 벽 ----------
  // 계단은 옥상 문에서 끝나므로 그 위로 이어질 계단이 없다. 그대로 두면 꼭대기 층 위가 텅 빈 원통처럼 보이므로,
  // 다음 계단이 있었다면 그 밑면이 있었을 자리(일정한 머리 높이)에 천장을 덮고, 난간 쪽은 벽으로 막는다.
  const yTop = (FLOORS - 1) * FLOOR_H;
  const headroom = TOP_Y - yTop;
  const capCeil = new GeoBuilder();
  const capWall = new GeoBuilder();
  const capPhis = samples(ROOF_DOOR_PHI - TAU, (FLOORS - 1) * FLOOR_PHI, 0.04);
  for (let j = 0; j < capPhis.length - 1; j++) {
    const p0 = capPhis[j], p1 = capPhis[j + 1];
    const y0 = Math.min(TOP_Y, baseY(p0) + headroom), y1 = Math.min(TOP_Y, baseY(p1) + headroom);
    const u0 = (p0 * R_IN) / 3, u1 = (p1 * R_IN) / 3;
    capCeil.quad(pol(S_IN, p0, y0), pol(R_OUT, p0, y0), pol(R_OUT, p1, y1), pol(S_IN, p1, y1),
      [0, u0], [1, u0], [1, u1], [0, u1]);
    if (TOP_Y - Math.min(y0, y1) > 0.01) {
      capWall.quad(pol(S_IN, p0, y0), pol(S_IN, p1, y1), pol(S_IN, p1, TOP_Y), pol(S_IN, p0, TOP_Y),
        [u0, y0 / 3], [u1, y1 / 3], [u1, TOP_Y / 3], [u0, TOP_Y / 3]);
    }
  }
  root.add(mesh(capCeil.build(), mat.soffit));
  root.add(mesh(capWall.build(), mat.soffit));

  // ---------- 난간 손잡이 + 난간살 ----------
  const RAIL_R = R_IN - 0.07;
  class RailCurve extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const phi = t * ROOF_DOOR_PHI;
      return polar(RAIL_R, phi, baseY(phi) + 1.02, target);
    }
  }
  const railGeo = new THREE.TubeGeometry(new RailCurve(), FLOORS * 110 * TURNS, 0.032, 6, false);
  root.add(mesh(railGeo, mat.rail));

  const balusterPhis = samples(0.02, ROOF_DOOR_PHI - 0.02, 0.19 / RAIL_R);
  const balGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 5);
  balGeo.translate(0, 0.5, 0);
  const balusters = new THREE.InstancedMesh(balGeo, mat.rail, balusterPhis.length);
  const m4 = new THREE.Matrix4();
  balusterPhis.forEach((phi, i) => {
    const y = baseY(phi);
    m4.makeScale(1, 0.78, 1).setPosition(RAIL_R * Math.cos(phi), y + 0.25, RAIL_R * Math.sin(phi));
    balusters.setMatrixAt(i, m4);
  });
  balusters.castShadow = true;
  balusters.receiveShadow = false;
  root.add(balusters);

  // ---------- 바깥 벽 (엘리베이터·비상문 개구부 포함) ----------
  const wall = new GeoBuilder();
  const holes = [
    { a: DOOR_ANGLE, h: DOOR_HALF_W / R_OUT },
    { a: FIREDOOR_ANGLE, h: FIRE_HALF_W / R_OUT },
  ];
  let angs = samples(0, TAU, TAU / 120).filter((a) => holes.every((hl) => Math.abs(a - hl.a) > hl.h + 0.004));
  for (const hl of holes) angs.push(hl.a - hl.h, hl.a + hl.h);
  angs = angs.sort((x, y) => x - y);
  const ys = [];
  for (let k = 0; k < FLOORS; k++) ys.push(k * FLOOR_H - 0.45, k * FLOOR_H, k * FLOOR_H + HOLE_H);
  ys.push(TOP_Y);
  const TS = (TAU * R_OUT) / 13; // 타일 텍스처 1장 크기 (이음새 없이 한 바퀴 13장)
  for (let j = 0; j < angs.length - 1; j++) {
    const a0 = angs[j], a1 = angs[j + 1];
    const isHole = holes.some((hl) => a0 >= hl.a - hl.h - 1e-6 && a1 <= hl.a + hl.h + 1e-6);
    for (let row = 0; row < ys.length - 1; row++) {
      if (isHole && row % 3 === 1) continue; // k*H ~ k*H+HOLE_H 구간 = 문
      const y0 = ys[row], y1 = ys[row + 1];
      const u0 = (a0 * R_OUT) / TS, u1 = (a1 * R_OUT) / TS;
      wall.quad(pol(R_OUT, a0, y0), pol(R_OUT, a1, y0), pol(R_OUT, a1, y1), pol(R_OUT, a0, y1),
        [u0, y0 / TS], [u1, y0 / TS], [u1, y1 / TS], [u0, y1 / TS]);
    }
  }
  root.add(mesh(wall.build(), mat.wall, { cast: false }));

  // ---------- 바닥 / 천장 / 천창 ----------
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R_OUT + 0.1, 48), mat.soffit);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  root.add(ground);

  const ceiling = new THREE.Mesh(new THREE.RingGeometry(1.4, R_OUT + 0.1, 48), mat.soffit);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = TOP_Y;
  root.add(ceiling);
  // 천창: 달빛이 비치는 젖빛 유리 + 철제 창살 (밋밋하게 하얀 원판이 아니도록)
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = skyCanvas.height = 256;
  const sc = skyCanvas.getContext('2d');
  const grad = sc.createRadialGradient(150, 110, 10, 128, 128, 140);
  grad.addColorStop(0, '#b9c3d6');
  grad.addColorStop(0.6, '#7f8aa0');
  grad.addColorStop(1, '#4a5263');
  sc.fillStyle = grad;
  sc.fillRect(0, 0, 256, 256);
  sc.strokeStyle = '#1c1f24';
  sc.lineWidth = 7;
  for (let i = 0; i <= 4; i++) {
    sc.beginPath(); sc.moveTo(i * 64, 0); sc.lineTo(i * 64, 256); sc.stroke();
    sc.beginPath(); sc.moveTo(0, i * 64); sc.lineTo(256, i * 64); sc.stroke();
  }
  sc.lineWidth = 14;
  sc.beginPath(); sc.arc(128, 128, 121, 0, Math.PI * 2); sc.stroke();
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skylight = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 32),
    new THREE.MeshBasicMaterial({ map: skyTex, color: new THREE.Color(0.62, 0.66, 0.74), fog: false }),
  );
  skylight.rotation.x = Math.PI / 2;
  skylight.position.y = TOP_Y + 0.01;
  root.add(skylight);
  const moon = new THREE.SpotLight(0xaab4c8, 10, 120, 0.42, 0.9, 0.5);
  moon.position.set(0, TOP_Y - 0.1, 0);
  moon.target.position.set(0, 0, 0);
  root.add(moon, moon.target);

  // 시작 지점 벽 (B1 폐쇄)
  const startWall = new GeoBuilder();
  const swTop = baseY(TAU) - 0.45; // 한 바퀴 위 계단 바로 아래까지
  startWall.quad(pol(S_IN, 0, -0.02), pol(R_OUT, 0, -0.02), pol(R_OUT, 0, swTop), pol(S_IN, 0, swTop),
    [0, 0], [1, 0], [1, 1], [0, 1]);
  root.add(mesh(startWall.build(), new THREE.MeshStandardMaterial({ map: startWallTexture(), roughness: 0.9, side: THREE.DoubleSide })));

  // ---------- 옥상 문 ----------
  const roof = buildRoofDoor(root, mat);

  // ---------- 층별 구조물 ----------
  const indicator = new IndicatorTexture();
  const indicatorMat = new THREE.MeshBasicMaterial({ map: indicator.texture, toneMapped: false });
  indicatorMat.color.setScalar(1.7);
  mat.panel = mat.steel; // 승강장 패널도 문과 같은 헤어라인 스테인리스
  mat.callTex = [callButtonTexture(1), callButtonTexture(-1)];
  const doorMats = {
    front: new THREE.MeshStandardMaterial({ map: fireDoorTexture(), roughness: 0.7, metalness: 0.3 }),
    back: new THREE.MeshStandardMaterial({ color: 0x41463f, roughness: 0.75, metalness: 0.3 }),
    exitOn: new THREE.MeshBasicMaterial({ map: exitSignTexture(true), toneMapped: false }),
    exitOff: new THREE.MeshBasicMaterial({ map: exitSignTexture(false) }),
  };
  doorMats.exitOn.color.setScalar(1.6);
  const glitchSign = glitchSignTexture();
  const elevators = [];
  const fireDoors = [];
  const signs = [];
  const lamps = [];
  const rand = mulberry(1234);

  for (let k = 0; k < FLOORS; k++) {
    const y = k * FLOOR_H;
    elevators.push(buildElevator(root, mat, indicatorMat, k));
    fireDoors.push(buildFireRoom(root, mat, doorMats, k, rand, lamps));

    // 층 번호 페인트
    const signTex = floorSignTexture(k + 1, k === FLOORS - 1);
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), signMat);
    faceCenter(sign, R_OUT - 0.02, SIGN_ANGLE, y + 1.5);
    root.add(sign);
    signs.push({ mesh: sign, mat: signMat, tex: signTex, glitch: glitchSign });

    // 벽등
    const lampAngle = SIGN_ANGLE + 0.02;
    const lampGroup = new THREE.Group();
    faceCenter(lampGroup, R_OUT, lampAngle, y + 3.1);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.14), mat.frame);
    base.position.z = 0.07;
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bulbMat);
    bulb.position.set(0, -0.07, 0.12);
    const cage = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111, wireframe: true }));
    cage.position.copy(bulb.position);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xffe9c0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.9);
    halo.position.copy(bulb.position);
    lampGroup.add(base, bulb, cage, halo);
    root.add(lampGroup);
    const roll = rand();
    const kind = k === 0 || k === FLOORS - 1 ? 'steady' : roll < 0.22 ? 'dead' : roll < 0.5 ? 'flicker' : 'steady';
    lamps.push({
      k, kind, bulbMat, halo, color: 0xffdcae, power: 2.4, room: false, tint: [1.4, 1.3, 1.1],
      pos: polar(R_OUT - 0.55, lampAngle, y + 2.95, new THREE.Vector3()),
      seed: rand() * 100, level: 1,
    });

    // 잡동사니
    if (k > 0) addClutter(root, mat, k, rand);
  }

  const car = buildCar(root, mat);

  return {
    root, mat, tex, elevators, fireDoors, signs, lamps, indicator, roof, doorMats, car,
    paperTex: [1, 2, 3, 4, 5, 6].map((s) => paperTexture(s * 13)),
  };
}

/**
 * 엘리베이터 문짝 한 장. withWindow 면 가운데에 세로 유리창이 실제로 뚫려 있다 (안팎이 비쳐 보인다).
 * 원점 = 문짝 가운데, 높이 h, 너비 w, 두께 d. 반환값은 Group (문 열림 애니메이션은 position.x 만 바꾼다)
 */
export function doorLeaf(w, h, d, steelMat, mat, withWindow, sealSide) {
  const leaf = new THREE.Group();
  const add = (bw, bh, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d), steelMat);
    m.position.set(x, y, 0);
    m.castShadow = m.receiveShadow = true;
    leaf.add(m);
  };
  if (!withWindow) add(w, h, 0, 0);
  else {
    const ww = 0.2, wh = 1.3, wy0 = 0.52 - h / 2; // 창: 너비 20cm, 높이 1.3m, 바닥에서 52cm 위부터
    const side = (w - ww) / 2;
    add(side, h, -w / 2 + side / 2, 0);
    add(side, h, w / 2 - side / 2, 0);
    add(ww, wy0 + h / 2, 0, (-h / 2 + wy0) / 2);
    const topH = h / 2 - (wy0 + wh);
    add(ww, topH, 0, h / 2 - topH / 2);
    // 창틀 안쪽 면 (두께가 보이도록) + 유리
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), mat.glass);
    glass.position.set(0, wy0 + wh / 2, 0);
    glass.renderOrder = 3;
    leaf.add(glass);
    const rim = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.5, metalness: 0.6 });
    for (const [bw, bh, x, y] of [[0.008, wh, -ww / 2, wy0 + wh / 2], [0.008, wh, ww / 2, wy0 + wh / 2], [ww, 0.008, 0, wy0], [ww, 0.008, 0, wy0 + wh]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d + 0.004), rim);
      r.position.set(x, y, 0);
      leaf.add(r);
    }
  }
  // 가운데(맞닿는 쪽) 고무 패킹
  const seal = new THREE.Mesh(new THREE.BoxGeometry(0.008, h - 0.02, d + 0.002), mat.rubber);
  seal.position.set(sealSide * (w / 2 - 0.004), 0, 0);
  leaf.add(seal);
  return leaf;
}

function buildElevator(root, mat, indicatorMat, k) {
  const y = k * FLOOR_H;
  const g = new THREE.Group();
  faceCenter(g, R_OUT, DOOR_ANGLE, y);
  const hw = DOOR_HALF_W;
  const H = 2.28; // 문 높이
  // 스테인리스 문틀: 양옆 기둥 + 위 머리판(조금 두툼하게), 벽면보다 살짝 튀어나옴
  const jambW = 0.09, jambD = 0.05;
  const pl = new THREE.Mesh(new THREE.BoxGeometry(jambW, H + 0.2, jambD), mat.steel);
  pl.position.set(-hw - jambW / 2, (H + 0.2) / 2, jambD / 2);
  const pr = pl.clone();
  pr.position.x = hw + jambW / 2;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + jambW * 2, 0.2, jambD), mat.steel);
  lintel.position.set(0, H + 0.1, jambD / 2);
  // 개구부 안쪽 면(리턴): 문틀이 벽 두께만큼 꺾여 들어간다
  const returns = new THREE.Group();
  for (const sx of [-1, 1]) {
    const rt = new THREE.Mesh(new THREE.PlaneGeometry(0.16, H), mat.steel);
    rt.rotation.y = -sx * Math.PI / 2;
    rt.position.set(sx * hw, H / 2, -0.08);
    returns.add(rt);
  }
  const rtTop = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 0.16), mat.steel);
  rtTop.rotation.x = Math.PI / 2;
  rtTop.position.set(0, H, -0.08);
  returns.add(rtTop);
  // 문턱: 홈이 파인 알루미늄
  const sill = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.06, 0.02, 0.2), mat.sill);
  sill.position.set(0, 0.01, -0.02);
  // 문짝: 헤어라인 스테인리스 + 가운데 고무 패킹. 오른쪽 문짝에는 세로 유리창 (안이 비쳐 보인다)
  const left = doorLeaf(hw, H, 0.035, mat.steel, mat, false, 1);
  const right = doorLeaf(hw, H, 0.035, mat.steel, mat, true, -1);
  left.position.set(-hw / 2, H / 2, -0.03);
  right.position.set(hw / 2, H / 2, -0.03);
  for (const m of [pl, pr, lintel, sill]) { m.castShadow = true; m.receiveShadow = true; }

  // 문 오른쪽 승강장 패널: 스테인리스 판 + 빨간 LED 표시기 + ▲▼ 호출 버튼
  const px = hw + 0.36;
  const wallZ = R_OUT - Math.sqrt(R_OUT * R_OUT - px * px); // 곡면 벽 위치
  const panel = new THREE.Group();
  panel.position.set(px, 0, wallZ);
  panel.rotation.y = -Math.asin(px / R_OUT);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.6, 0.018), mat.panel);
  plate.position.set(0, 1.28, 0.009);
  plate.castShadow = plate.receiveShadow = true;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.165), indicatorMat);
  screen.position.set(0, 1.45, 0.0215);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.124, 0.18, 0.004), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.15, metalness: 0.2 }));
  bezel.position.set(0, 1.45, 0.017);
  panel.add(plate, bezel, screen);
  const ringGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.01, 24);
  ringGeo.rotateX(Math.PI / 2);
  const faceGeo = new THREE.CircleGeometry(0.02, 24);
  const buttons = [];
  for (const [dir, y] of [[1, 1.2], [-1, 1.115]]) {
    if (dir > 0 && k === FLOORS - 1) continue; // 꼭대기 층: ▼만
    if (dir < 0 && k === 0) continue;          // 1층: ▲만
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xbfc2c4, roughness: 0.25, metalness: 0.95, emissive: 0x000000 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, k === 0 || k === FLOORS - 1 ? 1.16 : y, 0.022);
    const faceMat = new THREE.MeshBasicMaterial({ map: mat.callTex[dir > 0 ? 0 : 1] });
    faceMat.color.setScalar(0.75);
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.set(0, ring.position.y, 0.0275);
    panel.add(ring, face);
    buttons.push({ dir, ringMat, faceMat, ring, face, z0: ring.position.z, fz0: face.position.z });
  }
  g.add(panel);
  const setCall = (on) => {
    for (const b of buttons) {
      b.ringMat.emissive.setHex(on ? 0xff2a10 : 0x000000);
      b.ringMat.emissiveIntensity = on ? 2.2 : 0;
      b.faceMat.color.setRGB(on ? 1.6 : 0.75, on ? 0.45 : 0.75, on ? 0.35 : 0.75);
    }
  };

  // 버튼을 누르면 쏙 들어갔다가 다시 나온다
  const PRESS = 0.32;
  let pressT = 0, pressed = null;
  const press = () => {
    pressed = buttons.find((b) => b.dir > 0) || buttons[0];
    pressT = PRESS;
  };
  const tickButtons = (dt) => {
    if (pressT <= 0 || !pressed) return;
    pressT = Math.max(0, pressT - dt);
    const ph = 1 - pressT / PRESS;
    const depth = (ph < 0.3 ? ph / 0.3 : Math.max(0, 1 - (ph - 0.3) / 0.7)) * 0.007;
    pressed.ring.position.z = pressed.z0 - depth;
    pressed.face.position.z = pressed.fz0 - depth;
  };

  g.add(pl, pr, lintel, returns, sill, left, right);
  root.add(g);
  g.updateMatrixWorld(true);
  return {
    k, group: g, left, right, setCall, press, tickButtons, open: 0, target: 0,
    doorPos: polar(R_OUT - 0.2, DOOR_ANGLE, y + 1.2, new THREE.Vector3()),
    buttonPos: g.localToWorld(new THREE.Vector3(px, 1.2, wallZ + 0.05)),
  };
}

/** 실제로 오르내리는 엘리베이터 칸 (밝은 실내) */
export function buildCar(root, mat) {
  const g = new THREE.Group();
  faceCenter(g, R_OUT, DOOR_ANGLE, 0);
  // 칸 안: 이음매로 나뉜 스테인리스 벽 (밝은 실내), 뒷벽 위쪽은 거울처럼 매끈한 판
  const wallTex = carWallTexture();
  const steelIn = new THREE.MeshStandardMaterial({
    map: wallTex, roughness: 0.3, metalness: 0.85, envMapIntensity: 0.9, side: THREE.BackSide, emissive: 0x1d1f22,
  });
  mat.carSteel = steelIn;
  // 앞면(+z, 승강장 쪽)은 비워 두고 문 구멍이 난 앞벽을 따로 세운다 — 문이 열리면 바깥 계단참이 보이도록
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.6, metalness: 0.5, side: THREE.BackSide });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 1.5), [steelIn, steelIn, ceilMat, hidden, hidden, steelIn]);
  box.position.set(0, 1.2, -0.8);
  box.receiveShadow = true;
  const front = new THREE.MeshStandardMaterial({ map: mat.steel.map, normalMap: mat.steel.normalMap, roughness: 0.3, metalness: 0.85, envMapIntensity: 0.9, emissive: 0x1d1f22 });
  mat.carFront = front;
  const sideW = 0.75 - DOOR_HALF_W;
  for (const sx of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.PlaneGeometry(sideW, 2.4), front);
    jamb.rotation.y = Math.PI; // 칸 안쪽을 바라봄
    jamb.position.set(sx * (DOOR_HALF_W + sideW / 2), 1.2, -0.05);
    g.add(jamb);
  }
  const header = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.4 - HOLE_H), front);
  header.rotation.y = Math.PI;
  header.position.set(0, (2.4 + HOLE_H) / 2, -0.05);
  g.add(header);
  // 뒷벽 거울 (매끈한 스테인리스, 가장자리 틀)
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.06, metalness: 1, envMapIntensity: 1.2 });
  mat.carMirror = mirrorMat;
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.15), mirrorMat);
  mirror.position.set(0, 1.55, -1.545);
  const mFrame = new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.21, 0.01), new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.4, metalness: 0.8 }));
  mFrame.position.set(0, 1.55, -1.551);
  // 바닥 (짙은 화강석 타일)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshStandardMaterial({ map: carFloorTexture(), roughness: 0.35, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.005, -0.8);
  // 천장: 격자 틀 안의 LED 판 (환하게)
  const lightMat = new THREE.MeshBasicMaterial({ map: carCeilingTexture() });
  lightMat.color.setScalar(2.4);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), lightMat);
  panel.rotation.x = Math.PI / 2;
  panel.position.set(0, 2.39, -0.8);
  // 손잡이: 양옆 + 뒤, 둥근 스테인리스 파이프와 받침
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.18, metalness: 1, envMapIntensity: 1 });
  mat.carRail = railMat;
  const rails = new THREE.Group();
  const pipe = (len, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 12), railMat);
    m.rotation.set(Math.PI / 2, 0, 0);
    const holder = new THREE.Group();
    holder.add(m);
    holder.position.set(x, 0.92, z);
    holder.rotation.y = ry;
    for (const e of [-len / 2 + 0.06, len / 2 - 0.06]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6), railMat);
      post.rotation.x = Math.PI / 2;
      post.position.set(0, 0, e);
      const arm = new THREE.Group();
      arm.add(post);
      arm.rotation.y = Math.PI / 2;
      arm.position.set(0, 0, e);
      holder.add(arm);
    }
    rails.add(holder);
  };
  pipe(1.2, 0.69, -0.85, 0);
  pipe(1.2, -0.69, -0.85, 0);
  pipe(1.1, 0, -1.49, Math.PI / 2);
  // 조작반 (오른쪽 앞): 층 버튼·열림/닫힘·비상 호출이 그려진 스테인리스 판 + 작은 표시창
  const cop = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.78), new THREE.MeshStandardMaterial({
    map: copTexture(FLOORS), roughness: 0.32, metalness: 0.7, envMapIntensity: 0.8, emissive: 0x1a1a1a,
  }));
  cop.rotation.y = -Math.PI / 2;
  cop.position.set(0.744, 1.18, -0.32);
  const btnMat = new THREE.MeshBasicMaterial({ color: 0x3a3a2a });
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.05), btnMat); // 고장난 표시창 (누르면 깜빡)
  display.rotation.y = -Math.PI / 2;
  display.position.set(0.742, 1.18 + 0.39 - 0.07, -0.32);
  // 정원 표지판
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshStandardMaterial({ map: capacityPlateTexture(), roughness: 0.5 }));
  plate.rotation.y = -Math.PI / 2;
  plate.position.set(0.744, 1.75, -0.32);
  // 천장 모서리의 돔 카메라
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.1, metalness: 0.4 }));
  dome.rotation.x = Math.PI;
  dome.position.set(-0.62, 2.38, -1.42);
  // 칸 자체의 안쪽 문 (승강장 문과 함께 열림): 같은 스테인리스, 오른쪽 문짝에 승강장 문과 겹치는 유리창
  const left = doorLeaf(0.6, 2.28, 0.03, front, mat, false, 1);
  const right = doorLeaf(0.6, 2.28, 0.03, front, mat, true, -1);
  left.position.set(-0.3, 1.14, -0.09);
  right.position.set(0.3, 1.14, -0.09);
  // 문턱
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.12), mat.sill);
  sill.position.set(0, 0.01, -0.1);
  const light = new THREE.PointLight(0xf2f6ff, 0, 5, 1.4);
  light.position.set(0, 2.1, -0.8);
  g.add(box, floor, panel, mirror, mFrame, rails, cop, display, plate, dome, sill, left, right, light);
  root.add(g);
  return { group: g, left, right, light, lightMat, btnMat, panelLocal: new THREE.Vector3(0.72, 1.2, -0.32) };
}

/** 비상문 + 그 뒤의 복도와 방 (숨을 수 있는 공간) */
function buildFireRoom(root, mat, doorMats, k, rand, lamps) {
  const y = k * FLOOR_H;
  const g = new THREE.Group();
  faceCenter(g, R_OUT, FIREDOOR_ANGLE, y);
  const hw = FIRE_HALF_W;

  // 문틀
  const pl = box(0.1, HOLE_H + 0.06, 0.16, mat.frame, -hw - 0.04, (HOLE_H + 0.06) / 2, 0.02);
  const pr = box(0.1, HOLE_H + 0.06, 0.16, mat.frame, hw + 0.04, (HOLE_H + 0.06) / 2, 0.02);
  const lintel = box(hw * 2 + 0.2, 0.14, 0.16, mat.frame, 0, HOLE_H, 0.02);
  // 비상구 표시등
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), doorMats.exitOff);
  exitSign.position.set(0, HOLE_H + 0.24, 0.06);

  // 여닫이 문 (경첩: 왼쪽, 안쪽으로 열림)
  const hinge = new THREE.Group();
  hinge.position.set(-hw + 0.02, 0, -0.01);
  const doorGeo = new THREE.BoxGeometry(hw * 2 - 0.04, HOLE_H - 0.04, 0.05);
  doorGeo.translate(hw - 0.02, (HOLE_H - 0.04) / 2, 0);
  const door = new THREE.Mesh(doorGeo, [mat.frame, mat.frame, mat.frame, mat.frame, doorMats.front, doorMats.back]);
  door.castShadow = door.receiveShadow = true;
  hinge.add(door);

  // 복도
  const L = CORR_L;
  const cw = hw * 2;
  const parts = [
    box(cw + 0.2, 0.1, L + 0.1, mat.roomWall, 0, -0.05, -L / 2),                  // 바닥
    box(cw + 0.2, 0.1, L + 0.1, mat.roomWall, 0, HOLE_H + 0.05, -L / 2),          // 천장
    box(0.1, HOLE_H, L, mat.roomWall, -hw - 0.05, HOLE_H / 2, -L / 2),             // 좌벽
    box(0.1, HOLE_H, L, mat.roomWall, hw + 0.05, HOLE_H / 2, -L / 2),              // 우벽
  ];
  // 방
  const W = ROOM_X1 - ROOM_X0, cx = (ROOM_X0 + ROOM_X1) / 2, cz = -L - ROOM_D / 2, back = -L - ROOM_D;
  parts.push(
    box(W + 0.2, 0.1, ROOM_D + 0.2, mat.roomWall, cx, -0.05, cz),
    box(W + 0.2, 0.1, ROOM_D + 0.2, mat.roomWall, cx, ROOM_H + 0.05, cz),
    box(W + 0.2, ROOM_H, 0.1, mat.roomWall, cx, ROOM_H / 2, back - 0.05),
    box(0.1, ROOM_H, ROOM_D, mat.roomWall, ROOM_X0 - 0.05, ROOM_H / 2, cz),
    box(0.1, ROOM_H, ROOM_D, mat.roomWall, ROOM_X1 + 0.05, ROOM_H / 2, cz),
    box(-hw - ROOM_X0, ROOM_H, 0.1, mat.roomWall, (ROOM_X0 - hw) / 2, ROOM_H / 2, -L + 0.05),
    box(ROOM_X1 - hw, ROOM_H, 0.1, mat.roomWall, (ROOM_X1 + hw) / 2, ROOM_H / 2, -L + 0.05),
    box(cw, ROOM_H - HOLE_H, 0.1, mat.roomWall, 0, (ROOM_H + HOLE_H) / 2, -L + 0.05),
  );

  // 방 안 가구 (숨을 곳 같은 분위기)
  const shelf = new THREE.Group();
  for (let i = 0; i < 4; i++) shelf.add(box(1.6, 0.04, 0.45, mat.metal, 0, 0.3 + i * 0.55, 0));
  for (const sx of [-0.78, 0.78]) for (const sz of [-0.2, 0.2]) shelf.add(box(0.04, 2.0, 0.04, mat.frame, sx, 1.0, sz));
  for (let i = 0; i < 5; i++) {
    const s = 0.22 + rand() * 0.2;
    shelf.add(box(s, s * 0.8, s, mat.cardboard, -0.6 + rand() * 1.2, 0.32 + Math.floor(rand() * 4) * 0.55 + s * 0.4, 0));
  }
  shelf.position.set(ROOM_X0 + 2.5, 0, back + 0.3);
  parts.push(shelf);
  if (rand() < 0.6) {
    const bed = box(0.9, 0.18, 1.9, mat.cloth, ROOM_X0 + 0.5, 0.09, cz - 0.3);
    bed.rotation.y = (rand() - 0.5) * 0.08;
    parts.push(bed);
  } else {
    const desk = new THREE.Group();
    desk.add(box(1.2, 0.05, 0.6, mat.wood, 0, 0.75, 0));
    for (const dx of [-0.55, 0.55]) for (const dz of [-0.25, 0.25]) desk.add(box(0.05, 0.75, 0.05, mat.frame, dx, 0.375, dz));
    desk.position.set(ROOM_X0 + 0.4, 0, cz);
    desk.rotation.y = Math.PI / 2;
    parts.push(desk);
  }
  for (let i = 0; i < 3; i++) {
    const s = 0.3 + rand() * 0.3;
    const b = box(s, s * 0.8, s * 1.1, mat.cardboard, ROOM_X0 + 0.35 + rand() * 0.4, s * 0.4, -L - 0.45 - rand() * 0.5);
    b.rotation.y = rand() * Math.PI;
    parts.push(b);
  }

  // 복도 벽의 CCTV 모니터 (문 앞 계단참을 비춤)
  // 모니터는 방 안쪽 오른쪽 벽 (문과 충분히 떨어뜨려 조작 실수 방지)
  const monZ = cz + 0.3;
  const monitor = box(0.06, 0.34, 0.46, mat.frame, ROOM_X1 - 0.03, 1.5, monZ);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x0a0f0c });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), screenMat);
  screen.position.set(ROOM_X1 - 0.064, 1.5, monZ);
  screen.rotation.y = -Math.PI / 2;
  const monTable = box(0.36, 0.72, 0.62, mat.wood, ROOM_X1 - 0.18, 0.36, monZ);
  // 모니터 옆 대기 표시등 (어둠 속에서 모니터 위치를 알려줌)
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x4080ff });
  const led = box(0.02, 0.03, 0.03, ledMat, ROOM_X1 - 0.06, 1.3, monZ + 0.18);
  led.castShadow = false;
  // 방 안쪽에서 보이는 비상구 표시등 (출구 위)
  const exitIn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), doorMats.exitOn);
  exitIn.position.set(0, HOLE_H + 0.27, -L - 0.012);
  exitIn.rotation.y = Math.PI;
  parts.push(monTable, led, exitIn);
  // 문 위 왼쪽에 달린 CCTV 카메라: 문 앞과 엘리베이터 쪽 계단참을 함께 비춘다
  const camBox = box(0.12, 0.1, 0.18, mat.frame, -hw - 0.3, HOLE_H + 0.42, 0.12);
  const recMat = new THREE.MeshBasicMaterial({ color: 0x550000 });
  const rec = box(0.02, 0.02, 0.02, recMat, -hw - 0.3, HOLE_H + 0.42, 0.22);
  parts.push(monitor, screen, camBox, rec);

  // 방 비상등 (붉은 빛)
  const lampLocal = new THREE.Vector3(cx, ROOM_H - 0.12, cz + 0.6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xff4030 });
  const bulb = box(0.3, 0.06, 0.12, bulbMat, lampLocal.x, lampLocal.y, lampLocal.z);
  bulb.castShadow = false;
  parts.push(bulb);

  g.add(pl, pr, lintel, exitSign, hinge, ...parts);
  root.add(g);
  g.updateMatrixWorld(true);

  const lampWorld = g.localToWorld(lampLocal.clone()).setY(y + ROOM_H - 0.4);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff3020, transparent: true, opacity: 0, depthWrite: false }));
  halo.visible = false;
  const roomLamp = {
    k, kind: rand() < 0.25 ? 'flicker' : 'steady', bulbMat, halo, color: 0xff3828, power: 3.4, room: true, tint: [1.6, 0.25, 0.2],
    pos: lampWorld, seed: rand() * 100, level: 1,
  };
  lamps.push(roomLamp);
  // 모니터 쪽 푸른 보조등 + 출구 쪽 초록 보조등
  const noHalo = () => { const h = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0 })); h.visible = false; return h; };
  lamps.push({
    k, kind: 'steady', bulbMat: ledMat, halo: noHalo(), color: 0x7fa8ff, power: 1.3, room: true, tint: [0.4, 0.8, 1.8],
    pos: g.localToWorld(new THREE.Vector3(ROOM_X1 - 0.6, 1.9, monZ)), seed: rand() * 100, level: 1,
  });
  lamps.push({
    k, kind: 'steady', bulbMat: doorMats.exitOn, halo: noHalo(), color: 0x3cff7a, power: 0.9, room: true, tint: null,
    pos: g.localToWorld(new THREE.Vector3(0, HOLE_H + 0.1, -L - 0.4)), seed: rand() * 100, level: 1,
  });

  const handle = fromRoomLocal(0, 0);
  return {
    k, group: g, hinge, exitSign, open: 0, target: 0, locked: false,
    pos: new THREE.Vector3(handle.x, y + 1.05, handle.z),
    lamp: roomLamp,
    screen, screenMat, recMat,
    monitorPos: g.localToWorld(new THREE.Vector3(ROOM_X1 - 0.08, 1.5, monZ)),
    tablePos: g.localToWorld(new THREE.Vector3(ROOM_X1 - 0.2, 0.73, monZ - 0.18)), // 모니터 책상 위 (배터리 비치)
    cctvPos: g.localToWorld(new THREE.Vector3(-hw - 0.3, HOLE_H + 0.32, 0.32)),
    cctvTarget: g.localToWorld(new THREE.Vector3(1.3, 0.55, 2.4)),
  };
}

function buildRoofDoor(root, mat) {
  const phi = ROOF_DOOR_PHI;
  const y = (FLOORS - 1) * FLOOR_H;
  const u = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
  const t = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi));
  const up = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4().makeBasis(u, up, t);

  const holeR0 = R_MID - 0.52, holeR1 = R_MID + 0.52, holeH = 2.2;
  const wall = new GeoBuilder();
  const P = (r, yy) => [r * u.x, yy, r * u.z];
  const top = TOP_Y;
  const quadR = (r0, r1, y0, y1) => wall.quad(P(r0, y0), P(r1, y0), P(r1, y1), P(r0, y1), [r0, y0], [r1, y0], [r1, y1], [r0, y1]);
  quadR(R_IN - 0.14, holeR0, y - 0.45, top);
  quadR(holeR1, R_OUT, y - 0.45, top);
  quadR(holeR0, holeR1, y + holeH, top);
  quadR(holeR0, holeR1, y - 0.45, y);
  root.add(mesh(wall.build(), mat.concrete));

  // 문 뒤 바깥 빛
  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 2.4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.52, 0.58), fog: false }),
  );
  outside.position.copy(u).multiplyScalar(R_MID).add(t.clone().multiplyScalar(0.6));
  outside.position.y = y + 1.1;
  outside.quaternion.setFromRotationMatrix(basis);
  outside.rotateY(Math.PI);
  root.add(outside);

  const pivot = new THREE.Group();
  pivot.position.copy(u).multiplyScalar(holeR0);
  pivot.position.y = y;
  pivot.position.add(t.clone().multiplyScalar(-0.04));
  pivot.quaternion.setFromRotationMatrix(basis);
  const doorGeo = new THREE.BoxGeometry(1.04, holeH, 0.06);
  doorGeo.translate(0.52, holeH / 2, 0);
  const door = new THREE.Mesh(doorGeo, new THREE.MeshStandardMaterial({ map: roofDoorTexture(), roughness: 0.6, metalness: 0.5 }));
  door.castShadow = door.receiveShadow = true;
  // 방향은 pivot, 여닫이 회전은 hinge(로컬 Y축)
  const hinge = new THREE.Group();
  hinge.add(door);
  pivot.add(hinge);
  root.add(pivot);
  return {
    pivot: hinge, outside, open: 0, target: 0,
    pos: new THREE.Vector3().copy(u).multiplyScalar(R_MID).setY(y + 1.1),
  };
}

function addClutter(root, mat, k, rand) {
  const y = k * FLOOR_H;
  const n = Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.25 + rand() * 0.3;
    const a = 0.75 + rand() * 0.45;
    if (Math.abs(a - DOOR_ANGLE) < 0.2) continue;
    const b = box(s, s * 0.8, s * 1.1, mat.cardboard, (R_OUT - 0.35) * Math.cos(a), y + s * 0.4, (R_OUT - 0.35) * Math.sin(a));
    b.rotation.y = rand() * Math.PI;
    root.add(b);
  }
  if (rand() < 0.3) {
    // 넘어진 의자
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), mat.frame);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.04), mat.frame);
    back.position.set(0, 0.22, -0.2);
    chair.add(seat, back);
    const a = LANDING - 0.1;
    chair.position.set((R_OUT - 0.6) * Math.cos(a), y + 0.22, (R_OUT - 0.6) * Math.sin(a));
    chair.rotation.set(Math.PI / 2.2, rand() * 3, 0.3);
    chair.traverse((o) => { o.castShadow = true; });
    root.add(chair);
  }
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
