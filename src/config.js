// 공포의 송신계단 - 공용 상수와 계단 수학
//
// 계단은 중앙이 뚫린 나선형 계단이다. 한 층 = 두 바퀴(TURNS × 2π).
// 한 층은 [계단참(LANDING) | 계단(STAIR_ARC)] 으로 구성된다.
// 플레이어와 송신의 위치는 "펼친 각도" phi 와 반지름 r 로 표현한다.
// 계단참 바깥 벽의 비상문 너머에는 숨을 수 있는 방(복도 + 방)이 있다.

export const TAU = Math.PI * 2;

// 층 수는 난이도마다 다르다 (악몽 = 30층). setFloors() 로 바꾸며, 다른 모듈은 live binding 으로 읽는다.
export let FLOORS = 20;              // 1F ~ 맨 위층 (맨 위층 계단참 끝에 옥상 문)
export const TURNS = 2;              // 층당 나선 바퀴 수 (걸어서 약 15초 — 원작의 T_F)
export const FLOOR_PHI = TURNS * TAU;
export const FLOOR_H = 9;            // 층고 (m) — 위아래 계단 사이 머리 위 공간 약 4m
export const R_IN = 2.0;             // 난간(중앙 공동) 반지름
export const R_OUT = 4.9;            // 바깥 벽 반지름
export const R_MID = (R_IN + R_OUT) / 2;
export const LANDING = 1.25;         // 계단참 각도(rad)
export const STAIR_ARC = FLOOR_PHI - LANDING;
export const STEPS = 54;             // 층당 계단 수
export const RISE = FLOOR_H / (STEPS + 1);

export const DOOR_ANGLE = 0.68;          // 엘리베이터 문 각도 (모든 층 동일 → 수직 승강로)
export const FIREDOOR_ANGLE = 0.2;       // 비상문 (안쪽에 숨을 방)
export const SIGN_ANGLE = 1.05;          // 층 표시 페인트
export const DOOR_HALF_W = 0.6;          // 엘리베이터 개구부 반폭(m)
export const FIRE_HALF_W = 0.5;          // 비상문 개구부 반폭(m)
export const HOLE_H = 2.3;               // 벽 개구부 높이

// 비상문 로컬 좌표계: 원점 = 문 중앙(벽면), +z = 계단 안쪽, +x = 각도가 커지는 방향
export const CORR_L = 1.4;               // 복도 길이
export const ROOM_D = 3.8;               // 방 깊이
export const ROOM_X0 = -3.6;             // 방 x 범위
export const ROOM_X1 = 0.8;
export const ROOM_H = 2.9;

export const PLAYER_R_MIN = R_IN + 0.38;
export const PLAYER_R_MAX = R_OUT - 0.35;
export const PHI_MIN = 0.16;
export let ROOF_DOOR_PHI = 0;
export let PHI_MAX = 0;

export function setFloors(n) {
  FLOORS = n;
  ROOF_DOOR_PHI = (n - 1) * FLOOR_PHI + LANDING;
  PHI_MAX = ROOF_DOOR_PHI - 0.12;
}
setFloors(20);

export const EYE = 1.62;
export const EYE_CROUCH = 1.0;

/** 0부터 시작하는 층 인덱스 (0 = 1F) */
export function floorIndex(phi) {
  return Math.min(FLOORS - 1, Math.max(0, Math.floor(phi / FLOOR_PHI)));
}

/** 계단참 위에 있는지 */
export function onLanding(phi) {
  return phi - Math.floor(phi / FLOOR_PHI) * FLOOR_PHI < LANDING;
}

/** 실제 발 디딤 높이 (계단 한 칸 단위로 끊김) */
export function stepTopY(phi) {
  const k = Math.floor(phi / FLOOR_PHI);
  const a = phi - k * FLOOR_PHI;
  if (a < LANDING || k >= FLOORS - 1) return Math.min(k, FLOORS - 1) * FLOOR_H;
  const i = Math.min(STEPS - 1, Math.floor(((a - LANDING) / STAIR_ARC) * STEPS));
  return k * FLOOR_H + (i + 1) * RISE;
}

/** 매끄러운 기준 높이 (난간, 하부 슬래브, 송신 이동에 사용) */
export function baseY(phi) {
  const k = Math.floor(phi / FLOOR_PHI);
  const a = phi - k * FLOOR_PHI;
  if (a < LANDING || k >= FLOORS - 1) return Math.min(k, FLOORS - 1) * FLOOR_H;
  return k * FLOOR_H + ((a - LANDING) / STAIR_ARC) * FLOOR_H;
}

/** k층(0-based) 계단참 중앙 phi */
export function landingCenter(k) {
  return k * FLOOR_PHI + LANDING / 2;
}

/** k층 비상문 바로 앞(계단참 위) 지점의 phi */
export function fireDoorPhi(k) {
  return k * FLOOR_PHI + FIREDOOR_ANGLE;
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

// ---------- 비상문 로컬 좌표 ----------
const FC = Math.cos(FIREDOOR_ANGLE), FS = Math.sin(FIREDOOR_ANGLE);
const OX = R_OUT * FC, OZ = R_OUT * FS;

/** 월드 (x,z) → 비상문 로컬 (lx,lz) */
export function toRoomLocal(x, z, out = {}) {
  const dx = x - OX, dz = z - OZ;
  out.lx = dx * -FS + dz * FC;
  out.lz = dx * -FC + dz * -FS;
  return out;
}

/** 비상문 로컬 (lx,lz) → 월드 (x,z) */
export function fromRoomLocal(lx, lz, out = {}) {
  out.x = OX + lx * -FS + lz * -FC;
  out.z = OZ + lx * FC + lz * -FS;
  return out;
}

/** 로컬 좌표가 복도/방 안(걸을 수 있는 곳)인지. pad: 몸 반경 */
export function inRoomArea(lx, lz, pad = 0.28) {
  const corridor = Math.abs(lx) <= 0.5 - pad && lz >= -CORR_L - pad - 0.1 && lz <= 0.9;
  // 왼쪽 벽(침대·책상)과 뒷벽(선반) 쪽은 가구가 있어 걸을 수 없다
  const room = lx >= ROOM_X0 + 1.0 + pad && lx <= ROOM_X1 - pad && lz >= -CORR_L - ROOM_D + 0.6 + pad && lz <= -CORR_L - pad;
  return corridor || room;
}

// 난이도: 캐주얼 / 노말 / 하드 / 악몽(30층, 하드 클리어 시 해금)
// ai: 송신의 지능
//   hear      — 계단에서 플레이어의 기척(발소리·움직임)을 느끼는 거리(m). 정확한 위치가 아니라 '위/아래, 대략 몇 층'만 안다
//   floorErr  — 짐작한 층의 오차(층)
//   memory    — 마지막 기척을 기억하는 시간(s)
//   predict   — 플레이어가 움직이는 방향을 내다보는 정도 (0~1)
//   checkRooms— 놓친 층의 비상실 문 앞을 확인하는지
//   patience  — 엘리베이터를 기다리는 한계(s)
//   lightSense— 손전등 빛을 위아래 층에서 알아채는 범위(층)
//   calm      — 숨은 플레이어를 찾다 포기한 뒤 관심을 잃는 시간(s). 그동안은 그 층에서 4층 이상 떨어진 곳으로 간다
// ---------- 엘리베이터 문 로컬 좌표 (원점 = 엘리베이터 문 중앙, +z = 계단 안쪽) ----------
const EC = Math.cos(DOOR_ANGLE), ES = Math.sin(DOOR_ANGLE);
const EX = R_OUT * EC, EZ = R_OUT * ES;
export const CAR_HALF = 0.75;   // 엘리베이터 내부 반폭
export const CAR_DEPTH = 1.55;  // 엘리베이터 내부 깊이

export function toElevLocal(x, z, out = {}) {
  const dx = x - EX, dz = z - EZ;
  out.lx = dx * -ES + dz * EC;
  out.lz = dx * -EC + dz * -ES;
  return out;
}

export function fromElevLocal(lx, lz, out = {}) {
  out.x = EX + lx * -ES + lz * -EC;
  out.z = EZ + lx * EC + lz * -ES;
  return out;
}

/** 엘리베이터 문간 + 내부 (걸을 수 있는 곳) */
export function inCarArea(lx, lz, pad = 0.28) {
  const gap = Math.abs(lx) <= DOOR_HALF_W - pad && lz >= -0.2 && lz <= 0.9;
  const car = Math.abs(lx) <= CAR_HALF - pad && lz >= -CAR_DEPTH + pad && lz <= -0.05;
  return gap || car;
}

export const DIFFICULTY_ORDER = ['casual', 'normal', 'hard', 'nightmare'];
export const DIFFICULTY = {
  casual: {
    label: '캐주얼',
    ai: { hear: 18, floorErr: 2.2, memory: 14, predict: 0, checkRooms: false, patience: 26, lightSense: 0, calm: 34 },
    floors: 20,
    chaseSpeed: 3.4,         // 추격 속도(m/s) — 걷기(2.9)보다 빠르고 달리기(5.4)보다 느림
    chaseSpeedPerFloor: 0.02,
    chaseMax: 9,             // 추격 지속 한계(s)
    approachSpeed: 2.0,      // 엘리베이터에서 내려 다가올 때 속도
    roamSpeed: 1.3,
    elevatorSecPerFloor: 2.6,
    elevatorWeight: 0.55,    // 엘리베이터 목적지가 플레이어 근처일 확률
    rideDelay: [5, 11],      // 엘리베이터 출발 전 대기(s)
    graceTime: 30,           // 시작 유예
    hideThreshold: 70,       // 같은 층 체류 한계(s) — 원작의 HIDE_THRESH
    searchTime: 5,           // 닫힌 문 앞에서 서성이는 시간
    sight: 5,
    hearingMul: 0.65,
    batteryDrain: 0.9,       // 손전등 배터리 소모(%/s)
    batteries: 6,            // 계단에 떨어진 배터리 수
    roomBatteries: 0.9,      // 열린 비상실 책상에 배터리가 있을 확률
    indicatorGlitch: 0.15,
    eventMin: 26, eventMax: 50,
    tripChance: 0.03,
    exhaustTripChance: 0.25, // 지친 상태로 달리려 할 때 초당 넘어질 확률
    finalFloor: 17,          // 이 층(0-based)에 오르면 마지막 추격 시작
  },
  normal: {
    label: '노말',
    ai: { hear: 30, floorErr: 1.2, memory: 24, predict: 0.3, checkRooms: false, patience: 22, lightSense: 1, calm: 26 },
    floors: 20,
    chaseSpeed: 3.9,
    chaseSpeedPerFloor: 0.03,
    chaseMax: 13,
    approachSpeed: 2.5,
    roamSpeed: 1.4,
    elevatorSecPerFloor: 2.2,
    elevatorWeight: 0.75,
    rideDelay: [3, 8],
    graceTime: 22,
    hideThreshold: 45,
    searchTime: 7,
    sight: 6.5,
    hearingMul: 0.8,
    batteryDrain: 1.5,
    batteries: 5,
    roomBatteries: 0.75,
    indicatorGlitch: 0.3,
    eventMin: 20, eventMax: 40,
    tripChance: 0.06,
    exhaustTripChance: 0.4,
    finalFloor: 16,
  },
  hard: {
    label: '하드',
    ai: { hear: 43, floorErr: 0.6, memory: 38, predict: 0.7, checkRooms: true, patience: 16, lightSense: 1.5, calm: 18 },
    floors: 20,
    chaseSpeed: 4.4,
    chaseSpeedPerFloor: 0.035,
    chaseMax: 17,
    approachSpeed: 3.0,
    roamSpeed: 1.7,
    elevatorSecPerFloor: 1.8,
    elevatorWeight: 0.87,
    rideDelay: [2, 5],
    graceTime: 15,
    hideThreshold: 35,
    searchTime: 10,
    sight: 8,
    hearingMul: 1.0,
    batteryDrain: 2.0,
    batteries: 4,
    roomBatteries: 0.6,
    indicatorGlitch: 0.4,
    eventMin: 14, eventMax: 30,
    tripChance: 0.08,
    exhaustTripChance: 0.5,
    finalFloor: 13,
  },
  nightmare: {
    label: '악몽',
    keyRequired: true, // 옥상 문 열쇠 (엘리베이터 안 또는 25~30층 열린 비상실)
    ai: { hear: 62, floorErr: 0.25, memory: 60, predict: 1, checkRooms: true, patience: 10, lightSense: 2, calm: 12 },
    floors: 30,
    chaseSpeed: 4.8,
    chaseSpeedPerFloor: 0.02,  // 꼭대기에서는 거의 달리기 속도
    chaseMax: 24,
    approachSpeed: 3.4,
    roamSpeed: 2.0,
    elevatorSecPerFloor: 1.3,
    elevatorWeight: 0.95,
    rideDelay: [1, 3],
    graceTime: 10,
    hideThreshold: 25,
    searchTime: 13,
    sight: 9.5,
    hearingMul: 1.2,
    batteryDrain: 2.6,
    batteries: 3,
    roomBatteries: 0.5,
    indicatorGlitch: 0.6,      // 표시기를 믿기 어렵다
    eventMin: 9, eventMax: 20,
    tripChance: 0.1,
    exhaustTripChance: 0.65,
    finalFloor: 21,
  },
};
