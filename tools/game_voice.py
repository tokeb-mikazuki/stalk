"""게임 안내 방송 음성 생성: TTS_CA=<CA 번들> python3 tools/game_voice.py [id ...]  (id 를 주면 그것만 다시 만든다)
트레일러와 같은 신경망 음성(ko-KR-SunHiNeural)으로 src/voice.js 의 안내 문구를 읽어
assets/voice/*.mp3 (모노 24kHz, 작은 용량)로 저장한다. 네트워크가 필요하다.
"""
import asyncio
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'trailer'))
import tts  # noqa: E402  (CA 번들 패치 + edge_tts)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src', 'voice.js')
OUT = os.path.join(ROOT, 'assets', 'voice')


def lines():
    """src/voice.js 의 `id: { say: '...', rate: '..', pitch: '..' }` 를 읽는다"""
    text = open(SRC, encoding='utf8').read()
    for m in re.finditer(r"'([\w-]+)':\s*\{\s*say:\s*'([^']+)',\s*rate:\s*'([^']+)',\s*pitch:\s*'([^']+)'", text):
        yield m.group(1), m.group(2), m.group(3), m.group(4)


async def main():
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    for vid, say, rate, pitch in lines():
        if only and vid not in only:
            continue
        tmp = os.path.join(OUT, f'{vid}.tmp.mp3')
        await tts.edge_tts.Communicate(say, tts.VOICE, rate=rate, pitch=pitch).save(tmp)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', '24000', '-b:a', '40k',
                        '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',
                        os.path.join(OUT, f'{vid}.mp3')], check=True)
        os.remove(tmp)
        print(vid, say)


asyncio.run(main())
