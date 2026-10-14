// 챗봇 관리자 화면 — /api/admin?op=... 를 부름 (로그인 쿠키는 /api/admin 에만 붙음)

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(op, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/admin?op=${op}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && op !== 'login') {
    showLogin();
    throw new Error('로그인이 필요해요.');
  }
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

function toast(text) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

// ---------- 로그인 ----------
function showLogin() {
  $('.app').hidden = true;
  $('.login').hidden = false;
  $('.login input').focus();
}

$('.login-card').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('.login .form-error');
  err.textContent = '';
  try {
    await api('login', { method: 'POST', body: { password: e.target.password.value } });
    e.target.reset();
    start();
  } catch (x) {
    err.textContent = x.message;
  }
});

$('.logout').addEventListener('click', async () => {
  await api('logout', { method: 'POST', body: {} }).catch(() => {});
  showLogin();
});

// ---------- 탭 ----------
const loaders = { kb: loadKb, chats: loadChats, emotion: loadEmotion, rules: loadRules, blocks: loadBlocks, status: loadStatus };
function openTab(name) {
  stopLive();
  $$('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== name));
  loaders[name]();
  history.replaceState(null, '', `#${name}`);
}
$$('.tabs [role=tab]').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));

// ---------- 질문·답변 ----------
let kb = null;
let activeCat = 'all';

async function loadKb() {
  kb = await api('kb');
  renderKb();
}

function renderKb() {
  const counts = Object.fromEntries(kb.categories.map((c) => [c.id, 0]));
  kb.items.forEach((i) => (counts[i.categoryId] = (counts[i.categoryId] || 0) + 1));

  const list = $('.cat-list');
  list.innerHTML = `<li class="${activeCat === 'all' ? 'active' : ''}"><button class="cat-pick" data-cat="all"><span>🗂 전체</span><span class="count">${kb.items.length}</span></button></li>`
    + kb.categories.map((c, i) => `
      <li class="${activeCat === c.id ? 'active' : ''}">
        <button class="cat-pick" data-cat="${esc(c.id)}"><span>${esc(c.icon)} ${esc(c.name)}</span><span class="count">${counts[c.id] || 0}</span></button>
        <span class="cat-tools">
          <button class="icon-btn" data-move="up" data-id="${esc(c.id)}" aria-label="위로" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="icon-btn" data-move="down" data-id="${esc(c.id)}" aria-label="아래로" ${i === kb.categories.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="icon-btn" data-edit-cat="${esc(c.id)}" aria-label="이름 바꾸기">✎</button>
          <button class="icon-btn" data-del-cat="${esc(c.id)}" aria-label="삭제">🗑</button>
        </span>
      </li>`).join('');

  const q = $('.search').value.trim().toLowerCase();
  const draftsOnly = $('.only-drafts').checked;
  const cat = kb.categories.find((c) => c.id === activeCat);
  $('.items-title').textContent = cat ? `${cat.icon} ${cat.name}` : '📚 전체 질문';
  const catName = Object.fromEntries(kb.categories.map((c) => [c.id, `${c.icon} ${c.name}`]));
  const items = kb.items.filter((i) => (activeCat === 'all' || i.categoryId === activeCat)
    && (!draftsOnly || !i.enabled)
    && (!q || `${i.question}\n${i.answer}`.toLowerCase().includes(q)));

  $('.item-list').innerHTML = items.length
    ? items.map((i) => `
      <li class="item ${i.enabled ? '' : 'off'}">
        <div class="item-top"><p class="item-q">${esc(i.question)}</p></div>
        <p class="item-a">${esc(i.answer)}</p>
        <div class="item-meta">
          <span class="tag ${i.enabled ? 'on' : 'draft'}">${i.enabled ? '🟢 켜짐' : '⚪ 꺼짐'}</span>
          ${activeCat === 'all' ? `<span>${esc(catName[i.categoryId] || '카테고리 없음')}</span>` : ''}
          <span class="spacer"></span>
          <button class="btn small ghost" data-toggle="${esc(i.id)}">${i.enabled ? '⏸ 끄기' : '▶️ 켜기'}</button>
          <button class="btn small" data-edit="${esc(i.id)}">✏️ 수정</button>
          <button class="btn small danger" data-del="${esc(i.id)}">🗑 삭제</button>
        </div>
      </li>`).join('')
    : `<li class="empty">${q || draftsOnly ? '조건에 맞는 질문이 없어요.' : '아직 질문이 없어요. "+ 질문 추가"로 만들어 보세요.'}</li>`;
}

async function mutate(op, method, body, done) {
  try {
    kb = await api(op, { method, body: { ...body, rev: kb.rev } });
    renderKb();
    if (done) toast(done);
    return true;
  } catch (x) {
    alert(x.message);
    if (/새로고침/.test(x.message)) loadKb();
    return false;
  }
}

$('.cat-list').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.cat) {
    activeCat = b.dataset.cat;
    renderKb();
  } else if (b.dataset.move) mutate('moveCategory', 'POST', { id: b.dataset.id, dir: b.dataset.move });
  else if (b.dataset.editCat) editCategory(kb.categories.find((c) => c.id === b.dataset.editCat));
  else if (b.dataset.delCat) {
    const c = kb.categories.find((x) => x.id === b.dataset.delCat);
    if (confirm(`"${c.name}" 카테고리를 지울까요?`) && (await mutate('category', 'DELETE', { id: c.id }, '카테고리를 지웠어요.')) && activeCat === c.id) {
      activeCat = 'all';
      renderKb();
    }
  }
});

$('.item-list').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const find = (id) => kb.items.find((i) => i.id === id);
  if (b.dataset.edit) editItem(find(b.dataset.edit));
  else if (b.dataset.toggle) {
    const i = find(b.dataset.toggle);
    if (!i.enabled && /\[관리자 확인 필요\]/.test(i.answer)) return alert('답변에 "[관리자 확인 필요]"가 남아 있어요. 수정해서 실제 답변을 적은 뒤 켜 주세요.');
    mutate('item', 'POST', { item: { ...i, enabled: !i.enabled } }, i.enabled ? '껐어요.' : '켰어요.');
  } else if (b.dataset.del) {
    const i = find(b.dataset.del);
    if (confirm(`이 질문을 지울까요?\n\n${i.question}`)) mutate('item', 'DELETE', { id: i.id }, '지웠어요.');
  }
});

$('.search').addEventListener('input', () => renderKb());
$('.only-drafts').addEventListener('change', () => renderKb());
$('.add-item').addEventListener('click', () => editItem(null));
$('.add-cat').addEventListener('click', () => editCategory(null));
$('.reset-kb').addEventListener('click', () => {
  if (confirm('질문·답변을 처음 상태(기본 지식베이스)로 되돌릴까요?\n지금까지 고친 내용은 모두 사라져요.')) mutate('resetKb', 'POST', {}, '처음 상태로 되돌렸어요.');
});

// 편집 창: 저장 버튼을 누르면 서버에 저장하고, 실패하면 창을 열어 둔 채 오류를 보여 줌
function runModal(dialog, fill, save) {
  const form = $('form', dialog);
  const err = $('.form-error', dialog);
  err.textContent = '';
  fill(form);
  dialog.showModal();
  form.onsubmit = async (e) => {
    if (e.submitter?.value !== 'save') return;
    e.preventDefault();
    err.textContent = '';
    const ok = await save(form).catch((x) => {
      err.textContent = x.message;
      return false;
    });
    if (ok) dialog.close();
  };
}

function editItem(item) {
  const dialog = $('.item-modal');
  runModal(dialog, (f) => {
    $('.modal-title', dialog).textContent = item ? '질문 수정' : '질문 추가';
    f.categoryId.innerHTML = kb.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</option>`).join('');
    f.categoryId.value = item?.categoryId || (activeCat !== 'all' ? activeCat : kb.categories[0]?.id || '');
    f.question.value = item?.question || '';
    f.answer.value = item?.answer || '';
    f.enabled.checked = item ? item.enabled : true;
  }, async (f) => {
    if (f.enabled.checked && /\[관리자 확인 필요\]/.test(f.answer.value)) throw new Error('답변에 "[관리자 확인 필요]"가 남아 있어요. 실제 답변으로 바꾸거나 "켜기"를 풀어 주세요.');
    kb = await api('item', {
      method: 'POST',
      body: { rev: kb.rev, item: { id: item?.id, categoryId: f.categoryId.value, question: f.question.value, answer: f.answer.value, enabled: f.enabled.checked } },
    });
    renderKb();
    toast('저장했어요.');
    return true;
  });
}

function editCategory(cat) {
  const dialog = $('.cat-modal');
  runModal(dialog, (f) => {
    $('.modal-title', dialog).textContent = cat ? '카테고리 수정' : '카테고리 추가';
    f.icon.value = cat?.icon || '';
    f.name.value = cat?.name || '';
  }, async (f) => {
    kb = await api('category', { method: 'POST', body: { rev: kb.rev, category: { id: cat?.id, icon: f.icon.value, name: f.name.value } } });
    renderKb();
    toast('저장했어요.');
    return true;
  });
}

// ---------- 공통: 감정 표시 ----------
let EMO = {}; // 감정 id → { label, emoji, negative }
const emoChip = (e, extra = '') => (e && EMO[e.top]
  ? `<span class="emo-chip ${EMO[e.top].negative ? 'neg' : ''}" title="Jev 감정 분류">${EMO[e.top].emoji} ${esc(EMO[e.top].label)} ${e.percent}%${extra}</span>`
  : '');
function emoBars(probs, limit = 10) {
  return `<ul class="emo-bars">${Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, p]) => `
    <li class="${EMO[k]?.negative ? 'neg' : ''}"><span>${EMO[k]?.emoji || ''} ${esc(EMO[k]?.label || k)}</span><i style="--p:${p}%"></i><b>${p}%</b></li>`).join('')}</ul>`;
}
const fmtTime = (t) => (t ? new Date(t).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-');

// ---------- 채팅 내역 ----------
let chats = [];
let openChat = null;
let liveTimer = 0;
const VERDICT = { answer: '✅ 답변', smalltalk: '👋 인사', unknown: '🤷 자료 없음', off_topic: '🙅 무관', injection: '🛡 캐내기', wasteful: '💸 낭비', repeat: '🔁 반복', busy: '⏳ AI 상한', error: '❗ 오류', match: '🎯 비슷한 질문 답', suggest: '💡 질문 제안', no_match: '🤷 못 찾음' };

function stopLive() {
  clearInterval(liveTimer);
  liveTimer = 0;
}
function startLive() {
  stopLive();
  if ($('.live').checked) {
    liveTimer = setInterval(() => {
      if (document.hidden) return;
      loadChatList();
      if (openChat) showChat(openChat, true);
    }, 5000);
  }
}

async function loadChats() {
  await loadChatList();
  if (openChat) showChat(openChat, true);
  startLive();
}

async function loadChatList() {
  const data = await api(`conversations&q=${encodeURIComponent($('.chat-search').value.trim())}`);
  EMO = data.emotions;
  chats = data.items;
  $('.chat-list').innerHTML = chats.length
    ? chats.map((c) => `
      <li><button class="chat-pick ${c.id === openChat ? 'active' : ''}" data-id="${esc(c.id)}">
        <span class="chat-top"><b>${esc(c.name)}</b><small>${fmtTime(c.lastAt)}</small></span>
        ${c.email ? `<span class="chat-mail">${esc(c.email)}</span>` : ''}
        <span class="chat-last">${esc(c.lastText || '(아직 질문 없음)')}</span>
        <span class="chat-tags">${emoChip(c.last)}${c.peak && c.peak.top !== c.last?.top ? emoChip(c.peak, ' 최고') : ''}<span class="tag">💬 ${c.count}</span>${c.blocked ? '<span class="tag draft">⛔ 제한됨</span>' : c.strikes ? `<span class="tag draft">⚠️ 경고 ${c.strikes}</span>` : ''}</span>
      </button></li>`).join('')
    : '<li class="muted">💤 아직 대화가 없어요.</li>';
}

async function showChat(id, quiet) {
  openChat = id;
  $$('.chat-pick').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  let data;
  try {
    data = await api(`conversation&id=${encodeURIComponent(id)}`);
  } catch (x) {
    if (!quiet) $('.chat-detail').innerHTML = `<p class="muted">${esc(x.message)}</p>`;
    return;
  }
  const c = data.conv;
  EMO = data.emotions;
  const detail = $('.chat-detail');
  const atBottom = detail.scrollHeight - detail.scrollTop - detail.clientHeight < 40;
  const expires = c.consent ? c.startedAt + c.consent.retentionDays * 86400000 : null;
  detail.innerHTML = `
    <div class="row-head">
      <h2>🙋 ${esc(c.name)} 님의 대화</h2>
      <button class="btn small danger del-chat" type="button">🗑 대화 삭제</button>
    </div>
    <dl class="chat-info">
      ${c.email ? `<dt>📧 이메일</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>` : ''}
      <dt>🕒 시작</dt><dd>${fmtTime(c.startedAt)} · 마지막 ${fmtTime(c.lastAt)}</dd>
      ${c.consent ? `<dt>✅ 동의</dt><dd>${fmtTime(c.consent.at)} (문구 버전 ${esc(c.consent.version)}) · ${fmtTime(expires)} 자동 삭제</dd>` : ''}
      <dt>🌏 접속</dt><dd>${esc(c.place || '지역 모름')} · ${esc(c.ip)}</dd>
      <dt>💻 기기</dt><dd class="small">${esc(c.ua || '-')}</dd>
      <dt>📄 페이지</dt><dd>${esc(c.page || '-')} ${c.referrer ? `· ${esc(c.referrer)}에서 옴` : ''}</dd>
    </dl>
    <ol class="msgs">${c.messages.length ? c.messages.map((m) => m.role === 'user' ? `
      <li class="msg user">
        <div class="msg-bubble">${esc(m.text)}</div>
        <div class="msg-meta">${fmtTime(m.at)} · ${m.source === 'faq' ? '🔘 주제 버튼' : '⌨️ 직접 입력'} ${emoChip(m.emotion, m.emotion?.intensity ? ` · 세기 ${m.emotion.intensity}` : '')}
          ${m.peak && m.emotion && m.peak.percent > (m.emotion.probs?.[m.peak.top] || 0) ? `<span class="muted">✍️ 작성 중 최고 ${EMO[m.peak.top]?.emoji} ${esc(EMO[m.peak.top]?.label)} ${m.peak.percent}%</span>` : ''}</div>
        ${m.emotion ? `<details class="msg-emo"><summary>📊 감정 분포</summary>${emoBars(m.emotion.probs, 5)}</details>` : ''}
      </li>` : `
      <li class="msg bot">
        <div class="msg-bubble">${esc(m.text)}</div>
        <div class="msg-meta">${fmtTime(m.at)} · <span class="tag">${esc(VERDICT[m.verdict] || m.verdict)}</span> <span class="muted">${{ ai: '🤖 AI', faq: '📚 저장된 답', rule: '📏 규칙' }[m.source] || esc(m.source)}</span>
          ${(m.applied || []).map((k) => `<span class="tag on" title="이 감정 응대 기준을 OpenAI 에 함께 보냈어요">${EMO[k]?.emoji || ''} ${esc(EMO[k]?.label || k)} 응대</span>`).join('')}
          ${m.warning ? `<span class="tag draft">${esc(m.warning)}</span>` : ''}</div>
      </li>`).join('') : '<li class="muted">아직 질문이 없어요.</li>'}</ol>`;
  if (!quiet || atBottom) detail.scrollTop = detail.scrollHeight;
  $('.del-chat', detail).addEventListener('click', async () => {
    if (!confirm(`${c.name} 님의 대화를 지울까요? 되돌릴 수 없어요.`)) return;
    await api('conversation', { method: 'DELETE', body: { id: c.id } });
    openChat = null;
    detail.innerHTML = '<p class="muted">대화를 지웠어요.</p>';
    loadChatList();
    toast('대화를 지웠어요.');
  });
}

$('.chat-list').addEventListener('click', (e) => {
  const b = e.target.closest('.chat-pick');
  if (b) showChat(b.dataset.id);
});
let searchTimer = 0;
$('.chat-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadChatList, 300);
});
$('.live').addEventListener('change', startLive);

// ---------- 감정 분류 ----------
let emoReady = false;

async function loadEmotion() {
  const [meta, st] = await Promise.all([api('emotions'), api('settings')]);
  EMO = meta.emotions;
  emoReady = meta.ready;
  ({ settings, defaults } = st);
  renderPolicy();
  if (!emoReady) $('.emo-result').innerHTML = '<p class="bad">🔌 TYPESAFE_API_KEY 가 설정되지 않아 감정 분류를 할 수 없어요. 연결 상태 탭을 확인해 주세요.</p>';
  else if ($('.emo-input').value.trim()) runEmotion();
}

function renderPolicy() {
  const e = settings.emotion;
  $('.emo-policy').innerHTML = `
    <h2>💗 감정 응대 기준</h2>
    <p class="muted">Jev 가 분류한 감정이 기준 확률 이상이면, 아래 첫 문장 예시와 응대 기준을 이용자 질문과 함께 OpenAI 에 보내요 (높은 순서로 최대 2개). 첫 문장은 AI 를 쓰지 않는 규칙 답변(자료 없음 · 무관한 질문 등) 앞에도 붙어요. <code>{name}</code> 은 이용자 이름으로 바뀌어요.</p>
    <div class="policy-top">
      <label class="check"><input type="checkbox" name="enabled" ${e.enabled ? 'checked' : ''} /> 🎭 감정 응대 사용</label>
      <label class="check"><input type="checkbox" name="typingAnalysis" ${e.typingAnalysis ? 'checked' : ''} /> ⌨️ 입력하는 동안 실시간 분석</label>
      <label class="field inline"><span>🎯 기준 확률</span><input type="number" name="minPercent" min="0" max="100" value="${e.minPercent}" /> %</label>
    </div>
    <div class="policy-rows">${Object.keys(defaults.emotion.rules).map((k) => `
      <div class="policy-row ${EMO[k]?.negative ? 'neg' : ''}">
        <div class="policy-emo">${EMO[k]?.emoji || ''} ${esc(EMO[k]?.label || k)}</div>
        <label class="field"><span>첫 문장 예시</span><input name="opener.${k}" maxlength="200" value="${esc(e.rules[k].opener)}" placeholder="(없음)" /></label>
        <label class="field"><span>응대 기준</span><textarea name="guide.${k}" rows="2" maxlength="600" placeholder="(없음 — 이 감정은 따로 응대하지 않음)">${esc(e.rules[k].guide)}</textarea></label>
      </div>`).join('')}</div>
    <div class="rules-actions">
      <button class="btn primary" type="submit">💾 응대 기준 저장</button>
      <button class="btn ghost reset-policy" type="button">↩️ 이 기준만 기본값으로</button>
      <p class="form-error" role="alert"></p>
    </div>`;
  $('.reset-policy').addEventListener('click', () => {
    if (!confirm('감정 응대 기준을 기본값으로 바꿀까요? (저장을 눌러야 적용돼요)')) return;
    settings = { ...settings, emotion: structuredClone(defaults.emotion) };
    renderPolicy();
    runEmotion();
  });
}

function policyFromForm() {
  const f = $('.emo-policy');
  const rules = {};
  for (const k of Object.keys(defaults.emotion.rules)) {
    rules[k] = { opener: f.elements[`opener.${k}`].value, guide: f.elements[`guide.${k}`].value };
  }
  return { enabled: f.elements.enabled.checked, typingAnalysis: f.elements.typingAnalysis.checked, minPercent: Number(f.elements.minPercent.value), rules };
}

$('.emo-policy').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('.emo-policy .form-error');
  err.textContent = '';
  try {
    ({ settings, defaults } = await api('settings', { method: 'PUT', body: { rev: settings.rev, settings: { ...settings, emotion: policyFromForm() } } }));
    renderPolicy();
    toast('감정 응대 기준을 저장했어요. 바로 적용돼요.');
  } catch (x) {
    err.textContent = x.message;
  }
});
$('.emo-policy').addEventListener('input', () => {
  clearTimeout(emoTimer);
  emoTimer = setTimeout(runEmotion, 600);
});

let emoTimer = 0;
let emoSeq = 0;
async function runEmotion() {
  const text = $('.emo-input').value.trim();
  if (!text || !emoReady) return;
  const seq = ++emoSeq;
  $('.emo-result').classList.add('loading');
  try {
    const r = await api('emotion', { method: 'POST', body: { text, policy: policyFromForm() } });
    if (seq !== emoSeq) return;
    const e = r.emotion;
    $('.emo-result').innerHTML = `
      <div class="emo-head">${emoChip(e)} ${e.intensity ? `<span class="tag">🔥 감정 세기 ${e.intensity}/5</span>` : ''} ${e.confidence != null ? `<span class="tag">🎯 확신도 ${Math.round(e.confidence * 100)}%</span>` : ''}
        ${r.applied.length ? r.applied.map((k) => `<span class="tag on">${EMO[k].emoji} ${esc(EMO[k].label)} 응대 적용</span>`).join('') : '<span class="tag">😶 기준 확률을 넘은 응대 기준 없음</span>'}</div>
      ${emoBars(e.probs)}
      ${r.opener ? `<p class="emo-opener">💬 규칙 답변 앞 첫 문장: <b>${esc(r.opener)}</b></p>` : ''}
      <details open><summary>🤖 OpenAI 에 함께 보내는 내용 (이름은 예시)</summary><pre class="emo-context">${esc(r.context)}</pre></details>`;
  } catch (x) {
    if (seq === emoSeq) $('.emo-result').innerHTML = `<p class="bad">${esc(x.message)}</p>`;
  } finally {
    if (seq === emoSeq) $('.emo-result').classList.remove('loading');
  }
}
$('.emo-input').addEventListener('input', () => {
  clearTimeout(emoTimer);
  emoTimer = setTimeout(runEmotion, 500);
});

// ---------- 규칙 ----------
const LIMIT_LABELS = {
  maxChars: ['질문 최대 글자 수', '이보다 길면 AI를 부르지 않고 돌려보내요.'],
  minIntervalSec: ['질문 사이 최소 간격(초)', '연타 방지'],
  perMinute: ['접속 주소당 1분 질문 수', ''],
  perDay: ['접속 주소당 하루 질문 수', ''],
  perSession: ['대화 하나당 질문 수', '넘으면 대화를 끝내요.'],
  aiPerDay: ['사이트 전체 하루 AI 호출 수', '크레딧 상한. 넘으면 자주 묻는 질문만 답해요.'],
  historyTurns: ['AI에 함께 보내는 이전 대화 수', '많을수록 문맥은 좋아지고 비용은 늘어요.'],
  maxAnswerChars: ['답변 최대 글자 수', ''],
  mailPerHour: ['시간당 알림 메일 최대', '메일 폭주 방지'],
};
const STRIKE_LABELS = {
  offTopic: ['무관한 질문 허용 횟수', '이 횟수가 되면 대화를 제한해요.'],
  injection: ['프롬프트 캐내기 허용 횟수', ''],
  wasteful: ['반복·낭비성 질문 허용 횟수', ''],
  blockMinutes: ['무관·낭비 제한 시간(분)', ''],
  injectionBlockMinutes: ['캐내기 제한 시간(분)', ''],
  ipBlockAfter: ['접속 주소 제한 기준', '24시간 안에 대화가 이 횟수만큼 제한되면 주소 자체를 막아요.'],
  ipBlockMinutes: ['접속 주소 제한 시간(분)', ''],
};
const MESSAGE_LABELS = {
  match: 'AI 없이 비슷한 질문을 찾아 답할 때 (답변 앞에 붙음)', suggest: 'AI 없이 비슷한 질문 후보를 보여 줄 때', noMatch: 'AI 없이 비슷한 질문을 못 찾았을 때',
  unknown: '지식베이스에 답이 없을 때', offTopic: '무관한 질문', injection: '프롬프트 캐내기 시도', wasteful: '반복·낭비성 질문',
  repeat: '같은 질문을 한 번 더 했을 때 (앞 답변 앞에 붙음)', gibberish: '의미 없는 입력', smalltalk: '인사·감사 ({name}=이용자 이름)',
  warning: '경고 문구 ({n}=횟수, {limit}=허용 횟수)', blocked: '대화가 제한됐을 때', tooLong: '너무 긴 질문 ({max}=최대 글자 수)',
  tooFast: '너무 빨리 보낼 때', rateLimited: '질문 수 제한에 걸렸을 때', sessionLimit: '대화당 질문 수를 다 썼을 때',
  busy: '하루 AI 호출 상한을 넘었을 때', error: 'AI 오류',
};

let settings = null;
let defaults = null;

async function loadRules() {
  ({ settings, defaults } = await api('settings'));
  renderRules();
}

const numField = (group, key, [label, help]) => `
  <label class="field"><span>${esc(label)}</span><input type="number" name="${group}.${key}" value="${settings[group][key]}" required />
  ${help ? `<small>${esc(help)}</small>` : ''}<small>기본값 ${defaults[group][key]}</small></label>`;
const textField = (name, label, value, rows, help = '') => `
  <label class="field"><span>${esc(label)}</span>${rows > 1 ? `<textarea name="${name}" rows="${rows}">${esc(value)}</textarea>` : `<input name="${name}" value="${esc(value)}" />`}
  ${help ? `<small>${esc(help)}</small>` : ''}</label>`;

function renderRules() {
  const s = settings;
  $('.rules').innerHTML = `
    <div class="card">
      <h2>📝 기본 정보</h2>
      ${textField('botName', '챗봇 이름', s.botName, 1)}
      ${textField('greeting', '첫인사', s.greeting, 3)}
      ${textField('notice', '대화 창 아래 안내 문구 ({days}=보관 기간)', s.notice, 2)}
    </div>
    <div class="card">
      <h2>🔐 채팅 내역 보관</h2>
      <p class="muted">이름·이메일은 받지 않아요. 대화 내용·감정 분석 결과·접속 정보만 아래 기간 동안 보관해요.</p>
      <label class="field"><span>보관 기간(일)</span><input type="number" name="privacy.retentionDays" value="${s.privacy.retentionDays}" min="1" max="3650" style="max-width:140px" /><small>대화 시작일로부터 이 기간이 지나면 채팅 내역이 자동 삭제돼요. 기본값 ${defaults.privacy.retentionDays}</small></label>
    </div>
    <div class="card">
      <h2>🤖 AI 답변 지침</h2>
      <label class="check"><input type="checkbox" name="aiEnabled" ${s.aiEnabled ? 'checked' : ''} /> AI(OpenAI) 답변 사용 — 서버에 OPENAI_API_KEY 가 있어야 해요</label>
      <p class="muted">끄면 자유 질문은 AI 없이 가장 비슷한 자주 묻는 질문으로 답하거나 후보를 버튼으로 보여 줘요 (크레딧 0). 켜면 AI가 "질문 · 답변" 탭에서 켜 둔 내용만 근거로 답하고, 아래 지침으로 이상한 질문을 판정해요.</p>
      ${textField('style', '답변 스타일', s.style, 3)}
      ${textField('guidelines', '이상 사용자 판단 지침 (크레딧 낭비 판정 기준)', s.guidelines, 12, '여기에 해당하면 "반복·낭비성 질문"으로 경고가 쌓여요.')}
    </div>
    <div class="card">
      <h2>⏱ 사용량 제한</h2>
      <div class="grid">${Object.entries(LIMIT_LABELS).map(([k, l]) => numField('limits', k, l)).join('')}</div>
    </div>
    <div class="card">
      <h2>⚠️ 경고 · 제한</h2>
      <p class="muted">유형별로 경고가 쌓이다가 허용 횟수에 닿으면 그 대화를 일정 시간 막아요.</p>
      <div class="grid">${Object.entries(STRIKE_LABELS).map(([k, l]) => numField('strikes', k, l)).join('')}</div>
    </div>
    <div class="card">
      <h2>💬 규칙 응답 문구</h2>
      <p class="muted">AI를 쓰지 않고 정해진 대로 나가는 답변이에요.</p>
      ${Object.entries(MESSAGE_LABELS).map(([k, l]) => textField(`messages.${k}`, l, s.messages[k], 2)).join('')}
    </div>
    <div class="card">
      <h2>🛡 프롬프트 캐내기 차단 패턴</h2>
      <p class="muted">한 줄에 하나씩, 정규식으로 적어요 (대소문자 무시). 걸리면 AI를 부르지 않고 바로 막아요.</p>
      ${textField('injectionPatterns', '패턴 목록', s.injectionPatterns.join('\n'), 12)}
    </div>
    <div class="rules-actions">
      <button class="btn primary" type="submit">💾 규칙 저장</button>
      <button class="btn ghost reset-rules" type="button">↩️ 기본값으로 되돌리기</button>
      <p class="form-error" role="alert"></p>
      <span class="muted">${s.updatedAt ? `마지막 저장 ${new Date(s.updatedAt).toLocaleString('ko-KR')}` : '아직 기본값이에요'}</span>
    </div>`;
  $('.reset-rules').addEventListener('click', async () => {
    if (!confirm('규칙을 모두 기본값으로 되돌릴까요?')) return;
    ({ settings, defaults } = await api('resetSettings', { method: 'POST', body: {} }));
    renderRules();
    toast('기본값으로 되돌렸어요.');
  });
}

$('.rules').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const next = structuredClone(settings);
  for (const [name, value] of f) {
    const [a, b] = name.split('.');
    if (name === 'aiEnabled') continue;
    if (name === 'injectionPatterns') next.injectionPatterns = String(value).split('\n').map((x) => x.trim()).filter(Boolean);
    else if (b) next[a][b] = typeof defaults[a][b] === 'number' ? Number(value) : value;
    else next[a] = value;
  }
  next.aiEnabled = e.target.elements.aiEnabled.checked;
  const err = $('.rules .form-error');
  err.textContent = '';
  try {
    ({ settings, defaults } = await api('settings', { method: 'PUT', body: { rev: settings.rev, settings: next } }));
    renderRules();
    toast('규칙을 저장했어요. 바로 적용돼요.');
  } catch (x) {
    $('.rules .form-error').textContent = x.message;
  }
});

// ---------- 차단 기록 ----------
const REASON = { offTopic: '무관한 질문', injection: '프롬프트 캐내기', wasteful: '반복·낭비' };

async function loadBlocks() {
  const { blocks } = await api('blocks');
  $('.blocks tbody').innerHTML = blocks.length
    ? blocks.map((b) => `
      <tr>
        <td>${new Date(b.at).toLocaleString('ko-KR')}</td>
        <td>${b.type === 'ip' ? '🌐 접속 주소' : '💬 대화'}</td>
        <td>${{ offTopic: '🙅', injection: '🛡', wasteful: '💸' }[b.reason] || ''} ${esc(REASON[b.reason] || b.reason)}</td>
        <td>${esc(b.nickname || '-')}</td>
        <td>${esc(b.ip)}</td>
        <td class="msg">${esc(b.message)}</td>
        <td><button class="btn small" data-ip="${esc(b.type === 'ip' ? b.ip : '')}" data-session="${esc(b.sessionId)}">🔓 해제</button></td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="muted">🕊 아직 차단 기록이 없어요.</td></tr>';
}
$('.reload-blocks').addEventListener('click', loadBlocks);
$('.blocks').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !confirm('이 제한을 풀까요?')) return;
  await api('unblock', { method: 'POST', body: { ip: b.dataset.ip || undefined, sessionId: b.dataset.session } });
  toast('제한을 풀었어요.');
});

// ---------- 연결 상태 ----------
async function loadStatus() {
  const s = await api('status');
  const yes = (ok, good, bad) => `<span class="${ok ? 'ok' : 'bad'}">${ok ? `✅ ${good}` : `❌ ${bad}`}</span>`;
  $('.status').innerHTML = `
    <h2>🔌 연결 상태</h2>
    <dl>
      <dt>🤖 AI 답변</dt><dd>${s.aiOn ? `✅ OpenAI 사용 중 · 모델 <code>${esc(s.model)}</code>` : '⏸ 꺼짐 — 자주 묻는 질문 매칭으로 답해요 (크레딧 0)'}</dd>
      <dt>🎭 감정 분류 (Jev)</dt><dd>${yes(s.jev, 'API 키 연결됨', 'TYPESAFE_API_KEY 없음 — 감정 분석 없이 동작해요')} · 모델 <code>${esc(s.jevModel)}</code></dd>
      <dt>📈 오늘 AI 호출</dt><dd>${s.aiToday}회</dd>
      <dt>🗄 저장소</dt><dd>${s.storage === 'redis' ? yes(true, 'Upstash Redis', '') : s.persistent ? yes(true, '로컬 파일 (.data/) — 개발용', '') : yes(false, '', '임시 메모리 — Vercel 에서 Upstash Redis 를 연결해야 저장돼요')}</dd>
      <dt>📧 Gmail 알림</dt><dd>${s.mail ? `${yes(true, '연결됨', '')} · 받는 주소 ${esc(s.notifyTo)}` : yes(false, '', 'GMAIL_USER / GMAIL_APP_PASSWORD 없음')}</dd>
    </dl>
    <button class="btn test-mail" type="button" ${s.mail ? '' : 'disabled'}>✉️ 테스트 메일 보내기</button>
    <p class="muted">대화가 시작될 때마다(대화당 1번) 위 주소로 누가 어떤 질문으로 시작했는지 메일이 가요.</p>`;
  $('.test-mail').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = await api('testMail', { method: 'POST', body: {} });
      toast(`${r.to} 로 보냈어요.`);
    } catch (x) {
      alert(x.message);
    } finally {
      e.target.disabled = false;
    }
  });
}

// ---------- 시작 ----------
async function start() {
  $('.login').hidden = true;
  $('.app').hidden = false;
  const s = await api('status').catch(() => null);
  const banner = $('.banner');
  banner.hidden = !s || s.persistent;
  if (s && !s.persistent) banner.textContent = '⚠️ 저장소가 연결되지 않아 지금 고친 내용은 저장되지 않아요. Vercel > Storage 에서 Upstash for Redis 를 연결해 주세요.';
  openTab(loaders[location.hash.slice(1)] ? location.hash.slice(1) : 'kb');
}

api('me').then((me) => {
  if (me.authed) start();
  else {
    showLogin();
    if (!me.adminReady) $('.login .form-error').textContent = '서버에 ADMIN_PASSWORD(8자 이상)가 설정되지 않았어요.';
  }
});
