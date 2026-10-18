// 공포의 송신계단 — 메인 게임 루프
import * as THREE from 'three';
import songsinUrl from '../assets/songsin.png';
import {
  TAU, FLOORS, FLOOR_H, R_IN, R_MID, R_OUT, LANDING, DIFFICULTY, PHI_MAX,
  baseY, floorIndex, onLanding, landingCenter, pathDist, polar,
} from './config.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Stalker } from './stalker.js';
import { AudioEngine } from './audio.js';
import { Post } from './post.js';
import { Hud, formatTime } from './hud.js';
import { Director } from './director.js';

const NOTES = [
  { k: 1, title: '관리일지 — 3월 2일', body: '계단 청소 중 엘리베이터가 혼자 움직였다.\n아무도 타지 않았는데 층수 표시기가 계속 바뀐다.\n\n그리고 가끔, 표시기에 숫자 대신 "Err"가 뜬다.' },
  { k: 4, title: '경고문 (찢어짐)', body: '엘리베이터 표시기에 층수가 보이면, 그는 엘리베이터 안에 있습니다.\n"Err"가 보이면, 그는 계단에 있습니다.\n\n절대 엘리베이터 버튼을 누르지 마십시오.' },
  { k: 7, title: '누군가의 메모', body: '같은 층에 오래 있으면 안 돼.\n숨어 있으면 찾아와.\n불이 깜빡이기 시작하면 이미 늦은 거야.\n\n계속 올라가.' },
  { k: 10, title: '송신탑 무전 기록', body: '…수신기가 지직거리면 가까이 있다는 뜻이다.\n막대가 전부 붉게 차면, 뒤를 보지 말고 뛰어라.\n\n그는 빛과 소리를 따라온다.' },
  { k: 13, title: '찢긴 일기장', body: '송신은 웃고 있었다.\n하트 모양으로 일그러진 얼굴로.\n\n옥상 열쇠는 경비실에 있었는데…\n도망치다가 계단참 어딘가에 떨어뜨렸다.' },
  { k: 18, title: '마지막 메모', body: '거의 다 왔다. 옥상 문은 열쇠로만 열린다.\n\n열쇠를 줍는 순간 그가 알게 된다.\n그때부터는 멈추지 마.' },
];

const QUALITY = {
  low: { pr: 0.75, shadow: false },
  mid: { pr: 1, shadow: true },
  high: { pr: 1.5, shadow: true },
};

class Game {
  constructor() {
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x020203, 0.085);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.03, 80);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0x3a4250, 0x050505, 0.16));

    this.world = buildWorld(this.scene);
    this.lampLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffdcae, 0, 10, 1.7);
      this.scene.add(l);
      this.lampLights.push(l);
    }

    this.audio = new AudioEngine();
    this.audio.volume = this.settings.vol;
    this.hud = new Hud();
    this.post = new Post(this.renderer);
    this.player = new Player(this.camera);
    this.diff = DIFFICULTY.normal;

    this.items = [];
    this.state = 'loading';
    this.input = { f: false, b: false, l: false, r: false, sprint: false, crouch: false };
    this.glitch = 0;
    this.fear = 0;
    this.clock = new THREE.Clock();
    this.time = 0;
    this.titleT = 0;
    this.debugCount = 0;

    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.bindInput();
    this.bindUI();

    new THREE.TextureLoader().load(songsinUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.stalkerTex = tex;
      this.stalker = new Stalker(this.scene, tex);
      this.phantom = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.04, fog: true }));
      const aspect = tex.image.width / tex.image.height;
      this.phantom.scale.set(1.75 * aspect, 1.75, 1);
      this.phantom.visible = false;
      this.scene.add(this.phantom);
      this.director = new Director(this, this.phantom);
      document.querySelector('#scare img').src = songsinUrl;
      this.enterTitle();
    });

    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ 설정/입력
  applyQuality() {
    const q = QUALITY[this.settings.q] || QUALITY.mid;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, q.pr);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.player.torch.castShadow = q.shadow;
    this.resize();
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
        else this.hud.msg('배터리가 없다.');
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
    canvas.addEventListener('click', () => {
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
      this.hud.clickHint.classList.remove('on');
      if (!locked && this.state === 'playing' && !this.hud.noteOpen && !this.ignoreUnlock) this.pause();
      this.ignoreUnlock = false;
    });
  }

  lock() {
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
    const sens = document.getElementById('set-sens');
    const vol = document.getElementById('set-vol');
    const q = document.getElementById('set-q');
    const voice = document.getElementById('set-voice');
    const invert = document.getElementById('set-invert');
    sens.value = s.sens;
    vol.value = s.vol;
    q.value = s.q;
    voice.checked = s.voice;
    invert.checked = s.invert;
    sens.oninput = () => { s.sens = +sens.value; saveSettings(s); };
    vol.oninput = () => { s.vol = +vol.value; this.audio.setVolume(s.vol); saveSettings(s); };
    q.onchange = () => { s.q = q.value; this.applyQuality(); saveSettings(s); };
    voice.onchange = () => { s.voice = voice.checked; saveSettings(s); };
    invert.onchange = () => { s.invert = invert.checked; saveSettings(s); };

    document.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = b.dataset.act;
        if (act === 'start-normal') this.start('normal');
        else if (act === 'start-nightmare') this.start('nightmare');
        else if (act === 'howto' || act === 'settings') {
          backTo = this.state === 'paused' ? 'pause' : 'title';
          this.hud.screen(act);
        } else if (act === 'back') this.hud.screen(backTo);
        else if (act === 'resume') this.resume();
        else if (act === 'retry') this.start(this.diffKey);
        else if (act === 'quit') this.enterTitle();
      });
    });

    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches
      && !window.matchMedia('(any-pointer: fine)').matches;
    if (coarse) document.getElementById('mobile').classList.add('on');
  }

  // ------------------------------------------------------------------ 상태 전환
  enterTitle() {
    this.state = 'title';
    this.hud.screen('title');
    this.hud.show(false);
    this.hud.hideNote();
    this.unlock();
    this.audio.silence(false);
    this.clearItems();
    this.stalker.reset(DIFFICULTY.normal);
    this.stalker.sprite.visible = false;
    this.director.reset();
    this.player.torch.intensity = 0;
    this.player.viewModel.visible = false;
    this.post.uniforms.uFade.value = 1;
    this.post.uniforms.uFlash.value = 0;
    this.titleT = 0;
    this.world.roof.target = 0;
    this.world.roof.open = 0;
    this.world.roof.pivot.rotation.y = 0;
    for (const e of this.world.elevators) { e.target = 0; }
    this.phantom.visible = true; // 타이틀: 계단 위에서 내려다보는 송신
  }

  start(diffKey) {
    this.audio.init();
    this.audio.setVolume(this.settings.vol);
    this.audio.silence(false);
    this.diffKey = diffKey;
    this.diff = DIFFICULTY[diffKey];
    this.player.reset();
    this.player.viewModel.visible = true;
    this.stalker.reset(this.diff);
    this.director.reset();
    this.phantom.visible = false;
    this.hasKey = false;
    this.time = 0;
    this.chases = 0;
    this.glitch = 0;
    this.fear = 0;
    this.closeTimers = [];
    for (const e of this.world.elevators) { e.target = 0; e.open = 0; this.setDoor(e); e.btnMat.color.setHex(0x334433); }
    this.world.roof.target = 0;
    this.world.roof.open = 0;
    this.world.roof.pivot.rotation.y = 0;
    for (let k = 0; k < FLOORS; k++) this.director.setSignGlitch(k, false);
    this.placeItems();
    this.hud.setKey(false);
    this.hud.screen(null);
    this.hud.show(true);
    this.state = 'playing';
    this.post.uniforms.uFade.value = 1;
    this.post.uniforms.uFlash.value = 0;
    this.fadeIn = 1;
    this.lock();
    this.director.after(1.2, () => this.hud.msg('…여기는 어디지.', 2.6));
    this.director.after(4.2, () => this.hud.msg('위로 올라가야 한다. 20층, 옥상으로.', 3.4));
    this.director.after(8.5, () => this.hud.msg('엘리베이터 표시기를 잘 봐 둬야 할 것 같다.', 3.4));
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hud.screen('pause');
    this.audio.ctx?.suspend();
    this.unlock();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.screen(null);
    this.audio.ctx?.resume();
    this.lock();
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

  // ------------------------------------------------------------------ 아이템
  clearItems() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
  }

  placeItems() {
    this.clearItems();
    const used = new Set();
    const slot = (k) => {
      // 계단참 위 빈 자리
      const angles = [0.42, 0.85, 1.08];
      for (let i = 0; i < 6; i++) {
        const a = angles[Math.floor(Math.random() * angles.length)];
        const key = `${k}:${a}`;
        if (!used.has(key)) { used.add(key); return k * TAU + a; }
      }
      return k * TAU + 0.85;
    };
    // 열쇠: 13F~17F
    const keyFloor = 12 + Math.floor(Math.random() * 5);
    this.addItem('key', slot(keyFloor));
    // 쪽지
    for (let i = 0; i < NOTES.length; i++) this.addItem('note', slot(NOTES[i].k), i);
    // 배터리 7개
    const floors = new Set();
    while (floors.size < 7) floors.add(1 + Math.floor(Math.random() * 18));
    for (const k of floors) this.addItem('battery', slot(k));
  }

  addItem(type, phi, idx = 0) {
    const y = baseY(phi);
    const r = R_MID + 0.45;
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
    } else if (type === 'key') {
      const m = new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 0.9, roughness: 0.25, emissive: 0x3a2a05 });
      mesh = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 16), m);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.016, 0.012), m);
      shaft.position.x = 0.09;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.012), m);
      tooth.position.set(0.13, -0.02, 0);
      mesh.add(ring, shaft, tooth);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      // 열쇠고리 태그
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.035), new THREE.MeshStandardMaterial({ color: 0xaa2222, side: THREE.DoubleSide }));
      tag.position.set(-0.05, -0.02, 0);
      mesh.add(tag);
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
      map: this.world.tex.glow, color: type === 'key' ? 0xffd27a : 0xbfd8ff, transparent: true, opacity: 0.25,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(type === 'key' ? 0.6 : 0.4);
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
    for (const kk of [k, k + 1]) {
      const fd = this.world.fireDoors[kk];
      if (fd) consider(fd.pos, 2.0, { kind: 'firedoor' });
      const el = this.world.elevators[kk];
      if (el) consider(el.buttonPos, 1.8, { kind: 'button', el });
    }
    if (k === FLOORS - 1) consider(this.world.roof.pos, 2.4, { kind: 'roof' });
    return best;
  }

  promptFor(t) {
    if (!t) return '';
    if (t.kind === 'item') return { battery: '배터리 줍기', key: '열쇠 줍기', note: '쪽지 읽기' }[t.it.type];
    if (t.kind === 'firedoor') return '문 열기';
    if (t.kind === 'button') return '엘리베이터 버튼 누르기';
    if (t.kind === 'roof') return this.hasKey ? '옥상 문 열기' : '문 열기';
    return '';
  }

  interact() {
    if (this.hud.noteOpen) {
      this.hud.hideNote();
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
        this.hud.msg('손전등 배터리를 갈아 끼웠다. (+45%)', 2.4);
      } else if (it.type === 'note') {
        a.paper();
        const n = NOTES[it.idx];
        this.hud.showNote(n.title, n.body);
      } else if (it.type === 'key') {
        this.hasKey = true;
        this.hud.setKey(true);
        a.pickup(true);
        this.hud.msg('옥상 열쇠를 찾았다.', 2.5);
        this.director.after(2.2, () => {
          this.hud.msg('…아래에서 엘리베이터가 움직이기 시작했다.', 3.5);
          this.triggerHunt('key');
        });
      }
    } else if (t.kind === 'firedoor') {
      a.rattle();
      p.addNoise(11);
      this.hud.msg(['잠겨 있다.', '꿈쩍도 하지 않는다.', '문 너머에서 아무 소리도 들리지 않는다.'][Math.floor(Math.random() * 3)], 2);
    } else if (t.kind === 'button') {
      t.el.btnMat.color.setHex(0xff2222);
      a.click(0.5);
      this.hud.msg('버튼이 붉게 깜빡인다…', 2.5);
      this.director.after(1.3, () => this.triggerHunt('button'));
    } else if (t.kind === 'roof') {
      if (this.hasKey) this.win();
      else {
        a.rattle();
        this.hud.msg('잠겨 있다. 열쇠가 필요하다.', 2.5);
      }
    }
  }

  // ------------------------------------------------------------------ 사건
  triggerHunt(reason) {
    if (this.state !== 'playing') return;
    const r = this.stalker.hunt(this.player);
    if (r === 'already') return;
    this.audio.glitch(0.5);
    this.glitchPulse(0.8);
    this.director.flicker(2.5);
    this.hud.warn('FOUND YOU');
    if (reason === 'hide') this.hud.msg('송신이 당신을 찾았다.', 3);
    if (this.settings.voice) speak(Math.random() < 0.5 ? '찾았다' : '어디 가');
  }

  glitchPulse(v) {
    this.glitch = Math.max(this.glitch, v);
  }

  closeElevator(k, delay) {
    this.closeTimers.push({ k, t: delay });
  }

  onElevatorArrive(k, hunting) {
    const e = this.world.elevators[k];
    this.audio.ding(e.doorPos, hunting);
  }

  onDoorOpen(k) {
    this.audio.doorSlide(this.world.elevators[k].doorPos);
  }

  onStalkerRide() {}

  onChaseEnd(how) {
    this.chases++;
    if (how === 'vanish') this.audio.glitch(0.35);
    this.director.after(2, () => {
      if (this.state === 'playing' && !this.stalker.chasing) this.hud.msg(how === 'lost' ? '…따돌린 것 같다.' : '…사라졌다?', 2.5);
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
    this.state = 'dying';
    this.dieT = 0;
    this.player.frozen = true;
    this.hud.setPrompt('');
    this.hud.show(false);
    this.hud.hideNote();
    this.audio.jumpscare();
    this.audio.silence(true);
    this.glitch = 1;
  }

  win() {
    this.state = 'winning';
    this.winT = 0;
    this.player.frozen = true;
    this.hud.setPrompt('');
    this.world.roof.target = 1;
    this.audio.wind(0.6, 7);
    this.audio.silence(true);
    this.stalker.sprite.visible = false;
  }

  // ------------------------------------------------------------------ 루프
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'loading') return;
    const u = this.post.uniforms;
    u.uTime.value += dt;

    if (this.state === 'title') this.updateTitle(dt);
    else if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'dying') this.updateDying(dt);
    else if (this.state === 'winning') this.updateWinning(dt);

    if (this.state !== 'paused') {
      this.updateLamps(dt);
      this.updateDoors(dt);
    }
    this.hud.update(dt);
    this.glitch = Math.max(0, this.glitch - dt * 1.6);
    u.uGlitch.value = this.glitch;
    this.post.render(this.scene, this.camera);
  }

  updateTitle(dt) {
    this.titleT += dt;
    const u = this.post.uniforms;
    u.uFade.value = Math.max(0, u.uFade.value - dt * 0.5);
    u.uFear.value = 0.25;
    u.uRed.value = 0;
    // 참고 이미지 구도: 난간 너머로 위층 계단을 올려다봄, 꺾이는 곳에 송신
    const k = 6;
    const phi = landingCenter(k) + 0.95 + Math.sin(this.titleT * 0.08) * 0.08;
    const r = R_IN + 0.75;
    const cam = this.camera;
    polar(r, phi, baseY(phi) + 1.75 + Math.sin(this.titleT * 0.3) * 0.03, cam.position);
    const lookPhi = phi + 2.1;
    const target = polar(R_MID + 0.3, lookPhi, baseY(lookPhi) + 0.9, new THREE.Vector3());
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    cam.rotation.z += Math.sin(this.titleT * 0.2) * 0.01;
    // 송신: 계단 꺾이는 곳에서 가끔 사라짐
    const fPhi = phi + 2.75;
    polar(R_MID + 0.35, fPhi, baseY(fPhi) + 1.15, this.phantom.position);
    this.phantom.material.color.setScalar(0.7);
    const cyc = this.titleT % 9;
    this.phantom.visible = cyc > 2.5 && !(cyc > 6.2 && cyc < 6.35);
    this.player.torch.intensity = 0;
    this.player.glow.intensity = 0;
    this.titleLight = this.titleLight || new THREE.PointLight(0xdfe6ff, 0, 12, 1.4);
    if (!this.titleLight.parent) this.scene.add(this.titleLight);
    polar(R_MID, phi + 1.9, baseY(phi + 1.9) + 2.6, this.titleLight.position);
    this.titleLight.intensity = 3.2;
    this.lampCenterY = cam.position.y;
  }

  updatePlaying(dt) {
    const p = this.player, s = this.stalker, u = this.post.uniforms;
    if (this.titleLight) this.titleLight.intensity = 0;
    this.player.glow.intensity = 0.18;
    this.time += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt * 0.45);
    u.uFade.value = this.fadeIn;

    const reading = this.hud.noteOpen;
    const ev = p.update(dt, reading ? {} : this.input, this.diff);
    if (this.director.torchKill > 0) {
      p.torch.intensity = 0;
      p.lensMat.color.setScalar(0.08);
    }
    if (ev.footstep) this.audio.footstep(ev.footstep);
    if (ev.trip) {
      this.audio.thud();
      this.hud.msg('넘어졌다!', 1.6);
      p.shake = 0.8;
    }

    s.update(dt, p, this);
    this.director.update(dt);
    if (s.justSpotted) {
      this.audio.sting(0.45);
      this.audio.laughAt(s.pos, 1);
      this.glitchPulse(0.5);
      p.shake = Math.max(p.shake, 0.5);
    }

    // ---- 근접도 / 공포 ----
    let d;
    if (s.inElevator) d = Math.abs(s.elevFloor * FLOOR_H - p.footY) * 1.6 + 6;
    else d = pathDist(s.phi, s.r, p.phi, p.r);
    const prox = Math.max(0, Math.min(1, 1 - d / 30));
    const targetFear = Math.max(prox, s.chasing ? 0.55 + prox * 0.45 : 0);
    this.fear += (targetFear - this.fear) * Math.min(1, dt * 2);
    u.uFear.value = this.fear;
    const close = s.visible ? Math.max(0, 1 - d / 7) : 0;
    u.uRed.value += ((s.chasing ? close : close * 0.4) - u.uRed.value) * Math.min(1, dt * 5);
    if (s.visible && d < 3) p.shake = Math.max(p.shake, 0.7);
    else if (s.visible && d < 6) p.shake = Math.max(p.shake, 0.35);
    if (prox > 0.75 && Math.random() < dt * 2) this.glitchPulse(0.25);

    // ---- 잡힘 ----
    if (s.visible && (s.state === 'chase' || s.state === 'roam' || s.state === 'toElevator' || s.state === 'arriving')) {
      const dx = s.pos.x - p.x, dz = s.pos.z - p.z;
      const dy = baseY(s.phi) - p.footY;
      if (dx * dx + dz * dz < 0.62 && Math.abs(dy) < 1.5) {
        this.die();
        return;
      }
    }

    // ---- 아이템 반짝임 ----
    for (const it of this.items) {
      it.glow.material.opacity = 0.18 + 0.14 * Math.sin(this.time * 2.4 + it.seed);
    }

    // ---- 상호작용 안내 ----
    this.hud.setPrompt(reading ? '' : this.promptFor(this.findInteractable()));

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
    this.hud.setFloor(onLanding(p.phi) || fl >= FLOORS - 1 ? `${fl + 1}F` : `${fl + 1}F ↗ ${fl + 2}F`);
    this.hud.setStamina(p.stamina, p.exhausted);
    this.hud.setBattery(p.battery);
    this.hud.setDetector(s.inElevator ? prox * 0.6 : prox);

    // ---- 사운드 ----
    this.audio.updateListener(this.camera);
    this.audio.update(dt, {
      voicePos: s.pos,
      voiceOn: s.visible,
      chasing: s.chasing,
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
    this.lampCenterY = p.footY;
  }

  updateDying(dt) {
    this.dieT += dt;
    const cam = this.camera, s = this.stalker, u = this.post.uniforms;
    // 얼굴이 화면을 가득 채운다
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const dist = Math.max(0.42, 1.4 - this.dieT * 4);
    s.sprite.visible = this.dieT < 1.5;
    s.sprite.position.copy(cam.position).addScaledVector(fwd, dist);
    s.sprite.position.y += (Math.random() - 0.5) * 0.04;
    const sc = 0.9 + Math.random() * 0.08;
    s.sprite.scale.set(s.baseScale.x * 0.55 * sc, s.baseScale.y * 0.55 * sc, 1);
    s.material.color.setScalar(1.3);
    s.material.rotation = (Math.random() - 0.5) * 0.15;
    cam.rotation.z = (Math.random() - 0.5) * 0.08;
    u.uRed.value = 1;
    u.uFear.value = 1;
    this.glitch = Math.max(this.glitch, 0.7);
    if (this.dieT > 1.5) u.uFade.value = Math.min(1, (this.dieT - 1.5) * 2);
    if (this.dieT > 2.1 && this.state === 'dying') {
      this.state = 'dead';
      s.material.color.setScalar(0.85);
      this.unlock();
      this.hud.stats('dead', [
        `도달한 층: <b>${this.player.maxFloor + 1}F</b> / ${FLOORS}F`,
        `생존 시간: ${formatTime(this.time)}`,
        `따돌린 추격: ${this.chases}회`,
        `난이도: ${this.diff.label}`,
      ]);
      this.hud.screen('dead');
    }
  }

  updateWinning(dt) {
    this.winT += dt;
    const u = this.post.uniforms;
    u.uFlash.value = Math.min(1, Math.max(0, (this.winT - 0.6) / 2.2));
    u.uRed.value *= 0.9;
    u.uFear.value *= 0.95;
    this.player.update(dt, {}, this.diff);
    if (this.winT > 3.2 && this.state === 'winning') {
      this.state = 'won';
      this.unlock();
      this.hud.show(false);
      this.hud.stats('win', [
        `탈출 시간: <b>${formatTime(this.time)}</b>`,
        `따돌린 추격: ${this.chases}회`,
        `난이도: ${this.diff.label}`,
      ]);
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
      l.bulbMat.color.setRGB(l.level * 1.4, l.level * 1.3, l.level * 1.1);
      l.halo.material.opacity = 0.5 * l.level;
    }
    // 가까운 4개의 계단참에만 실제 조명 배치
    const cy = this.lampCenterY ?? 0;
    const sorted = [...lamps].sort((a, b) => Math.abs(a.pos.y - cy - 1) - Math.abs(b.pos.y - cy - 1));
    this.lampLights.forEach((light, i) => {
      const l = sorted[i];
      light.position.copy(l.pos);
      light.intensity = 5 * l.level;
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
function loadSettings() {
  const def = { sens: 1, vol: 0.8, q: 'mid', voice: true, invert: false };
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

const game = new Game();
window.__songsin = game; // 디버그용
