// 실제로 오르내리는 엘리베이터 한 대 (송신과 플레이어가 함께 쓴다)
//
// - 호출(call): 각 층 버튼. 송신도 플레이어도 누를 수 있다.
// - 탑승자(occupant): 'stalker' | 'player' | null. 탑승자가 있으면 그 목적지(dest)를 먼저 간다.
// - 송신이 타고 있을 때 들어온 호출은 송신이 내린 뒤에 처리한다.
import { FLOORS } from './config.js';

export class Elevator {
  constructor(game) {
    this.g = game;
    this.reset(0);
  }

  reset(floor) {
    this.floor = floor;      // 현재 위치 (실수, 층 인덱스)
    this.target = null;      // 지금 향하는 층
    this.calls = [];         // [{k, who}]
    this.dest = null;        // 탑승자 목적지
    this.occupant = null;
    this.doorK = -1;         // 문이 열려 있는 층
    this.doorT = 0;          // 문을 열어 둘 남은 시간
    this.speedMul = 1;
  }

  get moving() {
    return this.target !== null && this.doorK < 0;
  }

  /** k층에서 문이 충분히 열려 있어 드나들 수 있는지 */
  isOpenAt(k) {
    return this.doorK === k && this.g.world.elevators[k].open > 0.7;
  }

  call(k, who) {
    if (k < 0 || k >= FLOORS) return;
    if (this.doorK === k) {
      this.doorT = Math.max(this.doorT, 3.5); // 이미 그 층에 열려 있으면 더 열어 둔다
      return;
    }
    if (!this.calls.some((c) => c.k === k)) this.calls.push({ k, who });
  }

  /** 탑승자 목적지 */
  send(k) {
    this.dest = Math.max(0, Math.min(FLOORS - 1, k));
    if (this.target !== null && this.doorK < 0) this.target = this.dest; // 가는 중이면 목적지 변경
    if (this.doorK >= 0 && this.doorK === this.dest) this.doorT = Math.max(this.doorT, 2);
    else if (this.doorK >= 0) this.doorT = Math.min(this.doorT, 0.6);
  }

  hold(sec) {
    if (this.doorK >= 0) this.doorT = Math.max(this.doorT, sec);
  }

  openDoors(k, hold) {
    const e = this.g.world.elevators[k];
    this.doorK = k;
    this.doorT = hold;
    e.target = 1;
    this.g.onElevatorArrive?.(k, this);
  }

  closeDoors() {
    if (this.doorK < 0) return;
    const e = this.g.world.elevators[this.doorK];
    if (e.target !== 0) this.g.audio.doorSlide(e.doorPos);
    e.target = 0;
    this.closingK = this.doorK;
    this.doorK = -1;
  }

  update(dt) {
    const elevs = this.g.world.elevators;
    if (this.doorK >= 0) {
      this.doorT -= dt;
      if (this.doorT <= 0 && !this.g.blockElevatorClose?.(this.doorK)) this.closeDoors();
      return;
    }
    // 문이 완전히 닫힌 뒤에 움직인다
    if (this.closingK !== undefined && this.closingK >= 0 && elevs[this.closingK].open > 0.02) return;
    this.closingK = -1;

    if (this.target === null) {
      if (this.dest !== null) this.target = this.dest;
      else if (this.occupant !== 'stalker' && this.calls.length) this.target = this.calls[0].k;
      else return;
    }
    const secPerFloor = this.g.diff.elevatorSecPerFloor / this.speedMul;
    const d = this.target - this.floor;
    const step = dt / secPerFloor;
    if (Math.abs(d) <= step) {
      const k = this.target;
      this.floor = k;
      this.target = null;
      if (this.dest === k) this.dest = null;
      this.calls = this.calls.filter((c) => c.k !== k);
      for (const e of elevs) if (e.k === k) e.btnMat.color.setHex(0x334433);
      this.openDoors(k, this.occupant === 'stalker' ? 6 : 4.5);
    } else {
      this.floor += Math.sign(d) * step;
    }
  }
}
