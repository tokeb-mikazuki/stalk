// 송신 — 계단과 엘리베이터를 오가며 플레이어를 쫓는 존재
import * as THREE from 'three';
import {
  FLOORS, R_MID, R_OUT, PHI_MIN, PHI_MAX, baseY, floorIndex, landingCenter, pathDist, polar,
} from './config.js';

const HEIGHT = 1.85;

export class Stalker {
  constructor(scene, texture) {
    const aspect = texture.image ? texture.image.width / texture.image.height : 1;
    this.material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.04,
      fog: true,
      color: new THREE.Color(0.85, 0.85, 0.85),
    });
    this.sprite = new THREE.Sprite(this.material);
    this.baseScale = new THREE.Vector2(HEIGHT * aspect, HEIGHT);
    this.sprite.scale.set(this.baseScale.x, this.baseScale.y, 1);
    this.sprite.renderOrder = 2;
    scene.add(this.sprite);
    this.pos = new THREE.Vector3();
    this.humPos = new THREE.Vector3();
    this.reset();
  }

  reset(diff) {
    this.diff = diff;
    this.state = 'elevator';
    this.phi = landingCenter(8);
    this.r = R_OUT + 0.75;
    this.elevFloor = 7 + Math.floor(Math.random() * 6);
    this.elevTarget = this.elevFloor;
    this.elevDelay = 22 + Math.random() * 6; // 시작 유예 시간
    this.hunting = false;
    this.huntQueued = false;
    this.chaseTime = 0;
    this.loseTime = 0;
    this.timer = 0;
    this.doorK = -1;
    this.roamTarget = this.phi;
    this.visible = false;
    this.glitchT = 0;     // 표시기 글리치 남은 시간
    this.t = 0;
    this.jitter = 0;
    this.justSpotted = false;
    this.sprite.visible = false;
  }

  get floor() {
    return this.state === 'elevator' ? Math.round(this.elevFloor) : floorIndex(this.phi);
  }

  get inElevator() {
    return this.state === 'elevator';
  }

  get chasing() {
    return this.state === 'chase';
  }

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

  pickElevatorTarget(playerFloor) {
    const cur = Math.round(this.elevFloor);
    let t = cur;
    for (let i = 0; i < 10 && t === cur; i++) {
      if (Math.random() < 0.6) {
        // 플레이어 근처 층(바로 옆 층은 피함)
        const off = (2 + Math.floor(Math.random() * 4)) * (Math.random() < 0.6 ? 1 : -1);
        t = playerFloor + off;
      } else {
        t = Math.floor(Math.random() * FLOORS);
      }
      t = Math.max(0, Math.min(FLOORS - 1, t));
    }
    return t;
  }

  startElevatorRide(target, delay, game) {
    this.state = 'elevator';
    this.elevTarget = target;
    this.elevDelay = delay;
    this.visible = false;
    if (Math.random() < 0.3) this.glitchT = 5; // 원작: 엘리베이터 출발 시 30% 확률 글리치
    game.onStalkerRide?.();
  }

  /** 외부 사건(층 체류, 열쇠, 버튼)으로 플레이어를 사냥하러 옴 */
  hunt(player) {
    if (this.state === 'chase') return 'already';
    const d = pathDist(this.phi, this.r, player.phi, player.r);
    if (this.visible && d < 30) {
      this.beginChase();
      return 'chase';
    }
    if (this.state === 'elevator') {
      this.hunting = true;
      this.elevDelay = Math.min(this.elevDelay, 1.2);
      return 'elevator';
    }
    // 계단 위 먼 곳 → 사라졌다가 엘리베이터로 온다
    this.huntQueued = true;
    this.state = 'vanish';
    this.timer = 0;
    return 'vanish';
  }

  beginChase() {
    this.state = 'chase';
    this.chaseTime = 0;
    this.loseTime = 0;
    // 발견 직후 잠깐 멈춰 웃는다 — 도망칠 틈
    this.windup = this.hunting ? 0.5 : 0.95;
    this.hunting = false;
    this.justSpotted = true;
  }

  detect(player) {
    const d = pathDist(this.phi, this.r, player.phi, player.r);
    const sight = this.diff.sight + (player.torchOn ? 4 : 0) - (player.crouching ? 2.5 : 0);
    return d < Math.max(player.noise, sight);
  }

  update(dt, player, game) {
    const diff = this.diff;
    this.t += dt;
    this.justSpotted = false;
    this.glitchT = Math.max(0, this.glitchT - dt);
    const elevs = game.world.elevators;

    switch (this.state) {
      case 'elevator': {
        this.visible = false;
        if (this.hunting) this.elevTarget = player.floor;
        if (this.elevDelay > 0) {
          this.elevDelay -= dt;
          break;
        }
        const spd = (this.hunting ? 2.4 : 1) / diff.elevatorSecPerFloor;
        const d = this.elevTarget - this.elevFloor;
        if (Math.abs(d) <= spd * dt) {
          this.elevFloor = this.elevTarget;
          this.state = 'arriving';
          this.timer = 0;
          this.doorK = this.elevTarget;
          this.phi = landingCenter(this.doorK);
          this.r = R_OUT + 0.75;
          elevs[this.doorK].target = 1;
          game.onElevatorArrive?.(this.doorK, this.hunting);
        } else {
          this.elevFloor += Math.sign(d) * spd * dt;
        }
        break;
      }

      case 'arriving': {
        this.timer += dt;
        if (this.timer > 1.1) {
          this.visible = true;
          this.moveToward(this.phi, R_MID, diff.roamSpeed * 1.3, dt);
          if (this.r < R_OUT - 0.7) {
            game.closeElevator(this.doorK, 1.5);
            if (this.hunting || this.detect(player)) this.beginChase();
            else this.pickRoam(player);
          }
        }
        break;
      }

      case 'roam': {
        this.visible = true;
        const wob = Math.sin(this.t * 0.7) * 0.35;
        const rem = this.moveToward(this.roamTarget, R_MID + wob, diff.roamSpeed, dt);
        if (rem < 0.25) {
          if (Math.random() < 0.55) {
            this.state = 'toElevator';
            this.doorK = floorIndex(this.phi);
          } else {
            this.pickRoam(player);
          }
        }
        if (this.detect(player)) this.beginChase();
        break;
      }

      case 'toElevator': {
        this.visible = true;
        const tPhi = landingCenter(this.doorK);
        this.moveToward(tPhi, R_OUT + 0.8, diff.roamSpeed, dt);
        if (this.r > R_OUT - 1.3 && elevs[this.doorK].target === 0) {
          elevs[this.doorK].target = 1;
          game.onDoorOpen?.(this.doorK);
        }
        if (this.r > R_OUT + 0.6) {
          this.visible = false;
          game.closeElevator(this.doorK, 0.4);
          this.elevFloor = this.doorK;
          this.startElevatorRide(this.pickElevatorTarget(player.floor), 1.5 + Math.random() * 5, game);
          break;
        }
        if (this.detect(player)) this.beginChase();
        break;
      }

      case 'chase': {
        this.visible = true;
        this.chaseTime += dt;
        const speed = diff.chaseSpeed + diff.chaseSpeedPerFloor * player.maxFloor;
        if (this.windup > 0) this.windup -= dt;
        else this.moveToward(player.phi, player.r, speed, dt);
        const d = pathDist(this.phi, this.r, player.phi, player.r);
        this.loseTime = d > 21 ? this.loseTime + dt : 0;
        if (this.loseTime > 3.5) {
          // 놓쳤다 → 가까운 계단참으로 가서 엘리베이터를 탄다
          this.state = 'toElevator';
          this.doorK = Math.max(0, Math.min(FLOORS - 1, Math.round((this.phi - landingCenter(0)) / (Math.PI * 2))));
          game.onChaseEnd?.('lost');
        } else if (this.chaseTime > diff.chaseMax && d > 5) {
          this.state = 'vanish';
          this.timer = 0;
          game.onChaseEnd?.('vanish');
        }
        break;
      }

      case 'vanish': {
        this.timer += dt;
        this.visible = Math.random() < 0.5 * (1 - this.timer);
        if (this.timer > 0.9) {
          this.visible = false;
          const here = floorIndex(this.phi);
          this.elevFloor = here;
          if (this.huntQueued) {
            this.huntQueued = false;
            this.hunting = true;
            this.startElevatorRide(player.floor, 1.5, game);
          } else {
            // 멀리 떨어진 층에서 다시 시작
            let far = player.floor + (Math.random() < 0.5 ? -1 : 1) * (6 + Math.floor(Math.random() * 4));
            if (far < 0 || far >= FLOORS) far = player.floor < FLOORS / 2 ? FLOORS - 1 : 0;
            this.elevFloor = far;
            this.startElevatorRide(this.pickElevatorTarget(player.floor), 7 + Math.random() * 8, game);
          }
        }
        break;
      }
    }

    this.phi = Math.max(PHI_MIN - 0.1, Math.min(PHI_MAX + 0.05, this.phi));
    this.updateSprite(dt);
  }

  pickRoam(player) {
    const k = floorIndex(this.phi);
    let t = k;
    while (t === k) {
      // 플레이어 쪽으로 약간 끌려감
      const toward = Math.sign(player.floor - k) || (Math.random() < 0.5 ? 1 : -1);
      const off = Math.random() < 0.65 ? toward * (1 + Math.floor(Math.random() * 2)) : -toward;
      t = Math.max(0, Math.min(FLOORS - 1, k + off));
    }
    this.roamTarget = landingCenter(t);
    this.state = 'roam';
  }

  updateSprite(dt) {
    const y = baseY(this.phi) + HEIGHT * 0.5 + 0.35 + Math.sin(this.t * 2.1) * 0.06;
    polar(this.r, this.phi, y, this.pos);
    // 엘리베이터 승강로 위치 (모터 소리용)
    polar(R_OUT + 0.9, landingCenter(0), this.elevFloor * 3.6 + 1.2, this.humPos);

    const s = this.sprite;
    s.visible = this.visible;
    if (!this.visible) return;
    s.position.copy(this.pos);
    // 프레임이 튀는 듯한 글리치
    this.jitter -= dt;
    if (this.jitter <= 0) {
      this.jitter = 0.05 + Math.random() * (this.chasing ? 0.25 : 0.8);
      const g = this.chasing ? 1 : 0.4;
      this.jx = (Math.random() - 0.5) * 0.08 * g;
      this.jy = (Math.random() - 0.5) * 0.06 * g;
      this.js = 1 + (Math.random() - 0.5) * 0.06 * g;
    }
    s.position.x += this.jx || 0;
    s.position.y += this.jy || 0;
    const sc = this.js || 1;
    s.scale.set(this.baseScale.x * sc, this.baseScale.y * sc, 1);
    this.material.rotation = Math.sin(this.t * (this.chasing ? 9 : 1.3)) * (this.chasing ? 0.07 : 0.03);
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
