// 실제로 오르내리는 엘리베이터 한 대 (송신과 플레이어가 함께 쓴다) — 실제 엘리베이터처럼 움직인다
//
// - 요청: 각 층 호출 버튼(hall call)과 탑승자가 누른 층 버튼(car call). 누가 눌렀든 먼저 누른 순서대로 간다.
//   가는 길에 같은 방향 호출이 있고 멈출 수 있으면 들렀다 간다 (실제 엘리베이터의 승강 운전).
// - 움직임: 서서히 가속하고 도착 전에 서서히 감속한다. 반대 방향으로 가려면 먼저 멈춘다. 순간이동은 없다.
// - 문: 다 닫혀야 출발한다. 닫히는 중에 그 층 호출 버튼을 누르면 다시 열린다.
// - 송신이 타고 가는 도중 플레이어가 다른 층에서 부르면, 송신이 누른 층 버튼은 취소되고 플레이어가 부른 층에 선다.
import { FLOORS } from './config.js';

const ACCEL_TIME = 1.3; // 최고 속도까지 걸리는 시간(초)

export class Elevator {
  constructor(game) {
    this.g = game;
    this.reset(0);
  }

  reset(floor) {
    this.floor = floor;      // 현재 위치 (실수, 층 인덱스)
    this.v = 0;              // 속도 (층/초, 위가 +)
    this.target = null;      // 지금 향하는 층
    this.calls = [];         // 층 호출 [{k, who, t}] — 누른 순서
    this.dest = null;        // 탑승자가 누른 층 (car call)
    this.destT = 0;
    this.hijack = null;      // 송신이 탄 채 플레이어가 부른 층 — 송신의 층 버튼은 무시된다
    this.stop = null;        // 가는 길에 들르기로 한 층
    this.occupant = null;
    this.doorK = -1;         // 문이 열려 있는 층
    this.doorT = 0;          // 문을 열어 둘 남은 시간
    this.closingK = -1;
    this.speedMul = 1;
    this.clock = 0;
  }

  get moving() {
    return this.target !== null && this.doorK < 0;
  }

  /** 지금 서 있는 층 (움직이는 중이면 null) */
  get stoppedAt() {
    return this.v === 0 && Math.abs(this.floor - Math.round(this.floor)) < 1e-4 ? Math.round(this.floor) : null;
  }

  /** k층에서 문이 충분히 열려 있어 드나들 수 있는지 */
  isOpenAt(k) {
    return this.doorK === k && this.g.world.elevators[k].open > 0.7;
  }

  /** 층 호출 버튼 */
  call(k, who) {
    if (k < 0 || k >= FLOORS) return;
    if (this.doorK === k) {
      this.doorT = Math.max(this.doorT, 3.5); // 이미 그 층에 열려 있으면 더 열어 둔다
      return;
    }
    // 송신이 타고 가는 중에 플레이어가 부르면: 송신이 누른 층은 취소, 플레이어 층으로
    const hijack = who === 'player' && this.occupant === 'stalker';
    if (hijack) {
      this.hijack = k;
      this.dest = k;
      this.stop = null;
      if (this.target !== null) this.target = this.pickTarget();
      this.g.onElevatorHijack?.(k);
    }
    // 그 층에서 문이 닫히는 중이고 아직 출발 전이면 다시 연다 (송신이 타 있으면 그대로 마주친다)
    if (this.closingK === k && this.stoppedAt === k && this.v === 0) {
      if (hijack) {
        this.hijack = null;
        this.dest = null;
      }
      this.target = null;
      this.openDoors(k, hijack ? 6 : 3.5, hijack);
      return;
    }
    if (!this.calls.some((c) => c.k === k)) this.calls.push({ k, who, t: this.clock });
  }

  /** 탑승자가 층 버튼을 누름 (car call) */
  send(k) {
    if (this.hijack !== null) return; // 플레이어가 부른 층으로 가는 중 — 송신의 버튼은 취소됐다
    k = Math.max(0, Math.min(FLOORS - 1, k));
    if (this.dest !== k) this.destT = this.clock;
    this.dest = k;
    if (this.doorK >= 0 && this.doorK === k) this.doorT = Math.max(this.doorT, 2);
    else if (this.doorK >= 0) this.doorT = Math.min(this.doorT, 0.6);
    else if (this.target !== null) this.target = this.pickTarget();
  }

  hold(sec) {
    if (this.doorK >= 0) this.doorT = Math.max(this.doorT, sec);
  }

  openDoors(k, hold, arrive = true) {
    const e = this.g.world.elevators[k];
    this.doorK = k;
    this.doorT = hold;
    this.closingK = -1;
    e.target = 1;
    if (arrive) this.g.onElevatorArrive?.(k, this);
  }

  closeDoors() {
    if (this.doorK < 0) return;
    const e = this.g.world.elevators[this.doorK];
    if (e.target !== 0) this.g.audio.doorSlide(e.doorPos);
    e.target = 0;
    this.closingK = this.doorK;
    this.doorK = -1;
  }

  /** 다음에 갈 층: 탑승자 버튼과 층 호출 가운데 먼저 눌린 것 */
  pickTarget() {
    if (this.hijack !== null) return this.hijack;
    const reqs = [];
    if (this.dest !== null) reqs.push({ k: this.dest, t: this.destT });
    // 송신이 타고 있으면 다른 층 호출은 송신이 내린 뒤에 (플레이어의 호출은 위에서 hijack 으로 처리)
    if (this.occupant !== 'stalker') for (const c of this.calls) reqs.push(c);
    if (!reqs.length) return null;
    reqs.sort((a, b) => a.t - b.t);
    return reqs[0].k;
  }

  /** 가는 길(같은 방향)에 멈출 수 있는 층 호출이 있으면 그 층 */
  enRoute(target, aMax) {
    if (this.occupant === 'stalker' || this.hijack !== null) return target;
    const dir = Math.sign(target - this.floor);
    if (!dir) return target;
    const stopDist = (this.v * this.v) / (2 * aMax);
    let best = target;
    for (const c of this.calls) {
      const ahead = (c.k - this.floor) * dir;
      if (ahead > stopDist + 0.02 && ahead < (best - this.floor) * dir) best = c.k;
    }
    return best;
  }

  update(dt) {
    const elevs = this.g.world.elevators;
    this.clock += dt;
    if (this.doorK >= 0) {
      this.doorT -= dt;
      if (this.doorT <= 0 && !this.g.blockElevatorClose?.(this.doorK)) this.closeDoors();
      return;
    }
    // 문이 완전히 닫힌 뒤에 움직인다
    if (this.closingK >= 0 && elevs[this.closingK].open > 0.02) return;
    this.closingK = -1;

    const vMax = this.speedMul / this.g.diff.elevatorSecPerFloor;
    const aMax = vMax / ACCEL_TIME;
    if (this.target === null || this.v === 0) this.target = this.pickTarget();
    if (this.target === null) return;
    // 들르기로 정한 층은 끝까지 지킨다 (감속에 들어가면 '멈출 수 있나' 판단이 뒤집히므로)
    if (this.stop !== null && this.stop !== undefined && !this.calls.some((c) => c.k === this.stop)) this.stop = null;
    if (this.stop === null || this.stop === undefined) {
      const g = this.enRoute(this.target, aMax);
      this.stop = g !== this.target ? g : null;
    }
    const goal = this.stop ?? this.target;

    const d = goal - this.floor;
    const dir = Math.sign(d);
    // 반대 방향으로 가는 중이면 먼저 멈춘다
    if (this.v !== 0 && Math.sign(this.v) !== dir) {
      const nv = this.v - Math.sign(this.v) * aMax * dt;
      this.v = Math.sign(nv) === Math.sign(this.v) ? nv : 0;
      this.floor += this.v * dt;
      return;
    }
    // 남은 거리에서 멈출 수 있는 속도를 넘지 않게: 가속 → 정속 → 감속
    const brake = Math.sqrt(2 * aMax * Math.abs(d));
    const ns = Math.max(Math.min(vMax, brake, Math.abs(this.v) + aMax * dt), Math.min(0.06 * vMax, brake * 4));
    this.v = dir * ns;
    const step = Math.abs(this.v) * dt;
    if (Math.abs(d) <= Math.max(step, 0.003)) {
      this.arrive(goal);
      return;
    }
    this.floor += this.v * dt;
  }

  arrive(k) {
    this.floor = k;
    this.v = 0;
    this.target = null;
    this.stop = null;
    if (this.dest === k) this.dest = null;
    if (this.hijack === k) {
      this.hijack = null;
      this.dest = null;
    }
    this.calls = this.calls.filter((c) => c.k !== k);
    this.g.world.elevators[k].setCall(false);
    this.openDoors(k, this.occupant === 'stalker' ? 6 : 4.5);
  }
}
