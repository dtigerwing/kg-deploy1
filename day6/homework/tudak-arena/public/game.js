// 투닥 아레나 화면 — 서버가 보내준 상태를 그리고, 키 입력과 효과음만 담당한다.
const $ = s => document.querySelector(s);
const canvas = $('#c');
const ctx = canvas.getContext('2d');
const socket = io();
const TAU = Math.PI * 2;

let cfg = null;
let state = null;
let role = null;
let chatterOn = true;
let goFlashUntil = 0;
const sprites = {};
const fallAnim = {};   // id -> 떨어지기 시작한 시각
const prevAlive = {};
const bubbles = {};    // id -> { text, until }

fetch('/api/config').then(r => r.json()).then(c => {
  cfg = c;
  for (const id of ['player', ...c.bots.map(b => b.id)]) {
    const img = new Image();
    img.src = `img/${id}_sprite.png`;
    sprites[id] = img;
  }
});

// ---------- 시작 화면 ----------

const nameInput = $('#name');
try { nameInput.value = localStorage.getItem('tudak-name') || ''; } catch {}

function start() {
  const name = nameInput.value.trim() || '플레이어';
  try { localStorage.setItem('tudak-name', name); } catch {}
  initAudio();
  socket.emit('join', { name });
  $('#start').hidden = true;
  nameInput.blur();
}
$('#go').onclick = start;
nameInput.onkeydown = e => { if (e.key === 'Enter') start(); };

$('#chatter').onclick = () => socket.emit('chatter', !chatterOn);

// ---------- 서버 소식 ----------

socket.on('role', r => { role = r; });

socket.on('state', s => {
  for (const e of s.entities) {
    if (prevAlive[e.id] && !e.alive) fallAnim[e.id] = performance.now();
    prevAlive[e.id] = e.alive;
  }
  state = s;
  renderHud();
});

socket.on('status', s => {
  const pill = $('#discord');
  const text = { connected: '디스코드 연결됨', error: '디스코드 연결 실패', off: '디스코드 미연결' };
  pill.textContent = text[s.discord] || text.off;
  pill.className = `pill ${s.discord === 'connected' ? 'ok' : s.discord === 'error' ? 'bad' : ''}`;
  chatterOn = s.chatter;
  const btn = $('#chatter');
  btn.textContent = chatterOn ? '봇 수다 켜짐' : '봇 수다 꺼짐';
  btn.classList.toggle('off', !chatterOn);
});

socket.on('say', ({ id, text }) => {
  bubbles[id] = { text, until: performance.now() + 2500 + text.length * 90 };
});

// ---------- 효과음 (파일 없이 소리를 합성) ----------

let ac = null;
function initAudio() {
  try { ac = ac || new AudioContext(); ac.resume(); } catch {}
}

function tone(freq, dur, { type = 'square', vol = 0.07, to = null, at = 0 } = {}) {
  if (!ac) return;
  const t0 = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.2, freq = 1000, q = 1 } = {}) {
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  src.buffer = buf;
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start();
}

socket.on('fx', fx => {
  switch (fx.type) {
    case 'bump':
      noise(0.09, { vol: 0.15 + 0.35 * fx.power, freq: 500 + 600 * fx.power });
      tone(110 + 80 * fx.power, 0.1, { type: 'triangle', vol: 0.15 });
      break;
    case 'dash': noise(0.18, { vol: 0.1, freq: 2400, q: 0.7 }); break;
    case 'fall': tone(620, 0.7, { vol: 0.06, to: 80 }); break;
    case 'count': tone(660, 0.12); break;
    case 'go':
      tone(990, 0.3, { vol: 0.09 });
      goFlashUntil = performance.now() + 700;
      break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { at: i * 0.11 })); break;
  }
});

// ---------- 키 입력 ----------

const keys = { up: false, down: false, left: false, right: false, dash: false };
const keyMap = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'dash',
};
function onKey(e, down) {
  if (document.activeElement === nameInput) return;
  const k = keyMap[e.code];
  if (!k) return;
  e.preventDefault();
  if (keys[k] === down) return;
  keys[k] = down;
  socket.emit('input', keys);
}
addEventListener('keydown', e => onKey(e, true));
addEventListener('keyup', e => onKey(e, false));
addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  socket.emit('input', keys);
});

// ---------- HUD ----------

let lastScore = '';
function renderHud() {
  const s = state;
  $('#round').textContent = s.round ? `${s.round}라운드` : '';

  const ids = ['player', ...(cfg?.bots.map(b => b.id) ?? [])];
  const score = ids.map(id => `${id}:${s.wins[id] || 0}`).join('|') + s.humanName;
  if (score !== lastScore && cfg) {
    lastScore = score;
    $('#score').innerHTML = ids.map(id => {
      const name = id === 'player' ? s.humanName : cfg.bots.find(b => b.id === id).name;
      return `<span class="who"><img src="img/${id}_sprite.png" alt=""><span>${escapeHtml(name)}</span><b>${s.wins[id] || 0}</b></span>`;
    }).join('');
  }

  const me = s.entities.find(e => e.id === 'player');
  $('#cdbar').style.width = `${me ? Math.round((1 - me.cd) * 100) : 0}%`;

  const center = $('#center');
  let html = '';
  if (s.phase === 'countdown') {
    html = `<div class="big">${Math.max(1, Math.ceil(s.timer))}</div>`;
  } else if (s.phase === 'playing') {
    if (performance.now() < goFlashUntil) html = '<div class="big">투닥!</div>';
    else if (role === 'player' && me && !me.alive) html = '<div class="mid">탈락!</div><div class="small">친구들 싸움 구경 중...</div>';
  } else if (s.phase === 'intermission') {
    const w = s.entities.find(e => e.id === s.winner);
    const title = s.winner === 'player' && role === 'player' ? '내가 우승!' : `${escapeHtml(w?.name ?? '')} 우승!`;
    html = `<div class="mid">${title}</div><div class="small">다음 판까지 ${Math.max(0, Math.ceil(s.timer))}초</div>`;
  } else if (s.phase === 'waiting' && role === 'spectator') {
    html = '<div class="small">플레이어를 기다리는 중</div>';
  }
  if (role === 'spectator' && s.phase !== 'waiting') html += '<div class="small">관전 중</div>';
  if (center.innerHTML !== html) center.innerHTML = html;
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 그리기 ----------

function resize() {
  const dpr = devicePixelRatio || 1;
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function wrap(text, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > max && line) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
    while (line.length > max) { lines.push(line.slice(0, max)); line = line.slice(max); }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBubble(x, y, text) {
  const lines = wrap(text, 14);
  ctx.font = '17px Jua, sans-serif';
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 22;
  const h = lines.length * 21 + 14;
  const bx = x - w / 2, by = y - h - 12;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  roundRect(bx, by, w, h, 10);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 7, by + h);
  ctx.lineTo(x, by + h + 10);
  ctx.lineTo(x + 7, by + h);
  ctx.fill();
  ctx.fillStyle = '#22253a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x, by + 8 + i * 21));
}

function draw(now) {
  resize();
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#141826';
  ctx.fillRect(0, 0, W, H);
  if (!state || !cfg) return;

  const scale = Math.min(W, H) / (2 * cfg.R0 + 170);
  ctx.translate(W / 2, H / 2 + 12 * (devicePixelRatio || 1));
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;

  // 처음 경기장 크기 (점선)
  ctx.beginPath();
  ctx.arc(0, 0, cfg.R0, 0, TAU);
  ctx.setLineDash([10, 12]);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.setLineDash([]);

  // 지금 경기장
  const R = state.R;
  const shrinking = state.phase === 'playing' && R < cfg.R0 - 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fillStyle = '#f3e2bf';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = shrinking ? `rgba(255,90,90,${0.55 + 0.35 * Math.sin(now / 120)})` : '#c9a36a';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0, R * 0.35), 0, TAU);
  ctx.strokeStyle = 'rgba(201,163,106,0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();

  const r = cfg.PR;
  const size = r * 32 / 12;   // 스프라이트 몸통 반지름이 그림의 12/32
  const list = [...state.entities].sort((a, b) => a.y - b.y);

  for (const e of list) {
    let k = 1;
    if (!e.alive) {
      const st = fallAnim[e.id];
      if (!st) continue;
      const p = (now - st) / 700;
      if (p >= 1) continue;
      k = 1 - p;
      ctx.globalAlpha = 1 - p;
    }
    if (e.alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + r * 0.85, r * 0.95, r * 0.35, 0, 0, TAU);
      ctx.fill();
    }
    if (e.id === 'player' && e.alive) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 7, 0, TAU);
      ctx.strokeStyle = 'rgba(124,224,124,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (e.dash) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 10, 0, TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    const img = sprites[e.id];
    if (img?.complete) {
      const sz = size * k;
      ctx.drawImage(img, e.x - sz / 2 + sz / 64, e.y - sz / 2 - sz * 3 / 32, sz, sz);
    }
    ctx.globalAlpha = 1;

    if (e.alive) {
      ctx.font = '16px Jua, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,24,38,0.85)';
      const label = e.id === 'player' ? `${e.name} (나)` : e.name;
      ctx.strokeText(label, e.x, e.y + r + 8);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, e.x, e.y + r + 8);
    }
  }

  // 말풍선은 맨 위에 (떨어진 봇도 원래 자리 근처에 보여준다)
  for (const e of list) {
    const b = bubbles[e.id];
    if (!b) continue;
    if (now > b.until) { delete bubbles[e.id]; continue; }
    const x = e.alive ? e.x : Math.max(-R, Math.min(R, e.x));
    const y = e.alive ? e.y : Math.max(-R, Math.min(R, e.y));
    drawBubble(x, y - r - 6, b.text);
  }
}

function loop(now) {
  draw(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
