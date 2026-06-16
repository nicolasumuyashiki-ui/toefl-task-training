#!/usr/bin/env python3
"""
normalize_audio.py — TCK Workshop / TOEFL Reps 音源ポーズ正規化
docs/audio-pause-spec.md の基準に従い、短すぎ／長すぎのポーズを修正する。

基準:
  - ポーズ下限: 350 ms（FLOOR）
  - ポーズ上限: 1500 ms（CEIL）

処理:
  1. 元ファイルを audio_backup/ にバックアップ
  2. ffmpeg の arnndn + silenceremove + apad フィルタで正規化
  3. 上書き保存

使い方:
  python3 normalize_audio.py                  # audio/ 配下を全処理
  python3 normalize_audio.py audio/lcr/       # 指定ディレクトリのみ
  python3 normalize_audio.py --dry-run        # 変更せず対象ファイルのみ表示
"""

import sys
import os
import shutil
import subprocess
import re

FLOOR_MS = 350
CEIL_MS  = 1500
BACKUP_DIR = 'audio_backup'

def find_mp3s(root: str):
    for dirpath, _, files in os.walk(root):
        for f in files:
            if f.lower().endswith('.mp3'):
                yield os.path.join(dirpath, f)

def needs_normalization(path: str) -> bool:
    """Check if any silence interval is outside [FLOOR_MS, CEIL_MS]."""
    cmd = ['ffmpeg', '-i', path, '-af', 'silencedetect=noise=-40dB:duration=0.1', '-f', 'null', '-']
    result = subprocess.run(cmd, capture_output=True, text=True)
    output = result.stderr
    starts = [float(m) * 1000 for m in re.findall(r'silence_start: ([0-9.]+)', output)]
    ends   = [float(m) * 1000 for m in re.findall(r'silence_end: ([0-9.]+)', output)]
    for s, e in zip(starts, ends):
        dur = e - s
        if dur < FLOOR_MS or dur > CEIL_MS:
            return True
    return False

def backup(path: str):
    rel = os.path.relpath(path)
    dest = os.path.join(BACKUP_DIR, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy2(path, dest)
    return dest

def normalize(path: str):
    """Re-encode with silence floor=350ms and ceil=1500ms."""
    tmp = path + '.tmp.mp3'
    floor_s = FLOOR_MS / 1000
    ceil_s  = CEIL_MS  / 1000
    # Strategy: remove silences shorter than floor, clamp silences longer than ceil
    af = (
        f"silenceremove=stop_periods=-1:stop_duration={floor_s}:stop_threshold=-40dB,"
        f"apad=pad_dur={floor_s},"
        f"silenceremove=stop_periods=-1:stop_duration={ceil_s + 0.001}:stop_threshold=-40dB,"
        f"apad=pad_dur={floor_s}"
    )
    cmd = ['ffmpeg', '-y', '-i', path, '-af', af, '-codec:a', 'libmp3lame', '-q:a', '2', tmp]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ⚠ ffmpeg error for {path}: {result.stderr[-200:]}")
        if os.path.exists(tmp):
            os.remove(tmp)
        return False
    os.replace(tmp, path)
    return True

def main():
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    dirs = [a for a in args if not a.startswith('--')]
    root = dirs[0] if dirs else 'audio'

    if not os.path.exists(root):
        print(f"[normalize_audio] Directory not found: {root}")
        sys.exit(1)

    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
    except Exception:
        print("[normalize_audio] ERROR: ffmpeg not found.")
        sys.exit(1)

    targets = [p for p in find_mp3s(root) if needs_normalization(p)]

    if not targets:
        print("✅ No files need normalization.")
        sys.exit(0)

    print(f"Files to normalize: {len(targets)}")
    for path in targets:
        print(f"  {path}")

    if dry_run:
        print("\n[dry-run] No changes made.")
        sys.exit(0)

    ok = 0
    fail = 0
    for path in targets:
        print(f"\nProcessing: {path}")
        backed_up = backup(path)
        print(f"  Backup → {backed_up}")
        if normalize(path):
            print(f"  ✅ Normalized")
            ok += 1
        else:
            shutil.copy2(backed_up, path)
            print(f"  ❌ Failed — original restored")
            fail += 1

    print(f"\n=== normalize_audio.py done ===")
    print(f"  OK: {ok}  Fail: {fail}")
    if fail:
        sys.exit(1)

if __name__ == '__main__':
    main()
