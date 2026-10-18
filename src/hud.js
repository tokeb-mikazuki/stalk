// DOM HUD / 화면 전환
const $ = (s) => document.querySelector(s);

// 왼쪽 버튼이 칠해진 마우스 아이콘
const MOUSE_LEFT = '<svg class="mouse" viewBox="0 0 16 22" aria-label="좌클릭"><rect x="1" y="1" width="14" height="20" rx="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v8M1.8 9h12.4" stroke="currentColor" stroke-width="1.2"/><path d="M8 1.2A6.8 6.8 0 0 0 1.2 8V9H8z" fill="currentColor"/></svg>';

export class Hud {
  constructor() {
    this.el = $('#hud');
    this.floorNum = $('#floor .num');
    this.goalEl = $('#floor .goal');
    this.stFill = $('#stamina .fill');
    this.btFill = $('#battery .fill');
    this.btVal = $('#battery .v');
    this.detector = $('#detector');
    this.detLabel = $('#detector .head b');
    this.prompt = $('#prompt');
    this.msgEl = $('#msg');
    this.warnEl = $('#warn');
    this.note = $('#note');
    this.clickHint = $('#clickhint');
    const dbars = $('#dbars');
    this.bars = [];
    for (let i = 0; i < 20; i++) {
      const b = document.createElement('i');
      dbars.appendChild(b);
      this.bars.push(b);
    }
    this.msgT = 0;
    this.lastFloor = '';
    this.lastPrompt = '';
  }

  show(on) {
    this.el.classList.toggle('on', on);
  }

  screen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  setFloor() {
    /* 층 표시 없음 */
  }

  /** 현재 층은 알려주지 않는다 (벽에 칠해진 층 번호로만 알 수 있음) */
  setGoal(left, needKey = false) {
    const t = needKey ? '목표: 열쇠를 찾아 옥상 문으로' : left <= 0 ? '목표: 옥상 문을 열고 탈출' : '목표: 옥상 문으로 탈출';
    if (t !== this.lastGoal) {
      this.lastGoal = t;
      this.goalEl.textContent = t;
    }
  }

  setStamina(v, exhausted) {
    this.stFill.style.width = `${v}%`;
    this.stFill.classList.toggle('ex', exhausted);
  }

  setBattery(v) {
    this.btFill.style.width = `${v}%`;
    this.btFill.classList.toggle('low', v < 20);
    this.btVal.textContent = `${Math.ceil(v)}%`;
  }

  /** 원작의 synth meter: 가까울수록 막대가 크게 요동친다 */
  setDetector(level) {
    const f = Math.max(0, Math.min(1, level));
    this.bars.forEach((b, i) => {
      const factor = (i + 1) / this.bars.length;
      const amp = 0.05 + f * 1.15;
      const h = 3 + Math.random() * amp * 54 * factor;
      b.style.height = `${Math.min(54, h)}px`;
      b.style.opacity = 0.3 + 0.7 * f;
    });
    this.detector.classList.toggle('hot', f > 0.65);
    this.detLabel.textContent = f < 0.08 ? '신호 없음' : f < 0.4 ? '약한 신호' : f < 0.65 ? '신호 감지' : '매우 가까움';
  }

  setPrompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    if (text) {
      const touch = this.keyLabel && this.keyLabel !== 'E';
      this.prompt.innerHTML = touch ? `<kbd>${this.keyLabel}</kbd>${text}` : `<kbd>E</kbd>${MOUSE_LEFT}${text}`;
    }
    this.prompt.classList.toggle('on', !!text);
  }

  /** 하단 문구. cls: 'alert' 이면 붉은 강조 */
  msg(text, dur = 3.2, cls = '') {
    this.msgEl.textContent = text;
    this.msgEl.classList.toggle('alert', cls === 'alert');
    this.msgEl.classList.add('on');
    this.msgT = dur;
  }

  warn(text = 'FOUND YOU') {
    this.warnEl.textContent = text;
    this.warnEl.classList.remove('on');
    void this.warnEl.offsetWidth;
    this.warnEl.classList.add('on');
  }

  toast(text) {
    const el = document.getElementById('toast');
    const item = document.createElement('div');
    item.textContent = text;
    el.appendChild(item);
    setTimeout(() => item.classList.add('out'), 3600);
    setTimeout(() => item.remove(), 4300);
  }

  showNote(title, body) {
    this.note.querySelector('h3').textContent = title;
    this.note.querySelector('p').textContent = body;
    this.note.classList.add('on');
    this.clickHint.classList.remove('on');
  }

  hideNote() {
    this.note.classList.remove('on');
  }

  get noteOpen() {
    return this.note.classList.contains('on');
  }

  update(dt) {
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) this.msgEl.classList.remove('on');
    }
  }

  /** 결과 화면 통계: [[이름, 값, 강조?], ...] */
  stats(id, rows) {
    $(`#${id} .stats`).innerHTML = rows.map(([k, v, hl]) => `<div class="st ${hl ? 'hl' : ''}"><span>${k}</span><b>${v}</b></div>`).join('');
  }
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}분 ${String(s).padStart(2, '0')}초`;
}
