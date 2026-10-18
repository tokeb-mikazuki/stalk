// Web Audio 로 만드는 절차적 사운드 (오디오 파일 없음)
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.comp).connect(ctx.destination);

    // 계단실 잔향
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.4);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.55;
    this.reverbIn.connect(this.reverb).connect(this.master);

    this.noise = this.noiseBuffer(3);
    this.buildAmbient();
    this.buildStatic();
    this.buildVoice();
    this.buildElevatorHum();
    this.heartT = 0;
    this.breathT = 0;
    this.crackleT = 0;
    this.laughT = 2;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  get now() {
    return this.ctx.currentTime;
  }

  impulse(sec, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  noiseBuffer(sec) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  noiseSrc(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    if (!loop) s.loopStart = 0;
    return s;
  }

  panner(x = 0, y = 0, z = 0, ref = 1.5, rolloff = 1.4) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 80;
    this.setPos(p, x, y, z);
    return p;
  }

  setPos(p, x, y, z) {
    if (p.positionX) {
      const t = this.ctx.currentTime;
      p.positionX.setTargetAtTime(x, t, 0.02);
      p.positionY.setTargetAtTime(y, t, 0.02);
      p.positionZ.setTargetAtTime(z, t, 0.02);
    } else {
      p.setPosition(x, y, z);
    }
  }

  env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** 출력 노드(마스터 + 잔향 전송) */
  out(node, wet = 0.3) {
    node.connect(this.master);
    if (wet > 0) {
      const w = this.ctx.createGain();
      w.gain.value = wet;
      node.connect(w).connect(this.reverbIn);
    }
  }

  // ---------------- 지속음 ----------------
  buildAmbient() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    this.ambientGain = g;
    for (const f of [41, 43.5, 82.7]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = f > 80 ? 0.25 : 0.6;
      o.connect(og).connect(g);
      o.start();
    }
    // 바람/공조 소음
    const n = this.noiseSrc(true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    n.connect(lp).connect(ng).connect(g);
    n.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.25;
    lfo.connect(lfoG).connect(ng.gain);
    lfo.start();
    // 높은 층의 바람 휘파람
    const wn = this.noiseSrc(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 12;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wn.connect(bp).connect(this.windGain).connect(g);
    wn.start(0, 1.1);
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.11;
    const wlg = ctx.createGain();
    wlg.gain.value = 260;
    wl.connect(wlg).connect(bp.frequency);
    wl.start();
    this.out(g, 0.4);
  }

  /** 송신 감지기의 지직거림 (원작의 synth meter) */
  buildStatic() {
    const ctx = this.ctx;
    const n = this.noiseSrc(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.6;
    this.staticGain = ctx.createGain();
    this.staticGain.gain.value = 0;
    // 진폭을 잘게 끊어 무전기 느낌
    const chop = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 13;
    const lg = ctx.createGain();
    lg.gain.value = 0.35;
    chop.gain.value = 0.65;
    lfo.connect(lg).connect(chop.gain);
    lfo.start();
    n.connect(bp).connect(chop).connect(this.staticGain);
    n.start(0, 0.5);
    this.out(this.staticGain, 0);
  }

  /** 송신의 목소리: 포먼트 필터를 거친 웃음 섞인 웅얼거림 */
  buildVoice() {
    const ctx = this.ctx;
    this.voicePanner = this.panner(0, -100, 0, 2.2, 1.25);
    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 0;
    this.voiceGain.connect(this.voicePanner);
    this.out(this.voicePanner, 0.45);

    const src = ctx.createGain();
    this.voiceOsc = [];
    for (const det of [0, 4, -7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 150 + det;
      o.connect(src);
      o.start();
      this.voiceOsc.push(o);
    }
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.3;
    const vibG = ctx.createGain();
    vibG.gain.value = 9;
    vib.connect(vibG);
    for (const o of this.voiceOsc) vibG.connect(o.frequency);
    vib.start();

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distCurve(18);
    const formants = ctx.createGain();
    for (const [f, q, gain] of [[720, 7, 1], [1150, 8, 0.7], [2600, 10, 0.3]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(bp).connect(g).connect(formants);
    }
    // "하-하-하" 끊김
    this.laughAM = ctx.createGain();
    this.laughAM.gain.value = 0.4;
    const am = ctx.createOscillator();
    am.type = 'square';
    am.frequency.value = 6.5;
    this.laughDepth = ctx.createGain();
    this.laughDepth.gain.value = 0;
    am.connect(this.laughDepth).connect(this.laughAM.gain);
    am.start();
    formants.connect(shaper).connect(this.laughAM).connect(this.voiceGain);
    this.voiceLevel = 0;
  }

  buildElevatorHum() {
    const ctx = this.ctx;
    this.humPanner = this.panner(0, -100, 0, 2, 1.1);
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 52;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    o.connect(lp).connect(this.humGain).connect(this.humPanner);
    o.start();
    this.out(this.humPanner, 0.2);
  }

  distCurve(k) {
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return c;
  }

  // ---------------- 매 프레임 갱신 ----------------
  updateListener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = cam.position.clone()));
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.02);
      L.positionY.setTargetAtTime(p.y, t, 0.02);
      L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(f.x, t, 0.02);
      L.forwardY.setTargetAtTime(f.y, t, 0.02);
      L.forwardZ.setTargetAtTime(f.z, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  /**
   * s: { voicePos, voiceOn, chasing, humPos, humOn, proximity(0..1), fear(0..1), breath(0..1), floorRatio }
   */
  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // 송신 목소리
    if (s.voicePos) this.setPos(this.voicePanner, s.voicePos.x, s.voicePos.y, s.voicePos.z);
    let target = s.voiceOn ? (s.chasing ? 1.0 : 0.45) : 0;
    this.laughT -= dt;
    if (s.voiceOn && this.laughT <= 0) {
      // 주기적으로 웃음 폭발
      this.laughT = s.chasing ? 1.4 + Math.random() * 1.6 : 3 + Math.random() * 4;
      const dur = 0.7 + Math.random() * 0.8;
      this.laughDepth.gain.cancelScheduledValues(t);
      this.laughDepth.gain.setValueAtTime(0.6, t);
      this.laughDepth.gain.setValueAtTime(0, t + dur);
      for (const o of this.voiceOsc) {
        const base = 140 + Math.random() * 60;
        o.frequency.cancelScheduledValues(t);
        o.frequency.setValueAtTime(base * 1.5, t);
        o.frequency.exponentialRampToValueAtTime(base * 0.8, t + dur);
        o.frequency.setTargetAtTime(base, t + dur, 0.3);
      }
      target *= 1.6;
      this.voiceGain.gain.setTargetAtTime(target * 0.55, t, 0.03);
      this.voiceGain.gain.setTargetAtTime(target * 0.3, t + dur, 0.2);
    } else if (!s.voiceOn) {
      this.voiceGain.gain.setTargetAtTime(0, t, 0.08);
    } else {
      this.voiceGain.gain.setTargetAtTime(target * 0.3, t, 0.4);
    }

    // 엘리베이터 모터음
    if (s.humPos) this.setPos(this.humPanner, s.humPos.x, s.humPos.y, s.humPos.z);
    this.humGain.gain.setTargetAtTime(s.humOn ? 0.5 : 0, t, 0.3);

    // 감지기 잡음
    const prox = s.proximity;
    this.staticGain.gain.setTargetAtTime(prox * prox * 0.32, t, 0.05);
    this.crackleT -= dt;
    if (prox > 0.25 && this.crackleT <= 0) {
      this.crackleT = 0.03 + Math.random() * (0.4 * (1 - prox));
      this.click(0.05 + prox * 0.25);
    }

    // 심장 박동
    this.heartT -= dt;
    if (s.fear > 0.12 && this.heartT <= 0) {
      this.heartT = 1.15 - s.fear * 0.72;
      this.heartbeat(0.25 + s.fear * 0.75);
    }

    // 숨소리
    this.breathT -= dt;
    if (s.breath > 0.2 && this.breathT <= 0) {
      this.breathT = 1.25 - s.breath * 0.55;
      this.breath(s.breath);
    }

    this.windGain.gain.setTargetAtTime(s.floorRatio * 0.18, t, 1);
  }

  // ---------------- 단발음 ----------------
  click(vol) {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500;
    const g = ctx.createGain();
    this.env(g, t, 0.001, vol, 0.02);
    n.connect(hp).connect(g);
    this.out(g, 0);
    n.start(t, Math.random() * 2, 0.05);
  }

  footstep(vol = 0.5, pos = null) {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700 + Math.random() * 400;
    const g = ctx.createGain();
    this.env(g, t, 0.004, vol * 0.5, 0.09);
    n.connect(lp).connect(g);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const og = ctx.createGain();
    this.env(og, t, 0.003, vol * 0.7, 0.11);
    o.connect(og);
    let dest = g;
    if (pos) {
      const p = this.panner(pos.x, pos.y, pos.z, 2, 1.1);
      g.connect(p);
      og.connect(p);
      dest = p;
    } else {
      og.connect(g);
    }
    this.out(dest, 0.6);
    n.start(t, Math.random() * 2, 0.15);
    o.start(t);
    o.stop(t + 0.15);
  }

  heartbeat(vol) {
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [dt, v] of [[0, 1], [0.17, 0.7]]) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(62, t + dt);
      o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.12);
      const g = ctx.createGain();
      this.env(g, t + dt, 0.01, vol * v * 0.9, 0.16);
      o.connect(g);
      this.out(g, 0);
      o.start(t + dt);
      o.stop(t + dt + 0.25);
    }
  }

  breath(intensity) {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * intensity, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.06 * intensity, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    n.connect(bp).connect(g);
    this.out(g, 0.1);
    n.start(t, Math.random() * 2, 1.1);
  }

  ding(pos, distorted = false) {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(pos.x, pos.y, pos.z, 3, 0.9);
    const g = ctx.createGain();
    g.connect(p);
    this.out(p, 0.6);
    const base = distorted ? 1240 : 1318;
    for (const [f, v] of [[base, 0.5], [base * 2.01, 0.15], [base * 0.5, 0.2]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      if (distorted) o.frequency.linearRampToValueAtTime(f * 0.82, t + 1.6);
      const og = ctx.createGain();
      this.env(og, t, 0.005, v, 1.8);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 2);
    }
    // 문 열리는 소리
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t + 0.5);
    ng.gain.exponentialRampToValueAtTime(0.35, t + 0.8);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    n.connect(bp).connect(ng).connect(p);
    n.start(t + 0.5, 0, 1.3);
  }

  doorSlide(pos) {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(pos.x, pos.y, pos.z, 3, 0.9);
    this.out(p, 0.4);
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    n.connect(bp).connect(g).connect(p);
    n.start(t, Math.random(), 1.2);
  }

  /** 깜짝 놀람 효과음 (불협화음) */
  sting(vol = 0.55) {
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain();
    this.env(g, t, 0.015, vol, 1.8);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 300;
    g.connect(hp);
    this.out(hp, 0.5);
    for (const f of [466, 494, 698, 740, 1046]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 0.94, t + 1.8);
      const og = ctx.createGain();
      og.gain.value = 0.18;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 2);
    }
    const n = this.noiseSrc();
    const ng = ctx.createGain();
    this.env(ng, t, 0.005, vol * 0.6, 0.6);
    n.connect(ng).connect(hp);
    n.start(t, 0, 0.8);
    this.boom(vol * 0.9);
  }

  boom(vol = 0.6) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
    const g = ctx.createGain();
    this.env(g, t, 0.01, vol, 1.5);
    o.connect(g);
    this.out(g, 0.5);
    o.start(t);
    o.stop(t + 1.6);
  }

  jumpscare() {
    const ctx = this.ctx, t = ctx.currentTime;
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distCurve(80);
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.9, 1.6);
    shaper.connect(g);
    this.out(g, 0.3);
    for (const [f0, f1, type] of [[620, 110, 'sawtooth'], [930, 160, 'square'], [300, 60, 'sawtooth'], [1480, 400, 'sawtooth']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 1.5);
      const og = ctx.createGain();
      og.gain.value = 0.3;
      o.connect(og).connect(shaper);
      o.start(t);
      o.stop(t + 1.7);
    }
    const n = this.noiseSrc();
    const ng = ctx.createGain();
    ng.gain.value = 0.7;
    n.connect(ng).connect(shaper);
    n.start(t, 0, 1.6);
    this.boom(1);
  }

  /** 귓가 속삭임 (pan: -1 왼쪽 ~ 1 오른쪽) */
  whisper(pan = 0, dur = 1.6, vol = 0.35) {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.15);
    g.gain.setValueAtTime(vol, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const sum = ctx.createGain();
    for (const base of [600, 1300, 2600]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 9;
      bp.frequency.setValueAtTime(base, t);
      // 음절 느낌으로 포먼트 이동
      for (let k = 0.08; k < dur; k += 0.08 + Math.random() * 0.1) {
        bp.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.7), t + k);
      }
      n.connect(bp).connect(sum);
    }
    const am = ctx.createGain();
    am.gain.setValueAtTime(1, t);
    for (let k = 0; k < dur; k += 0.12 + Math.random() * 0.15) {
      am.gain.setValueAtTime(Math.random() < 0.3 ? 0.15 : 1, t + k);
    }
    sum.connect(am).connect(g).connect(p);
    this.out(p, 0.5);
    n.start(t, Math.random(), dur + 0.1);
  }

  /** 멀리서 들리는 웃음 */
  laughAt(pos, vol = 0.8) {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(pos.x, pos.y, pos.z, 3, 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const dur = 1.6;
    for (let k = 0; k < dur; k += 0.16) {
      g.gain.exponentialRampToValueAtTime(vol * (1 - k / dur * 0.6), t + k + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k + 0.13);
    }
    const sum = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(150, t + dur);
    for (const [f, q] of [[750, 6], [1200, 7]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      o.connect(bp).connect(sum);
    }
    sum.connect(g).connect(p);
    this.out(p, 0.7);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  rattle() {
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1700 + Math.random() * 800;
      bp.Q.value = 6;
      const g = ctx.createGain();
      this.env(g, t + i * 0.09, 0.002, 0.45, 0.07);
      n.connect(bp).connect(g);
      this.out(g, 0.4);
      n.start(t + i * 0.09, Math.random(), 0.1);
    }
  }

  pickup(key = false) {
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = key ? [523, 659, 784, 1046] : [880, 1320];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      this.env(g, t + i * 0.08, 0.005, 0.2, key ? 0.9 : 0.25);
      o.connect(g);
      this.out(g, 0.4);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 1);
    });
  }

  paper() {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = ctx.createGain();
    this.env(g, t, 0.01, 0.25, 0.3);
    n.connect(hp).connect(g);
    this.out(g, 0.2);
    n.start(t, Math.random(), 0.4);
  }

  torchClick() {
    this.click(0.4);
  }

  thud() {
    this.boom(0.7);
    this.footstep(1.2);
  }

  glitch(vol = 0.4) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(80, t);
    for (let k = 0; k < 0.5; k += 0.03) o.frequency.setValueAtTime(60 + Math.random() * 1600, t + k);
    const g = ctx.createGain();
    this.env(g, t, 0.005, vol * 0.4, 0.5);
    o.connect(g);
    this.out(g, 0.2);
    o.start(t);
    o.stop(t + 0.6);
    const n = this.noiseSrc();
    const ng = ctx.createGain();
    this.env(ng, t, 0.005, vol, 0.45);
    n.connect(ng);
    this.out(ng, 0);
    n.start(t, Math.random(), 0.5);
  }

  drone(vol = 0.4, dur = 3) {
    const ctx = this.ctx, t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    g.connect(lp);
    this.out(lp, 0.6);
    for (const f of [36.7, 38.9, 55, 77.8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  wind(vol = 0.5, dur = 6) {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc(true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(lp).connect(g);
    this.out(g, 0.2);
    n.start(t);
    n.stop(t + dur + 0.1);
  }

  /** 지속음 정지 (게임오버 화면 등) */
  silence(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambientGain.gain.setTargetAtTime(on ? 0 : 0.16, t, 0.3);
    if (on) {
      this.voiceGain.gain.setTargetAtTime(0, t, 0.05);
      this.staticGain.gain.setTargetAtTime(0, t, 0.05);
      this.humGain.gain.setTargetAtTime(0, t, 0.05);
    }
  }
}
