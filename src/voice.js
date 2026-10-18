// 건물 안내 방송 — 트레일러와 같은 목소리로 읽는 안내 문구 (화면 글자 + 음성)
// say: 음성으로 읽는 문장 (tools/game_voice.py 가 이것으로 assets/voice/<id>.mp3 를 만든다)
// text: 화면에 띄우는 문장 (없으면 say 그대로, {F} 는 꼭대기 층 번호)
// style: pa(천장 스피커) · glitch(일그러짐) · close(귓가에서)
// chime: 방송 전 '띵동' 차임
import vGoal from '../assets/voice/intro-goal.mp3';
import vElevator from '../assets/voice/intro-elevator.mp3';
import vDoor from '../assets/voice/intro-door.mp3';
import vRoom from '../assets/voice/room.mp3';
import vSee from '../assets/voice/see.mp3';
import vChase from '../assets/voice/chase.mp3';
import vTrip from '../assets/voice/tripTip.mp3';
import vLinger from '../assets/voice/linger.mp3';
import vFound from '../assets/voice/found.mp3';
import vPause from '../assets/voice/pause.mp3';
import vAtDoor from '../assets/voice/atDoor.mp3';
import vCarPanel from '../assets/voice/carpanel.mp3';
import vWin from '../assets/voice/win.mp3';
import vKey from '../assets/voice/key-intro.mp3';

export const VOICE = {
  'intro-goal': { say: '안내 말씀 드립니다. 옥상 문은 맨 위층에 있습니다. 벽에 적힌 층 번호를 확인하십시오.', rate: '-8%', pitch: '-2Hz',
    text: '안내 말씀 드립니다. 옥상 문은 맨 위층({F}F)에 있습니다. 벽에 적힌 층 번호를 확인하십시오.', style: 'pa', chime: true, url: vGoal },
  'intro-elevator': { say: '엘리베이터 표시기는 엘리베이터가 있는 층을 알려 드립니다. 그것도, 엘리베이터를 이용합니다.', rate: '-8%', pitch: '-2Hz',
    style: 'pa', url: vElevator },
  'intro-door': { say: '초록 비상구 표시등이 켜진 방에서는 잠시 쉬어 가실 수 있습니다. 들어가시면, 문을 꼭 닫으십시오.', rate: '-8%', pitch: '-2Hz',
    style: 'pa', url: vDoor },
  'room': { say: '비상실 모니터로 모든 층을 보실 수 있습니다. 너무 오래 머무르지는 마십시오.', rate: '-10%', pitch: '-3Hz',
    text: '비상실 모니터로 모든 층을 보실 수 있습니다. 너무 오래 머무르지는 마십시오. ([E] 문 닫기 · 모니터 = 전 층 CCTV)', style: 'pa', url: vRoom },
  'see': { say: '그것이 보이면, 눈을 마주치지 마십시오.', rate: '-12%', pitch: '-4Hz', style: 'pa', url: vSee },
  'chase': { say: '뛰십시오. 따돌리거나, 비상실에 들어가 문을 닫으십시오.', rate: '+4%', pitch: '-2Hz', style: 'glitch', url: vChase },
  'tripTip': { say: '지친 몸으로 뛰면 넘어질 수 있습니다. 숨을 고르십시오.', rate: '-10%', pitch: '-3Hz', style: 'pa', url: vTrip },
  'linger': { say: '같은 층에 너무 오래 머무르셨습니다. 이동하십시오.', rate: '-10%', pitch: '-4Hz', style: 'pa', chime: true, url: vLinger },
  'found': { say: '지금, 이동하십시오.', rate: '-5%', pitch: '-6Hz', text: '들켰습니다. 지금, 이동하십시오.', style: 'glitch', url: vFound },
  'pause': { say: '멈춰 있는 것으로는, 숨을 수 없습니다.', rate: '-15%', pitch: '-8Hz', style: 'glitch', url: vPause },
  'atDoor': { say: '문 앞에 누군가 있습니다. 문을 열지 마십시오.', rate: '-12%', pitch: '-4Hz',
    text: '문 앞에 누군가 있습니다. 문을 열지 마십시오. (모니터로 확인)', style: 'pa', url: vAtDoor },
  'carpanel': { say: '이 엘리베이터는, 원하시는 층으로 가지 않습니다.', rate: '-12%', pitch: '-5Hz',
    text: '버튼이 고장나 있다. — 이 엘리베이터는, 원하시는 층으로 가지 않습니다.', style: 'close', url: vCarPanel },
  'key-intro': { say: '옥상 문은 잠겨 있습니다. 열쇠는 맨 위층들의 비상실, 혹은 엘리베이터 안에 있습니다.', rate: '-12%', pitch: '-5Hz',
    text: '옥상 문은 잠겨 있습니다. 열쇠는 맨 위층들(25~30층)의 비상실, 혹은 엘리베이터 안에 있습니다.', style: 'pa', chime: true, url: vKey },
  'win': { say: '피구공아파트 비상계단을 이용해 주셔서 감사합니다.', rate: '-10%', pitch: '-2Hz', style: 'pa', chime: true, url: vWin },
};

export function voiceText(id, floors) {
  const v = VOICE[id];
  return (v.text || v.say).replace('{F}', String(floors));
}
