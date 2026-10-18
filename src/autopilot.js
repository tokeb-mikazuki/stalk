// 자동 클리어 AI (디버그) — 사람처럼 입력만으로 플레이한다. 화면에 보이는 것(피구공의 모습, SIGNAL 탐지기,
// 엘리베이터 표시등)과 들리는 것으로 판단한다.
//
// 원칙: 들키지 않는 것이 전부다. 악몽의 피구공은 달리기와 거의 같은 속도로 쫓아오므로 한번 들키면 뿌리칠 수 없다.
// - 걷는다. 달리기는 소리가 두 배로 퍼져 오히려 피구공을 부른다 — 쫓길 때만 달리고, 체력은 바닥나기 전에 아낀다.
// - 피구공이 보이면(쫓기기 전에) 피구공보다 먼저 닿는 열린 비상실로 조용히 들어가 문을 닫는다. 없으면 멀어지는 쪽으로 걷고,
//   너무 가까우면 웅크려 소리를 죽인다.
// - 피구공이 탄 엘리베이터가 이 층으로 오면 엘리베이터 문 앞을 피한다.
// - 숨어서는 피구공이 떠날 때까지(엘리베이터에 타서 문이 닫힐 때까지) 기다린다. 같은 층 체류 한계 직전에는 어쩔 수 없이 나간다.
// - 악몽: 열쇠부터 (비상실 책상 / 엘리베이터 안 — 꺼내자마자 나온다). 꼭대기 층 옥상 문으로 탈출.
import {
  R_MID, R_OUT, CORR_L, LANDING, FLOOR_PHI, DOOR_ANGLE, ROOF_DOOR_PHI, fireDoorPhi, pathDist, toRoomLocal, fromRoomLocal, fromElevLocal, toElevLocal,
} from './config.js';

const HIDE_SPOT = { lx: 0.05, lz: -2.7 };
const WALK = 2.9, SPRINT = 5.4;

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
    this.mode = 'walk';
    this.lastPhi = null;
    this.stuckT = 0;
    this.wiggle = 0;
    this.runOK = true;
    this.quietT = 0;
    this.fleeT = 0;
    this.fleeDir = 1;
    this.status = '';
  }

  set(s, why = '') {
    this.state = s;
    this.stateT = 0;
    this.quietT = 0;
    this.status = why;
  }

  /** 월드 (x,z) 쪽으로 몸을 돌리고 간다. mode: walk | run | sneak */
  steer(x, z, mode = 'walk') {
    const g = this.g, p = g.player, inp = g.input;
    const want = Math.atan2(-(x - p.x), -(z - p.z)) + this.wiggle;
    let dy = want - p.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    p.yaw += Math.abs(dy) > 0.6 ? dy : dy * 0.5; // 큰 방향 전환은 바로, 작은 건 부드럽게
    p.pitch *= 0.8;
    inp.f = true;
    inp.sprint = mode === 'run' && this.runOK && !p.exhausted;
    inp.crouch = mode === 'sneak';
    return Math.hypot(x - p.x, z - p.z);
  }

  /** 계단 가운데 선을 따라 위(+1) 또는 아래(-1)로 */
  walkSpiral(dir, mode) {
    const p = this.g.player;
    const tphi = Math.min(ROOF_DOOR_PHI - 0.2, Math.max(0.3, p.phi + (dir * 1.4) / R_MID));
    this.steer(R_MID * Math.cos(tphi), R_MID * Math.sin(tphi), mode);
  }

  stop() {
    const inp = this.g.input;
    for (const k in inp) inp[k] = false;
  }

  /** 지금 보이는 것: 피구공의 위치·상태, 들키는 거리, 엘리베이터 표시등 */
  look() {
    const g = this.g, p = g.player, s = g.stalker, el = g.elevator, diff = g.diff;
    const seen = s.visible && !s.inElevator;
    let d = seen ? s.distTo(p) : Infinity;
    // 숨어 있을 때는 층을 뚫은 직선거리가 아니라, 피구공이 계단을 따라 이 방 문까지 와야 하는 거리
    if (seen && p.inRoom && s.roomK !== p.roomK) d = pathDist(s.phi, s.r, fireDoorPhi(p.roomK), R_OUT - 0.5) + 2.5;
    const chased = seen && s.chasing;
    const sharp = 1 + 0.3 * s.heightRatio(p);
    const walkR = 8.5 * diff.hearingMul * sharp; // 걸으면 이 안에서 들킨다
    const sightR = diff.sight * sharp;
    const speed = chased ? diff.chaseSpeed + diff.chaseSpeedPerFloor * p.maxFloor : s.state === 'approach' ? diff.approachSpeed : diff.roamSpeed * 1.3;
    // 피구공이 탄 엘리베이터가 이 층으로 오는 중이거나 이 층에서 열려 있다
    // 피구공이 탄 엘리베이터가 가는 층(표시등) — 이 층이나 바로 위·아래면, 그 층 엘리베이터 문 근처는 위험하다
    const k = p.floor;
    const T = s.inElevator ? (el.doorK >= 0 ? el.doorK : el.target ?? el.dest) : null;
    const carT = T !== null && T !== undefined && Math.abs(T - k) <= 1 ? T : null;
    const doorPhi = carT !== null ? carT * FLOOR_PHI + DOOR_ANGLE : k * FLOOR_PHI + DOOR_ANGLE;
    const carHere = carT !== null;
    const nearCar = carHere && !p.inRoom && pathDist(p.phi, p.r, doorPhi, R_OUT - 0.4) < 14;
    // 문이 열린 비상실 안에서는 층을 뚫고 6m 안이면 들킨다 (직선거리)
    const raw = seen ? s.distTo(p) : Infinity;
    return { seen, d, raw, chased, above: seen && s.phi > p.phi, walkR, sightR, speed, carHere, nearCar, doorPhi, carT };
  }

  update(dt) {
    const g = this.g, p = g.player, doors = g.world.fireDoors;
    this.t += dt;
    this.stateT += dt;
    this.stop();
    if (p.torchOn && !g.cctv) p.toggleTorch(); // 어둠 속에서 조용히 — 불빛은 멀리서도 보인다
    if (g.cctv) g.closeCctv();
    if (g.hud.noteOpen) g.hud.hideNote();
    const L = this.look();
    const top = doors.length - 1;
    const needKey = g.diff.keyRequired && !g.hasKey;
    // 달리기 체력: 바닥나기 전에 멈추고(넘어지지 않게), 충분히 회복되면 다시
    if (p.stamina < 8) this.runOK = false;
    else if (p.stamina > 45) this.runOK = true;

    // 막힘 감지: 걷는 중인데 몇 초째 제자리면 살짝 비틀어 본다
    if (this.state === 'climb') {
      if (this.lastPhi !== null && Math.abs(p.phi - this.lastPhi) < 0.01 * dt * 60 && !g.input.crouch) this.stuckT += dt;
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

        // 0) 같은 층에 너무 오래 있었다(곧 FOUND YOU) 또는 이미 FOUND YOU: 가장 가까운 층 경계를 넘는다 — 층이 바뀌면 다시 센다
        const hunted = g.stalker.hunting || g.stalker.huntQueued || (g.huntFloor !== null && g.huntFloor !== undefined);
        if ((p.floorTime > g.diff.hideThreshold - 6 || hunted) && !L.chased && k >= 1) { // 1층은 체류 페널티가 없다
          const lo = k * FLOOR_PHI, hi = (k + 1) * FLOOR_PHI;
          let dir = p.phi - lo < hi - p.phi ? -1 : 1;
          if (k === 0) dir = 1;
          if (L.seen && L.d < 14 && Math.sign(g.stalker.phi - p.phi) === dir) dir = -dir; // 피구공 쪽 경계는 피한다
          const quiet = L.seen && L.d < L.walkR + 5;
          this.walkSpiral(dir, hunted ? 'run' : quiet ? 'sneak' : 'walk');
          this.status = hunted ? 'FOUND YOU — 층을 바꾼다' : `같은 층에 너무 오래 — ${quiet ? '웅크려 ' : ''}층을 바꾼다`;
          return;
        }

        // 1) 쫓긴다: 먼저 닿는 비상실로 뛰어든다. 없으면 피구공 반대쪽으로 달아난다
        if (L.chased) {
          const room = this.safeRoom(this.runOK ? SPRINT : WALK, L.speed, 0.9, L);
          if (room >= 0) return this.goHide(room, 'run', `쫓긴다 — ${room + 1}F 비상실로`);
          // 달아날 방향은 한번 정하면 잠깐 유지한다 (피구공이 바로 위아래를 오갈 때 갈팡질팡하지 않게)
          this.fleeT -= dt;
          if (this.fleeT <= 0 || (L.d < 4 && Math.sign(g.stalker.phi - p.phi) === this.fleeDir)) {
            this.fleeDir = L.above && p.phi > 2 ? -1 : 1;
            this.fleeT = 2;
          }
          const dir = this.fleeDir;
          this.walkSpiral(dir, 'run');
          this.status = dir < 0 ? '쫓긴다 — 아래로 달아나는 중' : '쫓긴다 — 위로 달아나는 중';
          return;
        }

        // 2) 피구공이 보인다(아직 들키지 않음): 조용히 비상실로, 없으면 멀어진다
        const near = L.seen && L.d < L.walkR + 12;
        if (near) {
          const room = this.safeRoom(WALK, L.speed, 0.8, L);
          if (room >= 0) return this.goHide(room, 'walk', `피구공이 보인다 — ${room + 1}F 비상실에 숨는다`);
          // 걸어서는 못 닿지만 달리면 먼저 닿는 방: 들키더라도 뛰어들어 문을 닫는다 (쫓아와도 닫힌 문 앞에서 멈춘다)
          if (this.runOK && p.stamina > 50) {
            const dash = this.safeRoom(SPRINT, L.d < L.walkR + 4 ? L.speed + 1.4 : g.diff.chaseSpeed + g.diff.chaseSpeedPerFloor * p.maxFloor, 0.75, L);
            if (dash >= 0) return this.goHide(dash, 'run', `피구공이 다가온다 — ${dash + 1}F 비상실로 뛴다`);
          }
          const dir = L.above && p.phi > 2 ? -1 : 1;
          const sneak = L.d < L.walkR + 2;
          this.walkSpiral(dir, sneak ? 'sneak' : 'walk');
          this.status = `${sneak ? '웅크려 ' : ''}피구공에게서 멀어지는 중 (${L.d.toFixed(0)}m)`;
          return;
        }

        // 3) 피구공이 탄 엘리베이터가 이 층으로 온다: 이 층 비상실에 숨거나, 엘리베이터 문 앞을 피한다
        if (L.nearCar) {
          const d = doors[L.carT];
          const time = L.carT !== k || p.floorTime < g.diff.hideThreshold - 14;
          if (d && !d.locked && time && pathDist(p.phi, p.r, fireDoorPhi(L.carT), R_OUT - 0.5) < 6) return this.goHide(L.carT, 'walk', '엘리베이터가 온다 — 비상실에 숨는다');
          if (p.phi < L.doorPhi + 0.4) {
            this.walkSpiral(-1, 'walk');
            this.status = '엘리베이터가 온다 — 물러서는 중';
          } else {
            this.walkSpiral(1, 'walk');
            this.status = '엘리베이터가 온다 — 서둘러 지나간다';
          }
          return;
        }

        // 4) 악몽: 열쇠
        if (needKey && g.keyWhere === k && doors[k] && !doors[k].locked) {
          this.room = k;
          this.purpose = 'key';
          this.mode = 'walk';
          return this.set('toRoom', `${k + 1}F 비상실의 열쇠를 가지러`);
        }
        // 엘리베이터 열쇠: 피구공이 계단 저 멀리 나와 있는 걸 확인했을 때만 부른다 (차 안에 피구공이 있으면 문이 열리자마자 끝이다)
        const sOut = g.stalker.visible && !g.stalker.inElevator && g.elevator.occupant !== 'stalker';
        if (needKey && g.keyWhere === 'car' && k >= 2 && sOut && L.d > 22) {
          return this.set('carCall', '엘리베이터 안의 열쇠를 가지러');
        }

        // 5) 꼭대기: 옥상 문
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
          this.walkSpiral(-1, 'walk');
          this.status = '열쇠 층으로 내려가는 중';
          return;
        }
        if (k === top && needKey && g.keyWhere === 'car') {
          // 엘리베이터 열쇠를 아직 못 얻었다 — 꼭대기 층 비상실에서 기회를 기다린다
          const d = doors[k];
          if (d && !d.locked && p.floorTime < g.diff.hideThreshold - 10) return this.goHide(k, 'walk', '엘리베이터 열쇠 기회를 기다린다');
        }

        // 6) 평소: 걸어서 오른다. 피구공이 엘리베이터 안에 갇혀 있는 동안(문이 닫힘)은 아무것도 못 느끼니 서두른다
        const deaf = g.stalker.inElevator && g.elevator.doorK < 0 && !L.carHere;
        const hurry = deaf && p.stamina > 60 && this.runOK;
        this.walkSpiral(1, hurry ? 'run' : 'walk');
        this.status = hurry ? `피구공이 엘리베이터 안 — 서둘러 오른다 (${k + 1}F)` : `오르는 중 (${k + 1}F)`;
        return;
      }

      case 'toRoom': {
        const d = doors[this.room];
        if (!d || d.locked) return this.set('climb');
        // 가는 길에 피구공이 앞을 막으면 다시 판단
        if (this.purpose === 'hide' && L.seen && this.stateT > 0.3) {
          const dp = fireDoorPhi(this.room);
          const it = pathDist(g.stalker.phi, g.stalker.r, dp, R_OUT - 0.5);
          const me = pathDist(p.phi, p.r, dp, R_OUT - 0.5);
          if (it < me * 0.7 && it < 6) return this.set('climb', '피구공이 앞을 막았다');
          if (L.chased) this.mode = 'run';
        }
        const dp = fireDoorPhi(this.room);
        const front = R_OUT - 0.55;
        // 나선은 층마다 같은 자리를 지나므로, 문이 멀면 계단을 따라 가고 가까워지면 문 앞으로 곧장
        if (Math.abs(dp - p.phi) > 0.9) {
          this.walkSpiral(Math.sign(dp - p.phi), this.mode);
          return;
        }
        this.steer(front * Math.cos(dp), front * Math.sin(dp), this.mode);
        const dist = pathDist(p.phi, p.r, dp, front);
        if (dist < 0.7) {
          if (d.target < 1) {
            d.target = 1;
            g.audio.creak?.(d.pos);
          }
          if (d.open > 0.7) this.set('enterRoom');
        }
        if (this.stateT > 14) this.set('climb', '비상실에 못 들어감');
        return;
      }

      case 'enterRoom': {
        const d = doors[this.room];
        const goal = this.purpose === 'key' ? { lx: 0.25, lz: -2.95 } : HIDE_SPOT;
        const c = p.inRoom ? toRoomLocal(p.x, p.z) : { lx: 0, lz: 1 };
        // 문간 → 복도 → 방 안쪽 순서로
        const way = c.lz > -CORR_L - 0.1 ? { lx: 0, lz: -CORR_L - 0.5 } : goal;
        const w = fromRoomLocal(way.lx, way.lz);
        this.steer(w.x, w.z, L.chased ? 'run' : 'walk');
        if (p.inRoom && c.lz < -0.75) d.target = 0; // 복도에 들어서자마자 문을 닫는다 (열린 문 너머로는 층을 뚫고도 들킨다)
        if (p.inRoom && c.lz < -CORR_L - 0.35) {
          if (this.purpose === 'hide') {
            if (Math.hypot(c.lx - goal.lx, c.lz - goal.lz) < 0.4) this.set('hide', '숨어서 기다리는 중');
          } else {
            const key = g.items.find((it) => it.type === 'key' && !it.car);
            if (key && Math.hypot(key.pos.x - p.x, key.pos.z - p.z) < 0.9) {
              this.pick(key);
              this.purpose = 'hide';
              this.set('hide', '열쇠를 얻었다 — 잠깐 숨을 고른다');
            }
          }
        }
        if (this.stateT > 15) this.set('exitRoom');
        return;
      }

      case 'hide': {
        const s = g.stalker;
        p.pitch *= 0.8;
        // 피구공이 가까이 있거나(계단·문 앞·같은 층 엘리베이터), 이 층으로 오는 중이면 기다린다
        const busy = (L.seen && L.d < 30) || s.state === 'search' || s.state === 'chase' || L.carHere || s.state === 'arriving' || s.state === 'trapWait';
        this.quietT = busy ? 0 : this.quietT + dt;
        const limit = g.diff.hideThreshold - 4;
        // 체류 한계가 다가와도 피구공이 문밖 가까이 있으면 나가지 않는다 (문 앞을 막고 있는 동안은 체류 시간이 흐르지 않는다)
        const outside = L.seen && (L.d < 7 || L.raw < 8);
        if (p.floorTime > limit && !outside) return this.set('exitRoom', '더 머물면 들킨다 — 잠깐 층을 바꾼다');
        if (s.hunting && !L.seen) return this.set('exitRoom', 'FOUND YOU — 문을 부수러 온다, 층을 바꾼다');
        if (this.quietT > 1.2 && this.stateT > 2) return this.set('exitRoom', '피구공이 떠났다');
        this.status = busy ? `숨죽이는 중 (피구공이 근처에, ${Math.max(0, limit - p.floorTime).toFixed(0)}초 여유)` : '조용해지기를 기다리는 중';
        return;
      }

      case 'exitRoom': {
        if (!p.inRoom) return this.set('climb');
        const d = doors[p.roomK];
        // 문을 열기 전에 피구공이 다시 보이면 도로 숨는다 (체류 한계면 웅크려 나간다 — 문밖에 바짝 붙어 있을 때만 기다린다)
        const forced = p.floorTime > g.diff.hideThreshold - 4;
        if (!g.stalker.hunting && d.open < 0.3 && L.seen && (forced ? L.d < 7 || L.raw < 8 : L.d < 16 || L.raw < 9)) {
          d.target = 0;
          return this.set('hide', '문밖에 피구공 — 도로 숨는다');
        }
        if (d.target < 1) d.target = 1;
        const c = toRoomLocal(p.x, p.z);
        // 방 안쪽이면 먼저 복도 입구 정면으로, 그다음 곧장 문밖으로
        const way = Math.abs(c.lx) > 0.2 && c.lz < -CORR_L - 0.1 ? { lx: 0, lz: -CORR_L - 0.4 } : { lx: 0, lz: 0.8 };
        const w = fromRoomLocal(way.lx, way.lz);
        const quiet = L.seen && L.d < L.walkR + 5;
        if (d.open > 0.6 || c.lz < -CORR_L - 0.2) this.steer(w.x, w.z, L.chased || g.stalker.hunting ? 'run' : quiet ? 'sneak' : 'walk');
        if (this.stateT > 12) this.set('climb');
        return;
      }

      case 'carCall': {
        // 엘리베이터 앞에서 호출 → 열리면 들어가서 열쇠 → 바로 나온다
        const k = p.floor;
        const el = g.elevator;
        const front = fromElevLocal(0, 0.9);
        if ((L.seen && L.d < L.walkR + 10) || g.stalker.inElevator || el.occupant === 'stalker') return this.set('climb', '피구공 때문에 열쇠는 나중에');
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
        this.steer(target.x, target.z, 'run');
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
        this.steer(out.x, out.z, 'run');
        if (!p.inCar && c.lz > 0.6) this.set('climb');
        return;
      }

      case 'done':
        return;
    }
  }

  goHide(k, mode, why) {
    this.room = k;
    this.purpose = 'hide';
    this.mode = mode;
    this.set('toRoom', why);
  }

  /**
   * 숨을 비상실: 이 층·아래·위층 가운데 열려 있고, 피구공보다 확실히 먼저 닿는 가장 가까운 곳 (-1: 없음)
   * mySpeed/itSpeed 로 도착 시간을 견주고(문 여는 시간 포함), margin 만큼 여유가 있어야 한다.
   */
  safeRoom(mySpeed, itSpeed, margin, L) {
    const g = this.g, p = g.player, s = g.stalker, doors = g.world.fireDoors;
    let best = -1, bestT = Infinity;
    for (let k = p.floor - 1; k <= p.floor + 1; k++) {
      const d = doors[k];
      if (!d || d.locked) continue;
      // 이 층에 숨기엔 체류 시간이 얼마 안 남았다 (다른 층 방이면 층이 바뀌어 다시 센다)
      if (k === p.floor && p.floorTime > g.diff.hideThreshold - 14) continue;
      const dp = fireDoorPhi(k);
      const me = pathDist(p.phi, p.r, dp, R_OUT - 0.5);
      const tMe = me / mySpeed + 0.9;
      if (me > 26) continue;
      if (L.seen) {
        const it = pathDist(s.phi, s.r, dp, R_OUT - 0.5);
        // 피구공이 문과 나 사이에 있으면 안 된다
        const between = (s.phi - p.phi) * (dp - p.phi) > 0 && Math.abs(s.phi - p.phi) < Math.abs(dp - p.phi) + 0.3;
        if (between || tMe > (it / itSpeed) * margin) continue;
      }
      if (tMe < bestT) {
        best = k;
        bestT = tMe;
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
