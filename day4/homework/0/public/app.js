// 화면 진행. 루소와 테이블을 사이에 두고 마주 앉은 장면 하나에서 말풍선과 테이블 위 물건만 바뀐다.
// 계산은 game.js, 목각인형 그림과 기록은 서버(/api)가 맡는다.
import { ANSWERS, newGame, nextStep, answer, wrongGuess, undo } from './game.js';

const $ = (id) => document.getElementById(id);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LINES = {
  question: ['가만있자~ 그럼 이건 어때요?', '옳지, 하나만 더 여쭤볼게요.', '음~ 이건요?'],
  sure: ['옳지! 거의 알 것 같아요.', '허허, 슬슬 감이 오네요.'],
  wrong: ['어이쿠, 아니었어요? 다시 생각해 볼게요.', '어라, 아니에요? 가만있자~'],
  done: ['짜잔! {name} 완성이에요. 뚝딱!', '허허, 거봐요! {name} 다 만들었어요.'],
};
const TOPIC_ICON = { animal: '🐾', food: '🍎', person: '🧑' };
const MIN_MAKING_MS = 3200; // 저장된 그림이 바로 나와도 뚝딱뚝딱 연출은 보여준다

let status = null;
let topic = null;
let game = null;
let current = null; // 지금 묻는 질문 (null 이면 답 버튼이 동작하지 않음)
let guessing = null; // 지금 추측 중인 후보
let flow = 0; // 화면이 바뀌면 늘어남. 기다리던 작업이 끝났을 때 이미 다른 화면이면 무시
const topicCache = {};

// ---------- 루소 포즈: assets/russo/<포즈>.png 가 없으면 임시 그림 ----------
const POSE_BADGE = { basic: '👋', think: '🤔', happy: '🎉', sweat: '💦', making: '🔨' };
const poseFound = {};
const poseAvailable = (pose) =>
  (poseFound[pose] ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = `/assets/russo/${pose}.png`;
  }));
Object.keys(POSE_BADGE).forEach(poseAvailable); // 미리 불러 두기

async function setPose(pose) {
  const el = $('russo');
  el.dataset.pose = pose;
  const found = await poseAvailable(pose);
  if (el.dataset.pose !== pose) return;
  el.classList.toggle('placeholder', !found);
  el.innerHTML = found
    ? `<img alt="루소" src="/assets/russo/${pose}.png">`
    : `<span class="ph" aria-label="루소">🦕</span><span class="ph-badge">${POSE_BADGE[pose]}</span>`;
}

// ---------- 장면 ----------
// main 에 [앞, 강조, 뒤] 배열을 주면 가운데를 파란 글씨로
function say(small, main) {
  const bubble = $('bubble');
  $('bubble-small').textContent = small || '';
  const strong = $('bubble-main');
  strong.replaceChildren();
  if (Array.isArray(main)) {
    const b = document.createElement('b');
    b.textContent = main[1];
    strong.append(main[0], b, main[2]);
  } else {
    strong.textContent = main || '';
  }
  bubble.classList.remove('talk');
  void bubble.offsetWidth;
  bubble.classList.add('talk');
}

function setScene(state, { pose, meta = topic?.name || '' } = {}) {
  flow++;
  $('scene').dataset.state = state;
  if (pose) setPose(pose);
  $('meta').textContent = state === 'start' ? '' : meta;
  $('work').hidden = state !== 'reveal';
  $('undo').hidden = state !== 'question' && state !== 'guess';
  $('home').hidden = state === 'start';
  $('status').hidden = state !== 'start';
  return flow;
}

function table(...nodes) {
  $('table').replaceChildren(...nodes);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

const button = (label, onclick, cls = '') => el('button', { type: 'button', class: `btn ${cls}`, onclick, text: label });

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

async function loadStatus() {
  try {
    status = await api('/api/status');
    const tableSrc = { jev: 'Jev', mixed: 'Jev 일부 + 임시 값', draft: '임시 값' }[status.table];
    const image = status.image ? `켜짐 (오늘 ${status.imagesToday}/${status.imageLimit}장)` : '꺼짐';
    $('status').textContent = `판단 표: ${tableSrc} · 목각인형 그림: ${image} · Jev: ${status.jev ? '켜짐' : '꺼짐'}`;
  } catch {
    $('status').textContent = '서버에 연결하지 못했어요.';
  }
}

// ---------- 시작, 주제 ----------
function goStart() {
  guessing = null;
  setScene('start', { pose: 'basic' });
  say('생각만 하세요. 아저씨가 뚝딱 맞혀볼게요!', '허허, 루소 목공소에 어서 와요! 오늘은 뭘 만들어 드릴까요?');
  table(
    button('시작하기', goTopics, 'primary big'),
    el('p', { class: 'howto', text: '만들고 싶은 걸 떠올리고 → 루소의 질문에 답하면 → 루소가 맞혀서 뚝딱 만들어 줘요' }),
  );
  loadStatus();
}

async function goTopics() {
  guessing = null;
  if (!status) await loadStatus();
  setScene('topic', { pose: 'basic', meta: '' });
  say('', '어떤 걸 만들어 드릴까요?');
  table(
    ...(status?.topics || []).map((t) => {
      const b = el('button', { type: 'button', class: 'crate', onclick: () => startTopic(t.id) }, [el('span', { text: TOPIC_ICON[t.id] || '📦' }), t.name]);
      if (!t.ready) {
        b.disabled = true;
        b.append(el('small', { text: '준비 중' }));
      }
      return b;
    }),
  );
}

async function startTopic(id) {
  try {
    topic = topicCache[id] ??= await api(`/api/topic/${id}`);
  } catch (e) {
    say('어이쿠!', e.message);
    return;
  }
  game = newGame(topic);
  step();
}

// ---------- 질문 ----------
function step() {
  const next = nextStep(game);
  current = null;
  if (next.type === 'question') {
    current = next.question;
    renderQuestion(pick(next.confidence >= 0.5 ? LINES.sure : LINES.question));
  } else if (next.type === 'guess') {
    openGuess(next.candidate);
  } else {
    goLose();
  }
}

function answerButtons(disabled = false) {
  return el(
    'div',
    { class: 'answers' },
    ANSWERS.map((a, i) => {
      const b = el('button', { type: 'button', class: `btn ${a.key}`, onclick: () => onAnswer(a.key) }, [el('kbd', { text: String(i + 1) }), a.label]);
      b.disabled = disabled;
      return b;
    }),
  );
}

function renderQuestion(line) {
  setScene('question', { pose: 'think', meta: `${topic.name} · 질문 ${game.answers.length + 1}` });
  say(line, current.text);
  table(answerButtons());
  $('undo').disabled = game.answers.length === 0;
}

function onAnswer(key) {
  if (!current) return;
  answer(game, current.id, key);
  step();
}

function onUndo() {
  const q = undo(game);
  if (!q) return;
  guessing = null;
  current = q;
  renderQuestion('어이쿠, 다시 답해 주세요.');
}

// ---------- 추측: "혹시 ○○ 만들어 드릴까요?" ----------
function openGuess(candidate) {
  guessing = candidate;
  setScene('guess', { pose: 'basic' });
  say('혹시…', ['', candidate.name, ' 만들어 드릴까요?']);
  table(button('맞아요!', onRight, 'primary big'), button('아니에요', onWrong, 'big'));
  $('undo').disabled = game.answers.length === 0;
}

async function onWrong() {
  const candidate = guessing;
  if (!candidate) return;
  guessing = null;
  wrongGuess(game, candidate.id);
  const id = setScene('question', { pose: 'sweat', meta: `${topic.name} · 다시 생각하는 중` });
  say(pick(LINES.wrong), '…');
  table(answerButtons(true));
  await sleep(1400);
  if (id === flow) step();
}

// ---------- 맞히면: "그럼 이제 만들어볼까요?" → 뚝딱뚝딱 → 목각인형 ----------
async function onRight() {
  const candidate = guessing;
  if (!candidate) return;
  guessing = null;
  const count = game.answers.length;
  const request = api('/api/reveal', { topic: topic.id, candidate: candidate.id }).catch(() => null);

  let id = setScene('making', { pose: 'happy' });
  say('좋아요!', '그럼 이제 만들어 볼까요?');
  table();
  await sleep(1300);
  if (id !== flow) return;

  setPose('making');
  say('', '뚝딱뚝딱… 금방 만들어 드릴게요!');
  table(el('div', { class: 'log', text: '🪵' }));
  const [result] = await Promise.all([request, sleep(MIN_MAKING_MS)]);
  if (id !== flow) return;

  let img = null;
  if (result?.image) {
    img = new Image();
    img.alt = `${candidate.name} 목각인형`;
    img.src = result.image;
    await img.decode().catch(() => {});
    if (id !== flow) return;
  }
  reveal(candidate, count, result, img);
}

const withSubject = (name) => {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return name + (code >= 0 && code <= 11171 && code % 28 ? '이' : '가');
};

function reveal(candidate, count, result, img) {
  setScene('reveal', { pose: 'happy' });
  $('work-photo').replaceChildren(
    img || el('div', { class: 'empty' }, [el('span', { text: '🪵' }), result?.reason === 'no-key' ? '그림 없이 완성!' : '오늘은 나무가 똑 떨어졌어요']),
  );
  $('plaque').textContent = candidate.name;
  say('', img ? pick(LINES.done).replace('{name}', candidate.name) : '어이쿠, 오늘 나무가 똑 떨어졌네요. 그래도 맞혔죠?');

  const actor = result?.actor ? `${withSubject(result.actor.name)} ${candidate.name} 흉내를 냈어요${result.actor.by === 'jev' ? ' · Jev가 고른 배우' : ''}` : '';
  table(
    el('div', { class: 'result' }, [
      el('p', { class: 'count', text: `${count}번 만에 맞혔어요!` }),
      el('p', { class: 'actor', text: actor }),
      el('div', { class: 'row' }, [button('하나 더 만들기', () => startTopic(topic.id), 'primary'), button('다른 주제', goTopics)]),
    ]),
  );
}

// ---------- 못 맞히면 ----------
function goLose() {
  setScene('lose', { pose: 'sweat' });
  say('어이쿠, 아저씨가 못 맞혔네요.', '뭘 만들어 드리면 될까요?');
  const input = el('input', { maxlength: '50', placeholder: '만들고 싶었던 것', autocomplete: 'off' });
  const form = el('form', { class: 'teach' }, [input, el('button', { type: 'submit', class: 'btn primary', text: '알려주기' })]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const answers = game.answers.map(({ q, a }) => ({
      question: topic.questions.find((x) => x.id === q)?.text,
      answer: ANSWERS.find((x) => x.key === a)?.label,
    }));
    api('/api/loss', { topic: topic.id, answer: text, answers }).catch(() => {});
    setPose('happy');
    say('', '알겠어요! 다음엔 꼭 만들어 드릴게요. 뚝딱!');
    table(button('다시 하기', () => startTopic(topic.id), 'primary big'));
  });
  table(form);
  input.focus();
}

// ---------- 버튼, 키보드 ----------
$('home').addEventListener('click', goStart);
document.querySelector('.logo').addEventListener('click', goStart);
$('undo').addEventListener('click', onUndo);

document.addEventListener('keydown', (e) => {
  if ($('scene').dataset.state !== 'question' || !current || e.target.matches('input') || e.metaKey || e.ctrlKey) return;
  const i = Number(e.key) - 1;
  if (i >= 0 && i < ANSWERS.length) onAnswer(ANSWERS[i].key);
});

goStart();
