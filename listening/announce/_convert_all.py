"""
Convert all announce practice files from static format to kickstart interactive format.
Extracts content from current HTML, rebuilds with kickstart listening-announce structure.
"""
import re
from html import unescape

CORRECT_ANSWERS = {
    1: [1, 2, 0, 3],
    2: [1, 0, 3, 2],
    3: [1, 0, 3, 2],
    4: [0, 1, 2, 3],
    5: [0, 1, 2, 3],
    6: [1, 0, 2, 3],
    7: [1, 2, 3, 0],
    8: [1, 2, 0, 3],
    9: [1, 0, 3, 2],
    10: [1, 0, 3, 2],
}

def extract_announce_data(html, practice_num):
    """Extract announcements and questions from the static HTML."""
    anns = []

    # Split by announce-section divs
    parts = html.split('<div class="announce-section">')
    sections = parts[1:]  # skip first part (before any announce-section)

    for idx, section in enumerate(sections):
        ann = {'questions': []}

        # Split by q-block divs
        q_parts = section.split('<div class="q-block">')
        q_blocks = q_parts[1:]  # skip first part (announcement text)

        for qb in q_blocks:
            q = {}
            # Extract question text
            h4_match = re.search(r'<h4>(.*?)</h4>', qb)
            if h4_match:
                qtext = unescape(h4_match.group(1).strip())
                # Remove Q number prefix like "Q1. " or "Q3. "
                qtext = re.sub(r'^Q\d+\.\s*', '', qtext)
                q['text'] = qtext

            # Extract options
            opts = re.findall(r'<span class="opt-letter">[A-D]\)</span>\s*(.*?)(?:</div>)', qb)
            q['options'] = [unescape(o.strip()) for o in opts]

            if q.get('text') and len(q['options']) == 4:
                ann['questions'].append(q)

        anns.append(ann)

    # Map correct answers
    answers = CORRECT_ANSWERS[practice_num]
    q_idx = 0
    for ann in anns:
        for q in ann['questions']:
            if q_idx < len(answers):
                q['correct'] = answers[q_idx]
            q_idx += 1

    return anns


def build_kickstart_html(practice_num, anns):
    """Build the kickstart-format HTML."""

    total_questions = sum(len(a['questions']) for a in anns)
    pct_per_q = round(100 / total_questions)

    # Build questions JS array
    q_lines = []
    for ann_idx, ann in enumerate(anns):
        for q in ann['questions']:
            opts_js = ','.join([
                '"' + opt.replace('\\', '\\\\').replace('"', '\\"') + '"'
                for opt in q['options']
            ])
            q_lines.append(
                f'  {{ann:{ann_idx}, text:"{q["text"].replace(chr(92), chr(92)+chr(92)).replace(chr(34), chr(92)+chr(34))}",'
                f'\n   options:[{opts_js}],'
                f'\n   correct:{q["correct"]}}}'
            )

    questions_js = ',\n'.join(q_lines)
    null_list = ','.join(['null'] * total_questions)

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Listen to an Announcement \\u2014 Practice {practice_num}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box;}}
body{{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f0f2f5;min-height:100vh;display:flex;flex-direction:column;}}
.top-nav{{background:#2d3748;color:#fff;display:flex;justify-content:space-between;align-items:center;padding:10px 24px;font-size:14px;flex-shrink:0;}}
.nav-left{{display:flex;align-items:center;gap:12px;}}
.nav-left .section-label{{font-weight:700;font-size:15px;}}
.nav-left .divider{{color:#718096;}}
.nav-left .q-info{{color:#a0aec0;}}
.nav-right{{display:flex;align-items:center;gap:14px;}}
.timer{{font-family:'Courier New',monospace;font-size:15px;font-weight:700;min-width:40px;text-align:center;}}
.timer.warning{{color:#fc8181;animation:blink .5s infinite;}}
@keyframes blink{{0%,100%{{opacity:1;}}50%{{opacity:.3;}}}}
.user-badge{{width:28px;height:28px;border-radius:50%;background:#4a90d9;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#fff;}}
.progress-bar{{height:4px;background:#e2e8f0;flex-shrink:0;}}
.progress-fill{{height:100%;background:#4a90d9;transition:width .3s;}}
.start-overlay{{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:100;}}
.start-overlay.hidden{{display:none;}}
.start-card{{background:#fff;border-radius:16px;padding:48px;text-align:center;max-width:500px;box-shadow:0 8px 32px rgba(0,0,0,.2);}}
.start-card h2{{font-size:22px;color:#2d3748;margin-bottom:12px;}}
.start-card p{{color:#718096;font-size:14px;margin-bottom:24px;line-height:1.6;}}
.btn-start{{background:#4a90d9;color:#fff;border:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;}}
.btn-start:hover{{background:#3a7cc0;}}
.main-content{{flex:1;display:flex;flex-direction:column;overflow:hidden;}}
.audio-phase{{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;background:#fff;margin:16px 24px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);}}
.audio-phase img{{max-height:480px;width:auto;border-radius:10px;object-fit:contain;box-shadow:0 4px 12px rgba(0,0,0,.12);}}
.audio-status{{margin-top:20px;display:flex;align-items:center;gap:10px;font-size:15px;color:#4a90d9;font-weight:600;}}
.pulse{{width:10px;height:10px;border-radius:50%;background:#4a90d9;animation:pulse-a 1s infinite;}}
@keyframes pulse-a{{0%,100%{{opacity:1;transform:scale(1);}}50%{{opacity:.4;transform:scale(1.3);}}}}
.question-phase{{flex:1;display:none;margin:16px 24px;min-height:0;}}
.q-split{{display:flex;gap:0;flex:1;min-height:100%;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);overflow:hidden;}}
.q-left{{width:50%;display:flex;align-items:center;justify-content:center;padding:32px;background:#f7fafc;border-right:1px solid #e2e8f0;}}
.q-left img{{max-height:500px;max-width:100%;border-radius:10px;object-fit:contain;box-shadow:0 4px 12px rgba(0,0,0,.12);}}
.q-right{{width:50%;padding:32px 40px;display:flex;flex-direction:column;justify-content:center;}}
.q-label{{font-size:12px;color:#4a90d9;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;}}
.q-text{{font-size:17px;color:#2d3748;font-weight:600;margin-bottom:24px;line-height:1.5;}}
.options{{display:flex;flex-direction:column;gap:10px;}}
.option{{display:flex;align-items:center;gap:14px;padding:14px 18px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;transition:all .15s;font-size:14px;color:#4a5568;background:#fff;}}
.option:hover{{border-color:#4a90d9;background:#ebf4ff;}}
.option.selected{{border-color:#4a90d9;background:#ebf4ff;}}
.option.selected .opt-letter{{background:#4a90d9;color:#fff;}}
.opt-letter{{width:28px;height:28px;border-radius:50%;border:2px solid #cbd5e0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#718096;flex-shrink:0;transition:all .15s;}}
.opt-text{{flex:1;line-height:1.4;}}
.completion{{flex:1;display:none;align-items:center;justify-content:center;padding:40px;}}
.completion-card{{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:600px;width:100%;padding:40px;text-align:center;}}
.completion-card h2{{font-size:22px;color:#2d3748;margin:12px 0 8px;}}
.score-display{{font-size:48px;font-weight:700;color:#4a90d9;margin:16px 0;}}
.result-grid{{text-align:left;margin:20px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px;}}
.result-item{{padding:10px 14px;border-radius:8px;font-size:13px;display:flex;align-items:center;gap:8px;}}
.result-item.correct{{background:#f0fff4;color:#276749;}}
.result-item.incorrect{{background:#fff5f5;color:#9b2c2c;}}
.btn-answers{{display:inline-block;margin-top:20px;padding:14px 36px;background:#4a90d9;color:#fff;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;}}
.btn-answers:hover{{background:#3a7cc0;}}
.footer-nav{{background:#fff;border-top:1px solid #e2e8f0;padding:12px 24px;display:flex;justify-content:flex-end;align-items:center;flex-shrink:0;}}
.btn-next{{padding:10px 28px;background:#4a90d9;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;opacity:.5;pointer-events:none;transition:opacity .2s;}}
.btn-next.active{{opacity:1;pointer-events:auto;}}
.btn-next:hover{{background:#3a7cc0;}}
</style>
</head>
<body>

<div class="top-nav">
<div class="nav-left">
<span class="section-label">Listening</span>
<span class="divider">|</span>
<span class="q-info" id="qInfo">Listen to an Announcement</span>
</div>
<div class="nav-right">
<span class="timer" id="timer">--:--</span>
<div class="user-badge" id="userBadge">?</div>
</div>
</div>
<div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>

<div class="start-overlay" id="startOverlay">
<div class="start-card">
<h2>\\ud83d\\udce2 Listen to an Announcement</h2>
<p>You will hear 2 short announcements.<br>After each announcement, you will answer 2 questions.<br><br>You have <strong>20 seconds</strong> per question.</p>
<button class="btn-start" onclick="startListening()">Start Listening</button>
</div>
</div>

<div class="main-content">
<div class="audio-phase" id="audioPhase">
<img id="audioImg" src="" alt="Speaker">
<div class="audio-status" id="audioStatus"><span class="pulse"></span> Listen to the announcement...</div>
</div>
<div class="question-phase" id="questionPhase">
<div class="q-split">
<div class="q-left"><img id="qImg" src="" alt="Speaker"></div>
<div class="q-right">
<div class="q-label" id="qLabel">Question 1 of {total_questions}</div>
<div class="q-text" id="qText"></div>
<div class="options" id="optionsContainer"></div>
</div>
</div>
</div>
<div class="completion" id="completionPage">
<div class="completion-card">
<div style="font-size:48px">\\u2705</div>
<h2>Announcement Section Complete!</h2>
<div class="score-display" id="scoreDisplay">0 / {total_questions}</div>
<div class="result-grid" id="resultGrid"></div>
<a class="btn-answers" href="practice-{practice_num}-answers.html" id="answersBtn" style="display:none">\\u89e3\\u7b54\\u89e3\\u8aac\\u3092\\u898b\\u308b \\u2192</a>
</div>
</div>
</div>

<div class="footer-nav">
<button class="btn-next" id="btnNext" onclick="nextStep()">Next \\u2192</button>
</div>

<script src="../../js/auth.js"></script>
<script>
if(typeof Auth!=='undefined'){{Auth.require();Auth.showBadge('userBadge');}}

/* ===== SPEAKER IMAGES (placeholder) ===== */
const speakerImages = [{','.join(['"" /* ann' + str(i+1) + ' image placeholder */' for i in range(len(anns))])}];

/* ===== AUDIO FILES (placeholder) ===== */
const audioFiles = {{instruction:"" /* instruction audio placeholder */,ann1:"" /* ann1 audio placeholder */,ann2:"" /* ann2 audio placeholder */}};

/* ===== QUESTIONS ===== */
const questions = [
{questions_js}
];

/* ===== STATE ===== */
const labels = ['A','B','C','D'];
let currentQ = -1;
let currentAnn = -1;
let userAnswers = [{null_list}];
let timerInterval = null;
let secondsLeft = 0;
let audio = null;
let instrPlayed = false;

function startListening(){{
  document.getElementById('startOverlay').classList.add('hidden');
  // Play instruction first
  audio = new Audio(audioFiles.instruction);
  document.getElementById('audioPhase').style.display = 'flex';
  document.getElementById('audioImg').style.display = 'none';
  document.getElementById('audioStatus').innerHTML = '<span class="pulse"></span> Listen to the instructions...';
  document.getElementById('qInfo').textContent = 'Instructions';

  audio.addEventListener('ended', () => {{
    instrPlayed = true;
    playAnnouncement(0);
  }});
  audio.play().catch(e => {{
    console.log('Autoplay blocked:', e);
    document.getElementById('audioStatus').innerHTML = '<button onclick="retryInstr()" style="padding:10px 24px;background:#4a90d9;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">\\u25b6 Play Instructions</button>';
  }});
}}

function retryInstr(){{
  document.getElementById('audioStatus').innerHTML = '<span class="pulse"></span> Listen to the instructions...';
  if(audio) audio.play();
}}

function playAnnouncement(idx){{
  currentAnn = idx;
  document.getElementById('audioPhase').style.display = 'flex';
  document.getElementById('questionPhase').style.display = 'none';
  document.getElementById('completionPage').style.display = 'none';
  document.getElementById('audioImg').style.display = 'block';
  document.getElementById('audioImg').src = speakerImages[idx];
  document.getElementById('audioStatus').innerHTML = '<span class="pulse"></span> Listen to the announcement...';
  document.getElementById('btnNext').classList.remove('active');
  document.getElementById('qInfo').textContent = 'Listen to an Announcement';
  document.getElementById('timer').textContent = '--:--';
  document.getElementById('timer').classList.remove('warning');

  const key = 'ann' + (idx+1);
  audio = new Audio(audioFiles[key]);
  audio.addEventListener('ended', () => {{
    showQuestion(idx * 2);
  }});
  audio.play().catch(e => {{
    document.getElementById('audioStatus').innerHTML = '<button onclick="retryAnn()" style="padding:10px 24px;background:#4a90d9;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">\\u25b6 Play Announcement</button>';
  }});
}}

function retryAnn(){{
  document.getElementById('audioStatus').innerHTML = '<span class="pulse"></span> Listen to the announcement...';
  if(audio) audio.play();
}}

function showQuestion(qIdx){{
  currentQ = qIdx;
  const q = questions[qIdx];

  document.getElementById('audioPhase').style.display = 'none';
  document.getElementById('questionPhase').style.display = 'flex';
  document.getElementById('completionPage').style.display = 'none';

  document.getElementById('qImg').src = speakerImages[q.ann];
  document.getElementById('qLabel').textContent = 'Question ' + (qIdx+1) + ' of {total_questions}';
  document.getElementById('qText').textContent = q.text;
  document.getElementById('qInfo').innerHTML = 'Question <strong>' + (qIdx+1) + '</strong> of {total_questions} | Listening';
  document.getElementById('progressFill').style.width = ({pct_per_q}*(qIdx+1)) + '%';

  const container = document.getElementById('optionsContainer');
  container.innerHTML = '';
  q.options.forEach((opt, i) => {{
    const div = document.createElement('div');
    div.className = 'option';
    div.innerHTML = '<span class="opt-letter">' + labels[i] + '</span><span class="opt-text">' + opt + '</span>';
    div.onclick = () => {{
      container.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
      div.classList.add('selected');
      userAnswers[qIdx] = i;
      document.getElementById('btnNext').classList.add('active');
    }};
    container.appendChild(div);
  }});

  document.getElementById('btnNext').classList.remove('active');
  startTimer(20);
}}

function startTimer(secs){{
  clearInterval(timerInterval);
  secondsLeft = secs;
  updateTimer();
  timerInterval = setInterval(() => {{
    secondsLeft--;
    updateTimer();
    if(secondsLeft <= 5) document.getElementById('timer').classList.add('warning');
    if(secondsLeft <= 0){{
      clearInterval(timerInterval);
      nextStep();
    }}
  }}, 1000);
}}

function updateTimer(){{
  const t = document.getElementById('timer');
  t.textContent = '0:' + String(secondsLeft).padStart(2,'0');
  if(secondsLeft > 5) t.classList.remove('warning');
}}

function nextStep(){{
  clearInterval(timerInterval);
  document.getElementById('timer').classList.remove('warning');

  const nextQ = currentQ + 1;
  if(nextQ >= questions.length){{
    showCompletion();
    return;
  }}
  if(questions[nextQ].ann !== questions[currentQ].ann){{
    playAnnouncement(questions[nextQ].ann);
  }} else {{
    showQuestion(nextQ);
  }}
}}

function showCompletion(){{
  document.getElementById('audioPhase').style.display = 'none';
  document.getElementById('questionPhase').style.display = 'none';
  document.getElementById('completionPage').style.display = 'flex';
  document.getElementById('btnNext').style.display = 'none';
  document.getElementById('progressFill').style.width = '100%';
  document.getElementById('timer').textContent = '';
  document.getElementById('qInfo').textContent = 'Results';

  let correct = 0;
  const grid = document.getElementById('resultGrid');
  grid.innerHTML = '';

  questions.forEach((q, i) => {{
    const isCorrect = userAnswers[i] === q.correct;
    if(isCorrect) correct++;
    const div = document.createElement('div');
    div.className = 'result-item ' + (isCorrect ? 'correct' : 'incorrect');
    const userAns = userAnswers[i] !== null ? labels[userAnswers[i]] : '\\u2014';
    div.innerHTML = (isCorrect ? '\\u2705' : '\\u274c') + ' Q' + (i+1) + ': ' + userAns + (isCorrect ? '' : ' \\u2192 ' + labels[q.correct]);
    grid.appendChild(div);
  }});

  document.getElementById('scoreDisplay').textContent = correct + ' / {total_questions}';
  sessionStorage.setItem('announceAnswers', JSON.stringify(userAnswers));
  document.getElementById('answersBtn').style.display = 'inline-block';
}}
</script>
</body>
</html>'''

    return html


def process_practice(num):
    filepath = rf'C:\Users\umuyashikin\toefl-task-training\listening\announce\practice-{num}.html'
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    anns = extract_announce_data(html, num)

    print(f"Practice {num}: {len(anns)} announcements")
    for i, ann in enumerate(anns):
        print(f"  Ann {i+1}: {len(ann['questions'])} questions")
        for j, q in enumerate(ann['questions']):
            print(f"    Q{j+1}: {q['text'][:60]}... ({len(q['options'])} opts, correct={q.get('correct','?')})")

    new_html = build_kickstart_html(num, anns)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_html)

    print(f"  -> Written {len(new_html):,} chars to {filepath}")
    print()


if __name__ == '__main__':
    for i in range(1, 11):
        process_practice(i)
    print("All announce practice files converted!")
