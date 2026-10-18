// 나선형 계단 타워 생성
import * as THREE from 'three';
import {
  TAU, FLOORS, FLOOR_H, R_IN, R_OUT, LANDING, STAIR_ARC, STEPS, RISE,
  DOOR_ANGLE, FIREDOOR_ANGLE, SIGN_ANGLE, DOOR_HALF_W, ROOF_DOOR_PHI, R_MID,
  baseY, polar,
} from './config.js';
import {
  tileTexture, concreteTexture, stepTexture, metalTexture, floorSignTexture,
  glitchSignTexture, fireDoorTexture, roofDoorTexture, startWallTexture,
  IndicatorTexture, paperTexture, glowTexture,
} from './textures.js';

export const TOP_Y = (FLOORS - 1) * FLOOR_H + 3.4;

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

/** 0..end 를 step 간격으로 샘플링 (끝점 포함) */
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

function faceCenter(obj, r, phi, y) {
  obj.position.set(r * Math.cos(phi), y, r * Math.sin(phi));
  obj.lookAt(0, y, 0); // +Z 가 중앙(계단 쪽)을 향함
}

export function buildWorld(scene) {
  const tex = {
    tile: tileTexture(),
    concrete: concreteTexture(96, 3),
    concreteDark: concreteTexture(62, 9),
    landing: concreteTexture(120, 15),
    step: stepTexture(),
    metal: metalTexture(),
    glow: glowTexture(),
  };
  tex.landing.repeat.set(1, 1);

  const mat = {
    step: new THREE.MeshStandardMaterial({ map: tex.step, roughness: 0.92, side: THREE.DoubleSide }),
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95, side: THREE.DoubleSide }),
    soffit: new THREE.MeshStandardMaterial({ map: tex.concreteDark, roughness: 1, side: THREE.DoubleSide }),
    landing: new THREE.MeshStandardMaterial({ map: tex.landing, roughness: 0.9, side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ map: tex.tile, roughness: 0.55, side: THREE.DoubleSide }),
    stringer: new THREE.MeshStandardMaterial({ color: 0x8c8b86, roughness: 0.8, side: THREE.DoubleSide }),
    rail: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.45, metalness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ map: tex.metal, roughness: 0.38, metalness: 0.85 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x3b3c3e, roughness: 0.5, metalness: 0.7 }),
    car: new THREE.MeshStandardMaterial({ map: tex.metal, color: 0x6a6a6a, roughness: 0.4, metalness: 0.6, side: THREE.BackSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 1 }),
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
      const a0 = k * TAU + LANDING + i * dA;
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
    const a = samples(k * TAU, k * TAU + LANDING, 0.09);
    for (let j = 0; j < a.length - 1; j++) {
      const p = [pol(R_IN, a[j], y), pol(R_OUT, a[j], y), pol(R_OUT, a[j + 1], y), pol(R_IN, a[j + 1], y)];
      landings.quad(...p, ...p.map((q) => [q[0] / 2.5, q[2] / 2.5]));
    }
    if (k > 0) {
      risers.quad(
        pol(R_IN, k * TAU, y - 0.45), pol(R_OUT, k * TAU, y - 0.45), pol(R_OUT, k * TAU, y), pol(R_IN, k * TAU, y),
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
  const phis = samples(0, ROOF_DOOR_PHI, 0.045);
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

  // ---------- 난간 손잡이 + 난간살 ----------
  const RAIL_R = R_IN - 0.07;
  class RailCurve extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const phi = t * ROOF_DOOR_PHI;
      return polar(RAIL_R, phi, baseY(phi) + 1.02, target);
    }
  }
  const railGeo = new THREE.TubeGeometry(new RailCurve(), FLOORS * 110, 0.032, 6, false);
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

  // ---------- 바깥 벽 (엘리베이터 개구부 포함) ----------
  const wall = new GeoBuilder();
  const holeHalf = DOOR_HALF_W / R_OUT;
  const angs = samples(0, TAU, TAU / 120).filter((a) => Math.abs(a - DOOR_ANGLE) > holeHalf + 0.004);
  angs.push(DOOR_ANGLE - holeHalf, DOOR_ANGLE + holeHalf);
  angs.sort((x, y) => x - y);
  const ys = [];
  for (let k = 0; k < FLOORS; k++) ys.push(k * FLOOR_H - 0.45, k * FLOOR_H, k * FLOOR_H + 2.3);
  ys.push(TOP_Y);
  const TS = (TAU * R_OUT) / 12; // 타일 텍스처 1장 크기 (이음새 없이 한 바퀴 12장)
  for (let j = 0; j < angs.length - 1; j++) {
    const a0 = angs[j], a1 = angs[j + 1];
    const isHole = a0 >= DOOR_ANGLE - holeHalf - 1e-6 && a1 <= DOOR_ANGLE + holeHalf + 1e-6;
    for (let row = 0; row < ys.length - 1; row++) {
      if (isHole && row % 3 === 1) continue; // k*H ~ k*H+2.3 구간 = 엘리베이터 문
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

  const ceiling = new THREE.Mesh(new THREE.RingGeometry(1.3, R_OUT + 0.1, 48), mat.soffit);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = TOP_Y;
  root.add(ceiling);
  const skylight = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.6, 0.68), fog: false }),
  );
  skylight.rotation.x = Math.PI / 2;
  skylight.position.y = TOP_Y + 0.01;
  root.add(skylight);
  const moon = new THREE.SpotLight(0xaab4c8, 9, 90, 0.42, 0.9, 0.55);
  moon.position.set(0, TOP_Y - 0.1, 0);
  moon.target.position.set(0, 0, 0);
  root.add(moon, moon.target);

  // 시작 지점 벽 (B1 폐쇄)
  const startWall = new GeoBuilder();
  startWall.quad(pol(S_IN, 0, -0.02), pol(R_OUT, 0, -0.02), pol(R_OUT, 0, FLOOR_H - 0.45), pol(S_IN, 0, FLOOR_H - 0.45),
    [0, 0], [1, 0], [1, 1], [0, 1]);
  root.add(mesh(startWall.build(), new THREE.MeshStandardMaterial({ map: startWallTexture(), roughness: 0.9, side: THREE.DoubleSide })));

  // ---------- 옥상 문 ----------
  const roof = buildRoofDoor(root, mat);

  // ---------- 층별 구조물 ----------
  const indicator = new IndicatorTexture();
  const indicatorMat = new THREE.MeshBasicMaterial({ map: indicator.texture, toneMapped: false });
  indicatorMat.color.setScalar(1.8);
  const fireDoorMat = new THREE.MeshStandardMaterial({ map: fireDoorTexture(), roughness: 0.7, metalness: 0.3 });
  const glitchSign = glitchSignTexture();
  const elevators = [];
  const fireDoors = [];
  const signs = [];
  const lamps = [];
  const rand = mulberry(1234);

  for (let k = 0; k < FLOORS; k++) {
    const y = k * FLOOR_H;
    elevators.push(buildElevator(root, mat, indicatorMat, k));

    // 비상문 (잠김)
    const fd = new THREE.Group();
    faceCenter(fd, R_OUT, FIREDOOR_ANGLE, y);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.1, 0.06), fireDoorMat);
    door.position.set(0, 1.05, 0.06);
    door.castShadow = door.receiveShadow = true;
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.22, 0.05), mat.frame);
    fr.position.set(0, 1.11, 0.03);
    fd.add(fr, door);
    root.add(fd);
    fireDoors.push({ group: fd, door, k, pos: new THREE.Vector3().copy(fd.position).setY(y + 1.0) });

    // 층 번호 페인트
    const signTex = floorSignTexture(k + 1, k === FLOORS - 1);
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), signMat);
    faceCenter(sign, R_OUT - 0.02, SIGN_ANGLE, y + 1.45);
    root.add(sign);
    signs.push({ mesh: sign, mat: signMat, tex: signTex, glitch: glitchSign });

    // 벽등
    const lampAngle = SIGN_ANGLE + 0.02;
    const lampGroup = new THREE.Group();
    faceCenter(lampGroup, R_OUT, lampAngle, y + 2.72);
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
      k, kind, bulbMat, halo,
      pos: polar(R_OUT - 0.55, lampAngle, y + 2.55, new THREE.Vector3()),
      seed: rand() * 100, level: 1,
    });

    // 잡동사니
    if (k > 0) addClutter(root, mat, k, rand);
  }

  return {
    root, mat, tex, elevators, fireDoors, signs, lamps, indicator, roof,
    paperTex: [1, 2, 3, 4, 5, 6].map((s) => paperTexture(s * 13)),
  };
}

function buildElevator(root, mat, indicatorMat, k) {
  const y = k * FLOOR_H;
  const g = new THREE.Group();
  faceCenter(g, R_OUT, DOOR_ANGLE, y);
  const hw = DOOR_HALF_W;
  const postGeo = new THREE.BoxGeometry(0.12, 2.42, 0.16);
  const pl = new THREE.Mesh(postGeo, mat.frame);
  pl.position.set(-hw, 1.21, 0.02);
  const pr = pl.clone();
  pr.position.x = hw;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.24, 0.16, 0.16), mat.frame);
  lintel.position.set(0, 2.38, 0.02);
  const panelGeo = new THREE.BoxGeometry(hw, 2.28, 0.04);
  const left = new THREE.Mesh(panelGeo, mat.metal);
  const right = new THREE.Mesh(panelGeo, mat.metal);
  left.position.set(-hw / 2, 1.14, -0.02);
  right.position.set(hw / 2, 1.14, -0.02);
  for (const m of [pl, pr, lintel, left, right]) { m.castShadow = true; m.receiveShadow = true; }

  // 엘리베이터 내부 (벽 뒤)
  const car = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 1.5), mat.car);
  car.position.set(0, 1.2, -0.8);
  const carLight = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0x5c625c }));
  carLight.rotation.x = Math.PI / 2;
  carLight.position.set(0, 2.38, -0.8);
  carLight.visible = false;

  const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), indicatorMat);
  ind.position.set(0, 2.66, 0.11);

  const btnPanel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, 0.03), mat.frame);
  btnPanel.position.set(hw + 0.32, 1.2, 0.03);
  const btnMat = new THREE.MeshBasicMaterial({ color: 0x334433 });
  const btn = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), btnMat);
  btn.position.set(hw + 0.32, 1.2, 0.05);

  g.add(pl, pr, lintel, left, right, car, carLight, ind, btnPanel, btn);
  root.add(g);
  return {
    k, group: g, left, right, carLight, btnMat, open: 0, target: 0,
    doorPos: polar(R_OUT - 0.2, DOOR_ANGLE, y + 1.2, new THREE.Vector3()),
    buttonPos: g.localToWorld(new THREE.Vector3(hw + 0.32, 1.2, 0.05)),
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
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x5a5046, roughness: 1 });
  const n = Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.25 + rand() * 0.3;
    const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s * 1.1), boxMat);
    const a = 0.15 + rand() * (LANDING - 0.3);
    if (Math.abs(a - DOOR_ANGLE) < 0.25) continue;
    b.position.set((R_OUT - 0.35) * Math.cos(a), y + s * 0.4, (R_OUT - 0.35) * Math.sin(a));
    b.rotation.y = rand() * Math.PI;
    b.castShadow = b.receiveShadow = true;
    root.add(b);
  }
  if (rand() < 0.3) {
    // 넘어진 의자
    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), mat.frame);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.04), mat.frame);
    back.position.set(0, 0.22, -0.2);
    chair.add(seat, back);
    const a = LANDING - 0.12;
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
