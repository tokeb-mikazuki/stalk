// 후처리: 블룸(빛 번짐), 흑백 필름 톤, 필름 그레인, 비네트, 색수차, 글리치, 붉은 경보, CCTV
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// 밝은 부분만 추출 (부드러운 문턱값)
const brightFrag = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold * 0.6, uThreshold * 1.4, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

// 9탭 가우시안 블러 (가로/세로 분리)
const blurFrag = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  c += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const frag = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uBloom;
uniform vec2 uRes;
uniform float uTime, uFear, uRed, uGlitch, uFade, uFlash, uSat, uExposure, uGamma, uCctv;
varying vec2 vUv;

float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  // 가로 띠 글리치
  float row = floor(uv.y * 38.0);
  float tick = floor(uTime * 24.0);
  float band = step(1.0 - 0.35 * uGlitch, rand(vec2(row, tick)));
  uv.x += (rand(vec2(row * 1.7, tick)) - 0.5) * 0.12 * uGlitch * band;
  // 공포가 클수록 화면이 숨쉬듯 일렁임
  uv += vec2(sin(uv.y * 24.0 + uTime * 3.0), cos(uv.x * 20.0 + uTime * 2.5)) * 0.0016 * uFear;

  // CCTV: 어안 렌즈 왜곡
  vec2 d0 = uv - 0.5;
  uv = mix(uv, 0.5 + d0 * (1.0 - 0.18 * dot(d0, d0) * 4.0), uCctv);
  vec2 d = uv - 0.5;
  float ca = 0.0015 + 0.006 * uFear + 0.025 * uGlitch;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + d * ca).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - d * ca).b;

  col += texture2D(tBloom, uv).rgb * uBloom;
  col = aces(col * uExposure * (1.0 + 3.5 * uCctv));
  col = pow(col, vec3(1.0 / 2.2));
  // 사용자 감마: 중간~밝은 톤만 끌어올리고 깊은 어둠(실루엣)은 거의 그대로 둔다
  vec3 lifted = pow(max(col, 0.0), vec3(1.0 / uGamma));
  col = mix(col, lifted, smoothstep(0.035, 0.22, max(col.r, max(col.g, col.b))));

  // 흑백 + 약간의 냉색
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  col *= vec3(0.96, 1.0, 1.05);
  col = clamp((col - 0.5) * 1.12 + 0.5, 0.0, 1.0);

  // CCTV: 녹색 단색 + 굵은 주사선 + 잡음 (붉은 경보·공포 효과는 끔)
  float cl = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 cctv = vec3(cl * 0.75, cl * 1.0, cl * 0.8);
  cctv *= 0.82 + 0.18 * step(0.5, fract(uv.y * 120.0 + uTime * 2.0));
  cctv += (rand(uv * 300.0 + uTime) - 0.5) * 0.12;
  cctv *= 0.9 + 0.1 * sin(uTime * 50.0);
  col = mix(col, cctv, uCctv);

  // 붉은 경보
  float lum = dot(col, vec3(0.333));
  float red = uRed * (1.0 - uCctv);
  col = mix(col, vec3(lum * 1.5, lum * 0.25, lum * 0.22), red * 0.85);

  // 비네트
  float v = smoothstep(0.95, 0.2, length(d) * (1.0 + uFear * 0.6 + red * 0.3));
  col *= mix(0.25, 1.0, v);
  col += vec3(0.25, 0.0, 0.0) * red * (1.0 - v);

  // 필름 그레인 + 주사선
  float g = rand(uv * uRes + fract(uTime) * 100.0) - 0.5;
  col += g * (0.07 + 0.1 * uFear + 0.25 * uGlitch);
  col *= 1.0 - 0.06 * uGlitch * step(0.5, fract(uv.y * uRes.y * 0.5));

  col = mix(col, vec3(0.0), uFade);
  col = mix(col, vec3(1.0), uFlash);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.samples = 2;
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: this.samples });
    const half = { type: THREE.HalfFloatType, depthBuffer: false };
    this.bloomA = new THREE.WebGLRenderTarget(4, 4, half);
    this.bloomB = new THREE.WebGLRenderTarget(4, 4, half);
    this.bloomOn = true;
    this.uniforms = {
      tDiffuse: { value: this.target.texture },
      tBloom: { value: this.bloomA.texture },
      uBloom: { value: 0.9 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uFear: { value: 0 },
      uRed: { value: 0 },
      uGlitch: { value: 0 },
      uFade: { value: 0 },
      uFlash: { value: 0 },
      uSat: { value: 0.16 },
      uExposure: { value: 0.78 },
      uGamma: { value: 1 },
      uCctv: { value: 0 },
    };
    const quadMat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader, depthTest: false, depthWrite: false });
    this.finalMat = quadMat(frag, this.uniforms);
    this.brightMat = quadMat(brightFrag, { tDiffuse: { value: this.target.texture }, uThreshold: { value: 1.0 } });
    this.blurMat = quadMat(blurFrag, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.finalMat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** 품질 설정: MSAA 샘플 수, 블룸 사용 여부 */
  configure({ samples = 2, bloom = true } = {}) {
    this.bloomOn = bloom;
    this.uniforms.uBloom.value = bloom ? 0.9 : 0;
    if (samples !== this.samples) {
      this.samples = samples;
      const { width, height } = this.target;
      this.target.dispose();
      this.target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples });
      this.uniforms.tDiffuse.value = this.target.texture;
      this.brightMat.uniforms.tDiffuse.value = this.target.texture;
    }
  }

  setSize(w, h, pr) {
    const W = Math.max(1, Math.floor(w * pr)), H = Math.max(1, Math.floor(h * pr));
    this.target.setSize(W, H);
    this.bloomA.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
    this.bloomB.setSize(Math.max(1, W >> 2), Math.max(1, H >> 2));
    this.uniforms.uRes.value.set(W, H);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    if (this.bloomOn) {
      // 밝은 부분 → 1/4 해상도에서 두 번 블러
      this.pass(this.brightMat, this.bloomA);
      const bw = this.bloomA.width, bh = this.bloomA.height;
      for (const spread of [1, 2.2]) {
        this.blurMat.uniforms.tDiffuse.value = this.bloomA.texture;
        this.blurMat.uniforms.uDir.value.set(spread / bw, 0);
        this.pass(this.blurMat, this.bloomB);
        this.blurMat.uniforms.tDiffuse.value = this.bloomB.texture;
        this.blurMat.uniforms.uDir.value.set(0, spread / bh);
        this.pass(this.blurMat, this.bloomA);
      }
    }
    this.pass(this.finalMat, null);
  }
}
