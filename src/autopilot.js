// 자동 클리어 AI (디버그) — 사람처럼 입력만으로 플레이한다. 송신을 꿰뚫어 보지 않고, 보이는 것과 들리는 것으로 판단한다.
//
// 오르기: 손전등을 끄고 조용히 걸어서 나선을 오른다. 쫓기면 체력이 있을 때만 달린다 (지친 채 달리다 넘어지지 않게).
// 숨기:   쫓기는데 이 층에 열린 비상실이 가까우면 들어가 문을 닫고, 송신이 떠나면(또는 같은 층 체류 한계 전에) 나온다.
// 열쇠:   악몽에서는 열쇠부터 — 비상실 책상 위면 그 층에서 들어가 줍고, 엘리베이터 안이면 불러서 들어갔다 바로 나온다.
// 탈출:   꼭대기 층 옥상 문을 연다.
import {
  R_MID, R_OUT, CORR_L, LANDING, ROOF_DOOR_PHI, fireDoorPhi, pathDist, toRoomLocal, fromRoomLocal, fromElevLocal, toElevLocal,
} from './config.js';

const HIDE_SPOT = { lx: 0.05, lz: -2.7 };

export class AutoPilot {
  constructor(game) {
    this.g = game;
    this.reset();
  }

  reset() {
    this.state = 'climb';
    this.t = 0;
    this.stateT = 0;
    this.room = -1;
    this.purpose = 'hide';
    this.lastPhi = null;
    this.stuckT = 0;
    this.wiggle = 0;
    this.fleeT = 0;
    this.status = '';
  }

  set(s, why = '') {
    this.state = s;
    this.stateT = 0;
    this.status = why;
  }

  /** 월드 (x,z) 쪽으로 몸을 돌리고 걷는다 */
  steer(x, z, run = false) {
    const g = this.g, p = g.player, inp = g.input;
    p.yaw = Math.atan2(-(x - p.x), -(z - p.z)) + this.wiggle;
    p.pitch = 0;
    inp.f = true;
    inp.sprint = run && p.stamina > 25 && !p.exhausted;
    return Math.hypot(x - p.x, z - p.z);
  }

  stop() {
    const inp = this.g.input;
    for (const k in inp) inp[k] = false;
  }

  /** 송신이 위협인지 (보이고, 쫓아오거나 가까울 때만) */
  threat() {
    const g = this.g, s = g.stalker, p = g.player;
    if (!s.visible || s.inElevator) return { danger: false, dist: Infinity };
    const dist = s.distTo(p);
    return { danger: s.chasing || dist < 12, chasing: s.chasing, dist };
  }

  update(dt) {
    const g = this.g, p = g.player, doors = g.world.fireDoors;
    this.t += dt;
    this.stateT += dt;
    this.stop();
    if (p.torchOn && !g.cctv) p.toggleTorch(); // 어둠 속에서 조용히 — 불빛은 멀리서도 보인다
    if (g.cctv) g.closeCctv();
    if (g.hud.noteOpen) g.hud.hideNote();
    const th = this.threat();
    const top = doors.length - 1;
    const needKey = g.diff.keyRequired && !g.hasKey;

    // 막힘 감지: 계단을 오르는 중인데 몇 초째 제자리면 살짝 비틀어 본다
    if (this.state === 'climb') {
      if (this.lastPhi !== null && Math.abs(p.phi - this.lastPhi) < 0.02 * dt * 60) this.stuckT += dt;
      else this.stuckT = Math.max(0, this.stuckT - dt);
      this.lastPhi = p.phi;
      if (this.stuckT > 2.5) {
        this.wiggle = (Math.random() - 0.5) * 1.6;
        this.stuckT = 0;
      }
    }
    this.wiggle *= Math.pow(0.2, dt);

    switch (this.state) {
      case 'climb': {
        if (p.inRoom) return this.set('exitRoom', '방에서 나가는 중');
        const k = p.floor;
        // 악몽: 열쇠 먼저
        if (needKey && g.keyWhere === k && !th.danger) {
          this.room = k;
          this.purpose = 'key';
          return this.set('toRoom', `${k + 1}F 비상실의 열쇠를 가지러`);
        }
        // 엘리베이터 열쇠: 송신이 계단 저 멀리 나와 있는 걸 확인했을 때만 부른다 (차 안에 송신이 있으면 문이 열리자마자 끝이다)
        const sOut = g.stalker.visible && !g.stalker.inElevator && g.elevator.occupant !== 'stalker';
        if (needKey && g.keyWhere === 'car' && !th.danger && k >= 2 && sOut && g.stalker.distTo(p) > 22) {
          return this.set('carCall', '엘리베이터 안의 열쇠를 가지러');
        }
        // 쫓기거나 다가오면 송신보다 먼저 닿을 수 있는 열린 비상실로 숨는다
        if (th.danger && th.dist < 16) {
          const room = this.safeRoom();
          if (room >= 0) {
            this.room = room;
            this.purpose = 'hide';
            return this.set('toRoom', `${room + 1}F 비상실로 피신`);
          }
        }
        // 위에서 내려오면 오르지 말고 등을 돌려 달아난다
        if (th.danger && th.dist < 14 && g.stalker.phi > p.phi && p.phi > 2) this.fleeT = 2.5;
        this.fleeT = Math.max(0, (this.fleeT || 0) - dt);
        if (this.fleeT > 0) {
          const tphi = p.phi - 1.4 / R_MID;
          this.steer(R_MID * Math.cos(tphi), R_MID * Math.sin(tphi), true);
          this.status = '위에서 온다 — 아래로 도망';
          return;
        }
        // 꼭대기: 옥상 문
        if (k === top && p.phi > ROOF_DOOR_PHI - LANDING - 0.05 && !needKey) {
          const rp = g.world.roof.pos;
          if (this.steer(rp.x, rp.z) < 1.3) {
            g.win();
            this.set('done', '탈출!');
          }
          return;
        }
        if (k === top && needKey && typeof g.keyWhere === 'number' && g.keyWhere < k) {
          // 열쇠 층을 지나쳤다 — 내려간다
          const tphi = Math.max(fireDoorPhi(g.keyWhere), p.phi - 1.2 / R_MID);
          this.steer(R_MID * Math.cos(tphi), R_MID * Math.sin(tphi), th.danger);
          this.status = '열쇠 층으로 내려가는 중';
          return;
        }
        // 나선을 따라 위로 (계단 가운데 선을 따라 1.4m 앞을 본다)
        const goal = ROOF_DOOR_PHI - 0.2;
        const tphi = Math.min(goal, p.phi + 1.4 / R_MID);
        const run = th.danger && th.dist < 14;
        this.steer(R_MID * Math.cos(tphi), R_MID * Math.sin(tphi), run);
        this.status = run ? '도망치는 중' : `오르는 중 (${k + 1}F)`;
        return;
      }

      case 'toRoom': {
        const d = doors[this.room];
        if (!d || d.locked) return this.set('climb');
        const dp = fireDoorPhi(this.room);
        const front = R_OUT - 0.55;
        const dist = this.steer(front * Math.cos(dp), front * Math.sin(dp), th.danger);
        if (dist < 0.7) {
          if (d.target < 1) {
            d.target = 1;
            g.audio.creak?.(d.pos);
          }
          if (d.open > 0.7) this.set('enterRoom');
        }
        if (this.stateT > 12) this.set('climb', '비상실에 못 들어감');
        return;
      }

      case 'enterRoom': {
        const d = doors[this.room];
        const goal = this.purpose === 'key' ? { lx: 0.25, lz: -2.95 } : HIDE_SPOT;
        const c = p.inRoom ? toRoomLocal(p.x, p.z) : { lx: 0, lz: 1 };
        // 문간 → 복도 → 방 안쪽 순서로
        const way = c.lz > -CORR_L - 0.1 ? { lx: 0, lz: -CORR_L - 0.5 } : goal;
        const w = fromRoomLocal(way.lx, way.lz);
        this.steer(w.x, w.z, th.danger);
        if (p.inRoom && c.lz < -CORR_L - 0.35) {
          if (this.purpose === 'hide') {
            d.target = 0; // 문을 닫는다
            if (Math.hypot(c.lx - goal.lx, c.lz - goal.lz) < 0.4) this.set('hide', '숨어서 기다리는 중');
          } else {
            const key = g.items.find((it) => it.type === 'key' && !it.car);
            if (key && Math.hypot(key.pos.x - p.x, key.pos.z - p.z) < 0.9) {
              this.pick(key);
              this.purpose = 'hide';
              this.set('exitRoom', '열쇠를 얻었다');
            }
          }
        }
        if (this.stateT > 15) this.set('exitRoom');
        return;
      }

      case 'hide': {
        const s = g.stalker;
        const close = s.visible && !s.inElevator && s.distTo(p) < 18;
        const busy = s.state === 'search' || s.state === 'chase' || close;
        const limit = g.diff.hideThreshold - 6;
        p.pitch = 0;
        // 송신이 떠났거나, 같은 층 체류 한계가 가까우면 나간다
        if ((!busy && this.stateT > 5) || p.floorTime > limit) this.set('exitRoom', '송신이 떠났다');
        this.status = busy ? '숨죽이는 중 (송신이 근처에)' : '숨어서 기다리는 중';
        return;
      }

      case 'exitRoom': {
        if (!p.inRoom) return this.set('climb');
        const d = doors[p.roomK];
        if (d.target < 1) d.target = 1;
        const c = toRoomLocal(p.x, p.z);
        // 방 안쪽이면 먼저 복도 입구 정면으로, 그다음 곧장 문밖으로
        const way = Math.abs(c.lx) > 0.2 && c.lz < -CORR_L - 0.1 ? { lx: 0, lz: -CORR_L - 0.4 } : { lx: 0, lz: 0.8 };
        const w = fromRoomLocal(way.lx, way.lz);
        if (d.open > 0.6 || c.lz < -CORR_L - 0.2) this.steer(w.x, w.z, th.danger);
        if (this.stateT > 12) this.set('climb');
        return;
      }

      case 'carCall': {
        // 엘리베이터 앞에서 호출 → 열리면 들어가서 열쇠 → 바로 나온다
        const k = p.floor;
        const el = g.elevator;
        const front = fromElevLocal(0, 0.9);
        if (th.danger || g.stalker.inElevator || el.occupant === 'stalker') return this.set('climb', '송신 때문에 열쇠는 나중에');
        const dist = this.steer(front.x, front.z);
        if (dist < 0.5) {
          this.stop();
          const e = g.world.elevators[k];
          if (!el.isOpenAt(k) && !el.calls.some((c) => c.k === k) && el.doorK !== k) {
            el.call(k, 'player');
            e.setCall(true);
            e.press();
          }
          if (el.isOpenAt(k) && el.occupant !== 'stalker' && Math.abs(el.floor - k) < 0.01) this.set('carIn');
        }
        if (this.stateT > 45) this.set('climb', '엘리베이터가 오지 않는다');
        return;
      }

      case 'carIn': {
        const el = g.elevator, k = p.floor;
        if (!el.isOpenAt(k) && !p.inCar) return this.set('carCall');
        const key = g.items.find((it) => it.type === 'key' && it.car);
        if (!key) return this.set('carOut');
        const target = fromElevLocal(key.local.x * 0.6, key.local.z + 0.35);
        this.steer(target.x, target.z, true);
        const kp = g.world.car.group.localToWorld(key.local.clone());
        if (Math.hypot(kp.x - p.x, kp.z - p.z) < 0.75) {
          this.pick(key);
          this.set('carOut', '열쇠를 얻었다 — 바로 나간다');
        }
        if (this.stateT > 5) this.set('carOut');
        return;
      }

      case 'carOut': {
        const out = fromElevLocal(0, 1.2);
        const c = toElevLocal(p.x, p.z);
        this.steer(out.x, out.z, true);
        if (!p.inCar && c.lz > 0.6) this.set('climb');
        return;
      }

      case 'done':
        return;
    }
  }

  /** 숨을 비상실: 이 층·아래·위층 가운데 열려 있고, 송신보다 확실히 먼저 닿는 가장 가까운 곳 (-1: 없음) */
  safeRoom() {
    const g = this.g, p = g.player, s = g.stalker, doors = g.world.fireDoors;
    let best = -1, bestD = 11;
    for (let k = p.floor - 1; k <= p.floor + 1; k++) {
      const d = doors[k];
      if (!d || d.locked) continue;
      const dp = fireDoorPhi(k);
      const me = pathDist(p.phi, p.r, dp, R_OUT - 0.5);
      const it = pathDist(s.phi, s.r, dp, R_OUT - 0.5);
      // 송신이 문과 나 사이에 있으면 안 된다
      const between = (s.phi - p.phi) * (dp - p.phi) > 0 && Math.abs(s.phi - p.phi) < Math.abs(dp - p.phi) + 0.3;
      if (!between && me < bestD && me < it * 0.7) {
        best = k;
        bestD = me;
      }
    }
    return best;
  }

  /** 아이템 줍기 (상호작용과 같은 결과) */
  pick(it) {
    const g = this.g;
    it.mesh.parent?.remove(it.mesh);
    g.items.splice(g.items.indexOf(it), 1);
    if (it.type === 'key') g.hasKey = true;
    g.audio.pickup?.();
    g.hud.msg('옥상 열쇠를 얻었다', 2.6);
  }
}

