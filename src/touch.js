// 모바일 터치 조작: 왼쪽 가상 조이스틱(이동) + 오른쪽 드래그(시점) + 버튼
const STICK_R = 62;

export function isTouchDevice() {
  return (
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window
  );
}

export class TouchControls {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('touch');
    this.base = this.root.querySelector('.stick');
    this.knob = this.root.querySelector('.knob');
    this.useBtn = this.root.querySelector('[data-touch=use]');
    this.crouchBtn = this.root.querySelector('[data-touch=crouch]');
    this.torchBtn = this.root.querySelector('[data-touch=torch]');
    this.joy = { id: null, ox: 0, oy: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.enabled = false;
    this.bind();
  }

  enable(on) {
    this.enabled = on;
    document.body.classList.toggle('touch', on);
  }

  show(on) {
    this.root.classList.toggle('on', on && this.enabled);
    if (!on) this.release();
  }

  release() {
    this.joy.id = null;
    this.look.id = null;
    const inp = this.g.input;
    inp.axisX = 0;
    inp.axisY = 0;
    inp.sprint = false;
    this.base.classList.remove('on');
  }

  bind() {
    const r = this.root;
    const opts = { passive: false };
    r.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (e.target.closest('[data-touch]')) return;
      e.preventDefault();
      if (this.g.hud.noteOpen) {
        this.g.hud.hideNote();
        return;
      }
      if (this.g.cctv) {
        this.g.cctvTap(e.clientX, e.clientY);
        return;
      }
      const left = e.clientX < window.innerWidth * 0.42;
      if (left && this.joy.id === null) {
        this.joy.id = e.pointerId;
        this.joy.ox = e.clientX;
        this.joy.oy = e.clientY;
        this.base.style.left = `${e.clientX}px`;
        this.base.style.top = `${e.clientY}px`;
        this.knob.style.transform = 'translate(-50%, -50%)';
        this.base.classList.add('on');
      } else if (!left && this.look.id === null) {
        this.look.id = e.pointerId;
        this.look.x = e.clientX;
        this.look.y = e.clientY;
      }
      try { r.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    }, opts);

    r.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joy.id) {
        e.preventDefault();
        let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.g.input.axisX = dx / STICK_R;
        this.g.input.axisY = -dy / STICK_R;
      } else if (e.pointerId === this.look.id) {
        e.preventDefault();
        const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y;
        this.look.x = e.clientX;
        this.look.y = e.clientY;
        if (this.g.state === 'playing' && !this.g.hud.noteOpen) {
          const s = this.g.settings;
          this.g.player.look(dx, dy * (s.invert ? -1 : 1), 0.0048 * s.sens);
        }
      }
    }, opts);

    const end = (e) => {
      if (e.pointerId === this.joy.id) {
        this.joy.id = null;
        this.g.input.axisX = 0;
        this.g.input.axisY = 0;
        this.base.classList.remove('on');
      }
      if (e.pointerId === this.look.id) this.look.id = null;
    };
    r.addEventListener('pointerup', end);
    r.addEventListener('pointercancel', end);

    // 버튼
    r.querySelectorAll('[data-touch]').forEach((b) => {
      const act = b.dataset.touch;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('down');
        const g = this.g;
        if (g.state !== 'playing') return;
        if (act === 'use') g.interact();
        else if (act === 'torch') {
          if (g.player.toggleTorch()) g.audio.torchClick();
          else g.hud.msg('배터리가 없다.');
        } else if (act === 'crouch') g.input.crouch = !g.input.crouch;
        else if (act === 'run') g.input.sprint = true;
        else if (act === 'pause') g.pause();
      }, opts);
      const up = () => {
        b.classList.remove('down');
        if (act === 'run') this.g.input.sprint = false;
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    });
  }

  /** 매 프레임: 버튼 상태 표시 */
  update(canUse) {
    if (!this.enabled) return;
    this.useBtn.classList.toggle('ready', !!canUse);
    this.crouchBtn.classList.toggle('active', !!this.g.input.crouch);
    this.torchBtn.classList.toggle('active', this.g.player.torchOn);
  }
}
