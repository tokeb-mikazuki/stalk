// 디버그 패널 — 코나미 코드(↑ ↑ ↓ ↓ ← → ← → B A)로 열고 닫는다
// 원하는 층으로 이동, 무적·송신 정지·무한 체력, 게임 속도, 사건 발동, 진행 상황 조작, 실시간 상태 보기.
import { ACHIEVEMENTS } from './achievements.js';
import { DIFFICULTY_ORDER, landingCenter } from './config.js';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];

const CSS = `
#debug { position: fixed; top: 16px; right: 16px; z-index: 100; width: 300px; max-height: calc(100vh - 32px); overflow-y: auto;
  background: rgba(8,10,12,.94); border: 1px solid #2c3a2c; color: #cfe8cf; font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace;
  padding: 12px 14px 14px; display: none; box-shadow: 0 8px 30px rgba(0,0,0,.6); }
#debug.on { display: block; }
#debug h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: .2em; color: #7cff7c; display: flex; justify-content: space-between; }
#debug h3 button { all: unset; cursor: pointer; color: #8a9a8a; padding: 0 4px; }
#debug h4 { margin: 12px 0 6px; font-size: 11px; letter-spacing: .25em; color: #6f8a6f; border-top: 1px solid #1d261d; padding-top: 8px; }
#debug label { display: flex; align-items: center; gap: 8px; margin: 3px 0; cursor: pointer; }
#debug .row { display: flex; gap: 6px; align-items: center; margin: 4px 0; flex-wrap: wrap; }
#debug input[type=number] { width: 64px; background: #0f150f; color: #dfffdf; border: 1px solid #2f442f; padding: 3px 5px; font: inherit; }
#debug input[type=range] { flex: 1; accent-color: #5fd35f; }
#debug button.b { background: #132013; color: #cfe8cf; border: 1px solid #2f442f; padding: 4px 8px; font: inherit; cursor: pointer; }
#debug button.b:hover { background: #1c311c; color: #fff; }
#debug button.warn { border-color: #5a2a2a; color: #ffbcbc; background: #201212; }
#debug pre { margin: 6px 0 0; padding: 8px; background: #050705; border: 1px solid #1a241a; color: #9fd89f; white-space: pre-wrap; font-size: 11px; }
#debug .hint { color: #5d6f5d; font-size: 10px; margin-top: 8px; }
`;

export class DebugPanel {
  constructor(game) {
    this.g = game;
    this.open = false;
    this.god = false;      // 잡히지 않음
    this.freeze = false;   // 송신 AI 정지
    this.hide = false;     // 송신 숨김 (없는 것처럼)
    this.infinite = false; // 체력·배터리 무한
    this.speed = 1;        // 게임 속도
    this.seq = 0;
    this.infoT = 0;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = (this.el = document.createElement('div'));
    el.id = 'debug';
    el.innerHTML = `
      <h3>DEBUG <button data-dbg="close" title="닫기 (Esc)">✕</button></h3>
      <h4>이동</h4>
      <div class="row">층 <input type="number" id="dbg-floor" min="1" value="1"> <button class="b" data-dbg="go">이동</button>
        <button class="b" data-dbg="top">꼭대기</button></div>
      <div class="row"><button class="b" data-dbg="win">즉시 탈출 (엔딩)</button></div>
      <h4>송신</h4>
      <label><input type="checkbox" data-opt="god"> 무적 (잡히지 않음)</label>
      <label><input type="checkbox" data-opt="freeze"> 송신 정지 (AI 멈춤)</label>
      <label><input type="checkbox" data-opt="hide"> 송신 숨기기</label>
      <div class="row"><button class="b" data-dbg="hunt">FOUND YOU 발동</button><button class="b" data-dbg="summon">내 층으로 부르기</button></div>
      <div class="row"><button class="b" data-dbg="away">멀리 보내기</button><button class="b" data-dbg="callEl">엘리베이터 호출</button></div>
      <h4>플레이어</h4>
      <label><input type="checkbox" data-opt="infinite"> 체력·배터리 무한</label>
      <div class="row">속도 <input type="range" id="dbg-speed" min="0.25" max="3" step="0.25" value="1"> <span id="dbg-speed-v">1×</span></div>
      <div class="row"><button class="b" data-dbg="unlockRooms">비상실 모두 열기</button></div>
      <h4>진행</h4>
      <div class="row"><button class="b" data-dbg="clearAll">모든 난이도 해금</button><button class="b" data-dbg="achAll">도전과제 전부</button></div>
      <div class="row"><button class="b warn" data-dbg="reset">진행 초기화</button></div>
      <h4>상태</h4>
      <pre id="dbg-info">-</pre>
      <div class="hint">↑↑↓↓←→←→BA 또는 Esc 로 닫기</div>`;
    document.body.appendChild(el);
    this.info = el.querySelector('#dbg-info');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dbg]');
      if (b) this.action(b.dataset.dbg);
    });
    el.addEventListener('change', (e) => {
      const opt = e.target.dataset.opt;
      if (opt) this[opt] = e.target.checked;
    });
    const sp = el.querySelector('#dbg-speed');
    sp.addEventListener('input', () => {
      this.speed = +sp.value;
      el.querySelector('#dbg-speed-v').textContent = `${this.speed}×`;
    });
    // 패널 안에서 누른 키는 게임으로 가지 않는다
    el.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.toggle(false);
      e.stopPropagation();
    });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  onKey(e) {
    if (e.code === KONAMI[this.seq]) {
      this.seq++;
      if (this.seq === KONAMI.length) {
        this.seq = 0;
        this.toggle();
      }
    } else {
      this.seq = e.code === KONAMI[0] ? 1 : 0;
    }
    if (this.open && e.code === 'Escape') {
      e.stopImmediatePropagation();
      e.preventDefault();
      this.toggle(false);
    }
  }

  toggle(on = !this.open) {
    const g = this.g;
    this.open = on;
    this.el.classList.toggle('on', on);
    if (on) {
      const floors = g.world ? g.world.fireDoors.length : 20;
      const fl = this.el.querySelector('#dbg-floor');
      fl.max = String(floors);
      fl.value = String((g.player?.floor ?? 0) + 1);
      for (const k in g.input) g.input[k] = false;
      if (document.pointerLockElement) document.exitPointerLock();
      g.audio.uiTone?.(880, 1320, 0.07, 0.05);
    } else if (g.state === 'playing') {
      g.lock?.();
    }
  }

  action(name) {
    const g = this.g, p = g.player, s = g.stalker;
    const playing = g.state === 'playing';
    switch (name) {
      case 'close':
        this.toggle(false);
        break;
      case 'go':
      case 'top': {
        if (!playing) return;
        const n = g.world.fireDoors.length;
        const k = name === 'top' ? n - 1 : Math.max(1, Math.min(n, parseInt(this.el.querySelector('#dbg-floor').value, 10) || 1)) - 1;
        this.teleport(k);
        break;
      }
      case 'win':
        if (playing) g.win();
        break;
      case 'hunt':
        if (playing) g.triggerHunt('hide');
        break;
      case 'summon':
        if (!playing) return;
        if (!s.inElevator) s.teleportIntoCar(s.floor, g);
        s.hunting = false;
        s.startElevatorRide(Math.min(g.world.fireDoors.length - 1, p.floor + 1), 0.5, g);
        break;
      case 'away':
        if (!playing) return;
        s.huntQueued = false;
        s.hunting = false;
        s.burst = false;
        if (!s.inElevator) {
          s.setState('vanish');
          s.timer = 0;
        }
        break;
      case 'callEl':
        if (!playing) return;
        g.elevator.call(p.floor, 'player');
        g.world.elevators[p.floor].setCall(true);
        break;
      case 'unlockRooms':
        if (!g.world) return;
        for (const d of g.world.fireDoors) {
          d.locked = false;
          d.exitSign.material = g.world.doorMats.exitOn;
          if (d.lamp.baseKind !== undefined) d.lamp.kind = d.lamp.baseKind;
        }
        break;
      case 'clearAll':
        for (const k of DIFFICULTY_ORDER) g.progress.data.cleared[k] = true;
        g.progress.save();
        g.refreshTitle?.();
        break;
      case 'achAll':
        for (const a of ACHIEVEMENTS) g.progress.data.ach[a.id] = g.progress.data.ach[a.id] || Date.now();
        g.progress.save();
        g.refreshTitle?.();
        break;
      case 'reset':
        g.progress.data = { ach: {}, cleared: {}, deaths: 0, notes: [], hints: [] };
        g.progress.save();
        g.hints?.clear?.();
        g.refreshTitle?.();
        break;
    }
    g.audio.uiTone?.(660, 720, 0.05, 0.04);
  }

  /** k층 계단참으로 순간 이동 (방·엘리베이터 안이면 빠져나온다) */
  teleport(k) {
    const g = this.g, p = g.player;
    g.closeCctv();
    g.trap = null;
    const keep = { battery: p.battery, torchOn: p.torchOn, maxFloor: p.maxFloor };
    p.reset(landingCenter(k) - 0.3);
    Object.assign(p, keep);
    p.maxFloor = Math.max(keep.maxFloor, k);
    g.clock.getDelta();
  }

  /** 매 프레임: 실시간 상태 */
  update(dt) {
    if (!this.open) return;
    this.infoT -= dt;
    if (this.infoT > 0) return;
    this.infoT = 0.15;
    const g = this.g, p = g.player, s = g.stalker, el = g.elevator;
    if (!g.world || !p) return;
    const b = s.belief;
    this.info.textContent = [
      `상태     ${g.state}  ${g.diff ? g.diff.label : ''}`,
      `플레이어 ${p.floor + 1}F${p.inRoom ? ' (비상실)' : p.inCar ? ' (엘리베이터)' : ''}  체류 ${p.floorTime.toFixed(0)}s`,
      `         체력 ${p.stamina.toFixed(0)}  배터리 ${p.battery.toFixed(0)}  소음 ${p.noise.toFixed(1)}`,
      `송신     ${s.state} @ ${s.inElevator ? `E${el.floor.toFixed(1)}` : `${s.floor + 1}F`}  ${s.visible ? '보임' : '안 보임'}`,
      `         사냥 ${s.hunting ? 'O' : '-'}  문부수기 ${s.burst ? 'O' : '-'}  관심없음 ${s.calmT.toFixed(0)}s`,
      `         짐작 ${b && b.t < 1e8 ? `${Math.round(b.phi / (Math.PI * 4)) + 1}F 근처, ${b.t.toFixed(1)}s 전` : '없음'}`,
      `엘리베이터 ${el.floor.toFixed(1)}  문 ${el.doorK >= 0 ? el.doorK + 1 + 'F 열림' : '닫힘'}  탑승 ${el.occupant || '-'}`,
    ].join('\n');
  }
}
