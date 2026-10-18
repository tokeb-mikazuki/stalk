// 도전과제 + 진행 상황 저장 (브라우저 localStorage)
import { YUGI } from './theme.js';
export const ACHIEVEMENTS = [
  { id: 'first', name: '첫 탈출', desc: '아무 난이도로 옥상 문을 연다.' },
  { id: 'casual', name: '산책', desc: '캐주얼 클리어.' },
  { id: 'normal', name: '계단의 생존자', desc: '노말 클리어.' },
  { id: 'hard', name: '피구공을 넘어서', desc: '하드 클리어. 악몽 모드가 열린다.' },
  { id: 'nightmare', name: '30층의 악몽', desc: '악몽 클리어.' },
  { id: 'hider', name: '숨바꼭질 장인', desc: '한 판에서 비상실에 숨어 피구공을 3번 돌려보낸다.' },
  { id: 'watcher', name: '감시자', desc: 'CCTV로 문 앞을 서성이는 피구공을 지켜본다.' },
  { id: 'breach', name: '멈추지 말라고 했잖아', desc: '일시정지 화면이 깨진 판에서 끝내 탈출한다.', hidden: true },
  { id: 'dark', name: '어둠에 익숙한 자', desc: '손전등을 켠 시간이 모두 합쳐 20초 이하인 채로 탈출한다. (노말 이상)' },
  { id: 'runner', name: '숨지 않는 자', desc: '비상실에 한 번도 들어가지 않고 탈출한다. (노말 이상)' },
  { id: 'clumsy', name: '칠전팔기', desc: '한 판에서 5번 이상 넘어지고도 탈출한다.' },
  { id: 'close', name: '숨결이 닿는 거리', desc: '피구공에게 1m 안까지 따라잡히고도 탈출한다.' },
  { id: 'ghost', name: '아무도 몰랐다', desc: '한 번도 추격당하지 않고 탈출한다. (노말 이상)', hidden: true },
  { id: 'speed', name: '계단 스프린터', desc: '노말 이상에서 6분 안에 탈출한다.' },
  { id: 'reader', name: '기록 보관인', desc: '모든 쪽지를 읽는다. (누적)' },
  { id: 'trap', name: '고장난 버튼', desc: '엘리베이터에 탔다.', hidden: true },
  { id: 'friend', name: '피구공의 단골', desc: '피구공에게 10번 피폭당한다. (누적)', hidden: true },
];

// 판마다 따로 저장한다 (같은 주소에서 열어도 기록이 섞이지 않게)
const KEY = YUGI ? 'channel-yugi-progress' : 'songsin-stairs-progress';

export class Progress {
  constructor() {
    this.data = { ach: {}, cleared: {}, deaths: 0, notes: [], hints: [] };
    try {
      Object.assign(this.data, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch {
      /* 저장소 없음: 이번 세션만 기억 */
    }
    this.onUnlock = null;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* 저장 불가 */
    }
  }

  /** 플레이 기록과 도전과제를 모두 지운다 (클리어·해금, 피폭 횟수, 읽은 쪽지, 본 안내 문구 포함) */
  reset() {
    this.data = { ach: {}, cleared: {}, deaths: 0, notes: [], hints: [] };
    this.save();
  }

  has(id) {
    return !!this.data.ach[id];
  }

  unlock(id) {
    if (this.has(id)) return false;
    this.data.ach[id] = Date.now();
    this.save();
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a && this.onUnlock) this.onUnlock(a);
    return true;
  }

  isCleared(diff) {
    return !!this.data.cleared[diff];
  }

  markCleared(diff) {
    const first = !this.data.cleared[diff];
    this.data.cleared[diff] = true;
    this.save();
    return first;
  }

  addDeath() {
    this.data.deaths = (this.data.deaths || 0) + 1;
    this.save();
    if (this.data.deaths >= 10) this.unlock('friend');
  }

  readNote(idx, total) {
    if (!this.data.notes.includes(idx)) this.data.notes.push(idx);
    this.save();
    if (this.data.notes.length >= total) this.unlock('reader');
  }

  /** 탈출 시 이번 판 기록으로 도전과제 판정 */
  checkWin(diffKey, run, time) {
    const atLeastNormal = diffKey !== 'casual';
    this.unlock('first');
    this.unlock(diffKey);
    if (run.hides >= 3) this.unlock('hider');
    if (run.breached) this.unlock('breach');
    if (atLeastNormal && run.torchTime <= 20) this.unlock('dark');
    if (atLeastNormal && !run.enteredRoom) this.unlock('runner');
    if (run.trips >= 5) this.unlock('clumsy');
    if (run.nearMiss) this.unlock('close');
    if (atLeastNormal && run.chases === 0) this.unlock('ghost');
    if (atLeastNormal && time <= 360) this.unlock('speed');
  }
}
