"""트레일러 사운드트랙 합성: python3 tools/trailer/audio.py <프레임폴더>/events.json <출력.wav>

record.cjs 가 남긴 events.json(샷 전환·사운드 호출 시각)에 맞춰
드론, 오르골 모티프, 발소리, 엘리베이터, 스팅어, 추격 타악, 점프스케어, 로고 히트를 합성한다.
"""
import json
import sys

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
rng = np.random.default_rng(7)


def t_arr(dur):
    return np.arange(int(dur * SR)) / SR


def lp(x, f, order=2):
    return sosfilt(butter(order, f / (SR / 2), 'low', output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f / (SR / 2), 'high', output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos'), x)


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def env_exp(dur, decay, attack=0.002):
    t = t_arr(dur)
    e = np.exp(-t / decay)
    a = np.minimum(1, t / max(attack, 1e-4))
    return e * a


def reverb_ir(dur=2.8, decay=0.9, bright=4000):
    n = noise(dur)
    n = lp(n, bright)
    t = t_arr(dur)
    ir = n * np.exp(-t / decay)
    ir[0] = 1.0
    return ir / np.max(np.abs(ir))


class Mix:
    def __init__(self, dur):
        self.n = int(dur * SR)
        self.dry = np.zeros((2, self.n))
        self.wet = np.zeros((2, self.n))

    def add(self, t, sig, gain=1.0, pan=0.0, rev=0.25):
        i = int(t * SR)
        if i >= self.n or i + len(sig) <= 0:
            return
        if i < 0:
            sig = sig[-i:]
            i = 0
        sig = sig[: self.n - i]
        lg, rg = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        for ch, g in ((0, lg), (1, rg)):
            self.dry[ch, i:i + len(sig)] += sig * gain * g * (1 - rev * 0.5)
            self.wet[ch, i:i + len(sig)] += sig * gain * g * rev

    def render(self):
        ir = reverb_ir()
        irR = np.roll(ir, 37)
        wl = fftconvolve(self.wet[0], ir)[: self.n]
        wr = fftconvolve(self.wet[1], irR)[: self.n]
        out = self.dry + np.stack([wl, wr]) * 0.22
        # 큰 타격음 기준으로 레벨을 맞추고(99.98 백분위), 넘치는 순간만 부드럽게 눌러 준다
        ref = np.percentile(np.abs(out), 99.98)
        out = out / ref * 0.8
        over = np.abs(out) > 0.8
        out[over] = np.sign(out[over]) * (0.8 + 0.18 * np.tanh((np.abs(out[over]) - 0.8) / 0.18))
        return out


# ---------------------------------------------------------------- 음원
def step(kind='walk'):
    heavy = {'run': 1.0, 'walk': 0.6, 'sneak': 0.25}.get(kind, 0.6)
    d = 0.28
    t = t_arr(d)
    thump = np.sin(2 * np.pi * (70 + 40 * np.exp(-t / 0.02)) * t) * env_exp(d, 0.045 + 0.03 * heavy)
    grit = bp(noise(d), 300, 2500) * env_exp(d, 0.018)
    heel = hp(noise(d), 2000) * env_exp(d, 0.006) * 0.3
    return (thump * (0.9 + heavy) + grit * 0.5 + heel) * (0.35 + 0.65 * heavy)


def bell(f, d=2.4, gain=1.0):
    t = t_arr(d)
    partials = [(1, 1), (2.76, 0.4), (5.4, 0.18), (8.9, 0.07)]
    s = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / (d * 0.35 / m ** 0.5)) for m, a in partials)
    return s * np.minimum(1, t / 0.003) * gain


def musicbox(f, d=2.6):
    t = t_arr(d)
    det = np.sin(2 * np.pi * f * t) + 0.6 * np.sin(2 * np.pi * f * 1.004 * t) + 0.25 * np.sin(2 * np.pi * f * 2.001 * t) * np.exp(-t / 0.3)
    return det * np.exp(-t / 0.9) * np.minimum(1, t / 0.004)


def ding():
    a = bell(1318.5, 2.6) * 0.5
    b = np.concatenate([np.zeros(int(0.42 * SR)), bell(1046.5, 2.2) * 0.5])
    a = np.pad(a, (0, max(0, len(b) - len(a))))
    return a[: len(b)] + b


def door_slide(d=1.1):
    t = t_arr(d)
    sweep = bp(noise(d), 180, 1400) * np.sin(np.pi * np.minimum(1, t / d)) ** 2
    rumble = np.sin(2 * np.pi * 55 * t) * 0.3 * np.sin(np.pi * t / d)
    clunk = np.zeros_like(t)
    k = int((d - 0.12) * SR)
    c = step('run')[: len(t) - k] * 0.5
    clunk[k:k + len(c)] = c
    return sweep * 0.5 + rumble + clunk


def sting(d=2.4):
    t = t_arr(d)
    freqs = [196, 207.7, 293.7, 311.1, 415.3, 622.3]
    s = sum(np.sign(np.sin(2 * np.pi * f * t * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)))) * 0.5 + np.sin(2 * np.pi * f * t) for f in freqs)
    s = lp(s, 3500) * env_exp(d, 0.7, 0.01)
    scrape = bp(noise(d), 1500, 6000) * env_exp(d, 0.35, 0.005) * 2.0
    return (s / len(freqs) * 2.2 + scrape) * 0.8


def boom(d=4.0, f0=62):
    t = t_arr(d)
    ph = 2 * np.pi * np.cumsum(f0 * 0.55 + f0 * 0.45 * np.exp(-t / 0.25)) / SR
    sub = np.sin(ph) * env_exp(d, 1.3, 0.004)
    crack = lp(noise(d), 1800) * env_exp(d, 0.09) * 1.4
    return sub * 1.6 + crack


def riser(d=2.0):
    t = t_arr(d)
    x = noise(d)
    out = np.zeros_like(x)
    seg = int(0.05 * SR)
    for i in range(0, len(x), seg):
        f = 300 + 7000 * (i / len(x)) ** 2
        out[i:i + seg] = bp(x[i:i + seg], f * 0.7, min(SR / 2 - 100, f * 1.3), 1)
    tone = np.sin(2 * np.pi * np.cumsum(110 + 330 * (t / d) ** 2) / SR) * 0.3
    return (out + tone) * (t / d) ** 2.2


def laugh():
    # 낮게 끊기는 웃음: 성문 펄스 + 모음 공명
    parts = []
    for i, f0 in enumerate([150, 142, 136, 128, 121, 112]):
        d = 0.16
        t = t_arr(d)
        pulse = (np.sin(2 * np.pi * f0 * t) > 0.92).astype(float)
        v = bp(pulse, 500, 900) * 2 + bp(pulse, 1000, 1400) + bp(noise(d) * 0.05, 2000, 4000)
        parts.append(v * np.sin(np.pi * t / d) ** 1.5)
        parts.append(np.zeros(int(0.06 * SR)))
    return np.concatenate(parts) * 3.0


def rattle():
    out = np.zeros(int(0.7 * SR))
    for k, tt in enumerate([0, 0.09, 0.17, 0.31, 0.4, 0.52]):
        d = 0.15
        h = bp(noise(d), 350, 900) * env_exp(d, 0.025) * 1.6 + bp(noise(d), 1800, 4200) * env_exp(d, 0.01) * 0.6
        i = int(tt * SR)
        out[i:i + len(h)] += h[: len(out) - i] * (1 - 0.08 * k)
    return out


def click():
    d = 0.03
    return hp(noise(d), 1500) * env_exp(d, 0.003) * 0.6


def glitch(d=0.25):
    x = noise(d)
    x = np.round(x * 3) / 3
    hold = 24
    x = np.repeat(x[::hold], hold)[: int(d * SR)]
    return bp(x, 400, 7000) * env_exp(d, 0.08, 0.001) * 0.7


def fall():
    d = 1.4
    out = np.zeros(int(d * SR))
    for tt, g in [(0, 1.3), (0.13, 0.9), (0.33, 0.5)]:
        h = step('run') * g
        i = int(tt * SR)
        out[i:i + len(h)] += h[: len(out) - i]
    scrape = bp(noise(0.6), 800, 3000) * env_exp(0.6, 0.2) * 0.5
    i = int(0.2 * SR)
    out[i:i + len(scrape)] += scrape
    return out


def heartbeat(bpm):
    d = 60 / bpm
    out = np.zeros(int(d * SR))
    for tt, g in [(0, 1.0), (0.22, 0.7)]:
        dd = 0.25
        t = t_arr(dd)
        h = np.sin(2 * np.pi * (48 + 20 * np.exp(-t / 0.03)) * t) * env_exp(dd, 0.07, 0.006) * g
        i = int(tt * SR)
        out[i:i + len(h)] += h[: len(out) - i]
    return out


def taiko():
    d = 0.6
    t = t_arr(d)
    body = np.sin(2 * np.pi * (58 + 50 * np.exp(-t / 0.04)) * t) * env_exp(d, 0.18, 0.002)
    skin = lp(noise(d), 1200) * env_exp(d, 0.03) * 0.8
    return body * 1.4 + skin


def jumpscare(d=1.6):
    t = t_arr(d)
    scream_f = 900 + 600 * np.sin(2 * np.pi * 7 * t) * 0.1 + 400 * np.exp(-t / 0.4)
    saw = 2 * ((np.cumsum(scream_f) / SR) % 1) - 1
    scream = (bp(saw, 700, 1300) * 2 + bp(saw, 2200, 3200)) * env_exp(d, 0.55, 0.003)
    hit = boom(d, 50)[: len(t)]
    crush = np.tanh(bp(noise(d), 200, 6000) * 4) * env_exp(d, 0.35, 0.001) * 0.6
    return scream * 1.2 + hit + crush + sting(d)[: len(t)] * 0.7


def hum(d, f=50):
    t = t_arr(d)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) + 0.2 * np.sin(2 * np.pi * 3 * f * t)) * 0.4 + lp(noise(d), 200) * 0.5


def static(d):
    return bp(noise(d), 2500, 9000) * 0.25 + hum(d, 60) * 0.15


def drone(d):
    t = t_arr(d)
    base = 0
    for f, a in [(41.2, 1.0), (61.7, 0.55), (82.4, 0.4), (87.3, 0.18)]:
        base = base + a * np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 0.07 * t * f / 41))
    air = bp(noise(d), 150, 700) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t)) * 0.6
    return base * 0.35 + air * 0.4


# ---------------------------------------------------------------- 타임라인
def main():
    data = json.load(open(sys.argv[1]))
    out_path = sys.argv[2]
    fps = data['fps']
    dur = data['frames'] / fps
    evs = data['events']
    marks = data['marks']
    shots = {e['name']: e['t'] for e in evs if e['type'] == 'shot'}
    order = [e['name'] for e in evs if e['type'] == 'shot']
    ends = {n: (shots[order[i + 1]] if i + 1 < len(order) else dur) for i, n in enumerate(order)}
    m = Mix(dur + 0.5)

    # 바탕 드론: 샷마다 세기 조절
    dr = drone(dur + 0.5)
    level = np.zeros_like(dr)
    lv = {'coldopen': 0.0, 'title': 0.5, 'climb': 0.6, 'well': 0.85, 'elevator': 0.5, 'descend': 0.35, 'card1': 0.45,
          'cctv': 0.6, 'grid': 0.8, 'card2': 0.9, 'chase': 1.1, 'flash': 1.0, 'card3': 0.0, 'trap': 0.35, 'logo': 0.9}
    for n in order:
        a, b = int(shots[n] * SR), int(ends[n] * SR)
        level[a:b] = lv.get(n, 0.5)
    k = np.ones(int(0.4 * SR)) / int(0.4 * SR)
    level = fftconvolve(level, k, mode='same')
    m.add(0, dr * level, 0.32, rev=0.3)

    # 콜드 오프닝: 잡음 → 한 순간의 얼굴 → 정적
    if 'coldflash' in marks:
        cf = marks['coldflash']
        m.add(0, static(cf), 0.5, rev=0.05)
        m.add(cf - 0.01, sting(1.8), 0.7, rev=0.4)
        m.add(cf - 0.01, boom(3.0, 48), 0.8, rev=0.5)
        m.add(cf, glitch(0.3), 0.8)
    # 막 사이 카드: 초침 · 숨
    if 'card1' in shots:
        c1 = shots['card1']
        for i in range(4):
            m.add(c1 + 0.1 + i * 0.45, click(), 0.6, pan=(-0.3 if i % 2 else 0.3), rev=0.3)
        m.add(c1 + 0.05, heartbeat(60), 1.0, rev=0.1)
    if 'card2' in shots:
        m.add(shots['card2'] + 0.2, bp(noise(0.9), 300, 2500) * env_exp(0.9, 0.4, 0.3), 0.25, rev=0.2)  # 숨 들이켬
        m.add(shots['chase'] - 0.02, boom(3.0, 52), 0.9, rev=0.4)
    if 'flash' in marks:
        m.add(marks['flash'] - 0.01, sting(1.6), 0.8, rev=0.3)
        m.add(marks['flash'] - 0.01, boom(2.0, 40), 0.7, rev=0.3)
        m.add(marks['flash'], glitch(0.4), 0.9)

    # 오르골 모티프 (도입부 · 로고)
    motif = [659.3, 493.9, 523.3, 440.0, 392.0, 440.0, 329.6]
    t0 = shots['title'] + 0.6
    for i, f in enumerate(motif):
        m.add(t0 + i * 1.25, musicbox(f), 0.16, pan=(-0.3 if i % 2 else 0.3), rev=0.7)
    # 계단 오를 때 한 번 더 (한 옥타브 아래, 느리게)
    for i, f in enumerate(motif[:4]):
        m.add(shots['climb'] + 0.3 + i * 1.2, musicbox(f / 2), 0.12, rev=0.7)

    # 게임 내 사운드 이벤트
    for e in evs:
        t, ty = e['t'], e['type']
        if ty == 'footstep':
            kind = e.get('kind') or 'walk'
            m.add(t, step(kind), 0.6 if kind == 'run' else 0.45, pan=rng.uniform(-0.15, 0.15), rev=0.18)
        elif ty == 'ding':
            m.add(t, ding(), 0.32, pan=0.2, rev=0.5)
            m.add(t + 0.2, door_slide(), 0.35, rev=0.3)
        elif ty == 'doorSlide':
            m.add(t, door_slide(), 0.35, rev=0.3)
        elif ty == 'sting':
            m.add(t, sting(), 0.55, rev=0.4)
        elif ty == 'laughAt':
            m.add(t + 0.15, laugh(), 0.3, rev=0.55)
        elif ty == 'rattle':
            m.add(t, rattle(), 0.6, pan=-0.2, rev=0.35)
        elif ty == 'torchClick':
            m.add(t, click(), 0.5, rev=0.1)
        elif ty == 'click':
            # 송신이 가까울 때 게임이 내는 잡음 딱딱거림
            m.add(t, click(), 0.07, pan=rng.uniform(-0.6, 0.6), rev=0.1)
        elif ty == 'glitch':
            m.add(t, glitch(), 0.4, rev=0.1)
        elif ty == 'fall':
            m.add(t, fall(), 0.8, rev=0.25)

    # 장면별 연출음
    if 'stalkerOut' in marks:
        m.add(marks['stalkerOut'] - 0.05, boom(4.5), 0.75, rev=0.5)
        m.add(marks['stalkerOut'] - 0.02, glitch(0.4), 0.6)
    el_t = shots['elevator']
    m.add(el_t, hum(2.6), 0.4, rev=0.2)
    # 웅크린 장면: 심장 박동이 빨라진다
    tt, bpm = shots['descend'], 64
    while tt < ends['descend'] - 0.2:
        hb = heartbeat(bpm)
        m.add(tt, hb, 1.1, rev=0.1)
        tt += 60 / bpm
        bpm = min(130, bpm + 7)
    # CCTV: 잡음
    m.add(shots['cctv'], static(ends['grid'] - shots['cctv']), 0.3, rev=0.05)
    m.add(shots['cctv'], glitch(0.3), 0.5)
    m.add(shots['grid'], glitch(0.3), 0.6)
    m.add(shots['chase'] - 2.6, riser(2.6), 0.45, rev=0.3)
    # 추격: 타악 (150 → 176bpm 으로 빨라짐)
    tt = shots['chase']
    i = 0
    while tt < ends['chase'] - 0.1:
        beat = 60 / (150 + 26 * (tt - shots['chase']) / max(0.1, ends['chase'] - shots['chase']))
        m.add(tt, taiko(), 0.55 if i % 4 == 0 else 0.38, pan=(0.25 if i % 2 else -0.25), rev=0.25)
        if i % 2 == 1:
            m.add(tt + beat / 2, taiko(), 0.22, rev=0.2)
        tt += beat
        i += 1
    # 엘리베이터 함정: 탑승 → 운행 소음 → 정적 → 점프스케어
    if 'ride' in marks:
        reveal = marks.get('reveal', marks['ride'] + 3)
        m.add(marks['ride'], hum(max(0.5, reveal - marks['ride'])), 0.3, rev=0.15)
    if 'die' in marks:
        m.add(marks['die'] - 0.02, jumpscare(), 0.95, rev=0.35)
    # 로고
    if 'logo' in marks:
        m.add(marks['logo'] - 1.6, riser(1.6), 0.3, rev=0.3)
        m.add(marks['logo'], boom(6.0, 40), 0.9, rev=0.6)
        m.add(marks['logo'] + 0.1, sting(3.0), 0.25, rev=0.7)
        for i, f in enumerate([329.6, 311.1, 293.7]):
            m.add(marks['logo'] + 2.0 + i * 1.1, musicbox(f), 0.14, rev=0.8)
    if 'cta' in marks:
        m.add(marks['cta'], bell(220, 4.0), 0.25, rev=0.7)

    out = m.render()
    # 마지막 페이드
    fade = int(1.0 * SR)
    out[:, -fade:] *= np.linspace(1, 0, fade)
    pcm = (out.T * 32767).astype(np.int16)
    import wave
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print('wrote', out_path, f'{dur:.1f}s')


if __name__ == '__main__':
    main()
