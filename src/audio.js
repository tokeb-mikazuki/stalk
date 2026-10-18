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

    // 높은 계단실의 슬랩백 메아리 (위아래 층에서 되돌아오는 발소리)
    this.slapIn = ctx.createGain();
    const slap = ctx.createDelay(1);
    slap.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const slapLp = ctx.createBiquadFilter();
    slapLp.type = 'lowpass';
    slapLp.frequency.value = 1800;
    this.slapIn.connect(slap);
    slap.connect(slapLp).connect(fb).connect(slap);
    slapLp.connect(this.master);

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
    // 낮은 웅웅거림 층 (무전기 험)
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 60;
    const humF = ctx.createBiquadFilter();
    humF.type = 'bandpass';
    humF.frequency.value = 240;
    humF.Q.value = 3;
    const humG = ctx.createGain();
    humG.gain.value = 0.25;
    hum.connect(humF).connect(humG).connect(this.staticGain);
    hum.start();
    // 일그러진 무전 질감
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distCurve(30);
    const n2 = this.noiseSrc(true);
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 900;
    bp2.Q.value = 1.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    n2.connect(bp2).connect(shaper).connect(g2).connect(this.staticGain);
    n2.start(0, 1.3);
    this.out(this.staticGain, 0);
    this.garbleT = 0;
    this.hotPrev = false;
  }

  /** 수신기에 섞여 들리는 일그러진 목소리 조각 */
  garble(vol) {
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = 0.35 + Math.random() * 0.6;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110 + Math.random() * 90, t);
    for (let k = 0.06; k < dur; k += 0.06) o.frequency.setValueAtTime(100 + Math.random() * 140, t + k);
    const sum = ctx.createGain();
    for (const base of [650, 1200]) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(base, t);
      for (let k = 0.08; k < dur; k += 0.08) f.frequency.setValueAtTime(base * (0.6 + Math.random() * 0.9), t + k);
      o.connect(f).connect(sum);
    }
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 450;
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.distCurve(40);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    for (let k = 0.05; k < dur; k += 0.05 + Math.random() * 0.06) g.gain.setValueAtTime(Math.random() < 0.35 ? vol * 0.1 : vol, t + k);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    sum.connect(hp).connect(shaper).connect(g);
    this.out(g, 0.1);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 송신이 가까워질 때 울리는 경고 삑 */
  squelch() {
    this.uiTone(1900, 1850, 0.07, 0.07);
    setTimeout(() => this.uiTone(1250, 1200, 0.1, 0.07), 90);
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
   * s: { voicePos, voiceOn, chasing, humPos, humOn, proximity(0..1), fear(0..1), exert(0..1), hold, floorRatio }
   */
  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    // 송신 목소리
    if (s.voicePos) this.setPos(this.voicePanner, s.voicePos.x, s.voicePos.y, s.voicePos.z);
    let target = s.voiceOn ? (s.chasing ? 1.0 : 0.45) * (s.muffled ? 0.4 : 1) : 0;
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
    this.garbleT -= dt;
    if (prox > 0.55 && this.garbleT <= 0) {
      this.garbleT = 0.8 + Math.random() * (3.5 - prox * 2.5);
      this.garble(0.05 + prox * 0.12);
    }
    const hot = prox > 0.65;
    if (hot && !this.hotPrev) this.squelch();
    this.hotPrev = hot;
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

    // 숨소리: 늘 쉬고 있다. 평소엔 코로 조용히 느리게, 달리고 나면 입으로 거칠고 빠르게,
    // 무서우면 떨리고, 숨어 있는데 송신이 가까우면 숨을 죽인다 (얕고 길게).
    const b = Math.max(s.exert || 0, (s.fear || 0) * 0.5);
    this.breathLvl = (this.breathLvl ?? 0) + (b - (this.breathLvl ?? 0)) * Math.min(1, dt * 1.5);
    this.breathT -= dt;
    if (this.breathT <= 0) {
      const lv = this.breathLvl;
      const hold = s.hold ? 1 : 0;
      const period = (4.2 - 3.3 * lv) * (hold ? 1.7 : 1);
      this.breathT = period * (0.92 + Math.random() * 0.16);
      this.breath(lv, period, s.fear || 0, hold);
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

  /**
   * 발소리: 뒤꿈치 → 앞꿈치 2단 타격 + 표면 질감 + 계단실 메아리
   * surface: 'stair' | 'landing' | 'room', kind: 'walk' | 'run' | 'sneak'
   */
  footstep(vol = 0.5, pos = null, surface = 'stair', kind = 'walk') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const pitch = 0.88 + Math.random() * 0.24;
    const bus = ctx.createGain();
    let dest = bus;
    if (pos) {
      const p = this.panner(pos.x, pos.y, pos.z, 2, 1.1);
      bus.connect(p);
      dest = p;
    }
    if (kind === 'sneak') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 650;
      const pre = ctx.createGain();
      pre.connect(lp).connect(bus);
      this.stepHits(pre, t, vol, pitch, surface);
    } else {
      // 둔탁하게: 밑창의 '딱' 소리보다 몸무게가 실린 '턱' 소리 — 고음을 깎는다 (터벅터벅 / 뚜벅뚜벅)
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = kind === 'run' ? 900 : 1150;
      lp.Q.value = 0.5;
      const pre = ctx.createGain();
      pre.gain.value = 1.15;
      pre.connect(lp).connect(bus);
      this.stepHits(pre, t, vol, pitch, surface, kind === 'run');
    }
    // 달릴 때: 묵직한 몸통 울림 + 낮은 옷깃 스침 (터벅터벅)
    if (kind === 'run') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(58 * pitch, t + 0.01);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.24);
      const og = ctx.createGain();
      this.env(og, t + 0.01, 0.01, vol * 1.1, 0.26);
      o.connect(og).connect(bus);
      o.start(t);
      o.stop(t + 0.28);
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 330 + Math.random() * 80;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      this.env(g, t, 0.04, vol * 0.05, 0.16);
      n.connect(bp).connect(g).connect(bus);
      n.start(t, Math.random() * 2, 0.25);
    }
    const wet = surface === 'room' ? 0.15 : surface === 'landing' ? 0.45 : 0.6;
    this.out(dest, wet);
    if (surface !== 'room' && !pos) {
      const s = ctx.createGain();
      s.gain.value = surface === 'stair' ? 0.35 : 0.22;
      dest.connect(s).connect(this.slapIn);
    }
  }

  stepHits(bus, t, vol, pitch, surface, heavy = false) {
    const ctx = this.ctx;
    // 무겁게 디딜 때는 고음(잡음·모래 긁힘)을 줄이고 저음을 키운다
    const hiMul = heavy ? 0.35 : 0.6;
    const lowMul = heavy ? 1.6 : 1.3;
    const toneMul = heavy ? 0.45 : 0.6;
    const hit = (time, v, pm) => {
      // 신발 밑창이 닿는 소리 (대역 잡음)
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = (surface === 'room' ? 700 : surface === 'landing' ? 950 : 1150) * pm * pitch * toneMul;
      bp.Q.value = 1.1;
      const g = ctx.createGain();
      this.env(g, time, 0.006, v * 0.5 * hiMul, 0.07);
      n.connect(bp).connect(g).connect(bus);
      n.start(time, Math.random() * 2, 0.1);
      // 모래 알갱이 긁힘
      const n2 = this.noiseSrc();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4200;
      const g2 = ctx.createGain();
      this.env(g2, time, 0.001, v * 0.08 * hiMul * hiMul, 0.02);
      n2.connect(hp).connect(g2).connect(bus);
      n2.start(time, Math.random() * 2, 0.05);
      // 몸무게가 실리는 저음
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(92 * pitch * (pm > 1 ? 1.2 : 1) * (heavy ? 0.8 : 1), time);
      o.frequency.exponentialRampToValueAtTime(heavy ? 36 : 42, time + (heavy ? 0.16 : 0.12));
      const og = ctx.createGain();
      this.env(og, time, 0.005, v * (pm > 1 ? 0.35 : 0.85) * lowMul, heavy ? 0.2 : 0.14);
      o.connect(og).connect(bus);
      o.start(time);
      o.stop(time + 0.24);
      // 계단 디딤판의 속이 빈 울림
      if (surface === 'stair') {
        const n3 = this.noiseSrc();
        const ring = ctx.createBiquadFilter();
        ring.type = 'bandpass';
        ring.frequency.value = 125 + Math.random() * 30;
        ring.Q.value = 6;
        const g3 = ctx.createGain();
        this.env(g3, time, 0.006, v * 1.0, 0.22);
        n3.connect(ring).connect(g3).connect(bus);
        n3.start(time, Math.random() * 2, 0.25);
      }
    };
    hit(t, vol, 1); // 뒤꿈치
    hit(t + (heavy ? 0.07 : 0.06) + Math.random() * 0.03, vol * (heavy ? 0.32 : 0.38), heavy ? 1.15 : 1.3); // 앞꿈치 (작게, 낮게)
  }

  /** 넘어짐: 미끄러짐 → 옷 펄럭 → 몸이 바닥에 부딪힘 → 손전등이 굴러감 → 신음 */
  fall() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // 신발 미끄러지는 소리
    const s = this.noiseSrc();
    const sbp = ctx.createBiquadFilter();
    sbp.type = 'bandpass';
    sbp.Q.value = 2;
    sbp.frequency.setValueAtTime(3200, t);
    sbp.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    const sg = ctx.createGain();
    this.env(sg, t, 0.01, 0.35, 0.16);
    s.connect(sbp).connect(sg);
    this.out(sg, 0.3);
    s.start(t, Math.random(), 0.25);
    // 옷 펄럭
    const w = this.noiseSrc();
    const wbp = ctx.createBiquadFilter();
    wbp.type = 'bandpass';
    wbp.frequency.value = 900;
    wbp.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, t + 0.04);
    wg.gain.exponentialRampToValueAtTime(0.28, t + 0.22);
    wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    w.connect(wbp).connect(wg);
    this.out(wg, 0.2);
    w.start(t + 0.04, Math.random(), 0.35);
    // 바닥에 부딪힘 (넘어짐 연출의 충돌 시점에 맞춤)
    const ti = t + 0.3;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(78, ti);
    o.frequency.exponentialRampToValueAtTime(30, ti + 0.5);
    const og = ctx.createGain();
    this.env(og, ti, 0.004, 1.0, 0.55);
    o.connect(og);
    this.out(og, 0.5);
    o.start(ti);
    o.stop(ti + 0.6);
    const b = this.noiseSrc();
    const blp = ctx.createBiquadFilter();
    blp.type = 'lowpass';
    blp.frequency.value = 520;
    const bg = ctx.createGain();
    this.env(bg, ti, 0.002, 0.9, 0.28);
    b.connect(blp).connect(bg);
    this.out(bg, 0.6);
    b.start(ti, Math.random(), 0.35);
    if (this.slapIn) {
      const e = ctx.createGain();
      e.gain.value = 0.5;
      bg.connect(e).connect(this.slapIn);
    }
    // 무릎/팔꿈치 두 번째 충돌
    this.stepHits(this.master, ti + 0.11, 0.7, 0.8, 'stair');
    // 손전등이 바닥을 구르는 금속음
    const clatter = (tc, v) => {
      for (const f of [2350, 3170, 4420, 5930]) {
        const m = ctx.createOscillator();
        m.type = 'sine';
        m.frequency.value = f * (0.95 + Math.random() * 0.1);
        const mg = ctx.createGain();
        this.env(mg, tc, 0.001, v * 0.06, 0.22 + Math.random() * 0.1);
        m.connect(mg);
        this.out(mg, 0.5);
        m.start(tc);
        m.stop(tc + 0.4);
      }
      this.click(v * 0.35);
    };
    clatter(ti + 0.05, 1);
    clatter(ti + 0.22, 0.6);
    clatter(ti + 0.34, 0.35);
    clatter(ti + 0.42, 0.2);
    // 신음 섞인 숨
    const g2 = this.noiseSrc();
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.value = 4;
    f1.frequency.setValueAtTime(700, ti + 0.25);
    f1.frequency.linearRampToValueAtTime(420, ti + 0.85);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0.0001, ti + 0.25);
    gg.gain.exponentialRampToValueAtTime(0.22, ti + 0.4);
    gg.gain.exponentialRampToValueAtTime(0.0001, ti + 0.9);
    g2.connect(f1).connect(gg);
    this.out(gg, 0.2);
    g2.start(ti + 0.25, Math.random(), 0.7);
  }

  // ---------------- 메뉴 효과음 ----------------
  uiTone(f0, f1, dur, vol, type = 'sine') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.004, vol, dur);
    o.connect(g);
    this.out(g, 0.25);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  uiMove() {
    this.uiTone(2100, 1700, 0.05, 0.035);
    if (this.ctx) this.click(0.05);
  }

  uiSelect() {
    this.uiTone(160, 70, 0.16, 0.22);
    this.uiTone(1300, 900, 0.07, 0.04);
  }

  uiBack() {
    this.uiTone(900, 520, 0.1, 0.06);
  }

  uiDeny() {
    this.uiTone(150, 140, 0.08, 0.08, 'square');
    setTimeout(() => this.uiTone(130, 120, 0.1, 0.08, 'square'), 110);
  }

  uiStart() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // 거꾸로 차오르는 잡음 + 묵직한 충격음
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    n.connect(bp).connect(g);
    this.out(g, 0.4);
    n.start(t, 0, 0.7);
    setTimeout(() => this.boom(0.8), 560);
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

  /**
   * 한 번의 들숨·날숨. lv: 숨찬 정도(0 평온 ~ 1 헐떡임), P: 한 호흡 길이(초), fear: 떨림, hold: 숨죽임
   * 들숨은 높고 좁은 바람 소리, 날숨은 낮고 넓게 — 숨이 차면 입으로 쉬어 소리가 굵어지고, 끝에 '하' 하는 성대음이 섞인다.
   */
  breath(lv, P, fear = 0, hold = 0) {
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const mouth = Math.min(1, Math.max(0, (lv - 0.3) / 0.4)); // 코 → 입
    const amp = (0.032 + 0.2 * Math.pow(lv, 1.3)) * (hold ? 0.4 : 1);
    const bus = ctx.createGain();
    bus.gain.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    bus.connect(lp);
    this.out(lp, 0.08);

    const phase = (start, dur, peakAt, f1, f2, vol, shaky) => {
      const n = this.noiseSrc();
      const g = ctx.createGain();
      for (const [f, q, w] of [[f1, 1.1, 1], [f2, 1.6, 0.55]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f * (0.94 + Math.random() * 0.12);
        bp.Q.value = q;
        const wg = ctx.createGain();
        wg.gain.value = w;
        n.connect(bp).connect(wg).connect(g);
      }
      const e = g.gain;
      e.setValueAtTime(0.0001, start);
      e.linearRampToValueAtTime(vol, start + dur * peakAt);
      e.setTargetAtTime(0.0001, start + dur * peakAt, dur * (1 - peakAt) * 0.38);
      if (shaky > 0.05) {
        // 떨리는 숨: 8~11Hz 로 끊기듯 흔들린다
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 8 + Math.random() * 3;
        const lg = ctx.createGain();
        lg.gain.value = vol * 0.6 * shaky;
        lfo.connect(lg).connect(e);
        lfo.start(start);
        lfo.stop(start + dur + 0.1);
      }
      g.connect(bus);
      n.start(start, Math.random() * Math.max(0, 2.6 - dur), dur + 0.3);
    };

    const shaky = Math.max(0, fear - 0.35) * 1.4 + hold * 0.4;
    const inDur = P * (0.34 + 0.06 * (1 - lv)), exAt = P * 0.42, exDur = P * 0.5;
    // 들숨: 코(높고 좁게) ↔ 입(낮고 넓게)
    phase(t, inDur, 0.75, 1700 - 700 * mouth, 3300 - 900 * mouth, amp * (0.55 + 0.2 * mouth), shaky * 0.6);
    // 날숨
    phase(t + exAt, exDur, 0.14, 1050 - 450 * mouth, 2000 - 500 * mouth, amp, shaky);
    // 헐떡일 때 날숨 끝의 '하아' (아주 작게 섞인 성대음)
    if (lv > 0.62 && !hold) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(150 + Math.random() * 25, t + exAt);
      o.frequency.linearRampToValueAtTime(118, t + exAt + exDur * 0.6);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 750;
      f.Q.value = 2.2;
      const g = ctx.createGain();
      const v = amp * 0.12 * (lv - 0.62) / 0.38;
      g.gain.setValueAtTime(0.0001, t + exAt);
      g.gain.linearRampToValueAtTime(v, t + exAt + exDur * 0.1);
      g.gain.setTargetAtTime(0.0001, t + exAt + exDur * 0.18, exDur * 0.12);
      o.connect(f).connect(g).connect(bus);
      o.start(t + exAt);
      o.stop(t + exAt + exDur);
    }
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

  /** 문고리 덜컹 (pos 가 있으면 그 위치에서) */
  rattle(pos = null) {
    const ctx = this.ctx, t = ctx.currentTime;
    const dest = pos ? this.panner(pos.x, pos.y, pos.z, 2.5, 1) : null;
    if (dest) this.out(dest, 0.4);
    for (let i = 0; i < 4; i++) {
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1700 + Math.random() * 800;
      bp.Q.value = 6;
      const g = ctx.createGain();
      this.env(g, t + i * 0.09, 0.002, 0.45, 0.07);
      n.connect(bp).connect(g);
      if (dest) g.connect(dest);
      else this.out(g, 0.4);
      n.start(t + i * 0.09, Math.random(), 0.1);
    }
  }

  /** 비상문 삐걱 (open: 여는 소리 / 닫는 소리) */
  creak(pos, open = true) {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(pos.x, pos.y, pos.z, 2.5, 1);
    this.out(p, 0.5);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = open ? 180 : 260, f1 = open ? 320 : 140;
    o.frequency.setValueAtTime(f0, t);
    for (let k = 0.04; k < 0.6; k += 0.04) o.frequency.linearRampToValueAtTime(f0 + (f1 - f0) * (k / 0.6) + (Math.random() - 0.5) * 40, t + k);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(bp).connect(g).connect(p);
    o.start(t);
    o.stop(t + 0.7);
    if (!open) {
      // 닫히는 쿵
      const o2 = ctx.createOscillator();
      o2.frequency.setValueAtTime(90, t + 0.5);
      o2.frequency.exponentialRampToValueAtTime(40, t + 0.7);
      const g2 = ctx.createGain();
      this.env(g2, t + 0.5, 0.005, 0.5, 0.2);
      o2.connect(g2).connect(p);
      o2.start(t + 0.5);
      o2.stop(t + 0.8);
    }
  }

  /** 문을 부수듯 열어젖힘 */
  slam(pos) {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(pos.x, pos.y, pos.z, 4, 0.8);
    this.out(p, 0.7);
    const n = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    this.env(g, t, 0.002, 1.0, 0.35);
    n.connect(lp).connect(g).connect(p);
    n.start(t, Math.random(), 0.5);
    this.boom(0.8);
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
    this.fall();
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

  // ---------------- 안내 방송 (TTS 음성) ----------------
  /**
   * 건물 천장 스피커로 나오는 안내 방송. url: 음성 파일(data URL), style: pa · glitch · close
   * 한 번에 하나만 — 방송 중이면 대기열에 넣고(최대 2개), 중요하지 않은 것은 버린다
   */
  announce(url, style = 'pa', chime = false, important = false) {
    if (!this.ctx) return;
    this.voiceQueue = this.voiceQueue || [];
    if (this.announcing) {
      if (important || this.voiceQueue.length < 1) this.voiceQueue.push([url, style, chime]);
      return;
    }
    this.announcing = true;
    this.loadVoice(url).then((buf) => this.playAnnouncement(buf, style, chime)).catch(() => this.nextAnnouncement());
  }

  loadVoice(url) {
    this.voiceCache = this.voiceCache || new Map();
    if (!this.voiceCache.has(url)) {
      this.voiceCache.set(url, fetch(url).then((r) => r.arrayBuffer()).then((ab) => this.ctx.decodeAudioData(ab)));
    }
    return this.voiceCache.get(url);
  }

  nextAnnouncement() {
    this.announcing = false;
    const n = this.voiceQueue?.shift();
    if (n) this.announce(...n);
  }

  /** 방송 앞의 '띵—동' 차임 */
  chime(t) {
    const ctx = this.ctx;
    [[659.3, 0], [523.3, 0.42]].forEach(([f, dt]) => {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      o2.frequency.value = f * 2.76;
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      o.connect(g);
      o2.connect(g2).connect(g);
      this.env(g, t + dt, 0.005, 0.12, 1.4);
      this.out(g, 0.5);
      o.start(t + dt);
      o2.start(t + dt);
      o.stop(t + dt + 1.6);
      o2.stop(t + dt + 1.6);
    });
  }

  playAnnouncement(buf, style, chime) {
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.05;
    if (chime) {
      this.chime(t);
      t += 1.25;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    let node = src;
    if (style !== 'close') {
      // 천장 스피커: 좁은 대역 + 살짝 찌그러짐
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 330;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = style === 'glitch' ? 2600 : 3400;
      const sh = ctx.createWaveShaper();
      sh.curve = this.distCurve(style === 'glitch' ? 40 : 6);
      node.connect(hp).connect(lp).connect(sh);
      node = sh;
    }
    if (style === 'glitch') {
      // 군데군데 끊기고 늘어진다
      src.playbackRate.setValueAtTime(1, t);
      for (let k = 0.3; k < buf.duration; k += 0.35 + Math.random() * 0.4) {
        src.playbackRate.setValueAtTime(Math.random() < 0.5 ? 0.86 : 1, t + k);
      }
    }
    const g = ctx.createGain();
    g.gain.value = style === 'close' ? 0.9 : 1.05;
    node.connect(g);
    let outNode = g;
    if (style === 'glitch') {
      const gate = ctx.createGain();
      g.connect(gate);
      outNode = gate;
      for (let k = 0.4; k < buf.duration; k += 0.5 + Math.random() * 0.6) {
        gate.gain.setValueAtTime(0.05, t + k);
        gate.gain.setValueAtTime(1, t + k + 0.05 + Math.random() * 0.06);
      }
    }
    if (style === 'close') {
      this.out(outNode, 0.12);
    } else {
      // 텅 빈 콘크리트 계단실에 울려 퍼지는 방송: 잔향 + 위아래 층에서 되돌아오는 메아리
      outNode.connect(this.master);
      const wet = ctx.createGain();
      wet.gain.value = 0.75;
      outNode.connect(wet).connect(this.reverbIn);
      const slap = ctx.createGain();
      slap.gain.value = 0.35;
      outNode.connect(slap).connect(this.slapIn);
      const echo = ctx.createGain();
      echo.gain.value = 0.4;
      outNode.connect(echo).connect(this.paEchoIn());
    }
    src.start(t);
    src.onended = () => this.nextAnnouncement();
  }

  /** 안내 방송 전용 긴 메아리 (먼 층의 스피커에서 조금 늦게 다시 들리는 소리) */
  paEchoIn() {
    if (this.paEcho) return this.paEcho;
    const ctx = this.ctx;
    const inp = ctx.createGain();
    const d1 = ctx.createDelay(2);
    d1.delayTime.value = 0.34;
    const d2 = ctx.createDelay(2);
    d2.delayTime.value = 0.57;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1900;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 380;
    const mix = ctx.createGain();
    mix.gain.value = 0.6;
    inp.connect(d1);
    inp.connect(d2);
    d1.connect(lp);
    d2.connect(lp);
    lp.connect(hp).connect(fb).connect(d1);
    hp.connect(mix).connect(this.master);
    const rv = ctx.createGain();
    rv.gain.value = 0.5;
    mix.connect(rv).connect(this.reverbIn);
    this.paEcho = inp;
    return inp;
  }

  // ---------------- 메인 화면 음악 ----------------
  /**
   * 트레일러의 자장가 오르골 + 따뜻한 장조 화음. 한 바퀴 돌 때마다 조금씩 늘어지고 어긋나다가,
   * 낮은 울림만 남은 정적 뒤 처음부터 다시 — 평온해서 더 불안한 메인 화면.
   */
  titleMusic(on) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!on) {
      if (!this.tm) return;
      const tm = this.tm;
      this.tm = null;
      clearInterval(tm.timer);
      tm.bus.gain.setTargetAtTime(0, t, 0.6);
      setTimeout(() => tm.nodes.forEach((n) => { try { n.stop(); } catch { /* 이미 정지 */ } }), 4000);
      return;
    }
    if (this.tm) return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + 3);
    this.out(bus, 0.6);
    const nodes = [];
    // 장조 패드 (숨쉬듯)
    const pad = ctx.createGain();
    pad.gain.value = 0.022;
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 1600;
    pad.connect(padLp).connect(bus);
    for (const f of [261.6, 329.6, 392.0, 523.3]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 6;
      o.connect(pad);
      o.start(t);
      nodes.push(o);
    }
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 0.09;
    lfoG.gain.value = 0.008;
    lfo.connect(lfoG).connect(pad.gain);
    lfo.start(t);
    nodes.push(lfo);
    // 낮은 드론 — 한 바퀴 돌 때마다 조금씩 올라온다
    const drone = ctx.createGain();
    drone.gain.value = 0;
    drone.connect(bus);
    for (const f of [41.2, 61.7]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(drone);
      o.start(t);
      nodes.push(o);
    }
    const LULL = [523.3, 659.3, 784.0, 659.3, 587.3, 698.5, 880.0, 784.0, 659.3, 523.3, 587.3, 493.9, 523.3];
    const tm = (this.tm = { bus, nodes, drone, pad, cycle: 0, i: 0, next: t + 1.2 });
    const note = (f, when, vol) => {
      const g = ctx.createGain();
      g.connect(bus);
      for (const [mul, a, dec] of [[1, 1, 0.9], [1.004, 0.6, 0.9], [2.001, 0.25, 0.3]]) {
        const o = ctx.createOscillator();
        o.frequency.value = f * mul;
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og).connect(g);
        o.start(when);
        o.stop(when + dec * 4);
      }
      this.env(g, when, 0.004, vol, 2.2);
    };
    tm.timer = setInterval(() => {
      if (this.tm !== tm) return;
      const now = ctx.currentTime;
      while (tm.next < now + 0.3) {
        const prog = Math.min(1, tm.cycle / 3); // 0 → 1 : 바퀴를 돌수록 어긋난다
        if (tm.i >= LULL.length) {
          // 한 바퀴 끝: 3바퀴 뒤에는 긴 정적 후 처음으로
          tm.i = 0;
          tm.cycle++;
          if (tm.cycle > 3) {
            tm.cycle = 0;
            tm.next += 6;
            drone.gain.setTargetAtTime(0.0, tm.next - 1, 1.5);
            pad.gain.setTargetAtTime(0.022, tm.next, 2);
          } else {
            tm.next += 1.2;
            drone.gain.setTargetAtTime(0.012 * tm.cycle, tm.next, 3);
            pad.gain.setTargetAtTime(0.022 * (1 - 0.3 * tm.cycle), tm.next, 3);
          }
          continue;
        }
        const f = LULL[tm.i] * (1 - 0.05 * prog) * (1 + (Math.random() - 0.5) * 0.008 * prog);
        note(f, tm.next, 0.05 * (1 - 0.35 * prog));
        tm.next += 0.55 * (1 + 0.8 * prog) + (prog > 0.6 && Math.random() < 0.15 ? 0.6 : 0);
        tm.i++;
      }
    }, 100);
  }

  // ---------------- 탈출 엔딩 음악 ----------------
  /**
   * 옥상의 아침: 따뜻한 화음 진행 + 메인 화면의 자장가를 이번엔 어긋남 없이 끝까지 + 새소리.
   */
  dawnMusic(on) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    if (!on) {
      if (!this.dm) return;
      const dm = this.dm;
      this.dm = null;
      clearInterval(dm.timer);
      dm.bus.gain.setTargetAtTime(0, t0, 0.8);
      return;
    }
    if (this.dm) return;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, t0);
    bus.gain.linearRampToValueAtTime(1, t0 + 2.5);
    this.out(bus, 0.55);
    // 화음 진행: C — G/B — Am — F — C — G — F — C
    const CH = [[261.6, 329.6, 392.0], [246.9, 293.7, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6],
      [261.6, 329.6, 392.0], [196.0, 246.9, 293.7], [174.6, 220.0, 261.6], [261.6, 329.6, 392.0]];
    const chordLen = 3.2;
    const chord = (notes, when) => {
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      g.connect(lp).connect(bus);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.03, when + 1.0);
      g.gain.setValueAtTime(0.03, when + chordLen - 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, when + chordLen + 1.2);
      for (const f of [notes[0] / 2, ...notes]) {
        for (const [type, det] of [['sine', 0], ['triangle', 4]]) {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = f;
          o.detune.value = det;
          o.connect(g);
          o.start(when);
          o.stop(when + chordLen + 1.4);
        }
      }
    };
    const note = (f, when, vol) => {
      const g = ctx.createGain();
      g.connect(bus);
      for (const [mul, a, dec] of [[1, 1, 1.1], [1.003, 0.5, 1.1], [2.0, 0.22, 0.4]]) {
        const o = ctx.createOscillator();
        o.frequency.value = f * mul;
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og).connect(g);
        o.start(when);
        o.stop(when + dec * 4);
      }
      this.env(g, when, 0.004, vol, 2.4);
    };
    const chirp = (when) => {
      const n = 2 + Math.floor(Math.random() * 4);
      const base = 2600 + Math.random() * 1800;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const g = ctx.createGain();
      g.gain.value = 0.018 + Math.random() * 0.02;
      if (pan) {
        pan.pan.value = Math.random() * 2 - 1;
        g.connect(pan).connect(bus);
      } else g.connect(bus);
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator();
        const eg = ctx.createGain();
        const tt = when + i * (0.08 + Math.random() * 0.06);
        o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), tt);
        o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.4), tt + 0.06);
        this.env(eg, tt, 0.005, 1, 0.07);
        o.connect(eg).connect(g);
        o.start(tt);
        o.stop(tt + 0.12);
      }
    };
    const LULL = [523.3, 659.3, 784.0, 659.3, 587.3, 698.5, 880.0, 784.0, 659.3, 523.3, 587.3, 493.9, 523.3];
    const dm = (this.dm = { bus, ci: 0, nextChord: t0 + 0.2, mi: 0, nextNote: t0 + 3.0, nextBird: t0 + 1.5 });
    dm.timer = setInterval(() => {
      if (this.dm !== dm) return;
      const now = ctx.currentTime;
      while (dm.nextChord < now + 0.4) {
        chord(CH[dm.ci % CH.length], dm.nextChord);
        dm.ci++;
        dm.nextChord += chordLen;
      }
      while (dm.nextNote < now + 0.4) {
        // 자장가 — 이번엔 늘어지지도 어긋나지도 않는다. 한 바퀴 뒤엔 한 옥타브 아래로 조용히
        const oct = Math.floor(dm.mi / LULL.length) % 2 ? 0.5 : 1;
        note(LULL[dm.mi % LULL.length] * oct, dm.nextNote, 0.045);
        dm.mi++;
        dm.nextNote += dm.mi % LULL.length === 0 ? 2.4 : 0.6;
      }
      while (dm.nextBird < now + 0.4) {
        chirp(dm.nextBird);
        dm.nextBird += 0.5 + Math.random() * 1.6;
      }
    }, 100);
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
