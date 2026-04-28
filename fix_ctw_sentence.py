"""
Two fixes:

A. CTW spacing — bump margin between the visible hint prefix (.sh) and
   the input boxes, and between consecutive word-blanks. Currently the
   prefix sits flush against the first box ("am◆◆don't") which makes
   it hard to tell where the typed-letter target starts. Adds inline
   CSS overrides to all 20 set files.

B. Build a Sentence — strip terminal punctuation (".", "!", "?") from
   the last blank piece in every question and move it into fixedEnd.
   A piece carrying ".", "!", or "?" is an instant tell that it must
   be the last piece, defeating the puzzle.
"""

import re, json, glob, os
os.chdir(r'C:\Users\umuyashikin\toefl-task-training')

# --------------------------------------------------------------
# A. CTW spacing
# --------------------------------------------------------------
ctw_old_css = '.passage{font-size:.95em;line-height:2.2;color:#0F1511}.word-blank{display:inline-block;white-space:nowrap}.sh{font-size:.95em}'
ctw_new_css = '.passage{font-size:.95em;line-height:2.2;color:#0F1511}.word-blank{display:inline-block;white-space:nowrap;margin-right:.45em}.sh{font-size:.95em;margin-right:.22em}'

ctw_files = sorted(glob.glob('reading/ctw/practice-*-set-*.html'))
ctw_fixed = 0
for fp in ctw_files:
    with open(fp, 'r', encoding='utf-8') as f: s = f.read()
    if ctw_old_css in s:
        s = s.replace(ctw_old_css, ctw_new_css)
        with open(fp, 'w', encoding='utf-8') as f: f.write(s)
        ctw_fixed += 1
print(f"[A] CTW spacing fix: {ctw_fixed}/{len(ctw_files)} files")

# --------------------------------------------------------------
# B. Sentence — strip terminal punctuation from word-bank pieces
# --------------------------------------------------------------
def fix_sentence_questions(text):
    """Find the `const questions=[...]` literal and rewrite it so no
    blank piece ends with .!?. Terminal punctuation moves to
    `fixedEnd` (preserving any existing fixedEnd content)."""
    m = re.search(r'(const questions\s*=\s*)(\[.*?\])(;\s*)', text, re.DOTALL)
    if not m:
        return text, 0
    prefix, arr_text, suffix = m.group(1), m.group(2), m.group(3)
    arr = json.loads(arr_text)
    rewrites = 0
    for q in arr:
        for key in ('blanks', 'answer'):
            pieces = q.get(key)
            if not pieces or not isinstance(pieces, list): continue
            last = pieces[-1]
            if not isinstance(last, str): continue
            stripped = last.rstrip()
            tail = ''
            for punct in ('.', '!', '?'):
                if stripped.endswith(punct):
                    tail = punct
                    stripped = stripped[:-1].rstrip()
                    break
            if not tail: continue
            # Move tail into fixedEnd
            old_fe = q.get('fixedEnd', '') or ''
            q['fixedEnd'] = (tail + (' ' + old_fe if old_fe else '')).strip()
            # If after stripping the piece is empty, drop it
            if stripped:
                pieces[-1] = stripped
            else:
                pieces.pop()
            rewrites += 1
        # Same for altAnswers (each is its own list)
        alts = q.get('altAnswers')
        if isinstance(alts, list):
            for alt in alts:
                if not isinstance(alt, list) or not alt: continue
                last = alt[-1]
                if not isinstance(last, str): continue
                stripped = last.rstrip()
                for punct in ('.', '!', '?'):
                    if stripped.endswith(punct):
                        stripped = stripped[:-1].rstrip()
                        if stripped:
                            alt[-1] = stripped
                        else:
                            alt.pop()
                        break
    new_arr_text = json.dumps(arr, ensure_ascii=False, separators=(',', ':'))
    return text.replace(prefix + arr_text + suffix, prefix + new_arr_text + suffix), rewrites

sent_files = sorted(glob.glob('writing/sentence/practice-*.html'))
sent_files = [f for f in sent_files if 'answers' not in f]
sent_changes = 0
for fp in sent_files:
    with open(fp, 'r', encoding='utf-8') as f: s = f.read()
    new, n = fix_sentence_questions(s)
    if n:
        with open(fp, 'w', encoding='utf-8') as f: f.write(new)
        sent_changes += n
        print(f"  {fp}: {n} blanks de-punctuated")
print(f"[B] Sentence punctuation strip: {sent_changes} blanks across {len(sent_files)} files")
