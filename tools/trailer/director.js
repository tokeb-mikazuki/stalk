// 트레일러 촬영용 연출 스크립트 — 빌드된 게임 페이지 안에서 실행된다 (record.cjs 가 주입)
// 게임 루프를 멈추고 고정 dt 로 한 프레임씩 진행하며, 장면(샷)마다 플레이어·피구공·카메라를 연출한다.
// window.TR.step() 을 부를 때마다 1프레임 진행 (window.TR_FPS, 기본 30fps). 소리는 나중에 합성하므로 사운드 호출 시각만 기록한다.
(() => {
  const g = window.__songsin;
  const YUGI = window.__theme === 'yugi'; // 어느 판을 찍는지 (TR_THEME)
  const FPS = window.TR_FPS || 30, DT = 1 / FPS;
  const FLOOR_PHI = Math.PI * 4, R_IN = 2.0, R_OUT = 4.9, R_MID = (R_IN + R_OUT) / 2;
  const DOOR_ANGLE = 0.68, FIREDOOR_ANGLE = 0.2;
  const p = g.player, s = g.stalker, el = g.elevator, u = g.post.uniforms;

  // ---------------------------------------------------------------- 준비
  g.renderer.setAnimationLoop(null);
  g.clock.getDelta = () => DT;
  g.settings.q = 'high';
  g.applyQuality();
  g.director.update = () => {};
  g.hint = () => {};
  g.hud.msg = () => {};
  g.hud.toast = () => {};
  g.progress.unlock = () => false;
  g.progress.addDeath = () => {};
  const origDie = g.die.bind(g);
  const origStalkerUpdate = s.update;
  const origUpdateMesh = s.updateMesh;
  const origUpdateTitle = g.updateTitle;
  const origUpdateCar = g.updateCar;
  // 피구공은 거의 보여 주지 않는다: 기본은 앞뒤 모두 검은 실루엣. 얼굴은 마지막 한 순간에만
  const silhouette = (on) => s.setSilhouette(on);
  const origDetect = s.detect;

  // window.TR_FROM: 이 번호의 샷부터 촬영 (미리보기용)
  const TR = { frame: 0, t: 0, events: [], shotIdx: (window.TR_FROM || 0) - 1, lt: 0, done: false, marks: {} };
  window.TR = TR;
  const ev = (type, extra = {}) => TR.events.push({ t: +TR.t.toFixed(3), type, ...extra });
  const mark = (name) => { if (TR.marks[name] === undefined) { TR.marks[name] = +TR.t.toFixed(3); ev('mark', { name }); } };

  // 사운드 호출 시각 기록 (실제 소리는 audio.py 가 합성)
  const A = g.audio;
  for (const name of ['footstep', 'fall', 'ding', 'doorSlide', 'sting', 'boom', 'jumpscare', 'laughAt', 'rattle', 'torchClick', 'glitch', 'click', 'slam', 'creak', 'thud']) {
    const orig = A[name]?.bind(A);
    A[name] = (...args) => {
      ev(name, name === 'footstep' ? { vol: args[0], kind: args[3] } : {});
      try { return orig?.(...args); } catch { return undefined; }
    };
  }

  // ---------------------------------------------------------------- 오버레이 (자막·레터박스·로고)
  const css = document.createElement('style');
  css.textContent = `
  #tr { position: fixed; inset: 0; z-index: 9999; pointer-events: none; font-family: 'Noto Serif KR', serif; }
  #tr .bar { position: absolute; left: 0; right: 0; height: 10.5%; background: #000; }
  #tr .bar.top { top: 0; } #tr .bar.bot { bottom: 0; }
  /* 수칙 문구: 낡은 안내문을 타자로 치듯 한 글자씩 */
  #tr .rule { position: absolute; left: 7.5%; bottom: 15.5%; color: #e4ded2; opacity: 0; text-shadow: 0 0 14px rgba(0,0,0,.95), 0 0 3px #000; }
  #tr .rule .hd { font-family: 'Noto Sans KR', sans-serif; font-size: 13px; font-weight: 400; letter-spacing: .55em; color: #8f897e; margin-bottom: 12px; }
  #tr .rule .hd::before { content: ''; display: inline-block; width: 26px; height: 1px; background: #8f897e; vertical-align: middle; margin-right: 12px; }
  #tr .rule .tx { font-size: 27px; font-weight: 500; letter-spacing: .08em; }
  #tr .rule .tx .n { color: #b3261e; margin-right: .5em; font-weight: 700; }
  #tr .rule .tx .cur { display: inline-block; width: .5em; border-bottom: 2px solid #e4ded2; margin-left: 2px; }
  #tr .rule.center { left: 0; right: 0; bottom: auto; top: 50%; transform: translateY(-50%); text-align: center; }
  #tr .rule.center .tx { font-size: 34px; }
  #tr.nobars .bar { display: none; }
  #tr .black { position: absolute; inset: 0; background: #000; opacity: 0; }
  #tr .logo { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; }
  #tr .logo h1 { margin: 0; font-size: 92px; font-weight: 900; color: #efe8de; letter-spacing: .12em; text-shadow: 0 0 30px rgba(180,0,0,.55), 3px 0 0 rgba(255,0,0,.35), -3px 0 0 rgba(0,180,255,.25); }
  #tr .logo h2 { margin: 18px 0 0; font-family: 'Noto Sans KR', sans-serif; font-weight: 300; font-size: 22px; letter-spacing: .9em; color: #b9b2a8; padding-left: .9em; }
  #tr .logo .tag { margin-top: 54px; font-size: 21px; letter-spacing: .24em; color: #cfc8be; opacity: 0; }
  #tr .logo .tag .n { color: #b3261e; font-weight: 700; margin-right: .5em; }
  `;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.id = 'tr';
  root.innerHTML = `<div class="black"></div><div class="rule"><div class="hd"></div><div class="tx"></div></div><div class="bar top"></div><div class="bar bot"></div>
    <div class="logo"><h1>${YUGI ? '공포의 채널유기' : '공포의 송신계단'}</h1><h2>${YUGI ? 'CHANNEL YUGI' : 'SONGSHIN STAIRWELL'}</h2>
    <div class="tag"><span class="n">13.</span>끝까지 오르십시오.</div></div>`;
  document.body.appendChild(root);
  const $ = (q) => root.querySelector(q);
  const ruleEl = $('.rule'), ruleHd = $('.rule .hd'), ruleTx = $('.rule .tx'), blackEl = $('.black'), logoEl = $('.logo');
  // 게임 HUD·메뉴 숨김
  const hideCss = document.createElement('style');
  hideCss.textContent = '#hud, #prompt, #msg, #warn, #toast, #clickhint, #touch, .screen, #note, #cross, .grain, #ver, .version { display: none !important; } #cctv .hint { display: none !important; }';
  document.head.appendChild(hideCss);
  document.body.classList.remove('menu-on');

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const HEADER = `${YUGI ? '피구공' : '송신'}아파트 비상계단 이용 수칙`;
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  /**
   * 수칙 문구 — [t0, t1] 동안 한 글자씩 타이핑되고, 끝에서 흐려진다.
   * { t0, t1, n: 번호, text, header: 머리말 표시, center: 화면 가운데 }
   */
  function rule(lt, list) {
    let r = null;
    for (const c of list) if (lt >= c.t0 - 0.01 && lt <= c.t1) r = c;
    if (!r) {
      ruleEl.style.opacity = 0;
      ruleEl.dataset.k = '';
      return;
    }
    const chars = [...r.text];
    const shown = Math.min(chars.length, Math.max(0, Math.floor((lt - r.t0) / 0.055)));
    const key = `${r.n}:${shown}`;
    if (ruleEl.dataset.k !== key) {
      if (shown > (+ruleEl.dataset.shown || 0) && ruleEl.dataset.n === String(r.n)) ev('type');
      ruleEl.dataset.k = key;
      ruleEl.dataset.n = String(r.n);
      ruleEl.dataset.shown = String(shown);
      ruleHd.textContent = r.header ? HEADER : '';
      ruleHd.style.display = r.header ? '' : 'none';
      const blink = shown < chars.length || Math.floor(lt * 2.2) % 2 === 0;
      ruleTx.innerHTML = `<span class="n">${r.n}.</span>${esc(chars.slice(0, shown).join(''))}${blink ? '<span class="cur"></span>' : ''}`;
    }
    ruleEl.classList.toggle('center', !!r.center);
    // 끝날 때는 깜빡이며 사라진다
    const out = clamp01((r.t1 - lt) / 0.35);
    const flick = out < 1 && Math.random() < 0.35 ? 0.15 : 1;
    ruleEl.style.opacity = (Math.min(clamp01((lt - r.t0 + 0.05) / 0.15), out) * flick).toFixed(3);
  }
  const black = (v) => { blackEl.style.opacity = clamp01(v).toFixed(3); };

  // ---------------------------------------------------------------- 공용 도우미
  function resetAll() {
    g.closeCctv();
    g.hud.screen(null);
    g.trap = null;
    for (const k in g.input) g.input[k] = false;
    p.reset(FLOOR_PHI * 2 + 0.6);
    p.frozen = false;
    s.update = function (dt) { this.visible = false; this.updateMesh(dt); };
    s.updateMesh = origUpdateMesh;
    g.updateTitle = origUpdateTitle;
    g.updateCar = origUpdateCar;
    silhouette(true);
    g.director.lightMul = 1;
    s.detect = () => false;
    s.reset(g.diff);
    s.visible = false;
    s.state = 'wander';
    s.phi = FLOOR_PHI * 18;
    el.reset(12);
    g.die = () => {};
    g.state = 'playing';
    g.fadeIn = 0;
    u.uFade.value = 0;
    u.uRed.value = 0;
    g.fear = 0;
    g.glitch = 0;
    g.stalkerOnStairs = undefined;
    g.resetDoors();
    if (g.titleLight) g.titleLight.intensity = 0;
    ruleEl.style.opacity = 0;
    logoEl.style.opacity = 0;
  }
  function place(phi, r, yaw, pitch = 0) {
    p.reset(phi);
    p.r = r;
    p.x = r * Math.cos(phi);
    p.z = r * Math.sin(phi);
    if (yaw !== undefined) p.yaw = yaw;
    p.pitch = pitch;
  }
  /** 피구공을 직접 움직인다: fn(dt) 안에서 phi/r/yaw 를 정함 */
  function scriptStalker(fn) {
    s.update = function (dt, player, game) {
      this.game = game;
      this.t += dt;
      this.roomK = -1;
      fn(dt);
      this.updateMesh(dt);
    };
  }
  const uphillYaw = (phi) => Math.PI - phi;
  const faceYaw = (fromX, fromZ, toX, toZ) => Math.atan2(-(toX - fromX), -(toZ - fromZ)); // 플레이어 카메라 기준
  const meshYawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz); // 피구공 평면 기준
  const firstOpenRoom = (min) => g.world.fireDoors.find((d) => !d.locked && d.k >= min) || g.world.fireDoors.find((d) => !d.locked);

  /** 검은 화면 자막 카드 (막과 막 사이) */
  const card = (name, dur, r = null) => ({
    name, dur,
    setup() { mark(name); },
    tick(lt) {
      black(1);
      rule(lt, r ? [{ t0: 0.2, t1: dur - 0.05, center: true, ...r }] : []);
    },
  });
  /** 피구공 얼굴이 화면을 덮치는 짧은 섬광 컷 */
  function faceFlash(k) {
    resetAll();
    const phi = FLOOR_PHI * k + 0.6;
    place(phi, R_MID, uphillYaw(phi) - 0.3, 0.05);
    p.torchOn = true;
    s.state = 'chase';
    s.visible = true;
    scriptStalker(() => {
      const w = { x: p.x - Math.sin(p.yaw) * 1.25, z: p.z - Math.cos(p.yaw) * 1.25 };
      s.phi = p.phi + Math.atan2(w.z, w.x) - Math.atan2(p.z, p.x);
      s.r = Math.hypot(w.x, w.z);
      s.yaw = meshYawTo(w.x, w.z, p.x, p.z);
      s.visible = true;
    });
  }

  // ---------------------------------------------------------------- 샷 목록
  // 음악과 함께 점점 고조된다:
  //   평온(아무 일도 없는 계단·빈 엘리베이터) → 이상 징후(같은 구도에 서 있는 그것, 깜빡이는 불)
  //   → 등장·긴장(엘리베이터, 웅크림, CCTV) → 혼돈(서브리미널 컷이 섞인 추격, 엘리베이터 함정) → 로고
  const shots = [
    // 1. 올려다본 나선 계단 — 멀리서 무언가 내려온다
    {
      name: 'title', dur: 4.6,
      setup() {
        resetAll();
        g.state = 'title';
        g.titleT = 0.4;
        u.uFade.value = 1;
        // 평온한 도입: 아직 아무도 없다
        s.updateMesh = function (dt) { this.visible = false; origUpdateMesh.call(this, dt); };
      },
      tick(lt) {
        u.uFade.value = Math.max(0, 1 - lt / 2.2) + DT * 0.5;
        rule(lt, []);
      },
    },
    // 2. 손전등을 들고 계단을 오른다
    {
      name: 'climb', dur: 4.4,
      setup() {
        resetAll();
        place(FLOOR_PHI * 2 + 1.9, R_MID - 0.25, uphillYaw(FLOOR_PHI * 2 + 1.9) - 0.55, 0.1);
        p.torchOn = true;
        g.input.f = true;
      },
      tick(lt) {
        black(1 - lt / 0.3);
        // 앞쪽(오르막) 보다 약간 안쪽 — 난간과 위층 계단이 보이게. 너무 바깥으로 붙으면 안쪽으로 되돌린다
        if (p.r > R_MID + 0.2) p.r -= 0.02;
        p.yaw = uphillYaw(p.phi) - 0.55 + 0.1 * Math.sin(lt * 0.7); // 오른쪽(나선 안쪽)으로 — 난간과 위로 감기는 계단
        p.pitch = 0.2 + 0.06 * Math.sin(lt * 0.5);
        rule(lt, [{ t0: 0.5, t1: 4.4, n: 1, header: true, text: '계단은 위로만 오르십시오.' }]);
      },
    },
    // 3. 난간 너머 위를 올려다본다 — 끝없는 나선
    {
      name: 'well', dur: 3.3,
      setup() {
        resetAll();
        const phi = FLOOR_PHI * 1 + 0.55;
        place(phi, R_IN + 0.42, Math.atan2(Math.cos(phi), Math.sin(phi)), 0.95);
        p.torchOn = true;
      },
      tick(lt) {
        const phi = p.phi;
        p.yaw = Math.atan2(Math.cos(phi), Math.sin(phi)) - 0.15 + lt * 0.05;
        p.pitch = Math.min(1.4, 0.95 + lt * 0.09);
      },
    },
    // 평온: 엘리베이터가 와서 열린다. 밝고, 비어 있다
    {
      name: 'elevEmpty', dur: 4.2,
      setup() {
        resetAll();
        const k = 3;
        const phi = FLOOR_PHI * k + DOOR_ANGLE - 0.1;
        place(phi, R_IN + 0.7, 0, -0.08);
        const d = g.world.elevators[k].doorPos;
        p.yaw = faceYaw(p.x, p.z, d.x, d.z) + 0.1;
        p.torchOn = false;
        el.reset(k);
        el.floor = k + 1.4 / g.diff.elevatorSecPerFloor;
        el.call(k, 'player');
        g.world.elevators[k].setCall(true);
      },
      tick(lt) {
        black(1 - lt / 0.25);
        if (el.doorK === 3) mark('emptyOpen');
      },
    },
    // 이상 징후: 처음과 같은 구도 — 이번엔 계단 위에 누가 서 있다. 불이 떨린다
    {
      name: 'glimpse', dur: 3.3,
      setup() {
        resetAll();
        g.state = 'title';
        g.titleT = 2.6;
        u.uFade.value = 0;
        g.updateTitle = (dt) => {
          origUpdateTitle.call(g, dt);
          const lt = TR.lt;
          const off = (lt > 1.1 && lt < 1.25) || (lt > 1.4 && lt < 1.48) || (lt > 2.6 && lt < 2.95);
          g.titleLight.intensity *= off ? 0.05 : 1;
          // 처음엔 없다 → 불이 한 번 떨린 뒤 저 위에 서 있다 → 다시 떨리면 사라진다
          if (lt < 1.25 || lt > 2.6) s.group.visible = false;
        };
        mark('glimpse');
      },
      tick(lt) {
        black(1 - lt / 0.2);
        if (lt > 1.1 && lt < 1.14) ev('flicker');
        if (lt > 2.6 && lt < 2.64) ev('flicker');
        if (lt > 3.0) black((lt - 3.0) / 0.3);
      },
    },
    // 4. 엘리베이터가 다시 열린다. 불이 떨리는 순간에만 — 안쪽 벽을 보고 선 무언가
    {
      name: 'elevator', dur: 4.8,
      setup() {
        resetAll();
        const k = 5;
        const phi = FLOOR_PHI * k + DOOR_ANGLE - 0.06;
        place(phi, R_IN + 0.6, 0, -0.1);
        const d = g.world.elevators[k].doorPos;
        p.yaw = faceYaw(p.x, p.z, d.x, d.z) - 0.05;
        p.torchOn = false;
        el.reset(k);
        el.floor = k + 1.1 / g.diff.elevatorSecPerFloor;
        el.call(k, 'player');
        g.world.elevators[k].setCall(true);
        this.k = k;
        this.open = null;
        this.flick = 1;
        this.fig = false;
        this.close = 0;
        const car = g.world.car;
        g.updateCar = (dt) => {
          origUpdateCar.call(g, dt);
          car.light.intensity *= this.flick;
          car.lightMat.color.multiplyScalar(Math.max(0.02, this.flick));
        };
        scriptStalker(() => {
          s.phi = FLOOR_PHI * k + DOOR_ANGLE;
          s.r = R_OUT + 1.0 - this.close;
          const w = s.worldXZ();
          s.yaw = meshYawTo(w.x, w.z, w.x * 2, w.z * 2); // 안쪽 벽을 보고 서 있다
          s.visible = this.fig;
        });
      },
      tick(lt) {
        black(1 - lt / 0.25);
        if (el.doorK === this.k && this.open === null) {
          this.open = lt;
          mark('figOpen');
        }
        const o = this.open === null ? -1 : lt - this.open;
        const W = (a, b) => o >= a && o < b;
        // 열리고 한동안은 밝고 비어 있다 → 불이 떨릴 때만 그것이 보인다 → 마지막엔 불이 죽는다
        let f = 1, fig = false;
        if (W(1.2, 1.28) || W(1.4, 1.46) || W(2.0, 2.14) || W(2.3, 2.36)) f = 0;
        if (W(1.28, 1.4)) { f = 1.3; fig = true; this.close = 0; }
        if (W(2.14, 2.3)) { f = 1.3; fig = true; this.close = 0.55; }
        if (W(2.36, 2.46)) { f = 1.5; fig = true; this.close = 1.05; }
        if (o >= 2.46) f = 0;
        if (fig && !this.fig) { ev('flicker'); mark('figSeen'); g.glitchPulse(0.35); }
        if (o >= 2.46 && this.flick > 0) ev('lightsOut');
        this.flick = f;
        this.fig = fig;
        if (o > 3.2) black((o - 3.2) / 0.2);
      },
    },
    // 5. 숨죽인 채 웅크린다. 위에서 발소리가 내려온다 — 그리고 손전등을 켜 버렸다.
    //    불이 깜빡일 때마다 그것은 한 계단씩 가까이 있다 (얼굴은 보이지 않는다)
    {
      name: 'descend', dur: 6.0,
      setup() {
        resetAll();
        const phi = FLOOR_PHI * 3 + 0.7;
        place(phi, R_MID - 0.2, uphillYaw(phi) - 0.5, 0.18);
        p.torchOn = false;
        g.input.crouch = true;
        this.stage = 0;
        this.hit = false;
        const dists = [5.0, 3.3, 2.0, 1.05];
        scriptStalker(() => {
          s.phi = p.phi + dists[this.stage] / R_MID;
          s.r = R_MID + 0.1;
          const w = s.worldXZ();
          s.yaw = meshYawTo(w.x, w.z, p.x, p.z);
          s.visible = p.torchOn && TR.lt > 4.2;
        });
      },
      tick(lt) {
        black(1 - lt / 0.25);
        // 계단 위 — 그것이 나타날 자리를 바라본다
        const tphi = p.phi + 4.0 / R_MID;
        const tx = (R_MID + 0.1) * Math.cos(tphi), tz = (R_MID + 0.1) * Math.sin(tphi);
        p.yaw = faceYaw(p.x, p.z, tx, tz) + 0.1 + Math.sin(lt * 0.4) * 0.02;
        p.pitch = 0.32;
        // 위에서 내려오는 발소리 (점점 크게)
        for (const [t, v] of [[0.7, 0.25], [1.55, 0.35], [2.35, 0.45], [3.05, 0.6], [3.65, 0.75]]) {
          if (lt >= t && lt - DT < t) ev('farstep', { vol: v });
        }
        const W = (a, b) => lt >= a && lt < b;
        if (lt >= 4.2 && !this.lit) {
          this.lit = true;
          g.audio.torchClick();
        }
        let on = lt >= 4.2;
        if (W(4.65, 4.76)) { on = false; this.stage = 1; }
        if (W(5.05, 5.13)) { on = false; this.stage = 2; }
        if (W(5.38, 5.44)) { on = false; this.stage = 3; }
        if (lt >= 5.6) on = false;
        if (on !== p.torchOn && lt > 4.3) ev('flicker');
        p.torchOn = on;
        if (lt >= 5.6 && !this.hit) {
          this.hit = true;
          mark('descendHit');
          g.glitchPulse(0.8);
        }
        if (lt >= 5.6) black(1);
        rule(lt, [{ t0: 0.3, t1: 4.0, n: 4, text: '그것과 눈이 마주치면, 불을 켜지 마십시오.' }]);
      },
    },
    card('card1', 0.8),
    // 6. 비상실에 숨어 CCTV로 문 앞을 본다. 그것이 쓱 다가온다
    {
      name: 'cctv', dur: 4.0,
      setup() {
        resetAll();
        const d = firstOpenRoom(4);
        this.door = d;
        place(FLOOR_PHI * d.k + 0.3, R_MID);
        p.roomK = d.k;
        p.setRoomPos(d.pos.x * 0.35 + d.monitorPos.x * 0.65, d.pos.z * 0.35 + d.monitorPos.z * 0.65);
        p.footY = d.k * 9;
        d.open = 0;
        d.target = 0;
        g.openCctv(d);
        this.d = 6.5;
        const base = FLOOR_PHI * d.k + FIREDOOR_ANGLE;
        scriptStalker((dt) => {
          this.d = Math.max(0, this.d - 1.45 * dt);
          s.phi = base + this.d / R_MID;
          s.r = R_OUT - 0.65 - Math.min(1, this.d / 6.5) * 0.9;
          const w = s.worldXZ();
          s.yaw = meshYawTo(w.x, w.z, d.cctvPos.x, d.cctvPos.z);
          s.visible = true;
        });
      },
      tick(lt) {
        black(1 - lt / 0.2);
        if (lt > 3.0 && !this.rattled) {
          this.rattled = true;
          g.onDoorRattle(this.door.k);
          g.glitchPulse(0.4);
        }
      },
    },
    // 7. 전 층 CCTV — MOTION
    {
      name: 'grid', dur: 2.2,
      setup() {
        const d = shots.find((x) => x.name === 'cctv').door;
        g.cctvToggle();
        this.door = d;
      },
      tick(lt) {
        if (lt > 1.2 && !this.r2) {
          this.r2 = true;
          g.onDoorRattle(this.door.k);
        }
        if (lt > 2.05) black((lt - 2.05) / 0.15);
      },
    },
    card('card2', 2.9, { n: 9, text: '뒤돌아보지 마십시오.' }),
    // 8. 추격 — 달리고, 돌아보고, 넘어진다
    {
      name: 'chase', dur: 6.6,
      setup() {
        resetAll();
        const phi = FLOOR_PHI * 7 + 1.6;
        place(phi, R_MID, uphillYaw(phi), 0.05);
        p.torchOn = true;
        p.stamina = 100;
        g.input.f = true;
        g.input.sprint = true;
        this.gap = 6.2;
        s.state = 'chase';
        s.visible = true;
        this.sub = false;
        scriptStalker((dt) => {
          const lt = TR.lt;
          const close = lt < 2.2 ? 0.25 : lt < 3.7 ? 1.4 : lt < 5.4 ? 0.2 : 2.4;
          this.gap = Math.max(1.3, this.gap - close * dt);
          if (this.sub) {
            // 서브리미널: 달리는 눈앞에 몇 프레임 동안 얼굴이 박힌다
            const w = { x: p.x - Math.sin(p.yaw) * 1.15, z: p.z - Math.cos(p.yaw) * 1.15 };
            s.phi = p.phi + Math.atan2(w.z, w.x) - Math.atan2(p.z, p.x);
            s.r = Math.hypot(w.x, w.z);
            s.yaw = meshYawTo(w.x, w.z, p.x, p.z);
          } else {
            s.phi = p.phi - this.gap / R_MID;
            s.r = R_MID + 0.1 * Math.sin(lt * 3);
            const w = s.worldXZ();
            s.yaw = meshYawTo(w.x, w.z, p.x, p.z);
          }
          s.visible = true;
        });
        g.audio.sting(0.5);
        g.glitchPulse(0.6);
      },
      tick(lt) {
        black(1 - lt / 0.15);
        const fwd = uphillYaw(p.phi) - 0.4; // 바깥벽 대신 위로 감기는 계단 쪽 (오른쪽이 나선 안쪽)
        // 2.2~3.7초: 뒤를 돌아본다 (뒷걸음질)
        let look = 0;
        if (lt > 2.2 && lt < 3.7) look = Math.min(1, (lt - 2.2) / 0.3) * Math.min(1, (3.7 - lt) / 0.25);
        const w = s.worldXZ();
        const back = faceYaw(p.x, p.z, w.x, w.z);
        let dy = back - fwd;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        p.yaw = fwd + dy * look + Math.sin(lt * 9) * 0.02;
        p.pitch = 0.05 - look * 0.12;
        g.input.f = look < 0.5;
        g.input.b = look >= 0.5;
        g.input.sprint = look < 0.5;
        if (lt > 2.4 && lt < 2.5) g.glitchPulse(0.5);
        // 정신없는 편집: 짧은 암전 끊김 + 서브리미널 얼굴
        const inW = (a, b) => lt >= a && lt < b;
        const stutter = inW(0.8, 0.87) || inW(1.9, 1.94) || inW(4.55, 4.62) || inW(5.9, 5.97);
        this.sub = inW(1.2, 1.3) || inW(4.1, 4.2) || inW(6.0, 6.1);
        if (this.sub) {
          g.glitchPulse(1);
          mark(lt < 2 ? 'sub1' : lt < 5 ? 'sub2' : 'sub3');
        }
        if (stutter) black(1);
        else if (lt > 0.15) black(0);
        if (Math.floor(lt * 2.6) !== Math.floor((lt - DT) * 2.6)) g.glitchPulse(0.25); // 박자에 맞춘 잔떨림
        if (lt > 5.3 && !this.tripped) {
          this.tripped = true;
          p.stamina = 0;
          p.trip({});
          g.audio.fall();
          g.glitchPulse(0.6);
        }
      },
    },
    // 섬광 컷: 넘어진 직후 눈앞의 얼굴
    {
      name: 'flash', dur: 0.45,
      setup() { faceFlash(11); mark('flash'); },
      tick() { g.glitchPulse(1); p.shake = 1; },
    },
    card('card3', 0.8),
    // 9. 엘리베이터에 탔다 — 문이 열리면
    {
      name: 'trap', dur: 9,
      setup() {
        resetAll();
        const k = 4;
        place(FLOOR_PHI * k + DOOR_ANGLE, R_MID);
        el.reset(k);
        el.openDoors(k, 3);
        g.world.elevators[k].open = 1;
        g.world.elevators[k].target = 1;
        p.carK = k;
        const a = DOOR_ANGLE, r = 5.55;
        p.setCarPos(r * Math.cos(a), r * Math.sin(a));
        p.yaw = Math.atan2(Math.cos(a), Math.sin(a));
        p.pitch = 0.02;
        p.torchOn = false;
        el.doorT = 1.3;
        s.update = origStalkerUpdate;
        g.die = () => { mark('die'); silhouette(false); origDie(); }; // 단 한 번, 얼굴
        this.patched = false;
      },
      tick(lt) {
        black(1 - lt / 0.2);
        if (g.trap && !this.patched) {
          this.patched = true;
          g.trap.T = 2;
          el.send(2);
          s.setTrap(2);
          el.speedMul = (2 * g.diff.elevatorSecPerFloor) / 2.6;
          mark('ride');
        }
        if (g.trap && el.doorK === 2) mark('reveal');
        rule(lt, [{ t0: 0.4, t1: 3.5, n: 12, text: '엘리베이터 문이 열리면, 눈을 감으십시오.' }]);
        if (g.state === 'dying' && g.dieT > 1.45) this.end = true;
        if (g.state === 'dying' && g.dieT > 1.25) black((g.dieT - 1.25) / 0.2);
      },
      over(lt) { return this.end || lt > 9; },
    },
    // 10. 로고
    {
      name: 'logo', dur: 7.2,
      setup() {
        resetAll();
        g.hud.screen(null);
        g.state = 'title';
        g.titleT = 5;
        u.uFade.value = 1;
        black(1);
        s.updateMesh = function (dt) { this.visible = false; origUpdateMesh.call(this, dt); };
      },
      tick(lt) {
        black(Math.max(0, 1 - lt / 0.6));
        u.uFade.value = 0.62 + DT * 0.5;
        const a = clamp01((lt - 0.5) / 0.9);
        logoEl.style.opacity = a.toFixed(3);
        logoEl.style.transform = `scale(${(1.04 - 0.04 * a).toFixed(4)})`;
        if (lt > 0.5) mark('logo');
        if (lt > 0.5 && lt < 0.62) g.glitchPulse(0.9);
        $('.tag').style.opacity = clamp01((lt - 2.6) / 1.0).toFixed(3);
        if (lt > 2.6) mark('cta');
        if (lt > 7.0) black((lt - 7.0) / 0.8);
      },
    },
  ];

  // ---------------------------------------------------------------- 진행
  TR.step = () => {
    if (TR.done) return false;
    let sh = shots[TR.shotIdx];
    const over = sh && (sh.over ? sh.over(TR.lt) : TR.lt >= sh.dur);
    if (!sh || over || !TR.started) {
      TR.started = true;
      TR.shotIdx++;
      sh = shots[TR.shotIdx];
      if (!sh) {
        TR.done = true;
        return false;
      }
      TR.lt = 0;
      sh.t0 = TR.t;
      black(0);
      sh.setup();
      ev('shot', { name: sh.name });
    }
    sh.tick(TR.lt);
    g.frame();
    root.classList.toggle('nobars', !!g.cctv);
    TR.frame++;
    TR.t += DT;
    TR.lt += DT;
    return true;
  };
})();
