// 공포의 송신계단 — 메인 게임 루프
import * as THREE from 'three';
import songsinUrl from '../assets/songsin.png';
import {
  FLOOR_PHI, FLOORS, FLOOR_H, R_IN, R_MID, DIFFICULTY,
  baseY, onLanding, landingCenter, polar, setFloors,
} from './config.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Stalker } from './stalker.js';
import { AudioEngine } from './audio.js';
import { Post } from './post.js';
import { Hud, formatTime } from './hud.js';
import { Director } from './director.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { Progress, ACHIEVEMENTS } from './achievements.js';
import { TorchFX } from './fx.js';

const NOTES = [
  { k: 1, title: '관리일지 — 3월 2일', body: '계단 청소 중 엘리베이터가 혼자 움직였다.\n아무도 타지 않았는데 층수 표시기가 계속 바뀐다.\n\n표시기에 숫자가 보이면 그건 엘리베이터 안에 있다.\n"Err"가 뜨면… 계단 어딘가에 있다.' },
  { k: 3, title: '경고문 (찢어짐)', body: '비상구 표시등이 켜진 문은 열립니다.\n안으로 들어가 문을 닫으면 그는 들어오지 못합니다.\n\n단, 같은 층에 오래 머물지 마십시오.\n불이 깜빡이면 이미 그가 알고 있습니다.' },
  { k: 6, title: '누군가의 메모', body: '그는 엘리베이터에서 내려 계단을 따라 걸어 온다.\n위층에서 내려올 때가 제일 무섭다.\n\n발소리를 줄여. 손전등도 꺼.\n그는 빛과 소리를 따라온다.' },
  { k: 9, title: '송신탑 무전 기록', body: '…수신기가 지직거리면 가까이 있다는 뜻이다.\n막대가 붉게 차면 뒤를 보지 말고 뛰어라.\n가장 가까운 비상문으로.' },
  { k: 12, title: '찢긴 일기장', body: '송신은 웃고 있었다.\n하트 모양으로 일그러진 얼굴로.\n\n문을 닫고 숨었더니 한참 문고리를 흔들다가 갔다.\n두 번째에는 문을 부수고 들어왔다.' },
  { k: 15, title: '마지막 메모', body: '옥상 문은 열려 있다. 맨 꼭대기 층까지만 가면 된다.\n\n하지만 위층에 가까워질수록 그도 알아챈다.\n그때부터는 멈추지 마.' },
];

// 그래픽 품질: GPU 성능에 맞춰 자동 선택 (설정에서 변경 가능)
const QUALITY = {
  low: { pr: 0.75, shadow: false, shadowSize: 512, samples: 0, bloom: false, beam: false, dust: false, aniso: 2 },
  mid: { pr: 1, shadow: true, shadowSize: 1024, samples: 2, bloom: true, beam: false, dust: true, aniso: 4 },
  high: { pr: 1.5, shadow: true, shadowSize: 1024, samples: 4, bloom: true, beam: true, dust: true, aniso: 8 },
  ultra: { pr: 2, shadow: true, shadowSize: 2048, samples: 4, bloom: true, beam: true, dust: true, aniso: 16 },
};

function detectQuality(renderer, touch) {
  if (touch) return 'low';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
    if (/nvidia|geforce|rtx|gtx|radeon|amd|apple m\d/i.test(name)) return 'high';
  } catch {
    /* 정보 없음 */
  }
  return 'mid';
}

class Game {
  constructor() {
    this.isTouch = isTouchDevice();
    this.settings = loadSettings(this.isTouch);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    if (!this.settings.q) this.settings.q = detectQuality(this.renderer, this.isTouch);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x020203, 0.1);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.03, 90);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0x3a4250, 0x050505, 0.025));

    this.world = null; // load() 에서 생성
    this.progress = new Progress();

    // CCTV: 비상실 모니터에 비치는 문 앞 계단참
    this.cctvCam = new THREE.PerspectiveCamera(88, 4 / 3, 0.05, 40);
    this.scene.add(this.cctvCam);
    this.cctvTarget = new THREE.WebGLRenderTarget(256, 192);
    this.cctvTarget.texture.colorSpace = THREE.SRGBColorSpace;
    this.irLight = new THREE.PointLight(0xdde6ff, 0, 10, 1.4); // 적외선 조명 (CCTV 렌더 때만 켬)
    this.scene.add(this.irLight);
    this.cctv = null;
    this.lampLights = [];
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(0xffdcae, 0, 10, 1.7);
      this.scene.add(l);
      this.lampLights.push(l);
    }

    this.audio = new AudioEngine();
    this.audio.volume = this.settings.vol;
    this.hud = new Hud();
    this.progress.onUnlock = (a) => {
      this.hud.toast(`도전과제 달성 — ${a.name}`);
      this.audio.ctx && this.audio.pickup(true);
    };
    this.post = new Post(this.renderer);
    this.post.uniforms.uGamma.value = this.settings.gamma;
    this.player = new Player(this.camera);
    this.fx = new TorchFX(this.scene, this.camera, this.player.torch);
    this.diff = DIFFICULTY.normal;

    this.items = [];
    this.closeTimers = [];
    this.hints = new Set();
    this.state = 'loading';
    this.input = { f: false, b: false, l: false, r: false, sprint: false, crouch: false };
    this.glitch = 0;
    this.fear = 0;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.titleT = 0;
    this.debugCount = 0;

    this.touch = new TouchControls(this);
    this.touch.enable(this.isTouch);
    this.hud.keyLabel = this.isTouch ? '조사' : 'E';
    // 노트북 등에서 처음 터치하면 터치 조작 켜기
    window.addEventListener('touchstart', () => {
      if (this.touch.enabled) return;
      this.touch.enable(true);
      this.hud.keyLabel = '조사';
      if (this.state === 'playing') this.touch.show(true);
    }, { once: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.bindInput();
    this.bindUI();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** 로딩: 단계마다 진행률을 알리며 무거운 준비 작업을 나눠서 한다 */
  async load(report) {
    const tick = () => new Promise((r) => setTimeout(r, 40));
    report(0.06, '계단실 설계 중');
    await tick();
    this.world = buildWorld(this.scene);
    report(0.45, '조명과 그림자 설치 중');
    await tick();
    this.applyQuality();
    report(0.6, '송신을 깨우는 중');
    await tick();
    const tex = await new THREE.TextureLoader().loadAsync(songsinUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.stalker = new Stalker(this.scene, tex);
    this.phantom = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.04, fog: true }));
    const aspect = tex.image.width / tex.image.height;
    this.phantom.scale.set(1.8 * aspect, 1.8, 1);
    this.phantom.visible = false;
    this.scene.add(this.phantom);
    this.director = new Director(this, this.phantom);
    document.querySelector('#scare img').src = songsinUrl;
    report(0.75, '셰이더 컴파일 중');
    await tick();
    this.enterTitle(false);
    this.updateTitle(0.016);
    try {
      this.renderer.compile(this.scene, this.camera);
      this.post.render(this.scene, this.camera);
    } catch {
      /* 미리 컴파일 실패해도 진행 */
    }
    report(1, '준비 완료');
    await tick();
  }

  // ------------------------------------------------------------------ 설정/입력
  applyQuality() {
    const q = QUALITY[this.settings.q] || QUALITY.mid;
    this.quality = q;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, q.pr);
    this.renderer.setPixelRatio(this.pixelRatio);
    const torch = this.player.torch;
    torch.castShadow = q.shadow;
    if (torch.shadow.mapSize.x !== q.shadowSize) {
      torch.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      torch.shadow.map?.dispose();
      torch.shadow.map = null;
    }
    this.post.configure({ samples: q.samples, bloom: q.bloom });
    this.fx.setEnabled(q.beam, q.dust);
    this.applyAnisotropy();
    this.resize();
  }

  applyAnisotropy() {
    if (!this.world) return;
    const a = Math.min(this.quality.aniso, this.renderer.capabilities.getMaxAnisotropy());
    const set = (t) => { if (t && t.anisotropy !== a) { t.anisotropy = a; t.needsUpdate = true; } };
    for (const t of Object.values(this.world.tex)) {
      if (t && t.isTexture) set(t);
      else if (t) Object.values(t).forEach(set);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, this.pixelRatio || 1);
  }

  bindInput() {
    const keyMap = {
      KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyC: 'crouch', ControlLeft: 'crouch', ControlRight: 'crouch',
    };
    window.addEventListener('keydown', (e) => {
      if (keyMap[e.code]) {
        this.input[keyMap[e.code]] = true;
        if (this.state === 'playing') e.preventDefault();
      }
      if (e.repeat) return;
      // 원작의 디버그 기능: Pause 키 5회 → 층 이동
      if (e.code === 'Pause') {
        if (++this.debugCount >= 5) {
          this.debugCount = 0;
          this.debugJump();
        }
      } else {
        this.debugCount = 0;
      }
      if (this.state !== 'playing') return;
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyF' && !this.hud.noteOpen) {
        if (this.player.toggleTorch()) this.audio.torchClick();
        else this.hud.msg('배터리 없음', 1.8);
      }
      if (e.code === 'KeyP') this.pause();
    });
    window.addEventListener('keyup', (e) => {
      if (keyMap[e.code]) this.input[keyMap[e.code]] = false;
    });
    window.addEventListener('blur', () => {
      for (const k in this.input) this.input[k] = false;
    });

    const canvas = this.renderer.domElement;
    document.addEventListener('mousemove', (e) => {
      if (this.state !== 'playing' || this.hud.noteOpen) return;
      const locked = document.pointerLockElement === canvas;
      // 포인터 잠금이 안 되는 환경에서는 드래그로 시점 회전
      if (!locked && !(e.buttons & 1)) return;
      const mx = e.movementX || 0, my = e.movementY || 0;
      // 포인터 잠금 직후 브라우저가 보내는 비정상적으로 큰 이동값 무시
      if (Math.abs(mx) > 250 || Math.abs(my) > 250 || performance.now() - this.lockTime < 120) return;
      const sens = 0.0022 * this.settings.sens;
      this.player.look(mx, my * (this.settings.invert ? -1 : 1), sens);
    });
    // 마우스 좌클릭 = 손전등 켜기/끄기 (마우스가 잠긴 상태에서)
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.state !== 'playing' || this.cctv || this.hud.noteOpen) return;
      if (document.pointerLockElement !== canvas) return;
      if (this.player.toggleTorch()) this.audio.torchClick();
      else this.hud.msg('배터리 없음', 1.8);
    });
    canvas.addEventListener('click', () => {
      this.hud.clickHint.classList.remove('on');
      if (this.state === 'playing' && this.cctv) {
        this.closeCctv();
        return;
      }
      if (this.state === 'playing') {
        if (this.hud.noteOpen) this.hud.hideNote();
        this.lock();
      }
    });
    document.getElementById('note').addEventListener('click', () => {
      this.hud.hideNote();
      this.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      this.lockTime = performance.now();
      if (!locked && this.state === 'playing' && !this.hud.noteOpen && !this.ignoreUnlock) this.pause();
      this.ignoreUnlock = false;
    });
  }

  lock() {
    if (this.touch.enabled) return; // 모바일은 포인터 잠금 대신 터치 조작
    const c = this.renderer.domElement;
    if (document.pointerLockElement === c) return;
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          try { c.requestPointerLock(); } catch { /* 무시 */ }
        });
      }
    } catch {
      /* 포인터 잠금 미지원: 드래그로 조작 */
    }
  }

  unlock() {
    if (document.pointerLockElement) {
      this.ignoreUnlock = true;
      document.exitPointerLock();
    }
  }

  bindUI() {
    let backTo = 'title';
    const s = this.settings;
    const $ = (id) => document.getElementById(id);
    const sens = $('set-sens'), vol = $('set-vol'), q = $('set-q'), voice = $('set-voice'), invert = $('set-invert'), gamma = $('set-gamma');
    sens.value = s.sens;
    vol.value = s.vol;
    q.value = s.q;
    voice.checked = s.voice;
    invert.checked = s.invert;
    gamma.value = s.gamma;
    const gammaLabel = () => { $('gamma-val').textContent = (+s.gamma).toFixed(2); };
    gammaLabel();
    sens.oninput = () => { s.sens = +sens.value; saveSettings(s); };
    vol.oninput = () => { s.vol = +vol.value; this.audio.setVolume(s.vol); saveSettings(s); };
    gamma.oninput = () => { s.gamma = +gamma.value; this.post.uniforms.uGamma.value = s.gamma; gammaLabel(); saveSettings(s); };
    q.onchange = () => { s.q = q.value; this.applyQuality(); saveSettings(s); };
    voice.onchange = () => { s.voice = voice.checked; saveSettings(s); };
    invert.onchange = () => { s.invert = invert.checked; saveSettings(s); };

    document.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = b.dataset.act;
        if (act === 'start') {
          const dk = b.dataset.diff;
          if (dk === 'nightmare' && !this.progress.isCleared('hard')) {
            this.audio.uiDeny();
            this.hud.toast('하드 모드를 클리어하면 열립니다.');
            return;
          }
          this.audio.uiStart();
          this.start(dk);
          return;
        }
        if (act === 'back') this.audio.uiBack();
        else this.audio.uiSelect();
        if (act === 'newgame') {
          this.refreshTitle();
          backTo = 'title';
          this.hud.screen('newgame');
        } else if (act === 'reset-hints') {
          this.progress.data.hints = [];
          this.progress.save();
          this.hud.toast('다음 판부터 안내 문구가 다시 표시됩니다.');
        } else if (act === 'achievements') {
          this.renderAchievements();
          backTo = 'title';
          this.hud.screen('achievements');
        } else if (act === 'howto' || act === 'settings') {
          backTo = this.state === 'paused' ? 'pause' : 'title';
          this.hud.screen(act);
        } else if (act === 'back') this.hud.screen(backTo);
        else if (act === 'resume') this.resume();
        else if (act === 'retry') this.start(this.diffKey);
        else if (act === 'quit') this.enterTitle();
      });
    });

    // 메뉴: 마우스를 올리면 선택 표시 + 효과음, 키보드 ↑↓←→ / Enter / Esc
    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        if (document.activeElement !== el) {
          el.focus({ preventScroll: true });
          this.audio.uiMove();
        }
      });
    });
    window.addEventListener('keydown', (e) => {
      if (!['title', 'paused', 'dead', 'won'].includes(this.state)) return;
      const items = [...document.querySelectorAll('.screen.on [data-nav]')].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      const next = ['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD', 'Tab'].includes(e.code) && !e.shiftKey;
      const prev = ['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'].includes(e.code) || (e.code === 'Tab' && e.shiftKey);
      if (next || prev) {
        e.preventDefault();
        const j = i < 0 ? 0 : (i + (next ? 1 : -1) + items.length) % items.length;
        items[j].focus({ preventScroll: true });
        this.audio.uiMove();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        if (i >= 0) {
          e.preventDefault();
          items[i].click();
        }
      } else if (e.code === 'Escape') {
        const back = document.querySelector('.screen.on [data-act=back]');
        if (back) back.click();
        else if (this.state === 'paused') this.resume();
      }
    });
  }

  renderAchievements() {
    const list = document.getElementById('ach-list');
    const got = ACHIEVEMENTS.filter((a) => this.progress.has(a.id)).length;
    document.getElementById('ach-count').textContent = `${got} / ${ACHIEVEMENTS.length}`;
    document.getElementById('ach-bar').style.width = `${(got / ACHIEVEMENTS.length) * 100}%`;
    list.innerHTML = ACHIEVEMENTS.map((a) => {
      const ok = this.progress.has(a.id);
      const secret = a.hidden && !ok;
      return `<div class="ach ${ok ? 'ok' : ''}"><div class="ic">${ok ? '◆' : secret ? '?' : '◇'}</div>`
        + `<div><b>${secret ? '???' : a.name}</b><span>${secret ? '숨겨진 도전과제' : a.desc}</span></div></div>`;
    }).join('');
  }

  refreshTitle() {
    const open = this.progress.isCleared('hard');
    document.querySelector('[data-diff=nightmare]').classList.toggle('locked', !open);
    document.querySelectorAll('.dcard').forEach((c) => c.classList.toggle('cleared', this.progress.isCleared(c.dataset.diff)));
    const got = ACHIEVEMENTS.filter((a) => this.progress.has(a.id)).length;
    document.getElementById('ach-mini').textContent = `${got}/${ACHIEVEMENTS.length}`;
  }

  /** 난이도마다 층 수가 다르면 타워를 다시 짓는다 */
  ensureWorld(floors) {
    if (floors === FLOORS) return;
    this.scene.remove(this.world.root);
    this.world.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    setFloors(floors);
    this.world = buildWorld(this.scene);
    this.applyAnisotropy();
  }

  // ------------------------------------------------------------------ 상태 전환
  resetDoors() {
    for (const e of this.world.elevators) { e.target = 0; e.open = 0; this.setDoor(e); }
    for (const d of this.world.fireDoors) {
      d.open = 0;
      d.target = 0;
      d.hinge.rotation.y = 0;
    }
    const roof = this.world.roof;
    roof.target = 0;
    roof.open = 0;
    roof.pivot.rotation.y = 0;
  }

  /** 이번 판에 잠긴 비상문 결정 (1F는 항상 잠김, 연속 두 층이 잠기지 않게) */
  rollLocks() {
    let prevLocked = true;
    for (const d of this.world.fireDoors) {
      const locked = d.k === 0 || (!prevLocked && Math.random() < this.diff.lockChance);
      d.locked = locked;
      prevLocked = locked;
      d.exitSign.material = locked ? this.world.doorMats.exitOff : this.world.doorMats.exitOn;
      if (d.lamp.baseKind === undefined) d.lamp.baseKind = d.lamp.kind;
      d.lamp.kind = locked ? 'dead' : d.lamp.baseKind;
    }
  }

  enterTitle(showMenu = true) {
    this.state = 'title';
    this.hud.screen(showMenu ? 'title' : null);
    document.body.classList.add('menu-on');
    this.hud.show(false);
    this.hud.hideNote();
    this.touch.show(false);
    this.unlock();
    this.audio.silence(false);
    this.clearItems();
    this.stalker.reset(DIFFICULTY.normal);
    this.director.reset();
    this.player.reset();
    this.player.torch.intensity = 0;
    this.player.viewModel.visible = false;
    this.post.uniforms.uFade.value = 1;
    this.post.uniforms.uFlash.value = 0;
    this.titleT = 0;
    this.closeCctv();
    this.resetDoors();
    this.refreshTitle();
  }

  start(diffKey) {
    this.audio.init();
    this.audio.setVolume(this.settings.vol);
    this.audio.silence(false);
    this.diffKey = diffKey;
    this.diff = DIFFICULTY[diffKey];
    this.ensureWorld(this.diff.floors);
    this.run = { breached: false, torchTime: 0, enteredRoom: false, trips: 0, nearMiss: false, chased: 0, hides: 0 };
    this.closeCctv();
    this.player.reset();
    this.player.viewModel.visible = true;
    this.stalker.reset(this.diff);
    this.director.reset();
    this.phantom.visible = false;
    this.time = 0;
    this.chases = 0;
    this.hides = 0;
    this.glitch = 0;
    this.fear = 0;
    this.closeTimers = [];
    this.hints = new Set(this.progress.data.hints || []); // 이미 본 안내는 다시 띄우지 않음
    this.resetDoors();
    this.rollLocks();
    for (const e of this.world.elevators) e.btnMat.color.setHex(0x334433);
    for (let k = 0; k < FLOORS; k++) this.director.setSignGlitch(k, false);
    this.placeItems();
    this.hud.screen(null);
    this.hud.show(true);
    document.body.classList.remove('menu-on');
    this.state = 'playing';
    this.post.uniforms.uFade.value = 1;
    this.post.uniforms.uFlash.value = 0;
    this.fadeIn = 1;
    this.lock();
    if (this.touch.enabled) {
      this.touch.show(true);
      this.input.crouch = false;
      try {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
          el.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
        }
      } catch { /* 전체 화면 미지원 */ }
    }
    this.director.after(1.5, () => this.hint('intro-goal', `목표: ${FLOORS}F 옥상 문으로 탈출`, 3.5));
    this.director.after(5.5, () => this.hint('intro-elevator', '엘리베이터 표시기 — 숫자: 송신이 엘리베이터 안 · Err: 계단 위', 4.5));
    this.director.after(10.5, () => this.hint('intro-door', '초록 비상구 표시 문 = 숨을 곳 · [E] 열기/닫기', 4));
  }

  pause() {
    if (this.state !== 'playing') return;
    this.closeCctv();
    this.state = 'paused';
    document.getElementById('pause-info').textContent = `${this.diff.label} · ${this.player.floor + 1}F / ${FLOORS}F · ${formatTime(this.time)}`;
    this.hud.screen('pause');
    this.touch.show(false);
    // 30초 넘게 멈춰 있으면 화면이 깨진다
    this.pauseT = 0;
    this.pauseLimit = 30;
    this.audio.ctx?.suspend();
    this.unlock();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.screen(null);
    this.audio.ctx?.resume();
    this.touch.show(true);
    this.lock();
  }

  /**
   * 일시정지(또는 쪽지 읽기)로 30초 넘게 숨으면: 그냥 풀리고, 담백한 한 줄과 함께 추격이 시작된다
   */
  breakPause() {
    this.run.breached = true;
    this.closeCctv();
    this.hud.hideNote();
    this.noteT = 0;
    if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.screen(null);
      this.audio.ctx?.resume();
      this.touch.show(true);
      if (!this.touch.enabled) this.hud.clickHint.classList.add('on');
    }
    document.body.classList.remove('menu-on');
    this.stalker.ambush(this.player, this);
    this.hud.msg('이것으로는 숨을 수 없다', 3.5);
  }

  debugJump() {
    if (this.state !== 'playing') return;
    this.unlock();
    const input = window.prompt(`Debug: 이동할 층 입력 (1~${FLOORS})`, `${this.player.floor + 1}`);
    const n = parseInt(input, 10);
    if (!isNaN(n)) {
      const k = Math.max(1, Math.min(FLOORS, n)) - 1;
      const keep = { battery: this.player.battery, torchOn: this.player.torchOn, maxFloor: this.player.maxFloor };
      this.player.reset(landingCenter(k) - 0.3);
      Object.assign(this.player, keep);
      this.player.maxFloor = Math.max(keep.maxFloor, k);
    }
    this.clock.getDelta();
  }

  /** 안내 문구: 처음 한 번만 표시하고 브라우저에 기록 (다음 판부터는 안 뜸) */
  hint(id, text, dur = 4) {
    if (this.hints.has(id)) return;
    this.hints.add(id);
    this.progress.data.hints = [...this.hints];
    this.progress.save();
    this.hud.msg(text, dur);
  }

  // ------------------------------------------------------------------ 아이템
  clearItems() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
  }

  placeItems() {
    this.clearItems();
    const used = new Set();
    const slot = (k) => {
      // 계단참 위 빈 자리 (비상문·엘리베이터 앞은 피함)
      const angles = [0.42, 0.95, 1.15];
      for (let i = 0; i < 6; i++) {
        const a = angles[Math.floor(Math.random() * angles.length)];
        const key = `${k}:${a}`;
        if (!used.has(key)) { used.add(key); return k * FLOOR_PHI + a; }
      }
      return k * FLOOR_PHI + 0.95;
    };
    for (let i = 0; i < NOTES.length; i++) this.addItem('note', slot(NOTES[i].k), i);
    const floors = new Set();
    while (floors.size < this.diff.batteries) floors.add(1 + Math.floor(Math.random() * (FLOORS - 2)));
    for (const k of floors) this.addItem('battery', slot(k));
  }

  addItem(type, phi, idx = 0) {
    const y = baseY(phi);
    const r = R_MID + 0.3;
    const g = new THREE.Group();
    polar(r, phi, y, g.position);
    let mesh;
    if (type === 'battery') {
      const m = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.6, emissive: 0x112211 });
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.13, 12), m);
      mesh.rotation.z = Math.PI / 2;
      mesh.position.y = 0.04;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0x9a7b2a, metalness: 0.8, roughness: 0.3 }));
      cap.position.y = 0.06;
      mesh.add(cap);
    } else {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.21, 0.28),
        new THREE.MeshStandardMaterial({ map: this.world.paperTex[idx % this.world.paperTex.length], roughness: 0.9, side: THREE.DoubleSide, emissive: 0x111111 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.random() * Math.PI;
      mesh.position.y = 0.012;
    }
    g.add(mesh);
    // 희미한 반짝임 (어둠 속에서 찾을 수 있도록)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.world.tex.glow, color: 0xbfd8ff, transparent: true, opacity: 0.25,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(0.4);
    glow.position.y = 0.06;
    g.add(glow);
    g.traverse((o) => { o.castShadow = o.isMesh; });
    this.scene.add(g);
    this.items.push({ type, mesh: g, glow, phi, idx, pos: g.position.clone().setY(y + 0.1), seed: Math.random() * 10 });
  }

  // ------------------------------------------------------------------ 상호작용
  findInteractable() {
    const cam = this.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    let best = null, bestScore = -1;
    const consider = (pos, maxD, data) => {
      const to = pos.clone().sub(cam.position);
      const d = to.length();
      if (d > maxD) return;
      const dot = fwd.dot(to.normalize());
      if (dot < 0.72) return;
      const score = dot - d * 0.1;
      if (score > bestScore) { bestScore = score; best = data; }
    };
    for (const it of this.items) consider(it.pos, 2.1, { kind: 'item', it });
    const k = this.player.floor;
    const fd = this.world.fireDoors[k];
    if (fd) consider(fd.pos, 2.2, { kind: 'firedoor', door: fd });
    if (k === FLOORS - 1) consider(this.world.roof.pos, 2.4, { kind: 'roof' });
    if (this.player.inRoom && fd) consider(fd.monitorPos, 1.9, { kind: 'cctv', door: fd });
    return best;
  }

  promptFor(t) {
    if (!t) return '';
    if (t.kind === 'item') return { battery: '배터리 줍기', note: '쪽지 읽기' }[t.it.type];
    if (t.kind === 'firedoor') return t.door.locked ? '비상문 (잠김)' : t.door.target > 0 ? '비상문 닫기' : '비상문 열기';
    if (t.kind === 'roof') return '옥상 문 열고 탈출하기';
    if (t.kind === 'cctv') return t.door.open > 0.3 ? 'CCTV 보기 (문이 열려 있다!)' : 'CCTV 보기 — 문 앞 확인';
    return '';
  }

  interact() {
    if (this.hud.noteOpen) {
      this.hud.hideNote();
      return;
    }
    if (this.cctv) {
      this.closeCctv();
      return;
    }
    const t = this.findInteractable();
    if (!t) return;
    const a = this.audio, p = this.player;
    if (t.kind === 'item') {
      const it = t.it;
      this.scene.remove(it.mesh);
      this.items.splice(this.items.indexOf(it), 1);
      if (it.type === 'battery') {
        p.battery = Math.min(100, p.battery + 45);
        a.pickup();
        this.hud.msg('배터리 +45%', 1.8);
      } else {
        a.paper();
        const n = NOTES[it.idx];
        this.hud.showNote(n.title, n.body);
        this.progress.readNote(it.idx, NOTES.length);
      }
    } else if (t.kind === 'firedoor') {
      const d = t.door;
      if (d.locked) {
        a.rattle(d.pos);
        p.addNoise(9);
        this.hud.msg('잠긴 문 — 다른 층으로', 2);
        return;
      }
      if (d.target > 0) {
        d.target = 0;
        p.pushOutOfDoorway();
        a.creak(d.pos, false);
      } else {
        d.target = 1;
        a.creak(d.pos, true);
      }
    } else if (t.kind === 'roof') {
      this.win();
    } else if (t.kind === 'cctv') {
      this.openCctv(t.door);
    }
  }

  // ------------------------------------------------------------------ CCTV
  openCctv(door) {
    this.cctv = { door, seen: 0, t: 0 };
    this.cctvCam.position.copy(door.cctvPos);
    this.cctvCam.lookAt(door.cctvTarget);
    this.player.frozen = true;
    this.player.viewModel.visible = false;
    this.hud.show(false);
    this.hud.setPrompt('');
    document.getElementById('cctv').classList.add('on');
    document.getElementById('cctv-cam').textContent = `CAM-${String(door.k + 1).padStart(2, '0')}F  비상문 앞`;
    this.post.uniforms.uCctv.value = 1;
    this.audio.click(0.4);
  }

  closeCctv() {
    if (!this.cctv) return;
    this.cctv = null;
    this.player.frozen = false;
    this.player.viewModel.visible = true;
    if (this.state === 'playing') this.hud.show(true);
    document.getElementById('cctv').classList.remove('on');
    this.post.uniforms.uCctv.value = 0;
  }

  /** 비상실 모니터 화면 + CCTV 감시 판정 */
  updateCctv(dt) {
    const p = this.player, s = this.stalker;
    const door = p.inRoom ? this.world.fireDoors[p.roomK] : null;
    if (this.cctv && (!door || door !== this.cctv.door)) this.closeCctv();
    for (const d of this.world.fireDoors) {
      if (d.screenMat.map !== this.cctvTarget.texture) {
        d.screenMat.map = this.cctvTarget.texture;
        d.screenMat.needsUpdate = true;
      }
      d.screenMat.color.setScalar(d === door ? 1.5 : 0.02);
    }
    if (!door) return;
    // 모니터 화면에 실시간 영상
    this.cctvCam.position.copy(door.cctvPos);
    this.cctvCam.lookAt(door.cctvTarget);
    door.recMat.color.setHex(Math.sin(this.time * 6) > 0 ? 0xff2020 : 0x330000);
    const vm = p.viewModel.visible;
    p.viewModel.visible = false;
    this.irLight.position.copy(door.cctvPos);
    this.irLight.intensity = 3.5;
    door.screen.visible = false;
    this.cctvCam.aspect = 4 / 3;
    this.cctvCam.updateProjectionMatrix();
    this.renderer.setRenderTarget(this.cctvTarget);
    this.renderer.render(this.scene, this.cctvCam);
    this.renderer.setRenderTarget(null);
    door.screen.visible = true;
    this.irLight.intensity = 0;
    p.viewModel.visible = vm;

    if (this.cctv) {
      this.cctv.t += dt;
      document.getElementById('cctv-time').textContent = new Date(Date.now()).toLocaleTimeString('ko-KR', { hour12: false });
      // 송신이 문 앞에 비치는지
      if (s.visible) {
        const to = s.pos.clone().sub(this.cctvCam.position);
        const fwd = this.cctvCam.getWorldDirection(new THREE.Vector3());
        if (to.length() < 10 && fwd.dot(to.normalize()) > 0.55) {
          this.cctv.seen += dt;
          if (this.cctv.seen > 1) this.progress.unlock('watcher');
        }
      }
    }
  }

  // ------------------------------------------------------------------ 사건
  triggerHunt(reason, offset = 0) {
    if (this.state !== 'playing') return;
    const r = this.stalker.hunt(this.player, offset);
    if (r === 'already') return;
    this.audio.glitch(0.5);
    this.glitchPulse(0.8);
    this.director.flicker(2.5);
    this.hud.warn(reason === 'final' ? 'RUN' : 'FOUND YOU');
    if (reason === 'hide') this.hud.msg('들켰다 — 지금 이동하라', 3);
    if (this.settings.voice) speak(Math.random() < 0.5 ? '찾았다' : '어디 가');
  }

  glitchPulse(v) {
    this.glitch = Math.max(this.glitch, v);
  }

  closeElevator(k, delay) {
    this.closeTimers.push({ k, t: delay });
  }

  /** 송신이 비상문을 연다 (slam: 부수듯 열어젖힘) */
  forceDoor(k, slam = false) {
    const d = this.world.fireDoors[k];
    if (!d || d.target === 1 && d.open > 0.7) return;
    d.target = 1;
    if (slam) {
      this.closeCctv();
      d.open = 1;
      d.hinge.rotation.y = 1.5;
      this.audio.slam(d.pos);
      this.glitchPulse(0.7);
      this.player.shake = Math.max(this.player.shake, 0.8);
    } else {
      this.audio.creak(d.pos, true);
    }
  }

  onElevatorArrive(k, hunting) {
    const e = this.world.elevators[k];
    this.audio.ding(e.doorPos, hunting);
  }

  onDoorOpen(k) {
    this.audio.doorSlide(this.world.elevators[k].doorPos);
  }

  onDoorRattle(k) {
    const d = this.world.fireDoors[k];
    this.audio.rattle(d.pos);
    d.rattleT = 0.35;
  }

  onChaseEnd(how) {
    if (how === 'hid') {
      this.hud.msg('송신이 문 앞에 있다 — CCTV로 확인', 3);
      return;
    }
    this.chases++;
    if (how === 'vanish') this.audio.glitch(0.35);
    this.director.after(2, () => {
      if (this.state === 'playing' && !this.stalker.chasing) this.hud.msg(how === 'lost' ? '따돌렸다' : '송신이 사라졌다', 2);
    });
  }

  onSearchEnd() {
    this.chases++;
    this.run.hides++;
    this.hides++;
    this.director.after(1.5, () => {
      if (this.state === 'playing' && !this.stalker.chasing) this.hud.msg('송신이 떠났다', 2);
    });
  }

  setDoor(e) {
    const o = e.open * e.open * (3 - 2 * e.open);
    e.left.position.x = -0.3 - o * 0.56;
    e.right.position.x = 0.3 + o * 0.56;
    e.carLight.visible = e.open > 0.02;
  }

  // ------------------------------------------------------------------ 종료
  die() {
    this.closeCctv();
    this.progress.addDeath();
    this.state = 'dying';
    this.dieT = 0;
    this.touch.show(false);
    this.player.frozen = true;
    this.player.viewModel.visible = false;
    this.hud.setPrompt('');
    this.hud.show(false);
    this.hud.hideNote();
    this.audio.sting(0.7);
    this.audio.silence(true);
    this.glitch = 0.6;
    // 사망 연출 준비: 고개가 송신 쪽으로 돌아가고 → 송신이 덮쳐 오며 → 뒤로 넘어짐
    const cam = this.camera;
    this.dieCam0 = cam.position.clone();
    this.dieQ0 = cam.quaternion.clone();
    const target = this.stalker.pos.clone();
    target.y = Math.max(target.y, cam.position.y - 0.2);
    if (target.distanceTo(cam.position) < 0.2) target.copy(cam.position).add(cam.getWorldDirection(new THREE.Vector3()));
    const m = new THREE.Matrix4().lookAt(cam.position, target, new THREE.Vector3(0, 1, 0));
    this.dieQLook = new THREE.Quaternion().setFromRotationMatrix(m);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.dieQLook);
    this.dieBack = fwd.clone().setY(0).normalize().multiplyScalar(-1);
    this.dieSide = Math.random() < 0.5 ? -1 : 1;
    this.dieHit = false;
    this.dieStutter = 0;
  }

  win() {
    const firstHard = this.diffKey === 'hard' && !this.progress.isCleared('hard');
    this.progress.markCleared(this.diffKey);
    this.progress.checkWin(this.diffKey, this.run, this.time);
    this.unlockedNightmare = firstHard;
    this.state = 'winning';
    this.winT = 0;
    this.touch.show(false);
    this.player.frozen = true;
    this.hud.setPrompt('');
    this.world.roof.target = 1;
    this.audio.wind(0.6, 7);
    this.audio.silence(true);
    this.stalker.group.visible = false;
  }

  // ------------------------------------------------------------------ 루프
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'loading') return;
    const u = this.post.uniforms;
    u.uTime.value += dt;

    if (this.state === 'paused' && !document.hidden) {
      this.pauseT += dt;
      if (this.pauseT > this.pauseLimit) this.breakPause();
    }
    if (this.state === 'title') this.updateTitle(dt);
    else if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'dying') this.updateDying(dt);
    else if (this.state === 'winning') this.updateWinning(dt);

    if (this.state !== 'paused') {
      this.updateLamps(dt);
      this.updateDoors(dt);
    }
    if (this.state === 'playing') this.fx.setHeight(this.player.footY / Math.max(1, (FLOORS - 1) * FLOOR_H));
    this.fx.update(dt, (this.state === 'playing' || this.state === 'winning') && !this.cctv && !this.director?.torchKill, this.pixelRatio);
    this.hud.update(dt);
    this.glitch = Math.max(0, this.glitch - dt * 1.6);
    u.uGlitch.value = this.glitch;
    if (this.cctv) {
      this.irLight.position.copy(this.cctvCam.position);
      this.irLight.intensity = 3.5;
      this.player.viewModel.visible = false;
      this.cctvCam.aspect = this.camera.aspect;
      this.cctvCam.updateProjectionMatrix();
      this.post.render(this.scene, this.cctvCam);
      this.irLight.intensity = 0;
    } else {
      this.post.render(this.scene, this.camera);
    }
  }

  updateTitle(dt) {
    this.titleT += dt;
    const u = this.post.uniforms;
    u.uFade.value = Math.max(0, u.uFade.value - dt * 0.5);
    u.uFear.value = 0.25;
    u.uRed.value = 0;
    // 참고 이미지 구도: 난간 너머로 위쪽 계단을 올려다봄. 송신이 계단을 내려오는 중
    const k = 6;
    const phi = landingCenter(k) + 1.0 + Math.sin(this.titleT * 0.08) * 0.08;
    const r = R_IN + 0.8;
    const cam = this.camera;
    polar(r, phi, baseY(phi) + 1.75 + Math.sin(this.titleT * 0.3) * 0.03, cam.position);
    const lookPhi = phi + 2.0;
    const target = polar(R_MID + 0.3, lookPhi, baseY(lookPhi) + 1.0, new THREE.Vector3());
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    cam.rotation.z += Math.sin(this.titleT * 0.2) * 0.01;

    // 송신: 계단 꺾이는 곳에서 이쪽으로 천천히 내려온다
    const s = this.stalker;
    const cyc = this.titleT % 14;
    s.phi = phi + 2.5 - cyc * 0.03;
    s.r = R_MID + 0.2;
    s.roomK = -1;
    s.visible = cyc > 2 && !(cyc > 8.2 && cyc < 8.35);
    s.t += dt;
    const sw = s.worldXZ();
    s.yaw = Math.atan2(cam.position.x - sw.x, cam.position.z - sw.z);
    s.updateMesh(dt);
    this.player.torch.intensity = 0;
    this.player.glow.intensity = 0;
    if (!this.titleLight) {
      this.titleLight = new THREE.PointLight(0xdfe6ff, 0, 14, 1.4);
      this.scene.add(this.titleLight);
    }
    polar(R_MID, phi + 1.9, baseY(phi + 1.9) + 2.8, this.titleLight.position);
    this.titleLight.intensity = 2.6;
  }

  updatePlaying(dt) {
    const p = this.player, s = this.stalker, u = this.post.uniforms;
    if (this.titleLight) this.titleLight.intensity = 0;
    this.player.glow.intensity = 0.22;
    this.time += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt * 0.45);
    u.uFade.value = this.fadeIn;

    const reading = this.hud.noteOpen;
    this.noteT = reading ? (this.noteT || 0) + dt : 0;
    if (this.noteT > 30) this.breakPause();
    const ev = p.update(dt, reading ? {} : this.input, this.diff, this.world.fireDoors);
    if (p.torchOn) this.run.torchTime += dt;
    if (p.inRoom) this.run.enteredRoom = true;
    if (ev.trip) this.run.trips++;
    if (this.director.torchKill > 0) {
      p.torch.intensity = 0;
      p.lensMat.color.setScalar(0.08);
    }
    if (ev.footstep) {
      const surface = p.inRoom ? 'room' : onLanding(p.phi) ? 'landing' : 'stair';
      const kind = p.crouching ? 'sneak' : p.sprinting ? 'run' : 'walk';
      this.audio.footstep(ev.footstep, null, surface, kind);
    }
    if (ev.trip) {
      this.audio.fall();
      if (ev.tripExhausted && !this.hints.has('tripTip')) this.hint('tripTip', 'TIP: 체력이 바닥난 채로 달리면 넘어질 수 있다', 4.5);
      else this.hud.msg('넘어졌다', 1.8);
      this.glitchPulse(0.35);
    }
    if (p.inRoom) this.hint('room', '[E] 문 닫기 → 송신이 못 들어옴 · 오래 숨으면 들킨다 · 모니터 = CCTV', 4.5);


    s.update(dt, p, this);
    this.director.update(dt);
    this.updateCctv(dt);
    if (s.justSpotted) {
      this.run.chased++;
      this.audio.sting(0.45);
      this.audio.laughAt(s.pos, 1);
      this.glitchPulse(0.5);
      p.shake = Math.max(p.shake, 0.5);
      this.hint('chase', '추격 — 달려서 따돌리거나 비상문에 숨어 문을 닫아라', 3.5);
    }

    // ---- 근접도 / 공포 ----
    let d;
    if (s.inElevator) d = Math.abs(s.elevFloor * FLOOR_H - p.footY) * 1.3 + 6;
    else d = s.distTo(p);
    if (s.visible && d < 26 && !s.chasing) this.hint('see', '송신 — 들키기 전에 피하라', 3);
    const hidden = p.inRoom && this.world.fireDoors[p.roomK].open < 0.3;
    const prox = Math.max(0, Math.min(1, 1 - d / 30)) * (hidden ? 0.75 : 1);
    const targetFear = Math.max(prox, s.chasing ? 0.55 + prox * 0.45 : 0);
    this.fear += (targetFear - this.fear) * Math.min(1, dt * 2);
    u.uFear.value = this.fear;
    const close = s.visible ? Math.max(0, 1 - d / 7) : 0;
    u.uRed.value += ((s.chasing ? close : close * 0.4) - u.uRed.value) * Math.min(1, dt * 5);
    if (s.visible && d < 3) p.shake = Math.max(p.shake, 0.7);
    else if (s.visible && d < 6) p.shake = Math.max(p.shake, 0.35);
    if (prox > 0.75 && Math.random() < dt * 2) this.glitchPulse(0.25);

    // ---- 잡힘 ----
    if (s.visible && s.state !== 'vanish' && s.state !== 'elevator') {
      const dx = s.pos.x - p.x, dz = s.pos.z - p.z;
      if (s.chasing && dx * dx + dz * dz < 1 && Math.abs(s.footY - p.footY) < 1.5) this.run.nearMiss = true;
      if (dx * dx + dz * dz < 0.62 && Math.abs(s.footY - p.footY) < 1.5) {
        this.die();
        return;
      }
    }

    // ---- 아이템 반짝임 ----
    for (const it of this.items) {
      it.glow.material.opacity = 0.18 + 0.14 * Math.sin(this.time * 2.4 + it.seed);
    }

    // ---- 상호작용 안내 ----
    const target = reading ? null : this.findInteractable();
    this.hud.setPrompt(this.promptFor(target));
    this.touch.update(target);

    // ---- 엘리베이터 표시기 ----
    let ind = s.indicator();
    if (s.glitchT > 0) {
      ind = { text: `${1 + Math.floor(Math.random() * FLOORS)}`, dir: Math.random() < 0.5 ? 1 : -1, err: Math.random() < 0.15 };
      if (Math.random() > dt * 12) ind = this.lastInd || ind;
    }
    this.lastInd = ind;
    this.world.indicator.draw(ind.text, ind.dir, ind.err, s.hunting || s.chasing);

    // ---- HUD ----
    const fl = p.floor;
    this.hud.setFloor(p.inRoom ? `${fl + 1}F 비상실` : onLanding(p.phi) || fl >= FLOORS - 1 ? `${fl + 1}F` : `${fl + 1}F ↗ ${fl + 2}F`);
    this.hud.setGoal(FLOORS - 1 - fl, FLOORS);
    this.hud.setStamina(p.stamina, p.exhausted);
    this.hud.setBattery(p.battery);
    this.hud.setDetector(s.inElevator ? prox * 0.6 : prox);

    // ---- 사운드 ----
    this.audio.updateListener(this.camera);
    this.audio.update(dt, {
      voicePos: s.pos,
      voiceOn: s.visible,
      chasing: s.chasing,
      muffled: hidden,
      humPos: s.humPos,
      humOn: s.inElevator && s.elevDelay <= 0,
      proximity: s.inElevator ? prox * 0.5 : prox,
      fear: this.fear,
      breath: Math.max(0, 1 - p.stamina / 45) * (p.exhausted ? 1 : 0.7),
      floorRatio: fl / (FLOORS - 1),
    });

    // 엘리베이터 문 닫힘 예약
    for (let i = this.closeTimers.length - 1; i >= 0; i--) {
      const c = this.closeTimers[i];
      c.t -= dt;
      if (c.t <= 0) {
        this.closeTimers.splice(i, 1);
        const e = this.world.elevators[c.k];
        if (!(s.state === 'toElevator' && s.doorK === c.k) && !(s.state === 'arriving' && s.doorK === c.k)) {
          if (e.target !== 0) this.audio.doorSlide(e.doorPos);
          e.target = 0;
        }
      }
    }
  }

  updateDying(dt) {
    this.dieT += dt;
    const t = this.dieT;
    const cam = this.camera, s = this.stalker, u = this.post.uniforms;
    const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

    // 1) 고개가 송신 쪽으로 홱 돌아간다
    cam.quaternion.slerpQuaternions(this.dieQ0, this.dieQLook, ease(t / 0.25));
    // 2) 뒤로 넘어지며 주저앉는다 (고개가 들리고 기울어짐)
    const fall = ease((t - 0.55) / 0.8);
    cam.position.copy(this.dieCam0).addScaledVector(this.dieBack, fall * 0.5);
    cam.position.y -= fall * 0.85;
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(fall * 0.38, 0, fall * 0.32 * this.dieSide));
    cam.quaternion.multiply(tilt);
    // 3) 흔들림 (덮치는 순간 최대)
    const shake = t < 0.4 ? 0.35 : t < 1.2 ? 1 : 0.55;
    cam.position.x += (Math.random() - 0.5) * 0.07 * shake;
    cam.position.y += (Math.random() - 0.5) * 0.07 * shake;
    const jit = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.06 * shake, (Math.random() - 0.5) * 0.06 * shake, (Math.random() - 0.5) * 0.08 * shake));
    cam.quaternion.multiply(jit);

    // 4) 송신이 멀리서 순식간에 덮쳐 온다
    const lunge = t < 0.35 ? 0 : Math.pow(Math.min(1, (t - 0.35) / 0.7), 2.4);
    const dist = 2.1 + (0.62 - 2.1) * lunge;
    if (t > 0.35 && !this.dieHit) {
      this.dieHit = true;
      this.audio.jumpscare();
    }
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const g = s.group;
    g.visible = u.uFade.value < 0.98;
    g.position.copy(cam.position).addScaledVector(fwd, dist).addScaledVector(up, 0.22 + Math.sin(t * 22) * 0.03 * lunge);
    g.quaternion.copy(cam.quaternion);
    s.faceMat.color.setScalar(1.15 + lunge * 0.5);
    // 마지막 순간: 프레임이 끊기듯 튄다
    if (t > 1.05) {
      this.dieStutter -= dt;
      if (this.dieStutter <= 0) {
        this.dieStutter = 0.05 + Math.random() * 0.05;
        s.body.position.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.1, 0);
        s.body.scale.setScalar(0.95 + Math.random() * 0.3);
        s.body.rotation.set(0, 0, (Math.random() - 0.5) * 0.3);
      }
    } else {
      s.body.position.set(0, 0, 0);
      s.body.scale.setScalar(1);
      s.body.rotation.set(0, 0, Math.sin(t * 26) * 0.1 * lunge);
    }

    u.uRed.value = Math.min(1, t * 2.2);
    u.uFear.value = 1;
    this.glitch = Math.max(this.glitch, t > 0.35 ? 0.4 + lunge * 0.6 : 0.3);
    u.uFade.value = t > 1.3 ? Math.min(1, (t - 1.3) * 4) : 0;
    if (this.dieT > 1.9 && this.state === 'dying') {
      this.state = 'dead';
      s.faceMat.color.setScalar(0.8);
      this.unlock();
      this.hud.stats('dead', [
        ['도달한 층', `${this.player.maxFloor + 1}F / ${FLOORS}F`, true],
        ['생존 시간', formatTime(this.time)],
        ['따돌린 추격', `${this.chases}회`],
        ['난이도', this.diff.label],
      ]);
      const subs = ['계단은 아직 끝나지 않았다', '송신은 웃고 있었다', '엘리베이터가 다시 움직인다', '조금만 더 올라갔다면'];
      document.getElementById('dead-sub').textContent = subs[Math.floor(Math.random() * subs.length)];
      document.body.classList.add('menu-on');
      this.hud.screen('dead');
    }
  }

  updateWinning(dt) {
    this.winT += dt;
    const u = this.post.uniforms;
    u.uFlash.value = Math.min(1, Math.max(0, (this.winT - 0.6) / 2.2));
    u.uRed.value *= 0.9;
    u.uFear.value *= 0.95;
    this.player.update(dt, {}, this.diff, this.world.fireDoors);
    if (this.winT > 3.2 && this.state === 'winning') {
      this.state = 'won';
      this.unlock();
      this.hud.show(false);
      this.hud.stats('win', [
        ['탈출 시간', formatTime(this.time), true],
        ['따돌린 추격', `${this.chases}회`],
        ['숨은 횟수', `${this.run.hides}회`],
        ['난이도', this.diff.label],
      ]);
      if (this.unlockedNightmare) this.hud.toast('악몽 모드 해금 — 30층');
      this.hud.screen('win');
      const after = document.querySelector('#win .after');
      after.classList.remove('on');
      // 마지막 한 번의 놀람
      setTimeout(() => {
        if (this.state !== 'won') return;
        const sc = document.getElementById('scare');
        sc.classList.add('on');
        this.audio.glitch(0.6);
        setTimeout(() => {
          sc.classList.remove('on');
          after.classList.add('on');
        }, 170);
      }, 5200);
    }
  }

  updateLamps(dt) {
    const lamps = this.world.lamps;
    const t = performance.now() / 1000;
    const mul = this.state === 'title' ? 1 : this.director.lightMul;
    for (const l of lamps) {
      let v = 1;
      if (l.kind === 'flicker') {
        const n = Math.sin(t * 13.1 + l.seed) * Math.sin(t * 7.7 + l.seed * 2.3) + Math.sin(t * 2.1 + l.seed);
        v = n > -0.35 ? 0.9 + Math.random() * 0.1 : 0.05;
      } else if (l.kind === 'dead') {
        v = Math.random() < 0.004 ? 0.6 : 0;
      }
      l.level = v * mul;
      if (l.tint) l.bulbMat.color.setRGB(l.level * l.tint[0], l.level * l.tint[1], l.level * l.tint[2]);
      l.halo.material.opacity = 0.3 * l.level;
    }
    // 카메라에서 가까운 조명에만 실제 광원 배치
    const cp = this.camera.position;
    const sorted = [...lamps].sort((a, b) => a.pos.distanceToSquared(cp) - b.pos.distanceToSquared(cp));
    this.lampLights.forEach((light, i) => {
      const l = sorted[i];
      light.position.copy(l.pos);
      light.color.setHex(l.color);
      light.intensity = l.power * l.level;
      light.distance = l.room ? 5 : 7;
    });
  }

  updateDoors(dt) {
    for (const e of this.world.elevators) {
      if (e.open !== e.target) {
        const step = dt * 1.3;
        e.open = e.target > e.open ? Math.min(e.target, e.open + step) : Math.max(e.target, e.open - step);
        this.setDoor(e);
      }
    }
    for (const d of this.world.fireDoors) {
      if (d.open !== d.target) {
        const step = dt * 2.6;
        d.open = d.target > d.open ? Math.min(d.target, d.open + step) : Math.max(d.target, d.open - step);
      }
      let rot = 1.5 * (1 - Math.pow(1 - d.open, 2));
      if (d.rattleT > 0) {
        d.rattleT -= dt;
        rot += Math.sin(d.rattleT * 90) * 0.025;
      }
      d.hinge.rotation.y = rot;
    }
    const roof = this.world.roof;
    if (roof.open !== roof.target) {
      roof.open = Math.min(roof.target, roof.open + dt * 0.7);
      roof.pivot.rotation.y = -1.7 * (1 - Math.pow(1 - roof.open, 3));
    }
  }
}

function speak(text) {
  try {
    const ss = window.speechSynthesis;
    if (!ss) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.pitch = 0.1;
    u.rate = 0.65;
    u.volume = 0.8;
    const v = ss.getVoices().find((x) => x.lang && x.lang.startsWith('ko'));
    if (v) u.voice = v;
    ss.speak(u);
  } catch {
    /* TTS 미지원 */
  }
}

const SETTINGS_KEY = 'songsin-stairs-settings';
function loadSettings(touch) {
  const def = { sens: 1, vol: 0.8, q: null, voice: true, invert: false, gamma: 1 };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return def;
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 저장 불가 환경 */
  }
}

// ------------------------------------------------------------------ 부팅
const LOADING_TIPS = [
  '엘리베이터 표시기에 층수가 보이면, 송신은 엘리베이터 안에 있다.',
  '표시기에 Err가 뜨면 송신은 계단 어딘가에 있다.',
  '초록 비상구 표시등이 켜진 문 안으로 숨을 수 있다. 문은 꼭 닫아라.',
  '비상실 안의 CCTV로 문 앞에 무엇이 있는지 확인할 수 있다.',
  '같은 층에 오래 머물면 조명이 깜빡이기 시작한다. 그건 경고다.',
  '달리면 빠르지만, 발소리는 계단 전체에 울린다.',
  '손전등 빛은 멀리서도 보인다. 하지만 끄면 아무것도 보이지 않는다.',
  '체력이 바닥난 채로 달리면 넘어진다.',
  '위로 올라갈수록 송신은 더 예민해진다.',
  '일시정지 뒤에 오래 숨어 있지 마라.',
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function waitInput(el, ms = Infinity) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', finish);
      el.removeEventListener('pointerdown', finish);
      resolve();
    };
    window.addEventListener('keydown', finish);
    el.addEventListener('pointerdown', finish);
    if (ms !== Infinity) setTimeout(finish, ms);
  });
}

async function boot() {
  const $ = (id) => document.getElementById(id);
  // 1) 주의 문구
  const bootEl = $('boot');
  await wait(400);
  await waitInput(bootEl, 3600);
  bootEl.classList.add('out');
  await wait(700);
  bootEl.classList.remove('on', 'out');

  // 2) 로딩 (실제 진행률 + 팁)
  const loading = $('loading');
  loading.classList.add('on');
  const tipEl = $('ld-tip-text');
  let tipI = Math.floor(Math.random() * LOADING_TIPS.length);
  tipEl.textContent = LOADING_TIPS[tipI];
  const tipTimer = setInterval(() => {
    tipI = (tipI + 1) % LOADING_TIPS.length;
    tipEl.parentElement.style.opacity = 0;
    setTimeout(() => {
      tipEl.textContent = LOADING_TIPS[tipI];
      tipEl.parentElement.style.opacity = 1;
    }, 450);
  }, 3200);
  await wait(250);
  const game = new Game();
  window.__songsin = game; // 디버그용
  await game.load((p, step) => {
    $('ld-fill').style.width = `${Math.round(p * 100)}%`;
    $('ld-pct').textContent = `${Math.round(p * 100)}%`;
    $('ld-step').textContent = step;
  });
  await wait(600);
  clearInterval(tipTimer);
  loading.classList.remove('on');

  // 3) 아무 키나 → 메인 메뉴 (이때 소리를 켠다: 브라우저 자동재생 정책)
  const press = $('press');
  press.classList.add('on');
  await waitInput(press);
  press.classList.remove('on');
  game.audio.init();
  game.audio.setVolume(game.settings.vol);
  game.audio.uiStart();
  game.refreshTitle();
  game.hud.screen('title');
}

boot();
