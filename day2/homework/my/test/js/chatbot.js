// 우측 하단 챗봇
// 1) 처음 열면 이름·이메일·개인정보 동의를 받아 대화 시작 (/api/session)
// 2) 입력하는 동안 잠깐 멈출 때마다 감정 분석 요청 (/api/emotion, 결과는 화면에 보이지 않음)
// 3) 질문은 /api/chat — 답은 서버가 정함: 자주 묻는 질문은 저장된 답, 나머지는 규칙 검사 후 AI

const SID_KEY = 'kigle-chat-sid';
const PROFILE_KEY = 'kigle-chat-profile';
const TYPING_DELAY = 700; // 입력이 이만큼 멈추면 감정 분석

const safe = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
};

function sessionId() {
  let id = safe.get(SID_KEY);
  if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    id = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    safe.set(SID_KEY, id);
  }
  return id;
}

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// 글 속 주소만 링크로 (나머지는 그대로 글자)
function richText(text) {
  const frag = document.createDocumentFragment();
  String(text).split(/(https?:\/\/[^\s)]+)/g).forEach((part, i) => {
    if (i % 2) {
      const a = el('a', null, part);
      a.href = part;
      a.target = '_blank';
      a.rel = 'noopener';
      frag.append(a);
    } else if (part) frag.append(part);
  });
  return frag;
}

const post = (path, body, signal) => fetch(path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sessionId: sessionId(), ...body }),
  signal,
});

const root = el('div', 'cb');
root.innerHTML = `
  <p class="cb-tip" hidden>궁금한 게 있나요? 🦖</p>
  <button class="cb-fab" type="button" aria-expanded="false" aria-controls="cb-panel" aria-label="코코비 도우미에게 물어보기">
    <span class="cb-face" aria-hidden="true"><i></i><i></i></span>
    <span class="cb-x" aria-hidden="true">✕</span>
  </button>
  <section class="cb-panel" id="cb-panel" role="dialog" aria-modal="false" aria-labelledby="cb-name" hidden>
    <header class="cb-head">
      <span class="cb-face cb-avatar" aria-hidden="true"><i></i><i></i></span>
      <div class="cb-title"><strong id="cb-name">코코비 도우미</strong><span>자주 묻는 질문 · AI 안내</span></div>
      <button class="cb-close" type="button" aria-label="챗봇 닫기">✕</button>
    </header>
    <div class="cb-log" role="log" aria-live="polite"></div>
    <form class="cb-form">
      <label class="cb-sr" for="cb-input">질문 입력</label>
      <textarea id="cb-input" rows="1" maxlength="300" placeholder="이름과 이메일을 먼저 알려 주세요" enterkeyhint="send" disabled></textarea>
      <button class="cb-send" type="submit" aria-label="보내기" disabled>➤</button>
    </form>
    <p class="cb-notice"></p>
  </section>`;
document.body.append(root);

const $ = (s) => root.querySelector(s);
const fab = $('.cb-fab');
const panel = $('.cb-panel');
const log = $('.cb-log');
const form = $('.cb-form');
const input = $('#cb-input');
const sendBtn = $('.cb-send');
const tip = $('.cb-tip');

let faq = null; // { botName, greeting, notice, consent, maxChars, typingAnalysis, categories, items }
let profile = null; // { name } — 대화를 시작했으면 있음
let busy = false;
let locked = false;

const scrollDown = () => requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));

function bubble(who, text, extra) {
  const row = el('div', `cb-row cb-${who}`);
  const b = el('div', 'cb-bubble');
  if (text != null) b.append(richText(text));
  if (extra) b.append(extra);
  row.append(b);
  log.append(row);
  scrollDown();
  return b;
}

function setInput(enabled, placeholder) {
  input.disabled = !enabled;
  sendBtn.disabled = !enabled;
  input.placeholder = placeholder;
}

// ---------- 대화 시작: 이름 · 이메일 · 동의 ----------
function startForm() {
  const f = el('form', 'cb-start');
  f.noValidate = true;
  f.innerHTML = `
    <label class="cb-field"><span>이름</span><input name="name" maxlength="20" autocomplete="name" placeholder="예: 김코코" required /></label>
    <label class="cb-field"><span>이메일</span><input name="email" type="email" maxlength="100" autocomplete="email" placeholder="name@example.com" required /></label>
    <details class="cb-consent"><summary>개인정보 수집·이용 안내 보기</summary><p></p></details>
    <label class="cb-agree"><input name="consent" type="checkbox" required /> <span>개인정보 수집·이용에 동의해요 (필수)</span></label>
    <p class="cb-error" role="alert"></p>
    <button class="cb-start-btn" type="submit">대화 시작하기</button>`;
  f.querySelector('.cb-consent p').textContent = faq.consent;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = f.querySelector('.cb-error');
    const field = (n) => f.elements.namedItem(n); // f.name 은 폼 자체의 name 속성이라 이렇게 꺼냄
    const name = field('name').value.trim();
    const email = field('email').value.trim();
    if (!name) return (err.textContent = '이름을 적어 주세요.');
    if (!email || !field('email').checkValidity()) return (err.textContent = '이메일 주소를 확인해 주세요.');
    if (!field('consent').checked) return (err.textContent = '대화를 시작하려면 동의가 필요해요.');
    err.textContent = '';
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const res = await post('/api/session', { name, email, consent: true, page: location.pathname, referrer: document.referrer });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '잠시 후 다시 시도해 주세요.');
      profile = { name: data.name };
      safe.set(PROFILE_KEY, JSON.stringify(profile));
      f.closest('.cb-row').remove();
      bubble('bot', data.greeting, topics());
      setInput(true, '궁금한 걸 적어 주세요');
      input.focus({ preventScroll: true });
    } catch (x) {
      err.textContent = x.message;
      btn.disabled = false;
    }
  });
  return f;
}

function askProfile(message) {
  profile = null;
  safe.del(PROFILE_KEY);
  setInput(false, '이름과 이메일을 먼저 알려 주세요');
  bubble('bot', message, startForm());
  setTimeout(() => log.querySelector('.cb-start input')?.focus({ preventScroll: true }), 50);
}

// ---------- 주제 → 자주 묻는 질문 ----------
function topics(label = '주제를 골라 보세요') {
  if (!faq?.categories.length) return null;
  const wrap = el('div', 'cb-topics');
  wrap.append(el('p', 'cb-label', label));
  const chips = el('div', 'cb-chips');
  for (const c of faq.categories) {
    const b = el('button', 'cb-chip', `${c.icon} ${c.name}`);
    b.type = 'button';
    b.addEventListener('click', () => questions(c));
    chips.append(b);
  }
  wrap.append(chips);
  return wrap;
}

function questions(cat) {
  const list = el('div', 'cb-questions');
  for (const q of faq.items.filter((i) => i.categoryId === cat.id)) {
    const b = el('button', 'cb-q', q.question);
    b.type = 'button';
    b.addEventListener('click', () => ask({ faqId: q.id }, q.question));
    list.append(b);
  }
  bubble('bot', `${cat.icon} ${cat.name}에서 자주 묻는 질문이에요.`, list);
}

async function load() {
  try {
    const res = await fetch('/api/faq');
    if (!res.ok) throw new Error(res.status);
    faq = await res.json();
    $('#cb-name').textContent = faq.botName;
    $('.cb-notice').textContent = faq.notice;
    input.maxLength = faq.maxChars;
    try {
      profile = JSON.parse(safe.get(PROFILE_KEY) || 'null');
    } catch {
      profile = null;
    }
    if (profile?.name) {
      bubble('bot', `${profile.name} 님, 이어서 물어보세요.`, topics());
      setInput(true, '궁금한 걸 적어 주세요');
    } else {
      askProfile(faq.greeting);
    }
  } catch {
    faq = null;
    bubble('bot', '앗, 챗봇을 불러오지 못했어요. 잠시 후 다시 열어 주세요.');
  }
}

function lock(reason) {
  locked = true;
  setInput(false, reason);
  root.querySelectorAll('.cb-chip, .cb-q').forEach((b) => (b.disabled = true));
}

// ---------- 입력 중 감정 분석 (멈출 때마다, 같은 문장은 다시 보내지 않음) ----------
let typingTimer = 0;
let typingCtrl = null;
let lastAnalyzed = '';

function cancelTyping() {
  clearTimeout(typingTimer);
  typingCtrl?.abort();
  typingCtrl = null;
}

function scheduleTyping() {
  if (!faq?.typingAnalysis || !profile || locked) return;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    const text = input.value.trim();
    if (text.length < 2 || text === lastAnalyzed) return;
    lastAnalyzed = text;
    typingCtrl?.abort();
    typingCtrl = new AbortController();
    post('/api/emotion', { text }, typingCtrl.signal).catch(() => {});
  }, TYPING_DELAY);
}

// ---------- 질문 보내기 ----------
async function ask(payload, shownText) {
  if (busy || locked || !profile) return;
  busy = true;
  cancelTyping();
  lastAnalyzed = '';
  sendBtn.disabled = true;
  bubble('me', shownText);
  const typing = bubble('bot', null, el('span', 'cb-typing', '•••'));
  typing.setAttribute('aria-label', '답변을 쓰는 중');
  try {
    const res = await post('/api/chat', payload);
    const data = await res.json().catch(() => ({}));
    typing.closest('.cb-row').remove();
    if (data.needProfile) return askProfile(data.reply);
    if (!res.ok) {
      bubble('bot', data.error || '앗, 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const extra = el('div');
    if (data.warning) extra.append(el('p', 'cb-warning', `⚠️ ${data.warning}`));
    if (data.showTopics && !data.blocked && !data.ended) {
      const t = topics('다른 주제도 있어요');
      if (t) extra.append(t);
    }
    bubble('bot', data.reply, extra.childNodes.length ? extra : null);
    if (data.blocked) lock('대화가 잠시 제한됐어요');
    else if (data.ended) lock('이번 대화가 끝났어요');
  } catch {
    typing.closest('.cb-row')?.remove();
    bubble('bot', '인터넷 연결을 확인하고 다시 시도해 주세요.');
  } finally {
    busy = false;
    if (!locked && profile) sendBtn.disabled = false;
  }
}

// ---------- 열기 · 닫기 ----------
function open() {
  tip.hidden = true;
  panel.hidden = false;
  root.classList.add('is-open');
  fab.setAttribute('aria-expanded', 'true');
  fab.setAttribute('aria-label', '챗봇 닫기');
  if (!log.childElementCount) load();
  else if (profile && !locked) setTimeout(() => input.focus({ preventScroll: true }), 50);
}

function close() {
  panel.hidden = true;
  root.classList.remove('is-open');
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-label', '코코비 도우미에게 물어보기');
  fab.focus({ preventScroll: true });
}

fab.addEventListener('click', () => (panel.hidden ? open() : close()));
$('.cb-close').addEventListener('click', close);
panel.addEventListener('keydown', (e) => e.key === 'Escape' && close());

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy || locked) return;
  input.value = '';
  input.style.height = '';
  ask({ message: text }, text);
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    form.requestSubmit();
  }
});
input.addEventListener('input', () => {
  input.style.height = '';
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  scheduleTyping();
});

// 처음 방문하면 잠깐 말풍선으로 알려 줌 (대화 창을 연 적 없을 때만)
setTimeout(() => {
  if (!panel.hidden || safe.get('kigle-chat-tip')) return;
  safe.set('kigle-chat-tip', '1');
  tip.hidden = false;
  setTimeout(() => (tip.hidden = true), 6000);
}, 2500);
