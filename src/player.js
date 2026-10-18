// 1인칭 플레이어: WASD 이동(시점 기준), 마우스 시점, 달리기/웅크리기/손전등
import * as THREE from 'three';
import {
  TAU, FLOOR_PHI, LANDING, R_MID, PHI_MIN, PHI_MAX, PLAYER_R_MIN, PLAYER_R_MAX, EYE, EYE_CROUCH,
  floorIndex, stepTopY, onLanding, toRoomLocal, fromRoomLocal, inRoomArea,
} from './config.js';

const WALK = 2.9, SPRINT = 5.4, CROUCH = 1.4;
const STAMINA_DRAIN = 21, STAMINA_REGEN = 14;
const TRIP_TIME = 3.4; // 넘어져서 다시 일어나기까지

function wrapPi(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export class Player {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';

    // 손전등 (카메라에 붙음)
    this.torch = new THREE.SpotLight(0xfff0d8, 30, 24, 0.5, 0.55, 1.6);
    this.torch.position.set(0.24, -0.215, -0.72);
    this.torch.target.position.set(0.02, -0.06, -7);
    this.torch.castShadow = true;
    this.torch.shadow.mapSize.set(1024, 1024);
    this.torch.shadow.camera.near = 0.2;
    this.torch.shadow.camera.far = 24;
    this.torch.shadow.bias = -0.0008;
    this.torch.shadow.normalBias = 0.02;
    camera.add(this.torch, this.torch.target);

    // 아주 약한 주변광 (손전등을 꺼도 윤곽은 보이게)
    // 손전등을 꺼도 바로 눈앞 정도만 겨우 보이게 하는 아주 약한 빛
    this.glow = new THREE.PointLight(0x8090a0, 0.18, 2.2, 2);
    camera.add(this.glow);

    this.buildViewModel();
    this.reset();
  }

  buildViewModel() {
    const vm = (this.viewModel = new THREE.Group());
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.95 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xb48e74, roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.35, metalness: 0.8 });
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8), sleeve);
    arm.rotation.x = Math.PI / 2 - 0.12;
    arm.position.set(0, -0.03, 0.2);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), skin);
    hand.scale.set(1, 0.85, 1.25);
    hand.position.set(0, 0, -0.05);
    const bodyGeo = new THREE.CylinderGeometry(0.03, 0.026, 0.24, 12);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, steel);
    body.position.set(0, 0.035, -0.1);
    const headGeo = new THREE.CylinderGeometry(0.042, 0.032, 0.06, 12);
    headGeo.rotateX(Math.PI / 2);
    const head = new THREE.Mesh(headGeo, steel);
    head.position.set(0, 0.035, -0.24);
    this.lensMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 14), this.lensMat);
    lens.position.set(0, 0.035, -0.271);
    lens.rotation.y = Math.PI;
    vm.add(arm, hand, body, head, lens);
    vm.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    this.vmBase = new THREE.Vector3(0.24, -0.25, -0.42);
    vm.position.copy(this.vmBase);
    this.camera.add(vm);
  }

  reset(phi = PHI_MIN + 0.3) {
    this.phi = phi;
    this.r = R_MID;
    this.x = this.r * Math.cos(phi);
    this.z = this.r * Math.sin(phi);
    this.yaw = Math.PI - phi; // 계단을 오르는 방향을 바라봄
    this.pitch = -0.05;
    this.vx = 0;
    this.vz = 0;
    this.footY = stepTopY(phi);
    this.eye = EYE;
    this.stamina = 100;
    this.exhausted = false;
    this.staminaDelay = 0;
    this.battery = 100;
    this.torchOn = true;
    this.torchFlicker = 1;
    this.crouching = false;
    this.sprinting = false;
    this.speed = 0;
    this.tripT = 0;
    this.sprintTime = 0;
    this.noise = 0;
    this.noiseSpike = 0;
    this.floorTime = 0;
    this.lastFloor = floorIndex(phi);
    this.maxFloor = this.lastFloor;
    this.stepAcc = 0;
    this.bob = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.shake = 0;
    this.frozen = false;
    this.roomK = -1; // 숨을 방 안에 있으면 그 층 번호
  }

  get inRoom() {
    return this.roomK >= 0;
  }

  get floor() {
    return floorIndex(this.phi);
  }

  look(dx, dy, sens) {
    if (this.frozen) return;
    this.yaw -= dx * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * sens));
    this.swayX = Math.max(-0.05, Math.min(0.05, this.swayX + dx * 0.00012));
    this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY - dy * 0.00012));
  }

  toggleTorch() {
    if (this.battery <= 0) return false;
    this.torchOn = !this.torchOn;
    return true;
  }

  trip(ev) {
    this.tripT = TRIP_TIME;
    this.tripSide = Math.random() < 0.5 ? -1 : 1;
    this.tripImpact = false;
    this.sprintTime = 0;
    this.stamina = Math.max(0, this.stamina - 40);
    this.exhausted = true;
    this.staminaDelay = 1.5;
    this.vx *= 0.15;
    this.vz *= 0.15;
    this.shake = Math.max(this.shake, 1.2);
    this.addNoise(26);
    ev.trip = true;
  }

  addNoise(radius) {
    this.noiseSpike = Math.max(this.noiseSpike, radius);
  }

  /**
   * input: {f,b,l,r,sprint,crouch}
   * 반환: { footstep: 볼륨|0, trip: bool }
   */
  update(dt, input, diff, doors = []) {
    const ev = { footstep: 0, trip: false };
    const tripping = this.tripT > 0;
    if (tripping) this.tripT = Math.max(0, this.tripT - dt);

    // ----- 입력 → 원하는 속도 -----
    let mz = 0, mx = 0;
    if (!this.frozen && !tripping) {
      // 키보드 + (모바일) 가상 조이스틱 아날로그 입력
      mz = (input.f ? 1 : 0) - (input.b ? 1 : 0) + (input.axisY || 0);
      mx = (input.r ? 1 : 0) - (input.l ? 1 : 0) + (input.axisX || 0);
    }
    const mag = Math.min(1, Math.hypot(mx, mz));
    const moving = mag > 0.12;
    this.crouching = !!input.crouch && !tripping;
    const stickRun = (input.axisY || 0) > 0 && Math.hypot(input.axisX || 0, input.axisY || 0) > 0.93;
    const wantSprint = (input.sprint || stickRun) && moving && mz > 0 && !this.crouching && !this.exhausted && this.stamina > 0;
    this.sprinting = wantSprint;
    const speed = (this.crouching ? CROUCH : wantSprint ? SPRINT : WALK) * (moving ? Math.max(0.35, mag) : 0);

    let tx = 0, tz = 0;
    if (moving) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      tx = fx * mz + rx * mx;
      tz = fz * mz + rz * mx;
      const len = Math.hypot(tx, tz);
      tx = (tx / len) * speed;
      tz = (tz / len) * speed;
    }
    const a = 1 - Math.exp(-dt * (moving ? 10 : 12));
    this.vx += (tx - this.vx) * a;
    this.vz += (tz - this.vz) * a;

    // ----- 나선 계단 위로 이동 (phi, r 로 충돌 처리) -----
    const ox = this.x, oz = this.z;
    this.moveTo(this.x + this.vx * dt, this.z + this.vz * dt, doors);
    this.speed = Math.hypot(this.x - ox, this.z - oz) / Math.max(dt, 1e-4);

    // ----- 스태미나 -----
    if (this.sprinting && this.speed > 1) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      this.staminaDelay = 0.9;
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) {
        this.stamina = Math.min(100, this.stamina + STAMINA_REGEN * (this.speed < 0.2 ? 1.4 : 1) * dt);
      }
      if (this.stamina > 35) this.exhausted = false;
    }

    // ----- 넘어짐 (원작: 5층 이상에서 오래 오르면 확률적으로 넘어짐) -----
    if (this.sprinting && this.speed > 3 && this.floor >= 4 && !onLanding(this.phi)) {
      this.sprintTime += dt;
      if (this.sprintTime > 2.5 && Math.random() < diff.tripChance * dt) this.trip(ev);
    } else {
      this.sprintTime = Math.max(0, this.sprintTime - dt * 2);
    }
    // 체력이 바닥난 채로 달리려 하면 다리가 꼬인다
    const tryRun = (input.sprint || stickRun) && moving && mz > 0 && !this.crouching;
    if (tryRun && this.exhausted && !tripping && Math.random() < diff.exhaustTripChance * dt) this.trip(ev);

    // ----- 소음 반경 (송신의 청각) -----
    let base = 0;
    if (this.speed > 0.3) base = this.crouching ? 3.5 : this.sprinting ? 17 : 8.5;
    this.noiseSpike = Math.max(0, this.noiseSpike - dt * 8);
    this.noise = Math.max(base, this.noiseSpike) * diff.hearingMul;

    // ----- 층 체류 시간 (원작의 HIDE_THRESH) -----
    const fl = this.floor;
    if (fl !== this.lastFloor) {
      this.lastFloor = fl;
      this.floorTime = 0;
    } else {
      this.floorTime += dt;
    }
    this.maxFloor = Math.max(this.maxFloor, fl);

    // ----- 손전등 배터리 -----
    if (this.torchOn) {
      this.battery = Math.max(0, this.battery - diff.batteryDrain * dt);
      if (this.battery <= 0) this.torchOn = false;
    }
    const low = this.battery < 15;
    if (low && Math.random() < dt * 3) this.torchFlicker = Math.random() * 0.6;
    else this.torchFlicker += (1 - this.torchFlicker) * Math.min(1, dt * 6);

    // ----- 발소리 -----
    const stride = this.sprinting ? 0.95 : this.crouching ? 0.6 : 0.74;
    this.stepAcc += this.speed * dt;
    if (this.stepAcc > stride) {
      this.stepAcc = 0;
      ev.footstep = this.crouching ? 0.15 : this.sprinting ? 0.85 : 0.45;
    }

    this.updateCamera(dt);
    return ev;
  }

  /** 계단(원환) + 비상문 너머 방을 오가는 충돌 처리 */
  moveTo(nx, nz, doors) {
    if (this.roomK >= 0) {
      const d = doors[this.roomK];
      const passable = d && d.open > 0.7;
      const ok = (lx, lz) => inRoomArea(lx, lz) && (passable || lz < -0.32);
      const c = toRoomLocal(nx, nz);
      // 문을 지나 계단참으로 나감
      if (c.lz > 0.35 && passable && Math.hypot(nx, nz) <= PLAYER_R_MAX + 0.02) {
        this.roomK = -1;
        this.moveTo(nx, nz, doors);
        return;
      }
      const o = toRoomLocal(this.x, this.z);
      let lx = o.lx, lz = o.lz;
      if (ok(c.lx, c.lz)) { lx = c.lx; lz = c.lz; }
      else if (ok(c.lx, o.lz)) lx = c.lx;
      else if (ok(o.lx, c.lz)) lz = c.lz;
      const w = fromRoomLocal(lx, lz);
      this.setRoomPos(w.x, w.z);
      return;
    }

    const dphi = wrapPi(Math.atan2(nz, nx) - this.phi);
    let phi = this.phi + dphi;
    let r = Math.hypot(nx, nz);
    // 열린 비상문으로 들어감 (문 쪽으로 살짝 빨아들여 들어가기 쉽게)
    const k = floorIndex(phi);
    const door = doors[k];
    if (door && door.open > 0.7 && onLanding(phi) && r > PLAYER_R_MAX) {
      const c = toRoomLocal(nx, nz);
      if (Math.abs(c.lx) < 0.55) {
        c.lx = Math.max(-0.21, Math.min(0.21, c.lx));
        if (inRoomArea(c.lx, c.lz)) {
          this.roomK = k;
          const w = fromRoomLocal(c.lx, c.lz);
          this.setRoomPos(w.x, w.z);
          return;
        }
      }
    }
    r = Math.max(PLAYER_R_MIN, Math.min(PLAYER_R_MAX, r));
    phi = Math.max(PHI_MIN, Math.min(PHI_MAX, phi));
    this.phi = phi;
    this.r = r;
    this.x = r * Math.cos(phi);
    this.z = r * Math.sin(phi);
  }

  setRoomPos(x, z) {
    const k = this.roomK;
    const phi = this.phi + wrapPi(Math.atan2(z, x) - this.phi);
    // 방 안에서는 그 층 계단참에 있는 것으로 취급 (층 판정·바닥 높이)
    this.phi = Math.max(k * FLOOR_PHI + 0.01, Math.min(k * FLOOR_PHI + LANDING - 0.01, phi));
    this.x = x;
    this.z = z;
    this.r = Math.hypot(x, z);
  }

  /** 문이 닫힐 때 문짝 자리에 서 있으면 방 안쪽으로 밀어냄 */
  pushOutOfDoorway() {
    if (this.roomK < 0) return;
    const c = toRoomLocal(this.x, this.z);
    if (c.lz > -0.35) {
      const w = fromRoomLocal(c.lx, -0.35);
      this.setRoomPos(w.x, w.z);
    }
  }

  updateCamera(dt) {
    // 발 높이: 계단을 오를 때는 빠르게, 내려갈 때는 떨어지듯
    const target = stepTopY(this.phi);
    if (target > this.footY) this.footY += (target - this.footY) * Math.min(1, dt * 16);
    else this.footY = Math.max(target, this.footY - dt * 5);

    const eyeT = this.crouching ? EYE_CROUCH : EYE;
    this.eye += (eyeT - this.eye) * Math.min(1, dt * 9);

    const sp = Math.min(1, this.speed / WALK);
    this.bob += dt * this.speed * 2.3;
    const bobY = Math.sin(this.bob * 2) * 0.045 * sp * (this.sprinting ? 1.4 : 1);
    const bobX = Math.cos(this.bob) * 0.03 * sp;

    // 넘어짐 연출: 확 고꾸라짐 → 바닥에 쓰러져 있음 → 비틀거리며 천천히 일어남
    let drop = 0, roll = 0, pitchOff = 0, down = 0;
    if (this.tripT > 0) {
      const p = 1 - this.tripT / TRIP_TIME;
      let e;
      if (p < 0.09) e = (p / 0.09) ** 2;
      else if (p < 0.5) e = 1;
      else {
        const q = (p - 0.5) / 0.5;
        e = 1 - q * q * (3 - 2 * q);
      }
      if (p >= 0.09 && !this.tripImpact) {
        this.tripImpact = true; // 바닥에 부딪힌 순간
        this.shake = Math.max(this.shake, 1.5);
      }
      const side = this.tripSide || 1;
      down = e;
      drop = -(this.eye - 0.28) * e;
      roll = side * (1.05 * e + (p > 0.5 ? Math.sin(p * 40) * 0.07 * e : 0));
      pitchOff = -0.75 * e + (p > 0.09 && p < 0.5 ? Math.sin(p * 9) * 0.04 : 0);
    }

    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sh = this.shake * this.shake;
    const shx = (Math.random() - 0.5) * 0.12 * sh;
    const shy = (Math.random() - 0.5) * 0.12 * sh;

    const cam = this.camera;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    cam.position.set(
      this.x + rx * bobX,
      this.footY + this.eye + bobY + drop,
      this.z + rz * bobX,
    );
    cam.rotation.y = this.yaw + shx;
    cam.rotation.x = this.pitch + pitchOff + shy;
    cam.rotation.z = roll + (this.sprinting ? Math.sin(this.bob) * 0.012 : 0);

    // 손 흔들림
    this.swayX *= Math.exp(-dt * 6);
    this.swayY *= Math.exp(-dt * 6);
    const vm = this.viewModel;
    const lower = this.sprinting ? 0.08 : 0;
    vm.position.set(
      this.vmBase.x + bobX * 0.6 - this.swayX,
      this.vmBase.y + bobY * 0.5 - lower - this.swayY - down * 0.45,
      this.vmBase.z,
    );
    vm.rotation.set(this.sprinting ? -0.35 : 0, this.sprinting ? 0.3 : 0, 0);

    const on = this.torchOn;
    const batt = Math.min(1, 0.35 + this.battery / 60);
    this.torch.intensity = on ? 22 * batt * this.torchFlicker : 0;
    this.lensMat.color.setScalar(on ? 2.8 * this.torchFlicker : 0.08); // 블룸으로 빛남
  }
}
