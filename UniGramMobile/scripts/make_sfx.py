"""
Synthesises UniGram's UI sound effects (assets/sounds/*.wav).

Design goals: very short, quiet, tonally consistent (all notes come from one
pentatonic palette), soft attack so nothing clicks, fast natural decay.
Run:  python scripts/make_sfx.py
"""
import math, os, random, struct, wave

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')
os.makedirs(OUT, exist_ok=True)
random.seed(7)

def env(i, n, attack=0.004, release_pow=3.2):
    t = i / SR
    a = min(1.0, t / attack) if attack > 0 else 1.0
    d = (1 - i / n) ** release_pow
    return a * d

def tone(freq, dur, vol=0.5, harmonics=((1, 1.0), (2, 0.28), (3, 0.1)), attack=0.004, release_pow=3.2, glide=None):
    n = int(SR * dur)
    out = []
    phase = 0.0
    for i in range(n):
        f = freq if glide is None else freq + (glide - freq) * (i / n)
        phase += 2 * math.pi * f / SR
        s = sum(w * math.sin(h * phase) for h, w in harmonics)
        out.append(s * env(i, n, attack, release_pow) * vol)
    return out

def mix(*tracks, length=None):
    n = max(len(t) for t in tracks) if length is None else length
    out = [0.0] * n
    for t in tracks:
        for i, s in enumerate(t):
            if i < n:
                out[i] += s
    return out

def delay(track, secs):
    return [0.0] * int(SR * secs) + track

def noise_burst(dur, vol=0.12, lp=0.25):
    n = int(SR * dur)
    y = 0.0
    out = []
    for i in range(n):
        y += lp * (random.uniform(-1, 1) - y)  # one-pole low-pass
        out.append(y * env(i, n, 0.002, 2.0) * vol)
    return out

def save(name, samples, peak=0.85):
    m = max(abs(s) for s in samples) or 1.0
    scale = min(1.0, peak / m)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s * scale)) * 32767)) for s in samples))
    print(name, f'{len(samples) / SR * 1000:.0f} ms')

# Pentatonic palette (Hz)
C5, D5, E5, G5, A5, C6, E6 = 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1318.5

# tap: a barely-there soft tick
save('tap', mix(tone(1900, 0.03, 0.35, ((1, 1.0), (2, 0.2)), 0.001, 4.5), noise_burst(0.02, 0.05)))
# pop: rounded bubble (like a bookmark / follow)
save('pop', tone(520, 0.11, 0.55, ((1, 1.0), (2, 0.15)), 0.003, 2.6, glide=900))
# like: bright two-note glass
save('like', mix(tone(E6 * 0.75, 0.16, 0.45), delay(tone(E6, 0.2, 0.45), 0.055)))
# send: soft upward whoosh + tick
save('send', mix(noise_burst(0.16, 0.14, 0.12), tone(700, 0.15, 0.4, ((1, 1.0), (2, 0.15)), 0.004, 2.4, glide=1250)))
# receive: gentle two-note down
save('receive', mix(tone(G5, 0.13, 0.4), delay(tone(E5, 0.18, 0.4), 0.075)))
# success: rising major arpeggio
save('success', mix(tone(C5, 0.2, 0.4), delay(tone(E5, 0.2, 0.4), 0.07), delay(tone(G5, 0.28, 0.45), 0.14), delay(tone(C6, 0.38, 0.4), 0.21)))
# error: two low soft pulses
save('error', mix(tone(196, 0.13, 0.55, ((1, 1.0), (2, 0.4), (3, 0.2)), 0.004, 2.2), delay(tone(165, 0.2, 0.55, ((1, 1.0), (2, 0.4), (3, 0.2)), 0.004, 2.2), 0.11)))
# refresh: a single soft pluck
save('refresh', tone(A5 * 0.8, 0.18, 0.45, ((1, 1.0), (2, 0.35), (4, 0.1)), 0.002, 3.6))
# notify: a small bell
save('notify', mix(tone(C6 * 1.5, 0.45, 0.4, ((1, 1.0), (2.76, 0.18), (5.4, 0.06)), 0.002, 2.8), delay(tone(C6 * 1.12, 0.5, 0.36, ((1, 1.0), (2.76, 0.18), (5.4, 0.06)), 0.002, 2.8), 0.12)))
