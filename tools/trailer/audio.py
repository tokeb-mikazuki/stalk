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
        if getattr(self, 'duck', None) is not None:
            out = out * self.duck
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


def pad(d):
    """평온한 장조 화음 (부드럽게 숨쉬듯)"""
    t = t_arr(d)
    s = 0
    for f in (261.6, 329.6, 392.0, 523.3):
        s = s + np.sin(2 * np.pi * f * t + 0.5 * np.sin(2 * np.pi * 0.2 * t)) + 0.3 * np.sin(2 * np.pi * f * 2.003 * t)
    return lp(s, 1800) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.09 * t)) * 0.12


def buzz(d=0.18):
    """형광등이 떨릴 때의 전기 소리"""
    t = t_arr(d)
    b = np.sign(np.sin(2 * np.pi * 120 * t)) * 0.4 + bp(noise(d), 2000, 6000) * 0.5
    return b * env_exp(d, 0.08, 0.002)


def typekey():
    d = 0.05
    return (bp(noise(d), 1500, 5000) * env_exp(d, 0.006) + np.sin(2 * np.pi * 180 * t_arr(d)) * env_exp(d, 0.01) * 0.3) * 0.8


def strings(d):
    """불협화 현악 트레몰로 — 점점 크게"""
    t = t_arr(d)
    s = 0
    for f in (220, 233.1, 311.1, 329.6, 466.2):
        saw = 2 * ((f * t * (1 + 0.003 * np.sin(2 * np.pi * 0.7 * t))) % 1) - 1
        s = s + saw
    trem = 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 11 * t))
    return lp(s, 3000) * trem * (t / d) ** 1.5 * 0.25


def load_wav(path):
    import subprocess
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def voice(vid, style):
    """안내 방송 음성. style: pa(건물 스피커) · warp(늘어짐) · crush(뭉개짐) · deep(낮게) · stutter(끊김) · close(귓가)"""
    import os
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voice', f'{vid}.mp3')
    if not os.path.exists(path):
        return None
    x = load_wav(path)
    x = x / (np.max(np.abs(x)) + 1e-9)
    if style in ('pa', 'warp', 'crush', 'stutter', 'deep'):
        x = bp(x, 320, 3400, 2) * 1.6  # 천장 스피커
    if style == 'warp':  # 테이프가 늘어지듯 흔들림
        n = len(x)
        idx = np.arange(n) * (1 - 0.035 * (np.arange(n) / n)) + 300 * np.sin(2 * np.pi * 0.6 * np.arange(n) / SR)
        x = np.interp(np.clip(idx, 0, n - 1), np.arange(n), x)
    if style == 'crush':
        x = np.round(x * 10) / 10
        x = np.repeat(x[::4], 4)[: len(x)]
        x = x * (0.75 + 0.25 * np.sign(np.sin(2 * np.pi * 7 * np.arange(len(x)) / SR)))
    if style == 'deep':  # 낮고 느리게
        n = len(x)
        idx = np.arange(int(n * 1.18)) / 1.18
        x = np.interp(idx, np.arange(n), x)
        x = lp(x, 2400)
    if style == 'stutter':  # 몇 군데가 되감기듯 반복
        out, i, n = [], 0, len(x)
        while i < n:
            seg = int(rng.uniform(0.12, 0.3) * SR)
            chunk = x[i:i + seg]
            out.append(chunk)
            if rng.random() < 0.3:
                out.append(chunk[: int(len(chunk) * 0.5)] * 0.9)
            if rng.random() < 0.15:
                out.append(np.zeros(int(0.06 * SR)))
            i += seg
        x = np.concatenate(out)
        x = np.tanh(x * 2.2) / 1.6
    if style == 'close':  # 귓가에서 속삭이듯 (건조하고 가까이)
        x = lp(x, 6000) * 1.1
    return x


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

    def S(name, default=None):
        return shots.get(name, default)

    def E(name):
        return ends.get(name, dur)

    # ---- 바탕: 평온한 패드 → 불길한 드론 (긴장도 곡선) ----
    tension = {'title': 0.0, 'climb': 0.05, 'well': 0.1, 'elevEmpty': 0.12, 'glimpse': 0.35, 'elevator': 0.5,
               'descend': 0.6, 'card1': 0.55, 'cctv': 0.7, 'grid': 0.8, 'card2': 0.85, 'chase': 1.0, 'flash': 1.0,
               'card3': 0.0, 'trap': 0.45, 'logo': 0.7}
    curve = np.zeros(m.n)
    for n in order:
        a, b = int(shots[n] * SR), int(ends[n] * SR)
        curve[a:b] = tension.get(n, 0.5)
    k = np.ones(int(1.2 * SR)) / int(1.2 * SR)
    curve = np.clip(fftconvolve(curve, k, mode='same'), 0, 1)
    dr = drone(dur + 0.5)[: m.n]
    m.add(0, dr * curve[: len(dr)] ** 1.3, 0.45, rev=0.3)
    calm = np.clip(1 - curve * 3, 0, 1)
    m.add(0, pad(dur + 0.5)[: m.n] * calm[: m.n], 0.22, rev=0.6)
    m.add(0, lp(noise(dur + 0.5), 500)[: m.n] * 0.08, 1.0, rev=0.2)  # 실내 공기

    # ---- 자장가 오르골: 평온하게 시작해 점점 늘어지고 어긋나다가, 그것이 보이는 순간 끊긴다 ----
    lull = [523.3, 659.3, 784.0, 659.3, 587.3, 698.5, 880.0, 784.0, 659.3, 523.3, 587.3, 493.9, 523.3]
    stop_at = marks.get('figSeen', S('elevator', dur))
    t, i = S('title', 0) + 0.8, 0
    while t < stop_at - 0.1:
        prog = np.clip((t - S('glimpse', t + 99)) / max(0.5, stop_at - S('glimpse', 0)), 0, 1) if 'glimpse' in shots else 0
        f = lull[i % len(lull)] * (1 - 0.06 * prog) * (1 + rng.normal(0, 0.004 * prog))
        m.add(t, musicbox(f), 0.13 * (1 - 0.4 * prog), pan=(-0.25 if i % 2 else 0.25), rev=0.65)
        t += 0.55 * (1 + 0.9 * prog)
        i += 1

    # ---- 게임 사운드 이벤트 ----
    for e in evs:
        t, ty = e['t'], e['type']
        if ty == 'footstep':
            kind = e.get('kind') or 'walk'
            m.add(t, step(kind), 0.6 if kind == 'run' else 0.42, pan=rng.uniform(-0.15, 0.15), rev=0.18)
        elif ty == 'farstep':
            m.add(t, lp(step('run'), 900), 0.55 * e.get('vol', 0.5) * 1.6, pan=0.2, rev=0.7)
        elif ty == 'ding':
            m.add(t, ding(), 0.3, pan=0.2, rev=0.5)
            m.add(t + 0.2, door_slide(), 0.32, rev=0.3)
        elif ty == 'doorSlide':
            m.add(t, door_slide(), 0.32, rev=0.3)
        elif ty == 'sting':
            m.add(t, sting(), 0.5, rev=0.4)
        elif ty == 'rattle':
            m.add(t, rattle(), 0.6, pan=-0.2, rev=0.35)
        elif ty == 'torchClick':
            m.add(t, click(), 0.6, rev=0.1)
        elif ty == 'click':
            m.add(t, click(), 0.06, pan=rng.uniform(-0.6, 0.6), rev=0.1)
        elif ty == 'flicker':
            m.add(t, buzz(), 0.35, rev=0.2)
        elif ty == 'lightsOut':
            m.add(t, buzz(0.35) * np.linspace(1, 0, int(0.35 * SR)), 0.5, rev=0.3)
        elif ty == 'type':
            m.add(t, typekey(), 0.16, pan=-0.3, rev=0.15)
        elif ty == 'fall':
            m.add(t, fall(), 0.8, rev=0.25)
        elif ty == 'glitch':
            m.add(t, glitch(), 0.35, rev=0.1)

    # ---- 장면별 ----
    if 'figSeen' in marks:  # 엘리베이터 안의 그것: 음악이 뚝 끊기고 낮은 타격
        m.add(marks['figSeen'], boom(4.0, 44), 0.55, rev=0.6)
        m.add(marks['figSeen'], sting(2.0), 0.25, rev=0.6)
    if 'descend' in shots:  # 심장 박동이 빨라진다
        tt, bpm = S('descend') + 0.3, 58
        while tt < (marks.get('descendHit', E('descend'))) - 0.2:
            m.add(tt, heartbeat(bpm), 1.0, rev=0.1)
            tt += 60 / bpm
            bpm = min(135, bpm + 8)
    if 'descendHit' in marks:
        m.add(marks['descendHit'], sting(2.2), 0.7, rev=0.4)
        m.add(marks['descendHit'], boom(3.0, 46), 0.7, rev=0.4)
        m.add(marks['descendHit'], glitch(0.4), 0.7)
    if 'card1' in shots:  # 초침
        for i in range(3):
            m.add(S('card1') + 0.05 + i * 0.3, click(), 0.55, rev=0.3)
    if 'cctv' in shots:
        m.add(S('cctv'), static(E('grid') - S('cctv')), 0.3, rev=0.05)
        m.add(S('cctv'), glitch(0.3), 0.5)
        # 낮은 맥박이 점점 빨라진다
        tt, bpm = S('cctv'), 90
        while tt < E('grid'):
            m.add(tt, heartbeat(bpm), 0.8, rev=0.1)
            tt += 60 / bpm
            bpm = min(150, bpm + 6)
    if 'grid' in shots:
        m.add(S('grid'), glitch(0.3), 0.6)
    if 'card2' in shots:  # 숨을 들이켜고 — 정적
        m.add(S('card2') - 1.6, riser(1.6), 0.3, rev=0.3)
        m.add(S('card2') + 0.1, bp(noise(0.9), 300, 2500) * env_exp(0.9, 0.4, 0.3), 0.22, rev=0.2)
        m.add(E('card2') - 2.4, riser(2.4), 0.45, rev=0.3)
    if 'chase' in shots:  # 혼돈: 가속하는 타악 + 불협 현악 + 서브리미널 타격
        c0, c1 = S('chase'), E('chase')
        m.add(c0 - 0.02, boom(3.0, 52), 0.9, rev=0.4)
        m.add(c0, strings(c1 - c0 + 0.6), 0.32, rev=0.4)
        tt, i = c0, 0
        while tt < c1 - 0.05:
            beat = 60 / (150 + 40 * (tt - c0) / max(0.1, c1 - c0))
            m.add(tt, taiko(), 0.55 if i % 4 == 0 else 0.38, pan=(0.25 if i % 2 else -0.25), rev=0.25)
            if i % 2 == 1:
                m.add(tt + beat / 2, taiko(), 0.24, rev=0.2)
            tt += beat
            i += 1
        for kname in ('sub1', 'sub2', 'sub3'):
            if kname in marks:
                m.add(marks[kname] - 0.01, sting(0.9), 0.6, rev=0.2)
                m.add(marks[kname], glitch(0.2), 0.7)
    if 'flash' in marks:
        m.add(marks['flash'] - 0.01, sting(1.4), 0.8, rev=0.3)
        m.add(marks['flash'] - 0.01, boom(2.0, 40), 0.7, rev=0.3)
        m.add(marks['flash'], glitch(0.4), 0.9)
    if 'ride' in marks:
        reveal = marks.get('reveal', marks['ride'] + 3)
        m.add(marks['ride'], hum(max(0.5, reveal - marks['ride'])), 0.3, rev=0.15)
    if 'die' in marks:
        m.add(marks['die'] - 0.02, jumpscare(), 0.95, rev=0.35)
    if 'logo' in marks:
        m.add(marks['logo'], boom(6.0, 40), 0.85, rev=0.6)
        m.add(marks['logo'] + 0.1, sting(3.0), 0.2, rev=0.7)
        for i, f in enumerate([523.3, 493.9, 466.2]):  # 자장가 첫 음이 늘어지며 반음씩 내려앉는다
            m.add(marks['logo'] + 1.2 + i * 1.3, musicbox(f), 0.12, rev=0.85)

    # ---- 안내 방송 (TTS): 깨끗한 방송 → 일그러짐 → 마지막엔 귀 바로 옆에서 ----
    vplan = [('v1', S('climb', -1) + 0.25, 'pa'), ('v2', marks.get('emptyOpen', -1) + 0.3, 'pa'),
             ('v3', S('glimpse', -1) + 0.15, 'warp'), ('v4', S('descend', -1) + 0.2, 'crush'),
             ('v5', S('card2', -1) + 0.15, 'deep'), ('v6', S('trap', -1) + 0.3, 'stutter'), ('v7', marks.get('cta', -1), 'close')]
    v_end = 0
    for vid, t, style in vplan:
        if t < 0:
            continue
        v = voice(vid, style)
        if v is not None:
            t = max(t, v_end + 0.35)  # 앞 방송과 겹치지 않게
            v_end = t + len(v) / SR
            m.add(t, v, 0.9 if style != 'close' else 0.75, rev={'pa': 0.45, 'warp': 0.5, 'crush': 0.35, 'deep': 0.55, 'stutter': 0.3, 'close': 0.08}[style])

    # 카드3: 완전한 정적 (모든 소리를 거의 0으로)
    duck = np.ones(m.n)
    if 'card3' in shots:
        a, b = int((S('card3') + 0.12) * SR), int(E('card3') * SR)
        f = int(0.08 * SR)
        duck[a:b] = 0.02
        duck[a - f:a] = np.linspace(1, 0.02, f)
        duck[b:b + f] = np.linspace(0.02, 1, f)
    m.duck = duck

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
