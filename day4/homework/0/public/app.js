// 화면 진행. 루소와 테이블을 사이에 두고 마주 앉은 장면 하나에서 말풍선과 테이블 위 물건만 바뀐다.
// 계산은 game.js, 목각인형 그림과 기록은 서버(/api)가 맡는다.
import { ANSWERS, newGame, nextStep, answer, wrongGuess, undo } from './game.js';

const $ = (id) => document.getElementById(id);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 루소 대사: 상황마다 여러 개 중 하나를 고른다. [작은 글씨, 큰 글씨] 쌍은 두 줄로 말함
const LINES = {
  question: ['가만있자~ 그럼 이건 어때요?', '옳지, 하나만 더 여쭤볼게요.', '음~ 이건요?'],
  sure: ['옳지! 거의 알 것 같아요.', '허허, 슬슬 감이 오네요.'],
  wrong: ['어이쿠, 아니었어요? 다시 생각해 볼게요.', '어라, 아니에요? 가만있자~'],
  done: [
    '짜잔! {name} 완성이에요. 뚝딱!',
    '허허, 거봐요! {name} 다 만들었어요.',
    '옳지! {name}, 아주 잘 깎였네요. 마음에 들어요?',
    '뚝딱! 오늘 작품 중에 {name}이(가) 제일 잘 나왔어요.',
    '어이쿠, 손이 다 떨리네요. {name} 완성! 허허.',
    '{name} 한 점 뚝딱! 조심히 가져가세요~',
    '허허, 나뭇결까지 살렸어요. {name} 완성이에요!',
  ],
  doneStorage: [
    '창고 깊숙이 있던 재료로 {name} 만들었어요. 뚝딱!',
    '허허, 창고 뒤지길 잘했네요! {name} 완성이에요.',
    '먼지 좀 털어 냈더니 {name}이(가) 나왔어요. 뚝딱!',
  ],
  noImage: ['어이쿠, 오늘 나무가 똑 떨어졌네요. 그래도 맞혔죠?', '허허, 대패날이 무뎌졌나 봐요. 그래도 정답은 맞혔어요!', '어이쿠, 오늘은 그림을 못 깎았네요. 다음엔 꼭 만들어 드릴게요.'],
  askStart: [['허허, 이건 좀 어렵네요.', '몇 가지만 더 여쭤볼게요~'], ['가만있자~', '아저씨가 조금만 더 물어볼게요.'], ['어이쿠, 두 번이나 틀렸네요.', '다른 걸 좀 여쭤볼게요.']],
  askNext: [['옳지!', '하나만 더요~'], ['허허, 그렇군요.', '그럼 하나 더 여쭤볼게요.']],
  ask: ['💬 이건 어때요?', '💬 음~ 이건요?', '💬 그럼 이건 어때요?'],
  search: [['가만있자~', '창고에 다른 재료가 있나 볼게요…'], ['어디 보자~', '창고 구석구석 뒤져 볼게요…'], ['허허, 이건 좀 어렵네요.', '창고에서 다른 나무를 꺼내 볼게요…']],
  probe: ['📏 요 두 개가 아주 비슷하네요. 딱 하나만 재볼게요.', '📏 가만있자, 줄자로 한 번 재볼게요.', '📏 거의 다 왔어요. 치수만 재볼게요.'],
  probeMore: ['📏 하나만 더 재볼게요.', '📏 옳지, 이것도 재볼게요.'],
  measured: ['옳지, 치수가 나왔어요!', '허허, 이제 알 것 같아요.'],
  lose: [['어이쿠, 아저씨가 못 맞혔네요.', '뭘 만들어 드리면 될까요?'], ['허허, 이건 아저씨도 처음 보네요.', '뭐였는지 알려 주실래요?'], ['창고를 다 뒤졌는데도 못 찾았어요.', '뭘 만들고 싶으셨어요?']],
  thanks: ['알겠어요! 다음엔 꼭 만들어 드릴게요. 뚝딱!', '허허, 하나 배웠네요. 재료 준비해 둘게요!', '고마워요! 다음에 오시면 뚝딱 만들어 드릴게요.'],
};

// "{name}이(가)" 를 받침에 맞게: 펭귄이 / 피자가
const fill = (line, name) =>
  line.replace('{name}이(가)', name + (/[가-힣]$/.test(name) && (name.charCodeAt(name.length - 1) - 0xac00) % 28 ? '이' : '가')).replace('{name}', name);
const TOPIC_ICON = { animal: '🐾', food: '🍎', person: '🧑' };
// 목각인형 만드는 몽타주 (기획서 7절): 영화처럼 클로즈업 컷을 이어 붙인다. 그림은 assets/montage/ (scripts/make-montage.mjs).
// 그림이 늦으면 색칠 컷에서 덧칠하며 기다린다. 저장된 그림이 바로 나와도 몽타주는 끝까지 보여준다.
const SHOTS = [
  { key: 'open', icon: '🧰', label: '공구 꺼내기', lines: ['어디 보자~ 연장부터 꺼내 볼까요.', '{name}엔 호두나무가 딱이겠네요.', '옳지, 오늘은 이 끌을 써야겠다.'] },
  { key: 'saw', icon: '🪚', label: '톱질', lines: ['쓱싹쓱싹, 크기부터 맞추고요.', '톱질은 천천히, 반듯하게~'] },
  { key: 'carve', icon: '🔨', label: '끌로 깎기', lines: ['뚝딱뚝딱… 모양을 깎는 중이에요.', '{name} 모양이 슬슬 나오네요!', '여기는 살살… 섬세하게요.'] },
  { key: 'sand', icon: '🖐️', label: '사포질', lines: ['사포로 매끈매끈하게~', '가시 하나 없이 다듬을게요.'] },
  { key: 'paint', icon: '🎨', label: '색칠', lines: ['이제 색을 입혀 볼게요~', '허허, 색이 아주 예쁘게 먹네요.'] },
  { key: 'varnish', icon: '✨', label: '니스 칠', lines: ['마지막으로 니스 칠! 반짝반짝~', '반들반들 광만 내면 끝이에요!'] },
];
const MONTAGE = ['bench.jpg', 'toolbox.jpg', 'block.webp', 'rough.webp', 'blank.webp', 'painted.webp', 'jars.webp', 'saw.webp', 'chisel.webp', 'mallet.webp', 'sandpaper.webp', 'brush.webp'];
const art = (file) => `/assets/montage/${file}`;
const WAIT_LINES = ['물감 말리는 중이에요~ 조금만요!', '한 번 더 꼼꼼히 덧칠할게요.', '허허, 이 부분이 제일 어려워요.', '거의 다 됐어요. 후~ 불어서 말리는 중!'];
// 상자 열기 (기획서 7절): 완성품을 담은 나무 상자가 쿵! 떨어지고 → 덜컹거리며 틈새로 빛이 새고 → 매번 다른 액션으로 열린다.
// popAt: 'open' 뒤 상자가 터지는(번쩍·파편) 시점(ms). 움직임은 style.css 의 .unbox[data-act=...]
const OPEN_ACTS = [
  { act: 'burst', sfx: '펑!', popAt: 450, lines: ['어이쿠, 상자가 들썩들썩! 곧 터지겠어요!', '허허, 안에서 뭔가 난리네요!'] },
  { act: 'lid', sfx: '슝~', popAt: 350, lines: ['뚜껑이 들썩여요… 하나, 둘, 셋!', '옳지, 뚜껑 열어 볼게요~'] },
  { act: 'spin', sfx: '빙글빙글~ 팡!', popAt: 1150, lines: ['어라라? 상자가 혼자 돌아요!', '가만있자~ 상자가 왜 이러지?'] },
  { act: 'hammer', sfx: '쾅!', popAt: 420, pose: 'making', lines: ['꽉 닫혔네요. 망치로 열어 볼게요!', '어이쿠, 안 열리네. 뚝딱 한 방이면 돼요!'] },
  { act: 'unfold', sfx: '짜잔~', popAt: 900, lines: ['판자를 한 장씩 열어 볼게요~', '두근두근… 천천히 열어 볼까요?'] },
];

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
new Image().src = '/assets/russo/search.png'; // 창고 뒤지기 때 돌아다니는 루소

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
  document.querySelectorAll('.montage, .unbox, .confetti').forEach((n) => n.remove()); // 몽타주·상자 열기·축하 도중에 화면이 바뀌면 치운다
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
    const image = status.image ? `켜짐 (오늘 ${status.imagesToday}/${status.imageLimit}장)` : '꺼짐';
    $('status').textContent = `목각인형 그림: ${image}`;
    renderTop(status.top || []);
  } catch {
    $('status').textContent = '서버에 연결하지 못했어요.';
  }
}

// 시작 화면 왼쪽 벽 메모: 가장 많이 맞혀서 만든 작품 TOP 5
function renderTop(top) {
  $('top5').hidden = status?.showTop5 === false; // 관리 페이지에서 끌 수 있음
  const list = $('top5-list');
  list.replaceChildren(
    ...(top.length
      ? top.map((t) => el('li', {}, [el('b', { text: t.name }), el('span', { text: ` ${t.topicName} · ${t.count}번` })]))
      : [el('li', { class: 'empty', text: '아직 만든 작품이 없어요' })]),
  );
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
  game.wrongNames = []; // 틀린 이름 (창고 후보 포함, 창고 뒤지기에서 다시 고르지 않게)
  game.searched = false; // 창고 뒤지기를 했는지
  game.storage = []; // 창고에서 찾은 후보 (차례로 추측)
  game.extra = []; // 창고 가기 전 루소의 질문과 답 [{ token, a }] (질문은 서버가 서명)
  game.askDone = false;
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
  } else if (!game.askDone) {
    askNext();
  } else if (!game.searched) {
    storageSearch();
  } else {
    goLose();
  }
}

// ---------- 창고 가기 전 루소의 질문: 판단 표로 두 번 틀리면 LLM 이 답을 보고 새 질문을 하나씩 만든다 (기획서 4절) ----------
const ASK_COUNT = 2;
async function askNext() {
  const id = setScene('question', { pose: 'think', meta: `${topic.name} · 질문 ${game.answers.length + game.extra.length + 1}` });
  say(...pick(game.extra.length ? LINES.askNext : LINES.askStart));
  table(answerButtons(true));
  $('undo').disabled = true;
  const [result] = await Promise.all([
    api('/api/ask', { topic: topic.id, answers: game.answers, wrong: game.wrongNames, extra: game.extra }).catch(() => null),
    sleep(900), // 루소가 생각하는 모습은 잠깐 보여준다
  ]);
  if (id !== flow) return;
  if (!result?.question) {
    game.askDone = true; // 키가 없거나 상한·실패면 바로 창고 뒤지기로
    step();
    return;
  }
  current = { id: 'ask', text: result.question, ask: true, token: result.token };
  say(pick(LINES.ask), current.text);
  table(answerButtons());
}

// ---------- 창고 뒤지기: 판단 표로 두 번 틀리면 LLM + Jev 로 목록 밖 정답까지 찾기 (기획서 4절) ----------
async function storageSearch() {
  game.searched = true;
  const id = setScene('search', { pose: 'think', meta: `${topic.name} · 창고 뒤지는 중` });
  say(...pick(LINES.search));
  table(el('div', { class: 'log', text: '📦' }));
  const [result] = await Promise.all([
    api('/api/search', { topic: topic.id, answers: game.answers, excluded: game.excluded, wrong: game.wrongNames, extra: game.extra }).catch(() => null),
    sleep(1500), // 너무 빨리 끝나도 뒤지는 모습은 잠깐 보여준다
  ]);
  if (id !== flow) return;
  game.storage = result?.candidates || [];
  if (result?.probe && game.storage.length > 1) startProbe(result.probe);
  else nextStorageGuess();
}

// 줄자로 재기: 창고 후보끼리 비슷하면 LLM 이 만든 가르는 질문을 1~3개 더 묻고, Jev 로 순서를 다시 매긴다
function startProbe(probe) {
  game.probe = { ...probe, answers: [] };
  askProbe();
}

function askProbe() {
  const i = game.probe.answers.length;
  if (i >= game.probe.questions.length) return finishProbe();
  current = { id: `probe${i}`, text: game.probe.questions[i], probe: true };
  setScene('question', { pose: 'think', meta: `${topic.name} · 줄자로 재는 중` });
  say(pick(i === 0 ? LINES.probe : LINES.probeMore), current.text);
  table(answerButtons());
  $('undo').disabled = true;
}

async function finishProbe() {
  const id = setScene('search', { pose: 'think', meta: `${topic.name} · 줄자로 재는 중` });
  say('', pick(LINES.measured));
  table(el('div', { class: 'log', text: '📏' }));
  const [result] = await Promise.all([
    api('/api/probe', { topic: topic.id, token: game.probe.token, answers: game.probe.answers }).catch(() => null),
    sleep(1000),
  ]);
  if (id !== flow) return;
  if (result?.candidates?.length) game.storage = result.candidates;
  nextStorageGuess();
}

function nextStorageGuess() {
  const candidate = game.storage.shift();
  if (!candidate) return goLose();
  openGuess({ ...candidate, storage: true });
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
  if (current.probe) {
    game.probe.answers.push(key);
    current = null;
    askProbe();
    return;
  }
  if (current.ask) {
    game.extra.push({ token: current.token, a: key });
    game.askDone = game.extra.length >= ASK_COUNT;
    current = null;
    step();
    return;
  }
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
  preloadMontage();
  guessing = candidate;
  setScene('guess', { pose: 'basic' });
  say(candidate.storage ? '창고에서 찾았어요! 혹시…' : '혹시…', ['', candidate.name, ' 만들어 드릴까요?']);
  table(button('맞아요!', onRight, 'primary big'), button('아니에요', onWrong, 'big'));
  $('undo').disabled = candidate.storage || game.answers.length === 0; // 창고 후보를 묻는 중에는 되돌리지 않음
}

async function onWrong() {
  const candidate = guessing;
  if (!candidate) return;
  guessing = null;
  game.wrongNames.push(candidate.name);
  if (!candidate.storage) wrongGuess(game, candidate.id);
  const id = setScene('question', { pose: 'sweat', meta: `${topic.name} · 다시 생각하는 중` });
  say(pick(LINES.wrong), '…');
  table(answerButtons(true));
  await sleep(1400);
  if (id !== flow) return;
  if (candidate.storage) nextStorageGuess();
  else step();
}

// ---------- 맞히면: "그럼 이제 만들어볼까요?" → 뚝딱뚝딱 → 목각인형 ----------
async function onRight() {
  const candidate = guessing;
  if (!candidate) return;
  guessing = null;
  const count = game.answers.length;
  // 창고 후보는 서버가 붙여 준 서명(token)을 그대로 돌려준다
  const request = api('/api/reveal', { topic: topic.id, candidate: candidate.id, token: candidate.token }).catch(() => null);

  // 그림을 받아 미리 풀어 두기까지 (브라우저에 따라 decode() 가 끝나지 않을 때가 있어서 최대 3초만 기다림)
  let ready = false;
  const prepared = request.then(async (result) => {
    let img = null;
    if (result?.image) {
      img = new Image();
      img.alt = `${candidate.name} 목각인형`;
      img.src = result.image;
      await Promise.race([img.decode().catch(() => {}), sleep(3000)]);
    }
    ready = true;
    return { result, img };
  });

  const id = setScene('making', { pose: 'happy' });
  say('좋아요!', '그럼 이제 만들어 볼까요?');
  table();
  await sleep(1000);
  if (id !== flow) return;

  if (!(await montage(candidate, () => ready, prepared))) return;

  const { result, img } = await prepared;
  if (!(await unbox())) return;
  reveal(candidate, count, result, img);
}

// ---------- 만드는 몽타주: 공구함 → 톱질 → 끌질 → 사포질 → 색칠 → 니스 (컷마다 클로즈업) ----------
let montageLoaded = false;
function preloadMontage() {
  if (montageLoaded) return;
  montageLoaded = true;
  MONTAGE.forEach((f) => (new Image().src = art(f)));
}

// 그림이 늦으면(isReady 가 false) 색칠 컷에서 기다린다. 다른 화면으로 넘어가면 false
async function montage(candidate, isReady, prepared) {
  const id = flow;
  const alive = () => id === flow;
  const img = (file, cls) => el('img', { class: cls, src: art(file), alt: '' });
  const m = {
    bg: el('div', { class: 'mt-bg' }),
    fig: el('div', { class: 'mt-fig', 'data-stage': 'block' }, [
      img('block.webp', 'fig fig-block'),
      img('rough.webp', 'fig fig-rough'),
      img('blank.webp', 'fig fig-blank'),
      ...[0, 1, 2].map((i) => img('painted.webp', `fig fig-paint p${i}`)),
      el('div', { class: 'mt-shine' }),
      img('jars.webp', 'tool t-jars'),
      img('saw.webp', 'tool t-saw'),
      img('chisel.webp', 'tool t-chisel'),
      img('mallet.webp', 'tool t-mallet'),
      img('sandpaper.webp', 'tool t-sand'),
      img('brush.webp', 'tool t-brush'),
    ]),
    step: el('div', { class: 'mt-step' }),
    sub: el('div', { class: 'mt-sub' }),
  };
  m.root = el('div', { class: 'montage', 'aria-hidden': 'true' }, [m.bg, m.fig, el('div', { class: 'mt-cut' }), m.step, m.sub]);
  $('scene').append(m.root);
  $('meta').textContent = `${topic.name} · ${candidate.name} 만드는 중`;

  for (const [i, shot] of SHOTS.entries()) {
    cut(m, shot, i, candidate.name);
    await SHOT_RUN[shot.key](m, alive);
    if (!alive()) return false;
    // 그림이 아직이면 색칠 컷에서 덧칠하며 기다린다
    while (shot.key === 'paint' && !isReady()) {
      m.sub.textContent = pick(WAIT_LINES);
      dab(m);
      await Promise.race([prepared, sleep(3500)]);
      if (!alive()) return false;
    }
  }
  return true;
}

// 컷 바꾸기: 번쩍 끊고, 배경을 다른 각도로 천천히 당겨 찍고(켄 번스), 자막을 바꾼다
function cut(m, shot, i, name) {
  m.root.dataset.shot = shot.key;
  m.root.classList.remove('cut');
  void m.root.offsetWidth;
  m.root.classList.add('cut');
  m.step.textContent = `${shot.icon} ${i + 1}/${SHOTS.length} ${shot.label}`;
  m.sub.textContent = fill(pick(shot.lines), name);
  const from = 1.08 + Math.random() * 0.06;
  const dx = Math.round(Math.random() * 6 - 3);
  m.bg.animate([{ transform: `scale(${from}) translateX(${dx}%)` }, { transform: `scale(${from + 0.1}) translateX(${-dx}%)` }], { duration: 3200, easing: 'linear', fill: 'forwards' });
}

// 글자 효과 (뚝! 쓱싹 반짝!) — 인형 상자 기준 위치 (%)
function sfx(m, text, x, y) {
  const s = el('span', { class: 'mt-sfx', text });
  s.style.left = `${x}%`;
  s.style.top = `${y}%`;
  m.fig.append(s);
  setTimeout(() => s.remove(), 1100);
}

// 한 점에서 사방으로 튀는 조각 (나무 조각·톱밥·먼지·반짝이)
function burst(m, x, y, kind, n = 12) {
  const box = el(
    'div',
    { class: `mt-bits ${kind}` },
    Array.from({ length: n }, () => {
      const b = el('i', { text: kind === 'sparkle' ? pick(['✦', '✧', '★']) : '' });
      const a = kind === 'dust' ? Math.PI * (1.1 + Math.random() * 0.8) : Math.random() * Math.PI * 2;
      const d = (kind === 'sparkle' ? 90 : 50) + Math.random() * 90;
      b.style.setProperty('--dx', `${Math.round(Math.cos(a) * d)}px`);
      b.style.setProperty('--dy', `${Math.round(Math.sin(a) * d + (kind === 'chip' ? 40 : 0))}px`);
      b.style.setProperty('--rot', `${Math.round(Math.random() * 600 - 300)}deg`);
      return b;
    }),
  );
  box.style.left = `${x}%`;
  box.style.top = `${y}%`;
  m.fig.append(box);
  setTimeout(() => box.remove(), 1200);
}

// 색칠 컷에서 기다릴 때: 붓으로 콕콕 덧칠
function dab(m) {
  const brush = m.fig.querySelector('.t-brush');
  brush.animate([{ transform: 'translate(0, 0)' }, { transform: 'translate(-3%, 4%)' }, { transform: 'translate(0, 0)' }], { duration: 500, iterations: 3 });
}

const SHOT_RUN = {
  // 공구함 클로즈업: 조명이 켜지고 연장이 반짝
  async open(m, alive) {
    m.bg.style.backgroundImage = `url(${art('toolbox.jpg')})`;
    await sleep(500);
    if (!alive()) return;
    sfx(m, '딸깍!', 70, 10);
    burst(m, 50, 30, 'sparkle', 8);
    await sleep(1400);
  },
  // 톱질: 톱이 오가고 톱밥이 떨어진다
  async saw(m, alive) {
    m.bg.style.backgroundImage = `url(${art('bench.jpg')})`;
    m.fig.dataset.stage = 'block';
    for (let i = 0; i < 4; i++) {
      if (!alive()) return;
      burst(m, 46 + Math.random() * 8, 14, 'dust', 8);
      if (i % 2 === 0) sfx(m, '쓱싹', 74, -4 + i * 4);
      await sleep(500);
    }
  },
  // 끌질: 망치로 세 번 내려칠 때마다 나무 조각이 튀고 모양이 바뀐다 (토막 → 대충 깎은 모양 → 매끈한 인형)
  async carve(m, alive) {
    const mallet = m.fig.querySelector('.t-mallet');
    const chisel = m.fig.querySelector('.t-chisel');
    await sleep(300);
    for (const [i, stage] of ['rough', 'rough', 'blank'].entries()) {
      if (!alive()) return;
      mallet.animate([{ transform: 'rotate(38deg)' }, { transform: 'rotate(0deg)' }], { duration: 240, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)', fill: 'forwards' });
      await sleep(240);
      chisel.animate([{ transform: 'scaleX(-1) translate(0, 0)' }, { transform: 'scaleX(-1) translate(3%, 4%)' }, { transform: 'scaleX(-1) translate(0, 0)' }], { duration: 160 });
      burst(m, 64, 40, 'chip', 14);
      sfx(m, ['뚝!', '딱!', '뚝딱!'][i], 78, 2);
      m.fig.dataset.stage = stage;
      m.root.classList.remove('jolt');
      void m.root.offsetWidth;
      m.root.classList.add('jolt');
      mallet.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(38deg)' }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
      await sleep(460);
    }
    await sleep(300);
  },
  // 사포질: 쓱싹쓱싹 문지르면 먼지가 폴싹
  async sand(m, alive) {
    m.fig.dataset.stage = 'blank';
    for (let i = 0; i < 4; i++) {
      if (!alive()) return;
      burst(m, 40 + Math.random() * 20, 70, 'dust', 6);
      if (i === 1) sfx(m, '쓱싹쓱싹', 70, 30);
      await sleep(400);
    }
  },
  // 색칠: 물감병에 붓을 콕 찍고, 붓이 지나간 띠만 색이 칠해진다 (머리 → 윗옷 → 바지)
  async paint(m, alive) {
    const brush = m.fig.querySelector('.t-brush');
    const BANDS = [
      { y: 28, clip: [2, 47] },
      { y: 64, clip: [53, 22] },
      { y: 86, clip: [76, 0] },
    ];
    // 붓 끝(그림의 왼쪽 아래)이 (x, y)% 에 오도록
    const at = (x, y) => ({ left: `${x - 6}%`, top: `${y - 47}%` });
    brush.animate([at(-43, 86), at(-43, 74), at(-43, 86)], { duration: 500, easing: 'ease-in-out', fill: 'forwards' });
    await sleep(520);
    for (const [i, band] of BANDS.entries()) {
      if (!alive()) return;
      const layer = m.fig.querySelector(`.p${i}`);
      const [t, b] = band.clip;
      layer.animate([{ clipPath: `inset(${t}% 100% ${b}% 0)` }, { clipPath: `inset(${t}% 0 ${b}% 0)` }], { duration: 520, easing: 'ease-in-out', fill: 'forwards' });
      brush.animate([at(24, band.y), at(78, band.y)], { duration: 520, easing: 'ease-in-out', fill: 'forwards' });
      await sleep(560);
    }
    m.fig.dataset.stage = 'painted';
    sfx(m, '알록달록~', 70, 6);
    await sleep(400);
  },
  // 니스 칠: 반짝 광이 쓱~ 지나가고 별이 반짝
  async varnish(m, alive) {
    m.fig.dataset.stage = 'painted';
    await sleep(250);
    if (!alive()) return;
    m.fig.classList.add('shine');
    burst(m, 30, 20, 'sparkle', 6);
    burst(m, 72, 60, 'sparkle', 6);
    sfx(m, '반짝!', 72, 4);
    await sleep(1300);
  },
};

// 상자 열기: 쿵! 떨어지고(drop) → 덜컹거리며 빛이 새고(rattle) → 액션대로 열리다가(open) → 번쩍! 터진다(pop).
// 다른 화면으로 넘어가면 false
async function unbox() {
  const act = pick(OPEN_ACTS);
  const id = setScene('unbox', { pose: 'happy' });
  say('🎁 포장 완료!', '완성품을 상자에 담았어요~');
  table();
  const stage = el('div', { class: 'unbox drop', 'data-act': act.act, 'aria-hidden': 'true' }, [
    el('div', { class: 'rays' }),
    el('div', { class: 'beam' }),
    el('div', { class: 'chest' }, [el('div', { class: 'lid' }), el('div', { class: 'box' }, [0, 1, 2].map((i) => el('i', { class: `plank p${i}` })))]),
    el('div', { class: 'mallet', text: '🔨' }),
    el('div', { class: 'thud', text: '쿵!' }),
    el('div', { class: 'sfx', text: act.sfx }),
  ]);
  $('scene').append(stage);
  quake();
  await sleep(1000);
  if (id !== flow) return false;

  stage.classList.add('rattle');
  if (act.pose) setPose(act.pose);
  say('', pick(act.lines));
  await sleep(1800);
  if (id !== flow) return false;

  stage.classList.add('open');
  await sleep(act.popAt);
  if (id !== flow) return false;
  stage.classList.add('pop');
  stage.append(burstBits());
  quake();
  flash();
  await sleep(900);
  return id === flow;
}

// 장면 흔들기
function quake() {
  const scene = $('scene');
  scene.classList.remove('quake');
  void scene.offsetWidth;
  scene.classList.add('quake');
}

// 화면 번쩍 (상자 → 완성품으로 넘어가는 순간을 가린다. 장면이 바뀌어도 남아서 서서히 사라짐)
function flash() {
  const f = el('div', { class: 'flash', 'aria-hidden': 'true' });
  $('scene').append(f);
  setTimeout(() => f.remove(), 1000);
}

// 상자가 터질 때 사방으로 튀는 나무 조각과 별
function burstBits() {
  return el(
    'div',
    { class: 'bits' },
    Array.from({ length: 30 }, (_, i) => {
      const star = i % 3 === 0;
      const bit = el('i', { class: star ? 'star' : '', text: star ? pick(['✦', '★', '✧']) : '' });
      const angle = Math.random() * Math.PI * 2;
      const dist = 140 + Math.random() * 200;
      bit.style.setProperty('--dx', `${Math.round(Math.cos(angle) * dist)}px`);
      bit.style.setProperty('--dy', `${Math.round(Math.sin(angle) * dist - 60)}px`);
      bit.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`);
      return bit;
    }),
  );
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
  celebrate();
  $('plaque').textContent = candidate.name;
  say('', img ? fill(pick(candidate.storage ? [...LINES.done, ...LINES.doneStorage] : LINES.done), candidate.name) : pick(LINES.noImage));

  const actor = result?.actor ? `${withSubject(result.actor.name)} ${candidate.name} 흉내를 냈어요${result.actor.by === 'jev' ? ' · Jev가 고른 배우' : ''}` : '';
  table(
    el('div', { class: 'result' }, [
      el('p', { class: 'count', text: `${count}번 만에 맞혔어요!` }),
      el('p', { class: 'actor', text: actor }),
      el('div', { class: 'row' }, [button('하나 더 만들기', () => startTopic(topic.id), 'primary'), button('다른 주제', goTopics)]),
    ]),
  );
  // 작품 명패 아래: 공유하기
  $('work-actions').replaceChildren(button('📤 공유하기', () => showShareLink(candidate, count, result?.n || 0), 'small'));
}

// 완성품 등장: 뒤로 빛살이 돌고, 그림 위로 반짝 광이 지나가고, 장면 위에서 색종이·나무 조각·별이 쏟아진다
function celebrate() {
  const COLORS = ['#ffd84a', '#ff7a59', '#4fb4ff', '#7ad16b', '#ff9bd2', '#d9a066', '#c58a4f'];
  const confetti = el(
    'div',
    { class: 'confetti', 'aria-hidden': 'true' },
    Array.from({ length: 46 }, (_, i) => {
      const star = i % 5 === 0;
      const bit = el('i', { class: star ? 'star' : '', text: star ? '★' : '' });
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.animationDelay = `${(Math.random() * 0.9).toFixed(2)}s`;
      bit.style.animationDuration = `${(2.2 + Math.random() * 1.4).toFixed(2)}s`;
      bit.style.setProperty('--c', pick(COLORS));
      bit.style.setProperty('--drift', `${Math.round(Math.random() * 160 - 80)}px`);
      bit.style.setProperty('--rot', `${Math.round(Math.random() * 900 - 450)}deg`);
      return bit;
    }),
  );
  $('scene').append(confetti);
  setTimeout(() => confetti.remove(), 4800);
}

// 공유: 버튼 자리에 공유 링크를 보여준다 (누르면 전체 선택돼서 바로 복사할 수 있음).
// 링크는 공유용 결과 페이지(/share/...)라서 받은 사람이 열면 그림과 [나도 해보기]가 나온다.
function showShareLink(candidate, count, n = 0) {
  const url = `${location.origin}/share/${topic.id}/${candidate.id}?q=${count}${n ? `&n=${n}` : ''}`; // n: 정답의 몇 번째 그림
  const input = el('input', { class: 'share-url', value: url, readonly: '', 'aria-label': '공유 링크' });
  input.addEventListener('focus', () => input.select());
  $('work-actions').replaceChildren(el('div', { class: 'share-box' }, [el('p', { text: '링크를 공유해주세요' }), input]));
  input.focus();
}

// ---------- 못 맞히면 ----------
function goLose() {
  setScene('lose', { pose: 'sweat' });
  say(...pick(LINES.lose));
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
    say('', pick(LINES.thanks));
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
