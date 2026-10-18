// 트레일러 촬영용 연출 스크립트 — 빌드된 게임 페이지 안에서 실행된다 (record.cjs 가 주입)
// 게임 루프를 멈추고 고정 dt 로 한 프레임씩 진행하며, 장면(샷)마다 플레이어·송신·카메라를 연출한다.
// window.TR.step() 을 부를 때마다 1프레임 진행 (window.TR_FPS, 기본 30fps). 소리는 나중에 합성하므로 사운드 호출 시각만 기록한다.
(() => {
  const g = window.__songsin;
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
  #tr .cap { position: absolute; left: 0; right: 0; bottom: 15%; text-align: center; color: #e9e4dc; font-size: 30px; font-weight: 500;
    letter-spacing: .14em; text-shadow: 0 0 18px rgba(0,0,0,.95), 0 0 4px #000; opacity: 0; }
  #tr .cap.big { font-size: 46px; font-weight: 700; color: #f2ece4; letter-spacing: .22em; bottom: 44%; }
  #tr.nobars .bar { display: none; }
  #tr .black { position: absolute; inset: 0; background: #000; opacity: 0; }
  #tr .logo { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; }
  #tr .logo h1 { margin: 0; font-size: 92px; font-weight: 900; color: #efe8de; letter-spacing: .12em; text-shadow: 0 0 30px rgba(180,0,0,.55), 3px 0 0 rgba(255,0,0,.35), -3px 0 0 rgba(0,180,255,.25); }
  #tr .logo h2 { margin: 18px 0 0; font-family: 'Noto Sans KR', sans-serif; font-weight: 300; font-size: 22px; letter-spacing: .9em; color: #b9b2a8; padding-left: .9em; }
  #tr .logo .tag { margin-top: 46px; font-size: 22px; letter-spacing: .3em; color: #cfc8be; opacity: 0; }
  #tr .logo .cta { margin-top: 22px; font-family: 'Noto Sans KR', sans-serif; font-size: 16px; letter-spacing: .5em; color: #ff4a4a; opacity: 0; padding-left: .5em; }
  #tr .logo .modes { margin-top: 16px; font-family: 'Noto Sans KR', sans-serif; font-size: 14px; letter-spacing: .4em; color: #8d877f; opacity: 0; padding-left: .4em; }
  `;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.id = 'tr';
  root.innerHTML = `<div class="black"></div><div class="cap"></div><div class="bar top"></div><div class="bar bot"></div>
    <div class="logo"><h1>공포의 송신계단</h1><h2>SONGSHIN STAIRWELL</h2>
    <div class="tag">끝까지 올라가라. 들키지 말고.</div>
    <div class="modes">캐주얼 · 노말 · 하드 · 악몽</div>
    <div class="cta">지금 플레이</div></div>`;
  document.body.appendChild(root);
  const $ = (q) => root.querySelector(q);
  const capEl = $('.cap'), blackEl = $('.black'), logoEl = $('.logo');
  // 게임 HUD·메뉴 숨김
  const hideCss = document.createElement('style');
  hideCss.textContent = '#hud, #prompt, #msg, #warn, #toast, #clickhint, #touch, .screen, #note, #cross, .grain, #ver, .version { display: none !important; } #cctv .hint { display: none !important; }';
  document.head.appendChild(hideCss);
  document.body.classList.remove('menu-on');

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  /** 자막 [t0, t1] 동안 페이드 인/아웃 */
  function caption(lt, list) {
    let text = '', op = 0, big = false;
    for (const c of list) {
      if (lt >= c.t0 - 0.01 && lt <= c.t1) {
        text = c.text;
        big = !!c.big;
        op = Math.min(clamp01((lt - c.t0) / 0.45), clamp01((c.t1 - lt) / 0.45));
      }
    }
    if (capEl.textContent !== text) capEl.textContent = text;
    capEl.classList.toggle('big', big);
    capEl.style.opacity = op.toFixed(3);
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
    capEl.style.opacity = 0;
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
  /** 송신을 직접 움직인다: fn(dt) 안에서 phi/r/yaw 를 정함 */
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
  const meshYawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz); // 송신 평면 기준
  const firstOpenRoom = (min) => g.world.fireDoors.find((d) => !d.locked && d.k >= min) || g.world.fireDoors.find((d) => !d.locked);

  // ---------------------------------------------------------------- 샷 목록
  const shots = [
    // 1. 올려다본 나선 계단 — 멀리서 무언가 내려온다
    {
      name: 'title', dur: 5.4,
      setup() {
        resetAll();
        g.state = 'title';
        g.titleT = 0.4;
        u.uFade.value = 1;
      },
      tick(lt) {
        u.uFade.value = Math.max(0, 1 - lt / 2.2) + DT * 0.5;
        caption(lt, [{ t0: 1.0, t1: 4.9, text: '자정이 지난 아파트, 비상계단.' }]);
      },
    },
    // 2. 손전등을 들고 계단을 오른다
    {
      name: 'climb', dur: 5.0,
      setup() {
        resetAll();
        place(FLOOR_PHI * 2 + 1.9, R_MID - 0.25, uphillYaw(FLOOR_PHI * 2 + 1.9) + 0.4, 0.1);
        p.torchOn = true;
        g.input.f = true;
      },
      tick(lt) {
        black(1 - lt / 0.3);
        // 앞쪽(오르막) 보다 약간 안쪽 — 난간과 위층 계단이 보이게. 너무 바깥으로 붙으면 안쪽으로 되돌린다
        if (p.r > R_MID + 0.2) p.r -= 0.02;
        p.yaw = uphillYaw(p.phi) + 0.42 + 0.12 * Math.sin(lt * 0.7);
        p.pitch = 0.2 + 0.06 * Math.sin(lt * 0.5);
        caption(lt, [{ t0: 0.5, t1: 4.6, text: '출구는 단 하나. 꼭대기의 옥상 문.' }]);
      },
    },
    // 3. 난간 너머 위를 올려다본다 — 끝없는 나선
    {
      name: 'well', dur: 4.2,
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
        caption(lt, [{ t0: 0.6, t1: 3.9, text: '그리고 이 계단에는—' }]);
      },
    },
    // 4. 엘리베이터가 내려와 열린다. 밝은 칸 안에 그것이 서 있다
    {
      name: 'elevator', dur: 5.6,
      setup() {
        resetAll();
        this.walk = false;
        const k = 5;
        const phi = FLOOR_PHI * k + DOOR_ANGLE - 0.06;
        place(phi, R_IN + 0.55, 0, -0.14);
        const d = g.world.elevators[k].doorPos;
        p.yaw = faceYaw(p.x, p.z, d.x, d.z) - 0.12;
        p.torchOn = false;
        // 약 2.3초 뒤 도착하도록 출발 위치를 정한다 (송신 AI가 속도 배율을 매 프레임 1로 되돌리므로)
        el.reset(k);
        el.floor = k + 2.3 / g.diff.elevatorSecPerFloor;
        el.occupant = 'stalker';
        s.reset(g.diff);
        s.update = origStalkerUpdate;
        s.detect = () => false;
        s.state = 'elevator';
        s.elevFloor = el.floor;
        s.elevTarget = k;
        s.elevDelay = 0;
        s.rideSent = true;
        s.hunting = false;
        el.send(k);
        g.world.elevators[k].setCall(true);
        this.k = k;
      },
      tick(lt) {
        black(1 - lt / 0.25);
        // 내린 뒤에는 플레이어 쪽으로 걸어온다
        s.belief.phi = p.phi;
        s.belief.t = 0;
        s.belief.vel = 0;
        if (s.state === 'arriving' && s.stateTime > 1.05) mark('stalkerOut');
        if (TR.marks.stalkerOut !== undefined && TR.t - TR.marks.stalkerOut < DT * 1.5) g.glitchPulse(0.7);
        // 내린 뒤 한 박자 쉬고, 플레이어 쪽으로 천천히 걸어온다
        if (TR.marks.stalkerOut !== undefined && TR.t - TR.marks.stalkerOut > 0.7 && !this.walk) {
          this.walk = true;
          scriptStalker((dt) => {
            if (s.distTo(p) > 1.7) s.moveToward(p.phi, p.r, 1.25, dt);
            const w = s.worldXZ();
            s.yaw = meshYawTo(w.x, w.z, p.x, p.z);
            s.visible = true;
          });
        }
        const o = TR.marks.stalkerOut !== undefined ? TR.marks.stalkerOut - this.t0 : 99;
        caption(lt, [{ t0: o + 0.15, t1: 5.6, text: '송신이 산다.', big: true }]);
      },
    },
    // 5. 숨죽인 채 웅크린다. 위에서 내려오는 발소리 — 그리고 손전등을 켜 버렸다
    {
      name: 'descend', dur: 5.2,
      setup() {
        resetAll();
        const phi = FLOOR_PHI * 3 + 0.7;
        place(phi, R_MID - 0.2, uphillYaw(phi) - 0.5, 0.18);
        p.torchOn = false;
        g.input.crouch = true;
        this.d = 6.4;
        s.state = 'approach';
        s.visible = true;
        scriptStalker((dt) => {
          const lt = TR.lt;
          if (lt < 3.7) this.d = Math.max(3.6, this.d - 0.8 * dt);
          else if (lt > 4.1) this.d = Math.max(0.9, this.d - 5.5 * dt);
          s.phi = p.phi + this.d / R_MID;
          s.r = R_MID + 0.15;
          const w = s.worldXZ();
          if (lt < 3.6) s.yaw = Math.atan2(Math.sin(s.phi), -Math.cos(s.phi));
          else s.yaw = meshYawTo(w.x, w.z, p.x, p.z);
          s.visible = true;
        });
      },
      tick(lt) {
        black(1 - lt / 0.25);
        const w = s.worldXZ();
        const toS = faceYaw(p.x, p.z, w.x, w.z);
        p.yaw = toS + 0.12 + Math.sin(lt * 0.4) * 0.03; // 내려오는 송신 쪽 (살짝 비켜서)
        p.pitch = Math.atan2(s.footY + 1.0 - (p.footY + 1.3), Math.hypot(w.x - p.x, w.z - p.z)) * 0.8;
        if (lt >= 2.75 && !p.torchOn) {
          p.torchOn = true;
          g.audio.torchClick();
        }
        if (lt >= 3.6 && s.state !== 'chase') {
          s.state = 'chase';
          g.glitchPulse(0.6);
          g.audio.sting(0.45);
          g.audio.laughAt(s.pos, 1);
          p.shake = 0.6;
        }
        caption(lt, [
          { t0: 0.3, t1: 2.5, text: '소리를 내지 마라.' },
          { t0: 2.75, t1: 4.0, text: '불을 켜지 마라.' },
        ]);
        if (lt > 5.0) black((lt - 5.0) / 0.2);
      },
    },
    // 6. 비상실에 숨어 CCTV로 문 앞을 본다. 그것이 쓱 다가온다
    {
      name: 'cctv', dur: 4.6,
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
        if (lt > 3.4 && !this.rattled) {
          this.rattled = true;
          g.onDoorRattle(this.door.k);
          g.glitchPulse(0.4);
        }
        caption(lt, [{ t0: 0.4, t1: 4.4, text: '숨어도, 오래 버틸 수는 없다.' }]);
      },
    },
    // 7. 전 층 CCTV — MOTION
    {
      name: 'grid', dur: 2.8,
      setup() {
        const d = shots[5].door;
        g.cctvToggle();
        this.door = d;
      },
      tick(lt) {
        if (lt > 1.6 && !this.r2) {
          this.r2 = true;
          g.onDoorRattle(this.door.k);
        }
        caption(lt, [{ t0: 0.3, t1: 2.6, text: '그것도, 당신을 찾고 있다.' }]);
        if (lt > 2.6) black((lt - 2.6) / 0.2);
      },
    },
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
        scriptStalker((dt) => {
          const lt = TR.lt;
          const close = lt < 2.2 ? 0.25 : lt < 3.7 ? 1.4 : lt < 5.4 ? 0.2 : 2.4;
          this.gap = Math.max(1.3, this.gap - close * dt);
          s.phi = p.phi - this.gap / R_MID;
          s.r = R_MID + 0.1 * Math.sin(lt * 3);
          const w = s.worldXZ();
          s.yaw = meshYawTo(w.x, w.z, p.x, p.z);
          s.visible = true;
        });
        g.audio.sting(0.5);
        g.glitchPulse(0.6);
      },
      tick(lt) {
        black(1 - lt / 0.15);
        const fwd = uphillYaw(p.phi) + 0.35; // 바깥벽 대신 위로 이어지는 계단 쪽
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
        if (lt > 5.3 && !this.tripped) {
          this.tripped = true;
          p.stamina = 0;
          p.trip({});
          g.audio.fall();
          g.glitchPulse(0.6);
        }
        if (lt > 6.35) black((lt - 6.35) / 0.15);
      },
    },
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
        g.die = () => { mark('die'); origDie(); };
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
        caption(lt, [{ t0: 0.4, t1: 3.4, text: '엘리베이터는… 타지 마라.' }]);
        if (g.state === 'dying' && g.dieT > 1.45) this.end = true;
        if (g.state === 'dying' && g.dieT > 1.25) black((g.dieT - 1.25) / 0.2);
      },
      over(lt) { return this.end || lt > 9; },
    },
    // 10. 로고
    {
      name: 'logo', dur: 7.8,
      setup() {
        resetAll();
        g.hud.screen(null);
        g.state = 'title';
        g.titleT = 5;
        u.uFade.value = 1;
        black(1);
      },
      tick(lt) {
        black(Math.max(0, 1 - lt / 0.6));
        u.uFade.value = 0.62 + DT * 0.5;
        const a = clamp01((lt - 0.5) / 0.9);
        logoEl.style.opacity = a.toFixed(3);
        logoEl.style.transform = `scale(${(1.04 - 0.04 * a).toFixed(4)})`;
        if (lt > 0.5) mark('logo');
        if (lt > 0.5 && lt < 0.62) g.glitchPulse(0.9);
        $('.tag').style.opacity = clamp01((lt - 2.3) / 0.8).toFixed(3);
        $('.modes').style.opacity = clamp01((lt - 3.6) / 0.8).toFixed(3);
        $('.cta').style.opacity = (clamp01((lt - 4.6) / 0.6) * (0.75 + 0.25 * Math.sin(lt * 5))).toFixed(3);
        if (lt > 4.6) mark('cta');
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
