// 송신 — 엘리베이터로 아무 층에나 내려, 계단을 따라 플레이어에게 다가오는 존재
//
// 송신은 평면(앞: 얼굴 / 뒤: 머리카락 실루엣)이며 항상 "자기가 걸어가는 방향"을 바라본다.
// 상태: elevator → arriving → approach | wander → chase → (lost | search | vanish) → toElevator → elevator ...
import * as THREE from 'three';
import {
  FLOORS, FLOOR_H, FLOOR_PHI, R_MID, R_OUT, PHI_MIN, PHI_MAX, CORR_L,
  baseY, floorIndex, landingCenter, fireDoorPhi, pathDist, polar,
  toRoomLocal, fromRoomLocal,
} from './config.js';
import { silhouetteTexture } from './textures.js';

const HEIGHT = 1.9;
const DOOR_FRONT_R = R_OUT - 0.45;

function wrapPi(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export class Stalker {
  constructor(scene, texture) {
    const img = texture.image;
    const aspect = img ? img.width / img.height : 1;
    this.width = HEIGHT * aspect;
    const geo = new THREE.PlaneGeometry(this.width, HEIGHT);
    this.faceMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.04, fog: true });
    this.faceMat.color.setScalar(0.8);
    this.backMat = new THREE.MeshBasicMaterial({ map: silhouetteTexture(img), transparent: true, alphaTest: 0.04, fog: true });
    const front = new THREE.Mesh(geo, this.faceMat);
    const back = new THREE.Mesh(geo, this.backMat);
    back.rotation.y = Math.PI;
    front.position.z = 0.004;
    back.position.z = -0.004;
    this.body = new THREE.Group();   // 흔들림/기울기
    this.body.add(front, back);
    this.group = new THREE.Group();  // 위치/방향
    this.group.add(this.body);
    this.group.renderOrder = 2;
    scene.add(this.group);

    this.pos = new THREE.Vector3();
    this.humPos = new THREE.Vector3();
    this.tmp = {};
    this.reset();
  }

  reset(diff) {
    this.diff = diff;
    this.state = 'elevator';
    this.phi = landingCenter(8);
    this.r = R_OUT + 0.75;
    this.roomK = -1;
    this.lx = 0;
    this.lz = 0;
    this.footY = 0;
    this.yaw = 0;
    this.elevFloor = 7 + Math.floor(Math.random() * 6);
    this.elevTarget = this.elevFloor;
    this.elevDelay = (diff ? diff.graceTime : 20) + Math.random() * 6; // 시작 유예 시간
    this.hunting = false;
    this.huntOffset = 0;
    this.huntQueued = false;
    this.burst = false;       // 닫힌 문을 부수고 들어올 수 있는지 (사냥 중)
    this.chaseTime = 0;
    this.loseTime = 0;
    this.stateTime = 0;
    this.timer = 0;
    this.doorK = -1;
    this.roamTarget = this.phi;
    this.visible = false;
    this.glitchT = 0;     // 표시기 글리치 남은 시간
    this.t = 0;
    this.jitter = 0;
    this.windup = 0;
    this.justSpotted = false;
    this.group.visible = false;
  }

  get floor() {
    if (this.state === 'elevator') return Math.round(this.elevFloor);
    if (this.roomK >= 0) return this.roomK;
    return floorIndex(this.phi);
  }

  get inElevator() {
    return this.state === 'elevator';
  }

  get chasing() {
    return this.state === 'chase';
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  // ------------------------------------------------------------------ 이동
  /** 계단 경로 위에서 목표 지점으로 이동. 남은 거리 반환 */
  moveToward(tPhi, tR, speed, dt) {
    const dx = (tPhi - this.phi) * R_MID;
    const dr = tR - this.r;
    const d = Math.hypot(dx, dr);
    if (d < 1e-4) return 0;
    const step = Math.min(d, speed * dt);
    this.phi += ((dx / d) * step) / R_MID;
    this.r += (dr / d) * step;
    return d - step;
  }

  /** 방(비상문 로컬 좌표) 안에서 이동. 남은 거리 반환 */
  moveLocal(tx, tz, speed, dt) {
    const dx = tx - this.lx, dz = tz - this.lz;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return 0;
    const step = Math.min(d, speed * dt);
    this.lx += (dx / d) * step;
    this.lz += (dz / d) * step;
    return d - step;
  }

  enterRoom(k) {
    const w = this.worldXZ();
    const c = toRoomLocal(w.x, w.z);
    this.roomK = k;
    this.lx = c.lx;
    this.lz = c.lz;
  }

  leaveRoom() {
    const k = this.roomK;
    const w = fromRoomLocal(this.lx, this.lz);
    const base = fireDoorPhi(k);
    this.phi = base + wrapPi(Math.atan2(w.z, w.x) - base);
    this.r = Math.hypot(w.x, w.z);
    this.roomK = -1;
  }

  worldXZ() {
    if (this.roomK >= 0) return fromRoomLocal(this.lx, this.lz, this.tmp);
    this.tmp.x = this.r * Math.cos(this.phi);
    this.tmp.z = this.r * Math.sin(this.phi);
    return this.tmp;
  }

  /** 방 안에서 계단참으로 나가는 한 걸음. 나가면 true */
  exitRoomStep(speed, dt, game) {
    const door = game.world.fireDoors[this.roomK];
    if (this.lz < -CORR_L - 0.2) {
      this.moveLocal(0, -CORR_L - 0.45, speed, dt);
      if (Math.abs(this.lx) < 0.15) this.moveLocal(0, -CORR_L + 0.1, speed, dt);
      return false;
    }
    if (door.open < 0.7 && this.lz > -0.6) {
      game.forceDoor(this.roomK);
      return false;
    }
    this.moveLocal(0, 0.55, speed, dt);
    if (this.lz > 0.5) {
      this.leaveRoom();
      return true;
    }
    return false;
  }

  /**
   * 플레이어 쪽으로 한 걸음. 플레이어가 닫힌 방 안이면 문 앞에서 'blocked' 반환
   */
  goToPlayer(player, speed, dt, game) {
    const doors = game.world.fireDoors;
    if (player.inRoom) {
      const k = player.roomK;
      if (this.roomK === k) {
        const p = toRoomLocal(player.x, player.z);
        // 복도 ↔ 방 경계에서는 문간을 거쳐 이동 (벽 모서리 통과 방지)
        const inRoomS = this.lz < -CORR_L - 0.25, inRoomP = p.lz < -CORR_L - 0.25;
        if (inRoomS !== inRoomP && Math.abs(this.lx) > 0.12) this.moveLocal(0, -CORR_L - 0.45, speed, dt);
        else if (inRoomS !== inRoomP) this.moveLocal(this.lx, inRoomP ? -CORR_L - 0.5 : -CORR_L + 0.1, speed, dt);
        else this.moveLocal(p.lx, p.lz, speed, dt);
        return 'moving';
      }
      if (this.roomK >= 0) {
        this.exitRoomStep(speed, dt, game);
        return 'moving';
      }
      const rem = this.moveToward(fireDoorPhi(k), DOOR_FRONT_R, speed, dt);
      if (rem < 0.2) {
        if (doors[k].open > 0.7) {
          this.enterRoom(k);
          return 'moving';
        }
        this.doorK = k;
        return 'blocked';
      }
      return 'moving';
    }
    if (this.roomK >= 0) {
      this.exitRoomStep(speed, dt, game);
      return 'moving';
    }
    this.moveToward(player.phi, player.r, speed, dt);
    return 'moving';
  }

  /** 송신과 플레이어 사이 거리(m): 계단 경로 또는 방 안 직선 */
  distTo(player) {
    if (this.state === 'elevator') return Infinity;
    if (this.roomK >= 0 || player.inRoom) {
      const w = this.worldXZ();
      const dy = this.footY - player.footY;
      return Math.hypot(w.x - player.x, w.z - player.z, dy);
    }
    return pathDist(this.phi, this.r, player.phi, player.r);
  }

  // ------------------------------------------------------------------ 판단
  pickElevatorTarget(playerFloor) {
    const cur = Math.round(this.elevFloor);
    let t = cur;
    for (let i = 0; i < 12 && t === cur; i++) {
      if (Math.random() < this.diff.elevatorWeight) {
        // 플레이어가 있는 곳으로 — 주로 바로 위층에 내려 계단을 따라 내려온다
        const offs = [1, 1, 1, 2, 2, 3, -1, -1, -2, 0];
        t = playerFloor + offs[Math.floor(Math.random() * offs.length)];
      } else {
        t = Math.floor(Math.random() * FLOORS);
      }
      t = Math.max(0, Math.min(FLOORS - 1, t));
    }
    return t;
  }

  startElevatorRide(target, delay, game) {
    this.setState('elevator');
    this.elevTarget = target;
    this.elevDelay = delay;
    this.visible = false;
    if (Math.random() < this.diff.indicatorGlitch) this.glitchT = 5; // 원작: 엘리베이터 출발 시 30% 확률 글리치
  }

  /** 외부 사건(층 체류, 마지막 추격)으로 플레이어를 사냥하러 옴. offset: 플레이어 층 기준 도착 층 */
  hunt(player, offset = 0) {
    if (this.state === 'chase') {
      this.burst = true;
      return 'already';
    }
    if (this.state === 'search') {
      this.beginChase(true);
      return 'chase';
    }
    const d = this.distTo(player);
    if (this.visible && d < 30) {
      this.beginChase(true);
      return 'chase';
    }
    this.huntOffset = offset;
    if (this.state === 'elevator') {
      this.hunting = true;
      this.elevDelay = Math.min(this.elevDelay, 1.2);
      return 'elevator';
    }
    // 계단 위 먼 곳 → 사라졌다가 엘리베이터로 온다
    this.huntQueued = true;
    this.setState('vanish');
    this.timer = 0;
    return 'vanish';
  }

  /** 일시정지를 너무 오래 하면: 바로 뒤에서 나타나 쫓아온다 */
  ambush(player, game) {
    this.huntQueued = false;
    this.hunting = false;
    if (player.inRoom) {
      // 숨은 방 문을 부수고 문 앞에 서 있다
      this.roomK = -1;
      this.phi = fireDoorPhi(player.roomK);
      this.r = DOOR_FRONT_R - 0.1;
      game.forceDoor(player.roomK, true);
    } else {
      this.roomK = -1;
      const ahead = Math.cos(player.yaw + player.phi) < 0 ? 1 : -1; // 계단 위쪽을 보고 있으면 1
      this.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, player.phi - (ahead * 8) / R_MID));
      this.r = player.r;
    }
    const w = this.worldXZ();
    this.yaw = Math.atan2(player.x - w.x, player.z - w.z);
    this.visible = true;
    this.beginChase(true);
    this.windup = 1.0;
    this.updateMesh(0);
  }

  beginChase(burst = false) {
    this.setState('chase');
    this.chaseTime = 0;
    this.loseTime = 0;
    this.burst = burst || this.hunting;
    // 발견 직후 잠깐 멈춰 웃는다 — 도망칠 틈
    this.windup = this.hunting ? 0.5 : 0.9;
    this.doorWait = 0;
    this.hunting = false;
    this.justSpotted = true;
  }

  detect(player) {
    if (player.inRoom) {
      const door = this.game.world.fireDoors[player.roomK];
      if (door.open < 0.3) return false; // 문을 닫고 숨으면 들키지 않는다
      return this.distTo(player) < 6;
    }
    const d = this.distTo(player);
    const sight = this.diff.sight + (player.torchOn ? 4 : 0) - (player.crouching ? 3 : 0);
    return d < Math.max(player.noise, sight);
  }

  goElevator(game) {
    this.doorK = Math.max(0, Math.min(FLOORS - 1, Math.round((this.phi - landingCenter(0)) / FLOOR_PHI)));
    this.setState('toElevator');
  }

  // ------------------------------------------------------------------ 갱신
  update(dt, player, game) {
    const diff = this.diff;
    this.game = game;
    this.t += dt;
    this.stateTime += dt;
    this.justSpotted = false;
    this.glitchT = Math.max(0, this.glitchT - dt);
    const elevs = game.world.elevators;
    const prev = this.worldXZ();
    const px = prev.x, pz = prev.z;
    let face = null; // 이동이 없을 때 바라볼 방향

    switch (this.state) {
      case 'elevator': {
        this.visible = false;
        if (this.hunting) this.elevTarget = Math.max(0, Math.min(FLOORS - 1, player.floor + this.huntOffset));
        if (this.elevDelay > 0) {
          this.elevDelay -= dt;
          break;
        }
        const spd = (this.hunting ? 2.4 : 1) / diff.elevatorSecPerFloor;
        const d = this.elevTarget - this.elevFloor;
        if (Math.abs(d) <= spd * dt) {
          this.elevFloor = this.elevTarget;
          this.setState('arriving');
          this.doorK = this.elevTarget;
          this.phi = landingCenter(this.doorK);
          this.r = R_OUT + 0.75;
          this.roomK = -1;
          this.yaw = Math.atan2(-Math.cos(this.phi), -Math.sin(this.phi)); // 계단 쪽을 보며 나옴
          elevs[this.doorK].target = 1;
          game.onElevatorArrive?.(this.doorK, this.hunting);
        } else {
          this.elevFloor += Math.sign(d) * spd * dt;
        }
        break;
      }

      case 'arriving': {
        if (this.stateTime > 1.1) {
          this.visible = true;
          this.moveToward(this.phi, R_MID, diff.approachSpeed, dt);
          if (this.r < R_OUT - 0.7) {
            game.closeElevator(this.doorK, 1.5);
            if (this.hunting || this.detect(player)) this.beginChase();
            else if (Math.random() < 0.8) this.setState('approach');
            else this.pickWander(player);
          }
        }
        break;
      }

      case 'approach': {
        // 플레이어가 있는 쪽으로 계단을 따라 걸어온다 (아직 발견하지는 못함)
        this.visible = true;
        const res = this.goToPlayer(player, diff.approachSpeed, dt, game);
        if (res === 'blocked') this.beginSearch();
        else if (this.detect(player)) this.beginChase();
        else if (this.stateTime > 50) this.goElevator(game);
        break;
      }

      case 'wander': {
        this.visible = true;
        const wob = Math.sin(this.t * 0.7) * 0.35;
        const rem = this.moveToward(this.roamTarget, R_MID + wob, diff.roamSpeed, dt);
        if (rem < 0.25) this.goElevator(game);
        if (this.detect(player)) this.beginChase();
        break;
      }

      case 'toElevator': {
        this.visible = true;
        if (this.roomK >= 0) {
          this.exitRoomStep(diff.roamSpeed * 1.5, dt, game);
          break;
        }
        const tPhi = landingCenter(this.doorK);
        this.moveToward(tPhi, R_OUT + 0.8, diff.roamSpeed * 1.2, dt);
        if (this.r > R_OUT - 1.3 && elevs[this.doorK].target === 0) {
          elevs[this.doorK].target = 1;
          game.onDoorOpen?.(this.doorK);
        }
        if (this.r > R_OUT + 0.6) {
          this.visible = false;
          game.closeElevator(this.doorK, 0.4);
          this.elevFloor = this.doorK;
          const [d0, d1] = diff.rideDelay;
          this.startElevatorRide(this.pickElevatorTarget(player.floor), d0 + Math.random() * (d1 - d0), game);
          break;
        }
        if (this.detect(player)) this.beginChase();
        break;
      }

      case 'chase': {
        this.visible = true;
        this.chaseTime += dt;
        let speed = diff.chaseSpeed + diff.chaseSpeedPerFloor * player.maxFloor;
        // 숨은 방 문 앞으로는 쓱— 천천히 다가온다 (CCTV에 비치도록)
        if (player.inRoom && this.roomK < 0 && this.burst) {
          const dDoor = pathDist(this.phi, this.r, fireDoorPhi(player.roomK), DOOR_FRONT_R);
          if (dDoor < 6 && game.world.fireDoors[player.roomK].open < 0.7) speed = Math.min(speed, 1.3);
        }
        let res = 'moving';
        if (this.windup > 0) this.windup -= dt;
        else if (this.doorWait > 0) {
          // 문 앞에 멈춰 선다… 그리고
          this.doorWait -= dt;
          const dp = game.world.fireDoors[this.doorK].pos;
          const w = this.worldXZ();
          face = Math.atan2(dp.x - w.x, dp.z - w.z);
          if (this.doorWait <= 0) game.forceDoor(this.doorK, true); // 문을 부수고 들어온다
          break;
        } else res = this.goToPlayer(player, speed, dt, game);
        if (res === 'blocked') {
          if (this.burst) {
            this.doorWait = 2.2;
            game.onDoorRattle?.(this.doorK);
          } else {
            this.beginSearch();
            game.onChaseEnd?.('hid');
            break;
          }
        }
        const d = this.distTo(player);
        this.loseTime = d > 22 && !player.inRoom ? this.loseTime + dt : 0;
        if (this.loseTime > 3.5) {
          this.burst = false;
          this.goElevator(game);
          game.onChaseEnd?.('lost');
        } else if (this.chaseTime > diff.chaseMax && d > 5 && !this.burst) {
          this.setState('vanish');
          this.timer = 0;
          game.onChaseEnd?.('vanish');
        }
        break;
      }

      case 'search': {
        // 닫힌 비상문 앞에서 서성인다
        this.visible = true;
        const door = game.world.fireDoors[this.doorK];
        const sway = Math.sin(this.t * 0.9) * 0.25;
        this.moveToward(fireDoorPhi(this.doorK) + sway / R_MID, DOOR_FRONT_R - 0.2, 0.6, dt);
        const w = this.worldXZ();
        const dp = door.pos;
        face = Math.atan2(dp.x - w.x, dp.z - w.z);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = 1.6 + Math.random() * 2.2;
          game.onDoorRattle?.(this.doorK);
        }
        if (door.open > 0.3 && player.inRoom && player.roomK === this.doorK) this.beginChase();
        else if (!player.inRoom && this.detect(player)) this.beginChase();
        else if (this.stateTime > diff.searchTime) {
          this.goElevator(game);
          game.onSearchEnd?.();
        }
        break;
      }

      case 'vanish': {
        this.timer += dt;
        this.visible = Math.random() < 0.5 * (1 - this.timer);
        if (this.timer > 0.9) {
          this.visible = false;
          this.roomK = -1;
          this.burst = false;
          const here = Math.max(0, Math.min(FLOORS - 1, this.floor));
          this.elevFloor = here;
          if (this.huntQueued) {
            this.huntQueued = false;
            this.hunting = true;
            this.startElevatorRide(player.floor + this.huntOffset, 1.5, game);
          } else {
            // 멀리 떨어진 층에서 다시 시작
            let far = player.floor + (Math.random() < 0.5 ? -1 : 1) * (5 + Math.floor(Math.random() * 3));
            if (far < 0 || far >= FLOORS) far = player.floor < FLOORS / 2 ? FLOORS - 1 : 0;
            this.elevFloor = far;
            this.startElevatorRide(this.pickElevatorTarget(player.floor), 6 + Math.random() * 6, game);
          }
        }
        break;
      }
    }

    if (this.roomK < 0) this.phi = Math.max(PHI_MIN - 0.1, Math.min(PHI_MAX + 0.05, this.phi));

    // 바라보는 방향 = 걸어가는 방향
    const now = this.worldXZ();
    const mx = now.x - px, mz = now.z - pz;
    if (face === null && mx * mx + mz * mz > 1e-7) face = Math.atan2(mx, mz);
    if (face !== null) this.yaw += wrapPi(face - this.yaw) * Math.min(1, dt * 7);
    this.updateMesh(dt);
  }

  pickWander(player) {
    const k = floorIndex(this.phi);
    let t = k;
    while (t === k) {
      const toward = Math.sign(player.floor - k) || (Math.random() < 0.5 ? 1 : -1);
      t = Math.max(0, Math.min(FLOORS - 1, k + (Math.random() < 0.7 ? toward : -toward)));
    }
    this.roamTarget = landingCenter(t);
    this.setState('wander');
  }

  beginSearch() {
    this.setState('search');
    this.timer = 0.6;
    this.burst = false;
  }

  updateMesh(dt) {
    const w = this.worldXZ();
    this.footY = this.roomK >= 0 ? this.roomK * FLOOR_H : baseY(this.phi);
    const bob = Math.abs(Math.sin(this.t * (this.chasing ? 9 : 4.2))) * (this.chasing ? 0.08 : 0.04);
    this.pos.set(w.x, this.footY + HEIGHT * 0.5 + 0.12 + bob, w.z);
    // 엘리베이터 승강로 위치 (모터 소리용)
    polar(R_OUT + 0.9, landingCenter(0), this.elevFloor * FLOOR_H + 1.2, this.humPos);

    const g = this.group;
    g.visible = this.visible;
    if (!this.visible) return;
    g.position.copy(this.pos);
    g.rotation.set(0, this.yaw, 0);
    // 프레임이 튀는 듯한 글리치
    this.jitter -= dt;
    if (this.jitter <= 0) {
      this.jitter = 0.05 + Math.random() * (this.chasing ? 0.25 : 0.8);
      const k = this.chasing ? 1 : 0.4;
      this.jx = (Math.random() - 0.5) * 0.06 * k;
      this.jy = (Math.random() - 0.5) * 0.05 * k;
      this.js = 1 + (Math.random() - 0.5) * 0.05 * k;
    }
    const b = this.body;
    b.position.set(this.jx || 0, this.jy || 0, 0);
    b.scale.setScalar(this.js || 1);
    // 걸음에 맞춰 좌우로 기우뚱
    b.rotation.z = Math.sin(this.t * (this.chasing ? 9 : 4.2)) * (this.chasing ? 0.08 : 0.05);
    b.rotation.x = this.chasing ? -0.12 : 0;
  }

  /** 엘리베이터 표시기에 보여줄 내용 (원작: 엘리베이터면 층수, 계단이면 Err) */
  indicator() {
    if (this.state === 'elevator') {
      const moving = this.elevDelay <= 0 && Math.abs(this.elevTarget - this.elevFloor) > 0.01;
      const dir = moving ? Math.sign(this.elevTarget - this.elevFloor) : 0;
      const shown = dir > 0 ? Math.floor(this.elevFloor + 1e-6) : Math.ceil(this.elevFloor - 1e-6);
      return { text: `${shown + 1}`, dir, err: false };
    }
    if (this.state === 'arriving') return { text: `${this.doorK + 1}`, dir: 0, err: false };
    return { text: '', dir: 0, err: true };
  }
}
