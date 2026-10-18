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
  IndicatorTexture, paperTexture, glowTexture, exitSignTexture, normalMapFrom, roughnessMapFrom,
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
  };
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
  const skylight = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.6, 0.68), fog: false }),
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
  indicatorMat.color.setScalar(1.8);
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
      k, kind, bulbMat, halo, color: 0xffdcae, power: 7, room: false,
      pos: polar(R_OUT - 0.55, lampAngle, y + 2.95, new THREE.Vector3()),
      seed: rand() * 100, level: 1,
    });

    // 잡동사니
    if (k > 0) addClutter(root, mat, k, rand);
  }

  return {
    root, mat, tex, elevators, fireDoors, signs, lamps, indicator, roof, doorMats,
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
  g.updateMatrixWorld(true);
  return {
    k, group: g, left, right, carLight, btnMat, open: 0, target: 0,
    doorPos: polar(R_OUT - 0.2, DOOR_ANGLE, y + 1.2, new THREE.Vector3()),
    buttonPos: g.localToWorld(new THREE.Vector3(hw + 0.32, 1.2, 0.05)),
  };
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
  const monitor = box(0.06, 0.34, 0.46, mat.frame, hw - 0.02, 1.5, -0.8);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x0a0f0c });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), screenMat);
  screen.position.set(hw - 0.056, 1.5, -0.8);
  screen.rotation.y = -Math.PI / 2;
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
    k, kind: rand() < 0.25 ? 'flicker' : 'steady', bulbMat, halo, color: 0xff3828, power: 2.2, room: true,
    pos: lampWorld, seed: rand() * 100, level: 1,
  };
  lamps.push(roomLamp);

  const handle = fromRoomLocal(0, 0);
  return {
    k, group: g, hinge, exitSign, open: 0, target: 0, locked: false,
    pos: new THREE.Vector3(handle.x, y + 1.05, handle.z),
    lamp: roomLamp,
    screen, screenMat, recMat,
    monitorPos: g.localToWorld(new THREE.Vector3(hw - 0.06, 1.5, -0.8)),
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
