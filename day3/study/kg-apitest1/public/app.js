const MAX_SIDE = 1536; // 업로드 전에 이 크기로 줄인다 (속도·비용 절약)

const $ = (id) => document.getElementById(id);
const ui = {
  workspace: $('workspace'),
  dropzone: $('dropzone'),
  file: $('file'),
  keyWarning: $('key-warning'),
  compare: $('compare'),
  original: $('original'),
  originalSlot: $('original-slot'),
  resultSlot: $('result-slot'),
  actions: $('actions'),
  start: $('start'),
  redraw: $('redraw'),
  save: $('save'),
  reset: $('reset'),
  status: $('status'),
  timer: $('timer'),
  models: $('models'),
  docName: $('doc-name'),
  poem: $('poem'),
  poemFile: $('poem-file'),
  poemActions: $('poem-actions'),
  rewrite: $('rewrite'),
  copy: $('copy'),
};

const state = {
  photo: null, // { blob, width, height, name }
  originalUrl: null,
  resultUrl: null,
  poem: null,
  controllers: {}, // paint / poem 진행 중인 요청
  startedAt: 0,
  timerId: 0,
};

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

function setStatus(text) {
  ui.status.textContent = text;
}

// ---------------------------------------------------------------------------
// 장식: 도구 상자와 팔레트
// ---------------------------------------------------------------------------

const TOOLS = [
  '<path d="M3 4l4 1 5-2-1 5 2 4-5-1-4 2 1-5z" stroke-dasharray="2 1"/>',
  '<rect x="2.5" y="3.5" width="11" height="9" stroke-dasharray="2 1"/>',
  '<path d="M2.5 10.5l5-5 5 5-3 3h-4z"/><path d="M5 8l5 5"/>',
  '<path d="M3.5 8.5l5-5 4 4-5 5z"/><path d="M12.5 9.5v3"/>',
  '<path d="M3.5 12.5l6-6M9.5 3.5l3 3M10.5 2.5l3 3"/>',
  '<circle cx="6.5" cy="6.5" r="3.5"/><path d="M9 9l4.5 4.5"/>',
  '<path d="M3 13l1-3.5 7-7 2.5 2.5-7 7z"/><path d="M3 13l1-3.5 2.5 2.5z" fill="#000"/>',
  '<path d="M9.5 2.5l3 3-4 4-3-3z"/><path d="M5.5 8.5c-2 0-3 2-3 5 2 0 4-1 4-3"/>',
  '<rect x="4.5" y="6.5" width="5" height="7"/><path d="M6.5 6.5v-3h4M12 3h1M13 5h1M12 7h1"/>',
  '<path d="M4 13.5L8 2.5l4 11M5.5 9.5h5"/>',
  '<path d="M2.5 13.5l11-11"/>',
  '<path d="M2.5 12.5c2-10 8 2 11-9"/>',
  '<rect x="2.5" y="4.5" width="11" height="7"/>',
  '<path d="M2.5 12.5l2-8 5 3 4-3v8z"/>',
  '<ellipse cx="8" cy="8" rx="5.5" ry="4"/>',
  '<rect x="2.5" y="4.5" width="11" height="7" rx="2.5"/>',
];
const PENCIL_TOOL = 6;
TOOLS.forEach((svg, i) => {
  $('toolbox').append(
    el('span', {
      className: `tool${i === PENCIL_TOOL ? ' active' : ''}`,
      innerHTML: `<svg viewBox="0 0 16 16">${svg}</svg>`,
    }),
  );
});

const PALETTE = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080',
  '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff',
  '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
];
for (const color of PALETTE) {
  $('swatches').append(el('span', { style: `background:${color}` }));
}

// ---------------------------------------------------------------------------
// 서버 상태 (API 키가 있는지)
// ---------------------------------------------------------------------------

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const { hasKey, imageModel, textModel } = await res.json();
    ui.keyWarning.hidden = hasKey;
    ui.models.textContent = `${imageModel} · ${textModel}`;
  } catch {
    ui.models.textContent = '서버 연결 안 됨';
  }
}
checkHealth();
window.addEventListener('focus', checkHealth);

// ---------------------------------------------------------------------------
// 사진 고르기
// ---------------------------------------------------------------------------

async function prepareImage(file) {
  const bitmap = await createImageBitmap(file); // EXIF 회전 정보도 반영됨
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = el('canvas', { width, height });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // 투명 PNG 는 흰 바탕으로
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.92),
  );
  return { blob, width, height };
}

async function loadFile(file) {
  if (!file) return;
  abortAll();
  if (!file.type.startsWith('image/')) {
    setStatus('사진 파일만 올릴 수 있어요.');
    return;
  }
  setStatus('사진을 여는 중…');
  let photo;
  try {
    photo = await prepareImage(file);
  } catch {
    setStatus('이 사진은 브라우저에서 열 수 없어요. JPG나 PNG로 바꿔서 올려 주세요.');
    return;
  }
  const name = file.name.replace(/\.[^.]+$/, '') || '붙여넣은 사진';
  state.photo = { ...photo, name };
  state.poem = null;
  replaceUrl('originalUrl', URL.createObjectURL(photo.blob));
  replaceUrl('resultUrl', null);

  ui.original.src = state.originalUrl;
  const ratio = `${photo.width} / ${photo.height}`;
  ui.originalSlot.style.aspectRatio = ratio;
  ui.resultSlot.style.aspectRatio = ratio;
  ui.docName.textContent = name;
  ui.poemFile.textContent = '시';

  ui.dropzone.hidden = true;
  ui.compare.hidden = false;
  ui.actions.hidden = false;
  ui.start.hidden = false;
  ui.redraw.hidden = true;
  ui.save.hidden = true;

  showResultMessage('아직 안 그렸어요.', '[그림판으로 바꾸기]를 눌러 주세요.');
  showPoemHint('[그림판으로 바꾸기]를 누르면 사진 속 주인공에게 이름을 지어 주고 시를 한 편 쓸게요.');
  setStatus('준비 완료! [그림판으로 바꾸기]를 눌러 주세요.');
  updateButtons();
  ui.start.focus();
}

function replaceUrl(key, url) {
  if (state[key]) URL.revokeObjectURL(state[key]);
  state[key] = url;
}

ui.dropzone.addEventListener('click', (e) => {
  if (!e.target.closest('.key-warning')) ui.file.click();
});
ui.file.addEventListener('change', () => {
  loadFile(ui.file.files[0]);
  ui.file.value = '';
});
document.addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (file) loadFile(file);
});
ui.workspace.addEventListener('dragover', (e) => {
  e.preventDefault();
  ui.workspace.classList.add('dragging');
});
ui.workspace.addEventListener('dragleave', (e) => {
  if (!ui.workspace.contains(e.relatedTarget)) ui.workspace.classList.remove('dragging');
});
ui.workspace.addEventListener('drop', (e) => {
  e.preventDefault();
  ui.workspace.classList.remove('dragging');
  loadFile(e.dataTransfer.files[0]);
});

ui.reset.addEventListener('click', () => {
  abortAll();
  state.photo = null;
  state.poem = null;
  replaceUrl('originalUrl', null);
  replaceUrl('resultUrl', null);
  ui.original.removeAttribute('src');
  ui.docName.textContent = '제목 없음';
  ui.poemFile.textContent = '시';
  ui.compare.hidden = true;
  ui.actions.hidden = true;
  ui.dropzone.hidden = false;
  showPoemHint();
  setStatus('사진을 끌어다 놓거나, 붙여넣거나, 골라 주세요.');
});

// ---------------------------------------------------------------------------
// 서버 호출
// ---------------------------------------------------------------------------

async function post(task, url) {
  const controller = new AbortController();
  state.controllers[task] = controller;
  startTimer();
  updateButtons();

  const form = new FormData();
  form.append('image', state.photo.blob, 'photo.jpg');
  form.append('width', state.photo.width);
  form.append('height', state.photo.height);
  try {
    let res;
    try {
      res = await fetch(url, { method: 'POST', body: form, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new Error('서버에 연결할 수 없어요. 터미널에서 npm start 로 서버가 켜져 있는지 확인해 주세요.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
    return data;
  } finally {
    if (state.controllers[task] === controller) delete state.controllers[task];
    if (!isBusy()) stopTimer();
    updateButtons();
  }
}

const isBusy = (task) => (task ? Boolean(state.controllers[task]) : Object.keys(state.controllers).length > 0);

function abortAll() {
  for (const controller of Object.values(state.controllers)) controller.abort();
  state.controllers = {};
  stopTimer();
}

function updateButtons() {
  ui.start.disabled = isBusy();
  ui.redraw.disabled = isBusy('paint');
  ui.rewrite.disabled = isBusy('poem');
}

function startTimer() {
  if (state.timerId) return;
  state.startedAt = Date.now();
  ui.timer.hidden = false;
  const tick = () => (ui.timer.textContent = `⏱ ${Math.floor((Date.now() - state.startedAt) / 1000)}초`);
  tick();
  state.timerId = setInterval(tick, 1000);
}

function stopTimer() {
  clearInterval(state.timerId);
  state.timerId = 0;
}

function updateProgressStatus() {
  const painting = isBusy('paint');
  const writing = isBusy('poem');
  if (painting && writing) setStatus('그림 그리는 중 · 시 쓰는 중…');
  else if (painting) setStatus('그림 그리는 중… 조금만 기다려 주세요.');
  else if (writing) setStatus('시 쓰는 중…');
}

// ---------------------------------------------------------------------------
// 그림판 변환
// ---------------------------------------------------------------------------

async function runPaint() {
  if (!state.photo) return;
  ui.start.hidden = true;
  ui.save.hidden = true;
  showDrawing();
  const request = post('paint', '/api/paint');
  updateProgressStatus();
  try {
    const { image } = await request;
    const blob = await (await fetch(image)).blob();
    replaceUrl('resultUrl', URL.createObjectURL(blob));
    ui.resultSlot.replaceChildren(el('img', { src: state.resultUrl, alt: '그림판에서 마우스로 그린 것처럼 바뀐 그림' }));
    ui.resultSlot.classList.add('done');
    ui.redraw.hidden = false;
    ui.save.hidden = false;
    updateSaveName();
    setStatus(isBusy('poem') ? '그림 완성! 시는 아직 쓰는 중…' : '완성! 마음에 안 들면 [다시 그리기]를 눌러 보세요.');
  } catch (err) {
    if (err.name === 'AbortError') return;
    showResultError(err.message);
    ui.redraw.hidden = false;
    setStatus('그림을 그리지 못했어요.');
  }
}

function showDrawing() {
  ui.resultSlot.classList.remove('done');
  const scribble = el('div', {
    className: 'scribble',
    innerHTML: `
      <svg class="track" viewBox="0 0 240 150" width="240" height="150" aria-hidden="true">
        <path class="line" pathLength="1" d="M24 112 C 30 60, 60 30, 84 58 S 96 128, 128 104 S 150 30, 176 40 S 222 98, 196 118 S 140 132, 120 126"/>
      </svg>
      <svg class="pencil" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 14l1-4 8-8 3 3-8 8z" fill="#ffd23f" stroke="#000" stroke-width=".8"/>
        <path d="M2 14l1-4 3 3z"/>
      </svg>`,
  });
  ui.resultSlot.replaceChildren(
    el('div', { className: 'slot-message' },
      scribble,
      el('b', { textContent: '마우스로 열심히 그리는 중…' }),
      el('span', { textContent: '보통 30초~1분쯤 걸려요.' }),
    ),
  );
}

function showResultMessage(title, sub) {
  ui.resultSlot.classList.remove('done');
  ui.resultSlot.replaceChildren(
    el('div', { className: 'slot-message' }, el('b', { textContent: title }), el('span', { textContent: sub })),
  );
}

function errorBox(message, onRetry) {
  return el('div', { className: 'error-box', role: 'alert' },
    el('span', {
      innerHTML: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="#e00000" stroke="#000"/><path d="M11 11l10 10M21 11L11 21" stroke="#fff" stroke-width="3"/></svg>',
    }),
    el('div', {},
      el('p', { textContent: message }),
      el('button', { type: 'button', className: 'btn', textContent: '다시 시도', onclick: onRetry }),
    ),
  );
}

function showResultError(message) {
  ui.resultSlot.classList.remove('done');
  ui.resultSlot.replaceChildren(el('div', { className: 'slot-message' }, errorBox(message, runPaint)));
}

function updateSaveName() {
  const base = state.poem?.found ? state.poem.name : state.photo?.name || '그림';
  ui.save.href = state.resultUrl;
  ui.save.download = `${base}-그림판.png`;
}

// ---------------------------------------------------------------------------
// 이름 + 시
// ---------------------------------------------------------------------------

const CATEGORY_LABEL = { person: '사람', animal: '동물', nature: '자연물' };

async function runPoem() {
  if (!state.photo) return;
  ui.poemActions.hidden = true;
  ui.poem.replaceChildren(
    el('p', { className: 'notepad-hint' }, '사진을 들여다보며 이름을 고르고, 시상을 떠올리는 중…', el('span', { className: 'caret' })),
  );
  const request = post('poem', '/api/poem');
  updateProgressStatus();
  try {
    state.poem = await request;
    renderPoem(state.poem);
    if (isBusy('paint')) updateProgressStatus();
    else setStatus('완성! 마음에 안 들면 [다시 그리기]나 [다시 짓기]를 눌러 보세요.');
  } catch (err) {
    if (err.name === 'AbortError') return;
    ui.poem.replaceChildren(errorBox(err.message, runPoem));
    if (isBusy('paint')) updateProgressStatus();
    else setStatus('시를 쓰지 못했어요.');
  }
}

function renderPoem(p) {
  ui.poemActions.hidden = false;
  ui.copy.hidden = !p.found;
  if (!p.found) {
    ui.poemFile.textContent = '시';
    ui.poem.replaceChildren(
      el('p', { className: 'notepad-hint' },
        '이 사진에서는 사람·동물·자연물을 찾지 못해서 시는 쉬어 갈게요. 그림판 변환은 그대로 즐겨 주세요!'),
    );
    return;
  }
  ui.poemFile.textContent = p.name;
  ui.docName.textContent = p.name;
  if (state.resultUrl) updateSaveName();
  ui.poem.replaceChildren(
    el('div', { className: 'poem-meta' },
      el('span', { className: 'chip', textContent: CATEGORY_LABEL[p.category] || '주인공' }),
      el('span', { className: 'subject', textContent: p.subject }),
    ),
    el('h3', { className: 'poem-name' }, el('small', { textContent: '이름' }), `「${p.name}」`),
    el('p', { className: 'name-reason', textContent: p.name_reason }),
    el('hr', { className: 'rule' }),
    el('h3', { className: 'poem-title', textContent: p.title }),
    el('p', { className: 'poem-text', textContent: p.poem }),
  );
}

function showPoemHint(text = '사진을 올리면 사진 속 사람·동물·자연물에게 이름을 지어 주고, 그 이름으로 시를 한 편 써 드려요.') {
  ui.poemActions.hidden = true;
  ui.poem.replaceChildren(el('p', { className: 'notepad-hint' }, text, el('span', { className: 'caret' })));
}

ui.copy.addEventListener('click', async () => {
  const p = state.poem;
  if (!p?.found) return;
  try {
    await navigator.clipboard.writeText(`${p.title}\n\n${p.poem}\n\n— ${p.name}에게`);
    setStatus('시를 클립보드에 복사했어요.');
  } catch {
    setStatus('복사하지 못했어요. 시를 직접 드래그해서 복사해 주세요.');
  }
});

// ---------------------------------------------------------------------------

ui.start.addEventListener('click', () => {
  runPaint();
  runPoem();
});
ui.redraw.addEventListener('click', runPaint);
ui.rewrite.addEventListener('click', runPoem);

showPoemHint();
