// GPU 시각 효과: 손전등 빛줄기(볼류메트릭 콘)와 빛 속에 떠다니는 먼지
import * as THREE from 'three';

const BEAM_LEN = 9;

const beamVert = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const beamFrag = /* glsl */ `
uniform float uIntensity;
uniform float uLen;
uniform float uTime;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float t = clamp(-vLocal.z / uLen, 0.0, 1.0);
  float fall = pow(1.0 - t, 1.8) * smoothstep(0.0, 0.06, t);
  float edge = pow(abs(dot(normalize(vNormal), normalize(-vView))), 1.4);
  // 공기 중 먼지 결
  float n = 0.75 + 0.25 * sin(vLocal.x * 7.0 + uTime * 0.6) * sin(vLocal.y * 9.0 - uTime * 0.4);
  float a = uIntensity * fall * edge * n * 0.055;
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.86) * a, 1.0);
}`;

const dustVert = /* glsl */ `
uniform vec3 uCam;
uniform vec3 uTorchPos;
uniform vec3 uTorchDir;
uniform float uTime;
uniform float uSize;
uniform float uScale;
uniform float uMaxSize;
attribute float aSeed;
varying float vBright;
void main() {
  // 카메라 주변 상자 안에서 순환하며 천천히 떠다님
  vec3 drift = vec3(sin(uTime * 0.21 + aSeed * 6.0), sin(uTime * 0.13 + aSeed * 9.0) * 0.6 - uTime * 0.03, cos(uTime * 0.17 + aSeed * 4.0)) * 0.35;
  vec3 p = mod(position + drift - uCam + uSize * 0.5, uSize) - uSize * 0.5 + uCam;
  vec3 d = p - uTorchPos;
  float dist = length(d);
  float c = dot(d / max(dist, 1e-3), uTorchDir);
  vBright = smoothstep(0.86, 0.95, c) * smoothstep(7.0, 1.0, dist) * smoothstep(0.15, 0.6, dist);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // 아주 작은 점 (거리와 무관하게 1~2px 정도)
  gl_PointSize = clamp(uScale * (0.6 + aSeed) / -mv.z, 1.0, uMaxSize);
  gl_Position = projectionMatrix * mv;
}`;

const dustFrag = /* glsl */ `
uniform float uIntensity;
varying float vBright;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.35, 0.5, length(q));
  float b = vBright * uIntensity * a;
  if (b < 0.002) discard;
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * b * 0.7, 1.0);
}`;

export class TorchFX {
  constructor(scene, camera, torch) {
    this.camera = camera;
    this.torch = torch;

    // 빛줄기 콘: 꼭짓점이 렌즈, 축은 손전등 방향
    const R = BEAM_LEN * Math.tan(torch.angle * 0.5);
    const geo = new THREE.ConeGeometry(R, BEAM_LEN, 40, 12, true);
    geo.translate(0, -BEAM_LEN / 2, 0);
    geo.rotateX(Math.PI / 2);
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 0 }, uLen: { value: BEAM_LEN }, uTime: { value: 0 } },
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.beam = new THREE.Mesh(geo, this.beamMat);
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 5;
    this.beam.position.copy(torch.position);
    const dir = torch.target.position.clone().sub(torch.position).normalize();
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    camera.add(this.beam);

    // 먼지 입자
    const N = 900;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 9;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 9;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 9;
      seed[i] = Math.random();
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uTorchPos: { value: new THREE.Vector3() },
        uTorchDir: { value: new THREE.Vector3(0, 0, -1) },
        uTime: { value: 0 },
        uSize: { value: 9 },
        uScale: { value: 6 },
        uMaxSize: { value: 2 },
        uIntensity: { value: 0 },
      },
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 6;
    scene.add(this.dust);

    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.setEnabled(true, true);
  }

  setEnabled(beam, dust) {
    this.beamOn = beam;
    this.dustOn = dust;
    this.beam.visible = beam;
    this.dust.visible = dust;
  }

  update(dt, active, pixelRatio) {
    const t = (this.beamMat.uniforms.uTime.value += dt);
    const lvl = active ? Math.min(1, this.torch.intensity / 30) : 0;
    this.beamMat.uniforms.uIntensity.value = lvl;
    this.beam.visible = this.beamOn && lvl > 0.01;
    const u = this.dustMat.uniforms;
    u.uTime.value = t;
    u.uIntensity.value = lvl;
    u.uScale.value = 6 * pixelRatio;
    u.uMaxSize.value = 2 * pixelRatio;
    this.dust.visible = this.dustOn && lvl > 0.01;
    if (!this.dust.visible) return;
    this.camera.updateMatrixWorld();
    u.uCam.value.setFromMatrixPosition(this.camera.matrixWorld);
    this.torch.getWorldPosition(u.uTorchPos.value);
    this.torch.target.getWorldPosition(this.tmpA);
    u.uTorchDir.value.copy(this.tmpA).sub(u.uTorchPos.value).normalize();
  }
}
