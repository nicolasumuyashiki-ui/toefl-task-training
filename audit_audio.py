#!/usr/bin/env python3
"""
audit_audio.py — TCK Workshop / TOEFL Reps 音源ポーズ検証
docs/audio-pause-spec.md の基準に照らして全 MP3 を監査する。

基準:
  - 250 ms 未満のポーズ → NG（食い気味）
  - 1500 ms 超のポーズ  → NG（間延び）

使い方:
  python3 audit_audio.py                 # audio/ 配下を全走査
  python3 audit_audio.py audio/lcr/      # 指定ディレクトリのみ
"""

import sys
import os
import json

FLOOR_MS  = 250   # NG if pause shorter than this
CEIL_MS   = 1500  # NG if pause longer than this

def find_mp3s(root: str):
    for dirpath, _, files in os.walk(root):
        for f in files:
            if f.lower().endswith('.mp3'):
                yield os.path.join(dirpath, f)

def get_silences(path: str):
    """Return list of (start_ms, end_ms) silence intervals using ffmpeg."""
    import subprocess, re
    cmd = [
        'ffmpeg', '-i', path,
        '-af', f'silencedetect=noise=-40dB:duration=0.1',
        '-f', 'null', '-'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    output = result.stderr

    silences = []
    starts = [float(m) * 1000 for m in re.findall(r'silence_start: ([0-9.]+)', output)]
    ends   = [float(m) * 1000 for m in re.findall(r'silence_end: ([0-9.]+)', output)]
    for s, e in zip(starts, ends):
        silences.append((s, e, e - s))
    return silences

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else 'audio'
    if not os.path.exists(root):
        print(f"[audit_audio] Directory not found: {root}")
        sys.exit(1)

    try:
        import subprocess
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
    except Exception:
        print("[audit_audio] ERROR: ffmpeg not found. Install ffmpeg to run this script.")
        sys.exit(1)

    issues = []
    total  = 0

    for path in find_mp3s(root):
        total += 1
        silences = get_silences(path)
        for start, end, dur in silences:
            if dur < FLOOR_MS:
                issues.append({'file': path, 'start_ms': round(start), 'end_ms': round(end),
                                'dur_ms': round(dur), 'type': 'TOO_SHORT'})
            elif dur > CEIL_MS:
                issues.append({'file': path, 'start_ms': round(start), 'end_ms': round(end),
                                'dur_ms': round(dur), 'type': 'TOO_LONG'})

    print(f"\n=== audit_audio.py results ===")
    print(f"Files scanned : {total}")
    print(f"Issues found  : {len(issues)}")

    if issues:
        print("\n--- Issues ---")
        for iss in issues:
            tag = '❌ SHORT' if iss['type'] == 'TOO_SHORT' else '⚠️  LONG '
            print(f"{tag}  {iss['dur_ms']:5d} ms  [{iss['start_ms']}–{iss['end_ms']}]  {iss['file']}")
        print("\nRun  python3 normalize_audio.py  to auto-fix.")
        sys.exit(1)
    else:
        print("✅ All pauses within spec (250 ms – 1500 ms).")
        sys.exit(0)

if __name__ == '__main__':
    main()
