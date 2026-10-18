// 판(에디션) — 빌드할 때 정해진다 (tools/build.mjs 가 둘 다 만든다)
//   'songshin': 공포의 송신계단 (원작 — 송신)
//   'yugi':     공포의 채널유기 (피구공 — 그림을 입힌 공)
// 소스의 글자는 채널유기 판 기준이고, 송신계단 판은 빌드할 때 이름을 되돌린다 (THEME_TEXT).
/* global __THEME__ */
export const THEME = typeof __THEME__ !== 'undefined' ? __THEME__ : 'yugi';
export const YUGI = THEME === 'yugi';
