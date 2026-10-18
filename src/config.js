// 공포의 송신계단 - 공용 상수와 계단 수학
//
// 계단은 중앙이 뚫린 나선형 계단이다. 한 층 = 한 바퀴(2π).
// 각 바퀴는 [계단참(LANDING) | 계단(STAIR_ARC)] 으로 구성된다.
// 플레이어와 송신의 위치는 "펼친 각도" phi 와 반지름 r 로 표현한다.

export const TAU = Math.PI * 2;

export const FLOORS = 20;            // 1F ~ 20F (20F 계단참 끝에 옥상 문)
export const FLOOR_H = 3.6;          // 층고 (m)
export const R_IN = 1.7;             // 난간(중앙 공동) 반지름
export const R_OUT = 4.4;            // 바깥 벽 반지름
export const R_MID = (R_IN + R_OUT) / 2;
export const LANDING = 1.25;         // 계단참 각도(rad)
export const STAIR_ARC = TAU - LANDING;
export const STEPS = 22;             // 층당 계단 수
export const RISE = FLOOR_H / (STEPS + 1);

export const DOOR_ANGLE = LANDING / 2;   // 엘리베이터 문 각도 (모든 층 동일 → 수직 승강로)
export const FIREDOOR_ANGLE = 0.24;      // 비상문(잠김)
export const SIGN_ANGLE = 1.0;           // 층 표시 페인트
export const DOOR_HALF_W = 0.6;          // 엘리베이터 개구부 반폭(m)

export const PLAYER_R_MIN = R_IN + 0.38;
export const PLAYER_R_MAX = R_OUT - 0.35;
export const PHI_MIN = 0.16;
export const ROOF_DOOR_PHI = (FLOORS - 1) * TAU + LANDING;
export const PHI_MAX = ROOF_DOOR_PHI - 0.12;

export const EYE = 1.62;
export const EYE_CROUCH = 1.0;

/** 0부터 시작하는 층 인덱스 (0 = 1F) */
export function floorIndex(phi) {
  return Math.min(FLOORS - 1, Math.max(0, Math.floor(phi / TAU)));
}

/** 계단참 위에 있는지 */
export function onLanding(phi) {
  return phi - Math.floor(phi / TAU) * TAU < LANDING;
}

/** 실제 발 디딤 높이 (계단 한 칸 단위로 끊김) */
export function stepTopY(phi) {
  const k = Math.floor(phi / TAU);
  const a = phi - k * TAU;
  if (a < LANDING || k >= FLOORS - 1) return Math.min(k, FLOORS - 1) * FLOOR_H;
  const i = Math.min(STEPS - 1, Math.floor(((a - LANDING) / STAIR_ARC) * STEPS));
  return k * FLOOR_H + (i + 1) * RISE;
}

/** 매끄러운 기준 높이 (난간, 하부 슬래브, 송신 이동에 사용) */
export function baseY(phi) {
  const k = Math.floor(phi / TAU);
  const a = phi - k * TAU;
  if (a < LANDING || k >= FLOORS - 1) return Math.min(k, FLOORS - 1) * FLOOR_H;
  return k * FLOOR_H + ((a - LANDING) / STAIR_ARC) * FLOOR_H;
}

/** k층(0-based) 계단참 중앙 phi */
export function landingCenter(k) {
  return k * TAU + LANDING / 2;
}

export function polar(r, phi, y, out) {
  out.set(r * Math.cos(phi), y, r * Math.sin(phi));
  return out;
}

/** 두 지점 사이의 계단 경로 거리(m) */
export function pathDist(phiA, rA, phiB, rB) {
  const d = (phiA - phiB) * R_MID;
  const dr = rA - rB;
  return Math.sqrt(d * d + dr * dr);
}

export const DIFFICULTY = {
  normal: {
    label: '보통',
    chaseSpeed: 3.25,        // 추격 속도(m/s) — 걷기보다 빠르고 달리기보다 느림
    chaseSpeedPerFloor: 0.045,
    chaseMax: 12,            // 추격 지속 한계(s)
    roamSpeed: 1.5,
    elevatorSecPerFloor: 2.4,
    hideThreshold: 45,       // 같은 층 체류 한계(s) — 원작의 HIDE_THRESH
    sight: 7,
    hearingMul: 1.0,
    batteryDrain: 0.75,
    eventMin: 20, eventMax: 42,
    tripChance: 0.06,
  },
  nightmare: {
    label: '악몽',
    chaseSpeed: 3.95,
    chaseSpeedPerFloor: 0.06,
    chaseMax: 20,
    roamSpeed: 1.9,
    elevatorSecPerFloor: 1.8,
    hideThreshold: 30,
    sight: 9,
    hearingMul: 1.35,
    batteryDrain: 1.1,
    eventMin: 12, eventMax: 28,
    tripChance: 0.09,
  },
};
