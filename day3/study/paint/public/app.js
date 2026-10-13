const MAX_SIDE = 1536; // 업로드 전에 이 크기로 줄인다 (속도·비용 절약)

const $ = (id) => document.getElementById(id);
const ui = {
  workspace: $('workspace'),
  dropzone: $('dropzone'),
  file: $('file'),
  keyWarning: $('key-warning'),
  stage: $('stage'),
  canvas: $('canvas'),
  photo: $('photo'),
  painting: $('painting'),
  overlay: $('overlay'),
  inset: $('inset'),
  insetPhoto: $('inset-photo'),
  docName: $('doc-name'),
  nameplate: $('nameplate'),
  hopaeName: $('hopae-name'),
  jobChip: $('job-chip'),
  jobDesc: $('job-desc'),
  personName: $('person-name'),
  personHanja: $('person-hanja'),
  personMeta: $('person-meta'),
  personLine: $('person-line'),
  actions: $('actions'),
  roll: $('roll'),
  share: $('share'),
  save: $('save'),
  redraw: $('redraw'),
  reroll: $('reroll'),
  reset: $('reset'),
  status: $('status'),
  timer: $('timer'),
  models: $('models'),
  recordFile: $('record-file'),
  record: $('record'),
  recordActions: $('record-actions'),
  rewrite: $('rewrite'),
  copy: $('copy'),
  roulette: $('roulette'),
  rouletteLead: $('roulette-lead'),
  reelName: $('reel-name'),
  reelHanja: $('reel-hanja'),
  reelDesc: $('reel-desc'),
  rouletteOk: $('roulette-ok'),
  shareDialog: $('share-dialog'),
  thumbSlot: $('thumb-slot'),
  thumbCaption: $('thumb-caption'),
  shareNative: $('share-native'),
  shareSave: $('share-save'),
  shareCopy: $('share-copy'),
  shareRetry: $('share-retry'),
  shareClose: $('share-close'),
  shareX: $('share-x'),
};

const state = {
  jobs: [], // 서버의 직업 목록 { id, name, hanja, desc }
  photo: null, // { blob, width, height, name }
  photoUrl: null,
  job: null, // 뽑힌 직업
  rolling: false,
  paintingBlob: null,
  paintingUrl: null,
  story: null, // 이름 + 일대기
  thumb: null, // { blob, url } 공유용 썸네일 (그림·이야기가 바뀌면 버린다)
  controllers: {}, // paint / story / thumb 진행 중인 요청
  startedAt: 0,
  timerId: 0,
};

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 받침이 있으면 a, 없으면 b ("광대였습니다" / "의원이었습니다")
function josa(word, withBatchim, without) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasBatchim ? withBatchim : without);
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

// 그림판 기본 팔레트를 오방색 쪽으로 살짝 비튼 28색
const PALETTE = [
  '#000000', '#808080', '#8a1c1c', '#808000', '#1f6b3a', '#1c5f6b', '#1c2f80',
  '#6b1c6b', '#8a6a3a', '#3a4a40', '#2f7fd0', '#24406b', '#7a3cc0', '#7a4520',
  '#ffffff', '#c0c0c0', '#e03030', '#f2c230', '#3cbf5a', '#3cc8c8', '#2040e0',
  '#e040a0', '#f6efdc', '#9ad08a', '#9ae0f0', '#9aa0f0', '#f07090', '#f09040',
];
for (const color of PALETTE) {
  $('swatches').append(el('span', { style: `background:${color}` }));
}

// ---------------------------------------------------------------------------
// 서버 상태 (API 키) + 직업 목록
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

async function loadJobs() {
  try {
    const res = await fetch('/api/jobs');
    state.jobs = await res.json();
  } catch {
    state.jobs = [];
  }
  syncActions();
}

checkHealth();
loadJobs();
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
  clearResult();
  const name = file.name.replace(/\.[^.]+$/, '') || '붙여넣은 사진';
  state.photo = { ...photo, name };
  replaceUrl('photoUrl', URL.createObjectURL(photo.blob));

  ui.photo.src = state.photoUrl;
  ui.insetPhoto.src = state.photoUrl;
  ui.canvas.style.aspectRatio = `${photo.width} / ${photo.height}`;
  ui.stage.style.setProperty('--ratio', photo.width / photo.height);
  showPhoto();
  ui.dropzone.hidden = true;
  ui.stage.hidden = false;

  showRecordHint('[🎲 조선 직업 뽑기]를 누르면 직업이 정해지고, 이름과 일생이 여기에 적혀요.');
  setStatus('준비 완료! [🎲 조선 직업 뽑기]를 눌러 전생을 확인해 보세요.');
  syncActions();
  ui.roll.focus();
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

// 뽑은 직업과 그 결과(그림·이야기·썸네일)를 모두 버린다
function clearResult() {
  abortAll();
  state.job = null;
  state.story = null;
  state.paintingBlob = null;
  replaceUrl('paintingUrl', null);
  clearThumb();
  ui.nameplate.hidden = true;
  ui.docName.textContent = state.photo?.name || '제목 없음';
  ui.recordFile.textContent = '전생기록';
}

ui.reset.addEventListener('click', () => {
  clearResult();
  state.photo = null;
  replaceUrl('photoUrl', null);
  ui.photo.removeAttribute('src');
  ui.insetPhoto.removeAttribute('src');
  ui.docName.textContent = '제목 없음';
  ui.stage.hidden = true;
  ui.dropzone.hidden = false;
  showRecordHint();
  setStatus('사진을 끌어다 놓거나, 붙여넣거나, 골라 주세요.');
  syncActions();
});

// ---------------------------------------------------------------------------
// 서버 호출
// ---------------------------------------------------------------------------

async function post(task, url, fields, image = state.photo.blob) {
  state.controllers[task]?.abort();
  const controller = new AbortController();
  state.controllers[task] = controller;
  startTimer();
  syncActions();

  const form = new FormData();
  form.append('image', image, image.type === 'image/png' ? 'image.png' : 'photo.jpg');
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
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
    syncActions();
  }
}

const isBusy = (task) => (task ? Boolean(state.controllers[task]) : Object.keys(state.controllers).length > 0);

function abort(task) {
  state.controllers[task]?.abort();
  delete state.controllers[task];
  if (!isBusy()) stopTimer();
}

function abortAll() {
  for (const task of Object.keys(state.controllers)) abort(task);
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

// 버튼은 상태에서 계산한다
function syncActions() {
  const hasJob = Boolean(state.job);
  ui.actions.hidden = !state.photo;
  ui.roll.hidden = hasJob;
  ui.roll.disabled = !state.jobs.length || state.rolling;
  ui.share.hidden = !hasJob;
  ui.share.disabled = !(state.paintingBlob && state.story);
  ui.share.title = ui.share.disabled ? '그림과 이야기가 모두 완성되면 공유할 수 있어요' : '';
  ui.save.hidden = !state.paintingUrl;
  ui.redraw.hidden = !hasJob;
  ui.redraw.disabled = isBusy('paint');
  ui.reroll.hidden = !hasJob;
  ui.reroll.disabled = state.rolling;
  ui.recordActions.hidden = !state.story;
  ui.rewrite.disabled = isBusy('story');
}

function updateProgressStatus() {
  const painting = isBusy('paint');
  const writing = isBusy('story');
  const job = state.job?.name || '';
  if (painting && writing) setStatus(`${job} 옷 입히는 중 · 이름 짓고 일생 적는 중…`);
  else if (painting) setStatus(`${job} 옷 입히는 중… 조금만 기다려 주세요.`);
  else if (writing) setStatus('이름 짓고 일생 적는 중…');
  else if (state.paintingBlob && state.story) setStatus('완성! [공유하기]를 누르면 썸네일을 만들어 드려요.');
}

// ---------------------------------------------------------------------------
// 직업 뽑기 룰렛
// ---------------------------------------------------------------------------

function showReel(job) {
  ui.reelName.textContent = job.name;
  ui.reelHanja.textContent = job.hanja;
}

async function spin() {
  const jobs = state.jobs;
  const chosen = jobs[Math.floor(Math.random() * jobs.length)];
  ui.roulette.classList.remove('landed');
  ui.rouletteLead.textContent = '당신은 조선시대에…';
  ui.reelDesc.innerHTML = '&nbsp;';
  ui.rouletteOk.disabled = true;
  ui.roulette.showModal();

  if (!reducedMotion()) {
    let i = Math.floor(Math.random() * jobs.length);
    const steps = 26;
    for (let step = 0; step < steps; step++) {
      i = (i + 1 + Math.floor(Math.random() * 4)) % jobs.length;
      if (jobs[i] === chosen) i = (i + 1) % jobs.length; // 마지막 칸 전에는 당첨 직업을 안 보여 준다
      showReel(jobs[i]);
      await sleep(45 + (step / steps) ** 2.4 * 300);
    }
  }
  showReel(chosen);
  ui.roulette.classList.add('landed');
  ui.reelDesc.textContent = josa(chosen.desc, '이었습니다!', '였습니다!');
  ui.rouletteOk.disabled = false;
  ui.rouletteOk.focus();
  return chosen;
}

async function roll() {
  if (!state.photo || !state.jobs.length || state.rolling) return;
  clearResult();
  state.rolling = true;
  syncActions();
  let job;
  try {
    job = await spin();
  } finally {
    state.rolling = false;
  }
  start(job);
  // 확인을 안 눌러도 잠시 뒤 저절로 닫힌다
  setTimeout(() => {
    if (state.job === job && ui.roulette.open) ui.roulette.close();
  }, 2200);
}

// 도는 동안에는 Esc 로 닫히지 않게
ui.roulette.addEventListener('cancel', (e) => {
  if (state.rolling) e.preventDefault();
});
ui.rouletteOk.addEventListener('click', () => ui.roulette.close());

function start(job) {
  state.job = job;
  ui.docName.textContent = job.name;
  ui.recordFile.textContent = job.name;
  ui.nameplate.hidden = false;
  ui.jobChip.textContent = job.hanja ? `${job.name} ${job.hanja}` : job.name;
  ui.jobDesc.textContent = job.desc;
  runPaint();
  runStory();
}

ui.roll.addEventListener('click', roll);
ui.reroll.addEventListener('click', roll);

// ---------------------------------------------------------------------------
// 1) 그림판 그림
// ---------------------------------------------------------------------------

async function runPaint() {
  const job = state.job;
  if (!state.photo || !job) return;
  state.paintingBlob = null;
  replaceUrl('paintingUrl', null);
  clearThumb();
  showDrawing(job);
  const request = post('paint', '/api/paint', { job: job.id, width: state.photo.width, height: state.photo.height });
  updateProgressStatus();
  try {
    const { image } = await request;
    const blob = await (await fetch(image)).blob();
    state.paintingBlob = blob;
    replaceUrl('paintingUrl', URL.createObjectURL(blob));
    ui.painting.src = state.paintingUrl;
    ui.painting.alt = `조선시대 ${job.name}의 옷을 입고 그림판으로 그려진 모습`;
    showPainting();
    updateSaveName();
    syncActions();
    updateProgressStatus();
    if (isBusy('story')) setStatus('그림 완성! 이름과 일생은 아직 적는 중…');
  } catch (err) {
    if (err.name === 'AbortError') return;
    showOverlay(errorBox(err.message, runPaint));
    setStatus('그림을 그리지 못했어요.');
  }
}

function showPhoto() {
  ui.photo.hidden = false;
  ui.painting.hidden = true;
  ui.overlay.hidden = true;
  ui.inset.hidden = true;
  ui.canvas.classList.remove('done', 'busy');
}

function showPainting() {
  ui.photo.hidden = true;
  ui.painting.hidden = false;
  ui.overlay.hidden = true;
  ui.inset.hidden = false;
  ui.canvas.classList.remove('busy');
  ui.canvas.classList.add('done');
}

function showOverlay(...children) {
  ui.photo.hidden = false;
  ui.painting.hidden = true;
  ui.inset.hidden = true;
  ui.canvas.classList.remove('done');
  ui.canvas.classList.add('busy');
  ui.overlay.hidden = false;
  ui.overlay.replaceChildren(el('div', { className: 'slot-message' }, ...children));
}

function scribble() {
  return el('div', {
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
}

function showDrawing(job) {
  showOverlay(
    scribble(),
    el('b', { textContent: `${job.name} 옷 입히는 중…` }),
    el('span', { textContent: '마우스로 열심히 그리는 중이에요. 보통 30초~1분쯤 걸려요.' }),
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

function fileBase() {
  const job = state.job?.name || '조선';
  return state.story ? `${state.story.name}-${job}` : job;
}

function updateSaveName() {
  if (!state.paintingUrl) return;
  ui.save.href = state.paintingUrl;
  ui.save.download = `${fileBase()}-그림판.png`;
}

ui.redraw.addEventListener('click', runPaint);

// ---------------------------------------------------------------------------
// 2) 이름 + 일대기
// ---------------------------------------------------------------------------

async function runStory() {
  const job = state.job;
  if (!state.photo || !job) return;
  state.story = null;
  clearThumb();
  renderNameplatePending();
  ui.record.replaceChildren(
    el('p', { className: 'record-hint' }, `${job.name}의 족보와 실록을 뒤적이는 중…`, el('span', { className: 'caret' })),
  );
  const request = post('story', '/api/story', { job: job.id });
  updateProgressStatus();
  try {
    state.story = await request;
    renderNameplate();
    renderRecord();
    updateSaveName();
    syncActions();
    updateProgressStatus();
    if (isBusy('paint')) setStatus(`${state.story.name}의 일생을 다 적었어요. 그림은 아직 그리는 중…`);
  } catch (err) {
    if (err.name === 'AbortError') return;
    ui.personName.textContent = '이름을 짓지 못했어요';
    ui.record.replaceChildren(errorBox(err.message, runStory));
    setStatus('이야기를 쓰지 못했어요.');
  }
}

function renderNameplatePending() {
  ui.hopaeName.textContent = '…';
  ui.personName.textContent = '이름 짓는 중…';
  ui.personHanja.textContent = '';
  ui.personMeta.textContent = '';
  ui.personLine.replaceChildren();
  ui.nameplate.classList.add('pending');
}

function lineNode(s) {
  return [el('span', { className: 'seal', textContent: s.one_line_label }), el('span', { textContent: s.one_line })];
}

function renderNameplate() {
  const s = state.story;
  ui.nameplate.classList.remove('pending');
  ui.hopaeName.textContent = s.name;
  ui.personName.textContent = s.name;
  ui.personHanja.textContent = s.hanja;
  ui.personMeta.textContent = [s.lifespan, s.hometown, `「${s.epithet}」`].filter(Boolean).join(' · ');
  ui.personLine.replaceChildren(...lineNode(s));
  ui.docName.textContent = `${s.name} (${state.job.name})`;
  ui.recordFile.textContent = s.name;
}

const NUMERALS = ['壹', '貳', '參', '肆', '伍', '陸'];

function renderRecord() {
  const s = state.story;
  ui.record.replaceChildren(
    el('div', { className: 'record-head' },
      el('span', { className: 'chip', textContent: s.era.label }),
      el('span', { className: 'chip fate', textContent: `운명 · ${s.fate.label}` }),
    ),
    el('h3', { className: 'record-name' }, s.name, s.hanja ? el('small', { textContent: s.hanja }) : null),
    el('p', { className: 'record-epithet', textContent: `「${s.epithet}」 · ${s.lifespan} · ${s.hometown}` }),
    el('dl', { className: 'record-facts' },
      el('dt', { textContent: '이름' }), el('dd', { textContent: s.name_story }),
      el('dt', { textContent: '행색' }), el('dd', { textContent: s.appearance }),
      el('dt', { textContent: '역사' }), el('dd', { className: 'scene', textContent: s.scene }),
    ),
    ...s.chapters.map((c, i) =>
      el('section', { className: 'chapter' },
        el('h4', {}, el('span', { className: 'num', textContent: NUMERALS[i] || i + 1 }), c.title),
        el('p', { textContent: c.text }),
      ),
    ),
    el('p', { className: 'record-end' }, ...lineNode(s)),
    el('p', { className: 'record-note', textContent: '실제 역사에 상상을 더한 가상의 이야기예요.' }),
  );
  ui.record.scrollTop = 0;
}

function showRecordHint(text = '사진을 올리고 조선 직업을 뽑으면, 그 직업에 걸맞은 이름과 한 사람의 일생이 여기에 적혀요.') {
  ui.recordActions.hidden = true;
  ui.record.replaceChildren(el('p', { className: 'record-hint' }, text, el('span', { className: 'caret' })));
}

function storyText() {
  const s = state.story;
  const job = state.job;
  return [
    `[${job.name}] ${s.name}${s.hanja ? `(${s.hanja})` : ''} — 「${s.epithet}」`,
    `${s.lifespan} · ${s.hometown} · ${s.era.label}`,
    '',
    ...s.chapters.flatMap((c, i) => [`${NUMERALS[i] || i + 1}. ${c.title}`, c.text, '']),
    `${s.one_line_label}: ${s.one_line}`,
  ].join('\n');
}

async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(done);
  } catch {
    setStatus('복사하지 못했어요. 글을 직접 드래그해서 복사해 주세요.');
  }
}

ui.copy.addEventListener('click', () => state.story && copyText(storyText(), '일대기를 클립보드에 복사했어요.'));
ui.rewrite.addEventListener('click', runStory);

// ---------------------------------------------------------------------------
// 3) 공유: 그림판 그림 + 이름 + 한 줄 → 썸네일 (이미지 모델로 합성)
// ---------------------------------------------------------------------------

function clearThumb() {
  abort('thumb');
  if (state.thumb) URL.revokeObjectURL(state.thumb.url);
  state.thumb = null;
}

function shareText() {
  const s = state.story;
  return `나의 조선 전생은 ${state.job.name} ${s.name}${s.hanja ? `(${s.hanja})` : ''}!\n${s.one_line_label} · ${s.one_line}\n#조선전생그림판`;
}

function thumbFile() {
  return new File([state.thumb.blob], `${fileBase()}-썸네일.png`, { type: 'image/png' });
}

function setShareButtons({ ready = false, failed = false } = {}) {
  const canShareFiles = ready && Boolean(navigator.canShare?.({ files: [thumbFile()] }));
  ui.shareNative.hidden = !canShareFiles;
  ui.shareSave.hidden = !ready;
  ui.shareCopy.hidden = !ready;
  ui.shareRetry.hidden = !(ready || failed);
}

async function makeThumb() {
  const s = state.story;
  const job = state.job;
  if (!s || !state.paintingBlob) return;
  clearThumb();
  setShareButtons();
  ui.thumbCaption.textContent = '';
  ui.thumbSlot.replaceChildren(
    el('div', { className: 'slot-message' },
      scribble(),
      el('b', { textContent: '그림판에 이름 써 넣는 중…' }),
      el('span', { textContent: `「${s.name}」 · ${s.one_line_label} ${s.one_line} — 보통 30초~1분쯤 걸려요.` }),
    ),
  );
  try {
    const { image } = await post('thumb', '/api/thumbnail', {
      name: s.name, jobName: job.name, label: s.one_line_label, line: s.one_line,
    }, state.paintingBlob);
    if (state.story !== s) return;
    const blob = await (await fetch(image)).blob();
    state.thumb = { blob, url: URL.createObjectURL(blob) };
    showThumb();
  } catch (err) {
    if (err.name === 'AbortError') return;
    ui.thumbSlot.replaceChildren(el('div', { className: 'slot-message' }, errorBox(err.message, makeThumb)));
    setShareButtons({ failed: true });
  }
}

function showThumb() {
  const s = state.story;
  ui.thumbSlot.replaceChildren(el('img', { src: state.thumb.url, alt: `${s.name} — ${s.one_line_label} ${s.one_line}` }));
  ui.thumbCaption.textContent = '그림 속 글자는 AI가 직접 그려서 가끔 틀릴 수 있어요. 어색하면 [다시 만들기]를 눌러 보세요.';
  ui.shareSave.href = state.thumb.url;
  ui.shareSave.download = `${fileBase()}-썸네일.png`;
  setShareButtons({ ready: true });
  (ui.shareNative.hidden ? ui.shareSave : ui.shareNative).focus();
  setStatus('썸네일 완성! 공유하거나 저장해 보세요.');
}

ui.share.addEventListener('click', () => {
  if (!state.story || !state.paintingBlob) return;
  ui.shareDialog.showModal();
  if (state.thumb) showThumb();
  else if (!isBusy('thumb')) makeThumb();
});

ui.shareNative.addEventListener('click', async () => {
  if (!state.thumb) return;
  try {
    await navigator.share({ files: [thumbFile()], title: '조선 전생 그림판', text: shareText() });
  } catch (err) {
    if (err.name !== 'AbortError') setStatus('공유하지 못했어요. [이미지 저장] 후 직접 올려 주세요.');
  }
});
ui.shareCopy.addEventListener('click', () => copyText(shareText(), '공유 문구를 클립보드에 복사했어요.'));
ui.shareRetry.addEventListener('click', makeThumb);
ui.shareClose.addEventListener('click', () => ui.shareDialog.close());
ui.shareX.addEventListener('click', () => ui.shareDialog.close());
// 바깥(어두운 부분)을 눌러도 닫힌다. 만드는 중이면 닫혀도 계속 만들고, 다시 열면 이어서 보여 준다.
ui.shareDialog.addEventListener('click', (e) => {
  const r = ui.shareDialog.getBoundingClientRect();
  const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  if (e.target === ui.shareDialog && outside) ui.shareDialog.close();
});

showRecordHint();
