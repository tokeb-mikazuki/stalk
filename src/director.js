// 공포 연출 감독: 층 체류 페널티, 무작위 공포 이벤트, 조명 깜빡임
import * as THREE from 'three';
import {
  TAU, FLOORS, FLOOR_H, R_IN, R_MID, PHI_MAX, PHI_MIN, baseY, pathDist, polar, landingCenter, R_OUT,
} from './config.js';

const EVENTS = [
  ['peek', 3],
  ['blackout', 2],
  ['ding', 2],
  ['footsteps', 2],
  ['whisper', 2],
  ['laugh', 1.5],
  ['sign', 1.2],
];

export class Director {
  constructor(game, phantom) {
    this.g = game;
    this.phantom = phantom; // 송신 환영 스프라이트
    this.tmp = new THREE.Vector3();
    this.reset();
  }

  reset() {
    const d = this.g.diff;
    this.next = d ? d.eventMin + 10 : 30;
    this.lightMul = 1;
    this.flickerT = 0;
    this.blackoutT = 0;
    this.torchKill = 0;
    this.hideWarned = false;
    this.warnFloor = -1;
    this.phantomT = 0;
    this.phantomMode = '';
    this.phantomLook = 0;
    this.signT = 0;
    this.signK = -1;
    this.timers = [];
    this.phantom.visible = false;
  }

  after(sec, fn) {
    this.timers.push({ t: sec, fn });
  }

  flicker(sec) {
    this.flickerT = Math.max(this.flickerT, sec);
  }

  update(dt) {
    const g = this.g, p = g.player, s = g.stalker, diff = g.diff;

    // 예약된 작업
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }

    // ---- 층 체류 페널티 (원작의 HIDE_THRESH 재해석) ----
    if (p.floor !== this.warnFloor) {
      this.warnFloor = p.floor;
      this.hideWarned = false;
    }
    if (p.floor >= 1 && !s.chasing && !s.hunting) {
      if (!this.hideWarned && p.floorTime > diff.hideThreshold - 12) {
        this.hideWarned = true;
        this.flicker(1.8);
        g.audio.whisper(Math.random() < 0.5 ? -0.8 : 0.8, 1.8, 0.4);
        g.hud.msg('같은 층에 너무 오래 있었다 — 이동하라', 3);
      }
      if (p.floorTime > diff.hideThreshold) {
        p.floorTime = 0;
        this.hideWarned = false;
        g.triggerHunt('hide');
      }
    }

    // ---- 조명 ----
    this.flickerT = Math.max(0, this.flickerT - dt);
    this.blackoutT = Math.max(0, this.blackoutT - dt);
    this.torchKill = Math.max(0, this.torchKill - dt);
    let mul = 1;
    if (this.flickerT > 0) mul = Math.random() < 0.45 ? 0.05 : 0.7 + Math.random() * 0.3;
    if (this.blackoutT > 0) mul = 0;
    if (s.chasing) mul *= 0.75 + Math.random() * 0.25;
    this.lightMul = mul;

    // ---- 층 표시 글리치 ----
    if (this.signT > 0) {
      this.signT -= dt;
      if (this.signT <= 0) this.setSignGlitch(this.signK, false);
    }

    this.updatePhantom(dt);

    // ---- 무작위 이벤트 ----
    if (s.chasing || s.hunting) return;
    this.next -= dt;
    if (this.next <= 0) {
      this.next = diff.eventMin + Math.random() * (diff.eventMax - diff.eventMin);
      this.fire(this.pick());
    }
  }

  pick() {
    const total = EVENTS.reduce((a, e) => a + e[1], 0);
    let r = Math.random() * total;
    for (const [name, w] of EVENTS) {
      r -= w;
      if (r <= 0) return name;
    }
    return 'whisper';
  }

  fire(name) {
    const g = this.g, p = g.player, s = g.stalker, a = g.audio;
    const far = s.inElevator || pathDist(s.phi, s.r, p.phi, p.r) > 30;
    switch (name) {
      case 'peek': {
        if (!far || p.inRoom) return this.fire('whisper');
        // 맞은편 난간 너머, 한두 층 위에서 내려다봄 (참고 이미지의 구도)
        const up = Math.random() < 0.5 ? 0 : TAU;
        let phi = p.phi + Math.PI + (Math.random() - 0.5) * 0.7 + up;
        if (phi > PHI_MAX) phi = p.phi + Math.PI * 0.6;
        if (phi > PHI_MAX) return this.fire('whisper');
        this.showPhantom(phi, R_IN + 0.3, 4.5, 'peek');
        break;
      }
      case 'blackout': {
        this.blackoutT = 1.7;
        this.torchKill = 1.7;
        a.drone(0.35, 2.6);
        if (far && !p.inRoom) {
          // 어둠 속, 바로 앞 계단에 서 있다
          const ahead = Math.cos(p.yaw + p.phi) < 0 ? 1 : -1; // 바라보는 방향이 계단 위쪽인지
          const phi = Math.max(PHI_MIN, Math.min(PHI_MAX, p.phi + (ahead * 4.2) / R_MID));
          this.showPhantom(phi, R_MID, 1.7, 'blackout');
        }
        break;
      }
      case 'ding': {
        let k = p.floor + (Math.random() < 0.5 ? 1 : -1) * (1 + Math.floor(Math.random() * 3));
        k = Math.max(0, Math.min(FLOORS - 1, k));
        const el = g.elevator;
        if (el.occupant || el.moving || el.doorK >= 0 || el.calls.length) return this.fire('whisper');
        el.call(k, 'ghost'); // 아무도 부르지 않았는데 엘리베이터가 움직인다
        break;
      }
      case 'footsteps': {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const phi0 = p.phi + dir * (TAU * 0.5 + Math.random() * 2);
        for (let i = 0; i < 7; i++) {
          this.after(i * 0.42, () => {
            const phi = phi0 - dir * i * 0.12;
            a.footstep(0.9, polar(R_MID, phi, baseY(phi), new THREE.Vector3()));
          });
        }
        break;
      }
      case 'whisper':
        a.whisper(Math.random() * 2 - 1, 1.6 + Math.random(), 0.32);
        break;
      case 'laugh': {
        const k = Math.floor(Math.random() * FLOORS);
        a.laughAt(polar(R_OUT + 0.8, landingCenter(k), k * FLOOR_H + 1.2, new THREE.Vector3()), 0.9);
        break;
      }
      case 'sign': {
        this.signK = p.floor;
        this.signT = 2.4;
        this.setSignGlitch(p.floor, true);
        a.glitch(0.25);
        break;
      }
    }
  }

  setSignGlitch(k, on) {
    const sg = this.g.world.signs[k];
    if (!sg) return;
    sg.mat.map = on ? sg.glitch : sg.tex;
    sg.mat.needsUpdate = true;
  }

  showPhantom(phi, r, dur, mode) {
    const y = baseY(phi) + 1.3;
    polar(r, phi, y, this.phantom.position);
    this.phantom.visible = true;
    this.phantomT = dur;
    this.phantomMode = mode;
    this.phantomLook = 0;
  }

  updatePhantom(dt) {
    if (!this.phantom.visible) return;
    const g = this.g;
    this.phantomT -= dt;
    // 블랙아웃 환영은 아주 어둡게
    this.phantom.material.color.setScalar(this.phantomMode === 'blackout' ? 0.12 : 0.75);

    const cam = g.camera;
    const to = this.tmp.copy(this.phantom.position).sub(cam.position);
    const dist = to.length();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const looking = fwd.dot(to.normalize()) > 0.975 && dist < 22;
    if (looking) this.phantomLook += dt;

    if (this.phantomLook > 0.28 || this.phantomT <= 0) {
      const seen = this.phantomLook > 0.28 || (this.phantomMode === 'blackout' && looking);
      this.phantom.visible = false;
      if (seen) {
        g.audio.sting(0.5);
        g.glitchPulse(0.6);
        g.player.shake = Math.max(g.player.shake, 0.6);
      }
    }
  }
}
