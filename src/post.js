// 후처리: 흑백 필름 톤, 필름 그레인, 비네트, 색수차, 글리치, 붉은 경보
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const frag = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime, uFear, uRed, uGlitch, uFade, uFlash, uSat, uExposure;
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

  vec2 d = uv - 0.5;
  float ca = 0.0015 + 0.006 * uFear + 0.025 * uGlitch;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + d * ca).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - d * ca).b;

  col = aces(col * uExposure);
  col = pow(col, vec3(1.0 / 2.2));

  // 흑백 + 약간의 냉색
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  col *= vec3(0.96, 1.0, 1.05);
  col = clamp((col - 0.5) * 1.12 + 0.5, 0.0, 1.0);

  // 붉은 경보
  float lum = dot(col, vec3(0.333));
  col = mix(col, vec3(lum * 1.5, lum * 0.25, lum * 0.22), uRed * 0.85);

  // 비네트
  float v = smoothstep(0.95, 0.2, length(d) * (1.0 + uFear * 0.6 + uRed * 0.3));
  col *= mix(0.25, 1.0, v);
  col += vec3(0.25, 0.0, 0.0) * uRed * (1.0 - v);

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
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2 });
    this.uniforms = {
      tDiffuse: { value: this.target.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uFear: { value: 0 },
      uRed: { value: 0 },
      uGlitch: { value: 0 },
      uFade: { value: 0 },
      uFlash: { value: 0 },
      uSat: { value: 0.16 },
      uExposure: { value: 1.0 },
    };
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false }),
    );
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h, pr) {
    this.target.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.uniforms.uRes.value.set(w * pr, h * pr);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
