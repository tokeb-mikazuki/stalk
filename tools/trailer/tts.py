"""트레일러 안내 음성(TTS) 생성: python3 tools/trailer/tts.py
Microsoft Edge 신경망 음성(ko-KR-SunHiNeural)으로 건물 안내 방송 같은 수칙 낭독을 만든다.
결과(voice/*.mp3)는 저장소에 포함되어 있으므로 다시 만들 때만 실행하면 된다 (네트워크 필요).
"""
import asyncio
import os
import ssl

CA = os.environ.get('TTS_CA')  # 프록시 환경이면 CA 번들 경로
if CA:
    import certifi
    certifi.where = lambda: CA
    _orig = ssl.create_default_context

    def _ctx(*a, **k):
        k['cafile'] = CA
        k.pop('capath', None)
        k.pop('cadata', None)
        return _orig(*a, **k)
    ssl.create_default_context = _ctx

import edge_tts  # noqa: E402

VOICE = 'ko-KR-SunHiNeural'
LINES = {
    'v1': ('안내 말씀 드립니다. 비상계단은, 위로만 오르십시오.', '-10%', '-2Hz'),
    'v2': ('엘리베이터는, 현재 정상 운행 중입니다.', '-8%', '-2Hz'),
    'v3': ('계단에서 누군가와 마주치더라도, 인사하지 마십시오.', '-12%', '-4Hz'),
    'v4': ('그것과 눈이 마주치면, 불을 켜지 마십시오.', '-15%', '-6Hz'),
    'v5': ('뒤돌아보지, 마십시오.', '-25%', '-10Hz'),
    'v6': ('엘리베이터 문이 열리면, 눈을 감으십시오.', '-5%', '-4Hz'),
    'v7': ('끝까지, 오르십시오.', '-20%', '-2Hz'),
}


async def main():
    here = os.path.join(os.path.dirname(__file__), 'voice')
    os.makedirs(here, exist_ok=True)
    for k, (text, rate, pitch) in LINES.items():
        await edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch).save(os.path.join(here, f'{k}.mp3'))
        print(k, text)


asyncio.run(main())
