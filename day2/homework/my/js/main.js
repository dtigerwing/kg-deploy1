import { games, categories, stores, friends, greetings, art } from './data.js';
import { createPlayground, PALETTE } from './playground.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// 이미지를 못 불러오면 깨진 아이콘 대신 빈자리로 (발표장 인터넷이 불안할 때 대비)
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);
document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = ''; }, true);
// 같은 애니메이션을 다시 재생
const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
// 받침 있으면 '이'/'이야', 없으면 '가'/'야'
const hasBatchim = (word) => (word.charCodeAt(word.length - 1) - 0xac00) % 28 > 0;
const iga = (word) => (hasBatchim(word) ? '이' : '가');
const iya = (word) => (hasBatchim(word) ? '이야' : '야');
const catLabel = (id) => categories.find((c) => c.id === id)?.label ?? '';
const isDark = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 130;
};

// ---------- 효과음 (WebAudio로 즉석 합성, 기본은 꺼짐) ----------
const sfx = (() => {
  let ac = null, on = false;
  const btn = $('.sound-toggle');
  btn.addEventListener('click', () => {
    on = !on;
    btn.setAttribute('aria-pressed', on);
    btn.title = on ? '효과음 끄기' : '효과음 켜기';
    if (on) { ac ||= new AudioContext(); play('pop'); }
  });
  function play(type, k = 1) {
    if (!on || !ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    const f = { pop: [520, 980], boing: [300, 140], grab: [700, 900] }[type] || [400, 600];
    o.type = type === 'boing' ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(f[0] * (0.9 + Math.random() * 0.2), t);
    o.frequency.exponentialRampToValueAtTime(f[1], t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * k, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.start(t); o.stop(t + 0.25);
  }
  return play;
})();

// ---------- 히어로 물리 놀이터 ----------
const friendArt = friends.map(({ id, img, color }) => ({ id, img, color }));
const best = games.find((g) => g.slug === 'dentist'); // 다운로드 1위
const wide = Math.min(1.6, Math.max(1, innerWidth / 1200)); // 발표 화면처럼 넓으면 장난감을 더 크고 많이
createPlayground($('.playground'), {
  letters: ['K', 'I', 'G', 'L', 'E'],
  intro: reduced ? 4 : Math.round(12 * wide),
  scale: (w) => Math.max(0.62, Math.min(1.35, w / 1200)),
  friends: friendArt,
  introFriends: [0, 1], // 코코, 러비 먼저 등장
  floor: 48, // 언덕 아랫부분은 다음 장면으로 스며드니 장난감은 그 위에 섬
  kinds: ['blob', 'blob', 'star', 'donut', 'pill', 'ball', 'friend', 'friend'],
  sign: { badge: 'BEST!', text: best.title, sub: `${best.downloads} 다운로드 →`, onClick: () => openGame(best) },
  sound: sfx,
});

// ---------- 코코비 친구들 ----------
$('.family-img').src = art.family;
$('.about-img').src = art.playground;

// 손 흔드는 친구들을 누르면 하트가 퐁퐁
$('.family').addEventListener('click', (e) => {
  const box = e.currentTarget, r = box.getBoundingClientRect();
  const x = e.clientX ? e.clientX - r.left : r.width / 2;
  replay(box, 'wave');
  for (let i = 0; i < 8; i++) {
    const h = document.createElement('span');
    h.className = 'heart';
    h.textContent = pick(['💛', '💗', '💚', '💙', '🧡']);
    h.style.cssText = `left:${x}px; top:${r.height * 0.45}px; --dx:${(Math.random() - 0.5) * 220}px; --dy:${-120 - Math.random() * 140}px; animation-delay:${i * 40}ms`;
    box.appendChild(h);
    h.addEventListener('animationend', () => h.remove());
  }
  sfx('pop');
});

// 주인공 카드 (코코 + 러비)
$('.duo').innerHTML = friends.filter((f) => f.star).map((f) => `
  <article class="buddy" style="--c:${f.color}">
    <p class="bubble" aria-live="polite">${f.lines[0]}</p>
    <button class="buddy-face" type="button" data-id="${f.id}" aria-label="${f.name}에게 인사하기"><img src="${f.img}" alt="" /></button>
    <h3>${f.name} <small>${f.en}</small></h3>
    <p class="trait">${f.trait}</p>
  </article>`).join('<span class="duo-plus" aria-hidden="true">+</span>');
$('.duo').addEventListener('click', (e) => {
  const btn = e.target.closest('.buddy-face');
  if (!btn) return;
  const f = friends.find((x) => x.id === btn.dataset.id), card = btn.closest('.buddy'), bubble = $('.bubble', card);
  f.at = ((f.at ?? 0) + 1) % f.lines.length;
  bubble.textContent = f.lines[f.at];
  replay(card, 'hop'); replay(bubble, 'pop');
  sfx('boing');
});

// 함께 노는 친구들: 처음엔 코코·러비 + 랜덤 1명, 공룡 알에서 새 친구가 나오면 여기로 합류
const START_PALS = 1; // 처음부터 같이 있는 친구 수 (코코·러비 빼고)
const crowd = $('.crowd'), crowdCard = $('.crowd-card'), crowdCount = $('.crowd-count');
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
const met = new Set([...friends.filter((f) => f.star), ...shuffle(friends.filter((f) => !f.star)).slice(0, START_PALS)]);
const palOf = (f) => $(`li[data-id="${f.id}"]`, crowd);
const joined = () => $$('li:not(.incoming)', crowd).length;

function addPal(f) {
  const li = document.createElement('li');
  li.dataset.id = f.id;
  li.style.cssText = `--c:${f.color}; --d:${crowd.children.length * 0.3}s`;
  li.innerHTML = `
    <button class="pal" type="button" aria-label="${f.name ? `${f.name}에게` : '친구에게'} 인사하기"><img src="${f.img}" alt="" /></button>
    <span class="pal-bubble" aria-hidden="true"></span>`;
  crowd.appendChild(li);
  return li;
}
function palSay(li, text) {
  const b = $('.pal-bubble', li);
  b.textContent = text;
  replay(li, 'hop'); replay(b, 'say');
}
function updateCount() {
  const n = joined(), done = n === friends.length;
  crowdCount.innerHTML = `<b>${n}</b> / ${friends.length} · ${done ? '친구들을 다 모았어요! 🎉' : '알을 깨면 새 친구가 와요'}`;
  crowdCard.classList.toggle('complete', done);
}
met.forEach(addPal);
updateCount();
crowd.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li || !e.target.closest('.pal')) return;
  const f = friends.find((x) => x.id === li.dataset.id);
  palSay(li, f.name && Math.random() < 0.5 ? `나는 ${f.name}${iya(f.name)}!` : pick(greetings));
  sfx('pop');
});

// 공룡 알 깨기: 세 번 두드리면 친구가 톡!
const EGG = 'M100 10 C52 10 20 94 20 150 C20 202 56 232 100 232 C144 232 180 202 180 150 C180 94 148 10 100 10 Z';
const ZIG = '0,124 20,112 40,130 60,110 80,130 100,110 120,130 140,110 160,130 180,112 200,124';
const SPOTS = [[66, 62, 11, 0], [132, 50, 8, 2], [148, 98, 13, 1], [50, 104, 9, 3], [96, 88, 7, 4], [112, 168, 13, 4], [58, 182, 9, 5], [152, 178, 10, 0], [88, 206, 7, 2]];
const shell = (part) => {
  const cut = part === 'top' ? `0,0 200,0 ${ZIG.split(' ').reverse().join(' ')}` : `${ZIG} 200,240 0,240`;
  return `<svg class="egg-shell egg-${part}" viewBox="0 0 200 240" aria-hidden="true">
    <defs>
      <clipPath id="egg-${part}-cut"><polygon points="${cut}" /></clipPath>
      <clipPath id="egg-${part}-shape"><path d="${EGG}" /></clipPath>
    </defs>
    <g clip-path="url(#egg-${part}-cut)">
      <path class="egg-fill" d="${EGG}" />
      <g clip-path="url(#egg-${part}-shape)">${SPOTS.map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${PALETTE[c]}" />`).join('')}</g>
      <path class="egg-line" d="${EGG}" />
    </g>
    <polyline class="egg-edge" points="${ZIG}" clip-path="url(#egg-${part}-shape)" />
  </svg>`;
};
const stage = $('.egg-stage');
stage.innerHTML = `
  <img class="egg-friend" alt="" />
  ${shell('bottom')}${shell('top')}
  <svg class="egg-cracks" viewBox="0 0 200 240" aria-hidden="true">
    <defs><clipPath id="egg-crack-shape"><path d="${EGG}" /></clipPath></defs>
    <g clip-path="url(#egg-crack-shape)">
      <polyline class="c1" points="100,110 95,94 104,82 97,66" />
      <polyline class="c2" points="60,110 66,95 59,84" />
      <polyline class="c2" points="140,110 134,96 141,86" />
      <polyline class="c3" points="${ZIG}" />
    </g>
  </svg>
  <button class="egg-hit" type="button" aria-label="공룡 알 두드리기"></button>
  <div class="confetti" aria-hidden="true"></div>`;

const NEW_FRIEND_CHANCE = 0.6; // 아직 못 만난 친구가 나올 확률 (나머지는 아무 친구나)
let hits = 0, lastFriend = null, round = 0;
const eggHint = $('.egg-hint'), eggAgain = $('.egg-again'), eggImg = $('.egg-friend', stage);
$('.egg-hit', stage).addEventListener('click', () => {
  replay(stage, 'shake');
  if (hits >= 3) { sfx('boing'); return; } // 나온 친구를 누르면 알이 들썩
  hits++;
  stage.dataset.hits = hits;
  sfx(hits < 3 ? 'grab' : 'boing');
  if (hits < 3) { eggHint.textContent = ['톡! 조금만 더!', '톡톡! 거의 다 됐어요!'][hits - 1]; return; }
  setTimeout(hatch, 260);
});
function hatch() {
  const unmet = friends.filter((x) => !met.has(x));
  const f = unmet.length && Math.random() < NEW_FRIEND_CHANCE ? pick(unmet) : pick(friends.filter((x) => x !== lastFriend));
  const isNew = !met.has(f), r = round;
  lastFriend = f;
  eggImg.src = f.img;
  eggImg.alt = f.name || '코코비 친구';
  stage.classList.add('open');
  eggHint.textContent = isNew
    ? `짠! 새 친구${f.name ? ` ${f.name}${iga(f.name)}` : '가'} 나왔어요! 친구들에게 쏙~`
    : f.name ? `짠! ${f.name}${iga(f.name)} 나왔어요!` : '짠! 아는 친구가 또 나왔어요!';
  confetti($('.confetti', stage));
  sfx('pop'); setTimeout(() => sfx('pop'), 140);
  eggAgain.hidden = false;
  if (isNew) {
    met.add(f); // 날아가는 동안 같은 친구가 또 추가되지 않게 바로 표시
    const li = addPal(f);
    li.classList.add('incoming');
    setTimeout(() => joinCrowd(f, li, r), reduced ? 0 : 800);
  } else {
    setTimeout(() => palSay(palOf(f), '나 여기 있어!'), 500);
  }
}
// 알에서 나온 새 친구가 '함께 노는 친구들' 자리로 폴짝 날아감
function joinCrowd(f, li, r) {
  const arrive = () => {
    li.classList.remove('incoming');
    replay($('.pal', li), 'arrive');
    updateCount();
    sfx('boing');
    if (joined() === friends.length) celebrate();
  };
  if (reduced || r !== round) return arrive(); // 그사이 '또 깨기'를 눌렀으면 바로 합류
  const from = eggImg.getBoundingClientRect(), to = $('.pal', li).getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const flyer = document.createElement('div');
  flyer.className = 'pal flyer';
  flyer.style.cssText = `--c:${f.color}; left:${to.left}px; top:${to.top}px; width:${to.width}px; height:${to.height}px`;
  flyer.innerHTML = `<img src="${f.img}" alt="" />`;
  document.body.appendChild(flyer);
  stage.classList.add('gone'); // 알 속 친구는 사라지고 날아가는 친구가 대신 등장
  sfx('grab');
  flyer.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${Math.min(1.8, from.width / to.width)})` },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 140}px) scale(1.25) rotate(-14deg)`, offset: 0.5 },
    { transform: 'none' },
  ], { duration: 950, easing: 'cubic-bezier(.4, 0, .3, 1)' }).onfinish = () => { flyer.remove(); arrive(); };
}
// 일곱 친구를 다 모으면 다 같이 폴짝 + 색종이
function celebrate() {
  eggHint.textContent = '와! 친구들을 모두 모았어요! 🎉';
  confetti($('.confetti', crowdCard), 40);
  $$('li', crowd).forEach((li, i) => setTimeout(() => replay(li, 'hop'), i * 90));
}
eggAgain.addEventListener('click', () => {
  round++;
  hits = 0;
  stage.dataset.hits = 0;
  stage.classList.remove('open', 'gone');
  eggAgain.hidden = true;
  eggHint.textContent = '톡톡 세 번 두드리면 누가 나올까?';
  $('.egg-hit', stage).focus();
});
function confetti(box, n = 28) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 100;
    s.style.cssText = `--dx:${Math.cos(a) * d}px; --dy:${Math.sin(a) * d - 50}px; --r:${Math.random() * 720 - 360}deg; background:${pick(PALETTE)}`;
    box.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }
}

// ---------- 영상관 ----------
const trailers = games.filter((g) => g.video);
let current = 0, reelTimer = 0;
const strip = $('.filmstrip');
strip.innerHTML = trailers.map((g, i) => `
  <button class="film" role="tab" aria-selected="${i === 0}" data-i="${i}">
    <img src="${g.cover}" alt="" loading="lazy" /><span>${g.title}</span>
  </button>`).join('');

function showTrailer(i, user = false) {
  current = (i + trailers.length) % trailers.length;
  const g = trailers[current], img = $('.tv-img');
  img.classList.add('swap');
  setTimeout(() => { img.src = g.cover; img.alt = `${g.title} 예고편 장면`; img.classList.remove('swap'); }, 200);
  $('.tv-title').textContent = g.title;
  $('.tv-count').textContent = `${String(current + 1).padStart(2, '0')} / ${String(trailers.length).padStart(2, '0')}`;
  $('.tv-runtime').textContent = `예고편 ${g.runtime}`;
  $$('.film').forEach((f, n) => f.setAttribute('aria-selected', n === current));
  if (user) $$('.film')[current].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  clearInterval(reelTimer);
  if (!reduced) reelTimer = setInterval(() => showTrailer(current + 1), 4500);
}
strip.addEventListener('click', (e) => { const f = e.target.closest('.film'); if (f) showTrailer(+f.dataset.i, true); });
$('.tv-play').addEventListener('click', () => openVideo(trailers[current]));
showTrailer(0);

// 영상관 커튼: 무대가 고정된 동안 스크롤하는 만큼 막이 열림 (CSS 변수 --open: 0 → 1)
const reelPin = $('.reel-pin');
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let curtainFrame = 0;
function updateCurtain() {
  curtainFrame = 0;
  const r = reelPin.getBoundingClientRect();
  const travel = Math.max(1, (r.height - innerHeight) * 0.7); // 고정 구간의 70% 동안 열리고 나머지는 열린 채로
  const p = Math.min(1, Math.max(0, -r.top / travel));
  reelPin.style.setProperty('--open', easeInOut(p).toFixed(4));
  // 무대가 올라오는 동안 커튼은 위에서 내려와(앞 장면을 덮으며) 무대가 고정될 때 딱 맞게 닫힘
  reelPin.style.setProperty('--drop-y', `${(-2 * Math.max(0, r.top)).toFixed(1)}px`);
}
if (reduced) reelPin.style.setProperty('--open', 1);
else {
  addEventListener('scroll', () => { curtainFrame ||= requestAnimationFrame(updateCurtain); }, { passive: true });
  addEventListener('resize', updateCurtain);
  updateCurtain();
}

const player = $('.player');
function openVideo(g) {
  clearInterval(reelTimer);
  $('.player-frame').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${g.video}?autoplay=1&rel=0" title="${g.title} 예고편" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  player.showModal();
}
player.addEventListener('close', () => { $('.player-frame').innerHTML = ''; showTrailer(current); });

// ---------- 게임 장난감 상자 ----------
const chips = $('.chips');
chips.innerHTML = categories.map((c, i) => `<button class="chip" role="tab" aria-selected="${i === 0}" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join('');
const grid = $('.game-grid');
grid.innerHTML = games.map((g, i) => `
  <li class="game ${isDark(g.color) ? 'dark' : ''}" data-cat="${g.cat}" style="--card:${g.color}; --tilt:${[-2, 1.5, -1, 2, -1.5, 1][i % 6]}deg">
    <button type="button" data-slug="${g.slug}">
      <div class="game-thumb">
        <img src="${g.cover}" alt="" loading="lazy" />
        <span class="dl ${g.downloads.startsWith('1,000') ? 'hot' : ''}">⬇ ${g.downloads}</span>
      </div>
      <h3>${g.title}</h3>
      <p>${g.desc}</p>
      <span class="cat">${catLabel(g.cat)}</span>
    </button>
  </li>`).join('');

chips.addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  $$('.chip').forEach((x) => x.setAttribute('aria-selected', x === c));
  let n = 0;
  $$('.game').forEach((li) => {
    const show = c.dataset.cat === 'all' || li.dataset.cat === c.dataset.cat;
    li.classList.toggle('hide', !show);
    li.classList.remove('pop-in');
    if (show) { void li.offsetWidth; li.style.animationDelay = `${n++ * 60}ms`; li.classList.add('pop-in'); }
  });
  sfx('pop');
});
grid.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-slug]');
  if (b) openGame(games.find((g) => g.slug === b.dataset.slug));
});

// ---------- 게임 상세 시트 (Critter Spin 식: 영상 + 스토어 버튼 한 화면) ----------
const sheet = $('.sheet');
function openGame(g) {
  $('.sheet-body', sheet).innerHTML = `
    <div class="sheet-hero" style="--card:${g.color}"><img src="${g.cover}" alt="${g.title} 대표 화면" /></div>
    <div class="sheet-content">
      <span class="cat" style="--card:${g.color}">${catLabel(g.cat)}</span>
      <h2 id="sheet-title">${g.title}</h2>
      <p class="headline">${g.headline}</p>
      <p>${g.body}</p>
      <div class="sheet-meta"><span>개발사 KIGLE</span><span>⬇ ${g.downloads} 다운로드</span>${g.runtime ? `<span>🎬 예고편 ${g.runtime}</span>` : ''}</div>
      <div class="sheet-actions">
        ${g.video ? '<button class="btn" type="button" data-play>▶ 예고편 보기</button>' : ''}
        <a class="btn btn-ghost" href="${g.link}" target="_blank" rel="noopener">Google Play에서 보기</a>
      </div>
      <div class="sheet-gallery ${g.portrait ? 'portrait' : ''}">
        ${g.gallery.map((src, i) => `<img src="${src}" alt="${g.title} 화면 ${i + 2}" loading="lazy" />`).join('')}
      </div>
    </div>`;
  $('[data-play]', sheet)?.addEventListener('click', () => { sheet.close(); openVideo(g); });
  sheet.showModal();
  sheet.scrollTop = 0;
  sfx('pop');
}
$$('dialog').forEach((d) => {
  $('.sheet-close', d).addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // 바깥 클릭 닫기
});

// ---------- 숫자 카운트업 ----------
// 150000000 → '1억 5천만', 18000000 → '1,800만'
const krNum = (n) => {
  if (n < 10000) return n.toLocaleString('ko-KR');
  const eok = Math.floor(n / 1e8), man = Math.floor((n % 1e8) / 1e4);
  const manText = !man ? '' : man % 1000 === 0 ? `${man / 1000}천만` : `${man.toLocaleString('ko-KR')}만`;
  return [eok ? `${eok}억` : '', manText].filter(Boolean).join(' ');
};
const counters = new IntersectionObserver((entries) => {
  entries.forEach(({ isIntersecting, target }) => {
    if (!isIntersecting) return;
    counters.unobserve(target);
    const end = +target.dataset.count, suffix = target.dataset.suffix || '', t0 = performance.now(), dur = reduced ? 1 : 1600;
    const fmt = target.dataset.format === 'kr' ? krNum : (n) => n.toLocaleString('ko-KR');
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      target.textContent = fmt(Math.round(end * e)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}, { threshold: 0.6 });
$$('[data-count]').forEach((el) => counters.observe(el));

// ---------- 상단 탭: 지금 보고 있는 섹션 표시 ----------
const navLinks = $$('.nav-links a');
const spy = new IntersectionObserver((entries) => {
  entries.forEach(({ isIntersecting, target }) => {
    if (!isIntersecting) return;
    navLinks.forEach((a) => (a.getAttribute('href') === `#${target.id}` ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
['hero', 'friends', 'reel', 'games', 'about', 'contact'].forEach((id) => spy.observe(document.getElementById(id)));

// ---------- imagegen 스킬로 만든 이미지 연결 ----------
// scripts/generate-assets.sh 가 만든 assets/gen/manifest.json 에 있는 이미지만 씀 (없으면 지금 디자인 그대로)
fetch('/assets/gen/manifest.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((files) => {
  const gen = (f) => (files.includes(f) ? `/assets/gen/${f}` : null);
  const village = gen('bg-friends-village.jpg');
  if (village) { $('.family').style.setProperty('--village', `url(${village})`); $('.family').classList.add('has-village'); }
  $$('img[data-gen]').forEach((img) => {
    const src = gen(img.dataset.gen);
    if (src) { img.src = src; img.classList.add('ready'); }
  });
  $$('[data-gen-icon]').forEach((el) => {
    const src = gen(el.dataset.genIcon);
    if (src) { el.innerHTML = `<img src="${src}" alt="" />`; el.classList.add('has-art'); }
  });
  const curtain = gen('prop-curtain.png');
  if (curtain) { $('.curtains').style.setProperty('--curtain', `url(${curtain})`); $('.curtains').classList.add('has-art'); }
  buildWorld(gen);
});

// ---------- 배경 세계 + 장면 전환 소품 ----------
// 섹션 배경을 화면 뒤 한 층에 쌓아 두고, 다음 섹션이 화면 아래에서 위로 지나가는 동안
// 다음 배경이 겹쳐 나타남(살짝 줌인). 같은 구간에서 소품이 앞 장면에서 다음 장면으로 지나감.
const SEAM_START = 1.1;  // 전환이 시작되는 위치 (다음 섹션 윗변이 화면 높이의 110% 지점)
const SEAM_LENGTH = 1.6; // 전환이 이어지는 스크롤 길이 (화면 높이의 160%) — 늘리면 더 길고 천천히
const SCENES = [
  { id: 'hero', bg: 'bg-hero-sky.jpg' },
  { id: 'friends', bg: 'bg-friends-pattern.jpg', veil: 'rgba(255, 240, 184, .1)' },
  { id: 'reel', bg: 'bg-reel-theater.jpg', veil: 'rgba(58, 46, 92, .08)' },
  { id: 'games', bg: 'bg-games-playroom.jpg', veil: 'rgba(255, 246, 229, .15)' },
  { id: 'about', bg: 'bg-about-world.jpg', veil: 'rgba(255, 253, 247, .15)' },
  { id: 'contact', bg: 'bg-footer-party.jpg', veil: 'rgba(255, 143, 177, .08)' },
];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const fade = (t, a = 0.04, b = 0.96) => clamp01(Math.min((t - a) / 0.14, (b - t) / 0.14)); // 들어올 때·나갈 때 흐려짐
// x, y 는 화면 너비·높이 비율(중심 위치), w 는 화면 너비 비율(최소~최대 px), s 크기, r 회전(도)
const TRAVELERS = [
  // 히어로 → 친구들: 두 페이지 사이 '구름 구간'(.cloud-gap)에서 구름이 몰려와 화면을 덮었다가 걷힘
  ...[
    // [시작(x,y), 덮었을 때(x,y), 걷힐 때(x,y), 크기, 좌우반전]
    [[-0.3, 1.25], [0.2, 0.42], [-0.6, 0.15], 2.2, false],
    [[1.3, 1.15], [0.8, 0.5], [1.6, 0.3], 2.3, true],
    [[0.5, 1.6], [0.5, 0.78], [0.55, -0.7], 2.0, false],
    [[0.15, 1.75], [0.32, 0.12], [-0.3, -0.6], 1.7, true],
    [[0.9, 1.8], [0.68, 0.2], [1.3, -0.6], 1.8, false],
    [[0.45, 2.0], [0.52, 0.4], [0.45, -0.9], 1.5, true],
  ].map(([a, b, c, size, flip], k) => ({
    seam: 'cloud-gap', img: 'prop-cloud.png', w: [0.34, 260, 720], flip,
    at: (t) => {
      const i = smooth(clamp01(t / 0.4)), o = smooth(clamp01((t - 0.6) / 0.4)); // 몰려옴 0~0.4 · 가득 0.4~0.6 · 걷힘 0.6~1
      const drift = Math.sin(t * 4 + k) * 0.03; // 가득 찬 동안에도 둥실둥실
      return { x: lerp(lerp(a[0], b[0], i), c[0], o) + drift, y: lerp(lerp(a[1], b[1], i), c[1], o), s: size * lerp(0.7, 1, i) * lerp(1, 1.25, o) };
    },
  })),
  // 영상관 → 게임: 장난감이 통통 튀어 올라옴
  { seam: 'games', img: 'icon-buddy.png', w: [0.13, 110, 220], at: (t) => ({ x: 0.1, y: lerp(1.15, -0.2, t) - Math.abs(Math.sin(t * Math.PI * 3)) * 0.08, r: Math.sin(t * 9) * 14 }) },
  { seam: 'games', img: 'icon-learn.png', w: [0.12, 100, 200], at: (t) => ({ x: 0.9, y: lerp(1.3, -0.1, t) - Math.abs(Math.sin(t * Math.PI * 3 + 1)) * 0.08, r: Math.sin(t * 8 + 2) * 12 }) },
  { seam: 'games', img: 'prop-stars.png', w: [0.08, 70, 140], at: (t) => ({ x: lerp(0.78, 0.7, t), y: lerp(1.2, 0.05, t), r: t * 120 }) },
  // 게임 → 소개: 풍선과 종이비행기가 하늘로
  { seam: 'about', img: 'prop-balloons.png', w: [0.15, 120, 260], at: (t) => ({ x: 0.84 + Math.sin(t * 6) * 0.02, y: lerp(1.25, -0.4, t), r: Math.sin(t * 5) * 6 }) },
  { seam: 'about', img: 'prop-balloons.png', w: [0.11, 90, 200], flip: true, at: (t) => ({ x: 0.12 + Math.sin(t * 5 + 1) * 0.02, y: lerp(1.45, -0.25, t), r: Math.sin(t * 6) * 6 }) },
  { seam: 'about', img: 'prop-plane.png', w: [0.12, 100, 220], at: (t) => ({ x: lerp(-0.15, 1.15, t), y: lerp(0.8, 0.12, t) + Math.sin(t * 7) * 0.03, r: lerp(-6, -18, t) }) },
  // 소개 → 푸터: 별이 쏟아짐
  { seam: 'contact', img: 'prop-stars.png', w: [0.1, 80, 180], at: (t) => ({ x: 0.14, y: lerp(-0.25, 1.05, t), r: t * 180 }) },
  { seam: 'contact', img: 'prop-stars.png', w: [0.08, 70, 150], at: (t) => ({ x: 0.52, y: lerp(-0.45, 0.9, t), r: -t * 160 }) },
  { seam: 'contact', img: 'prop-stars.png', w: [0.12, 90, 200], at: (t) => ({ x: 0.86, y: lerp(-0.35, 1.0, t), r: t * 140 }) },
];

function buildWorld(gen) {
  if (!SCENES.every((s) => gen(s.bg))) return; // 배경이 다 있을 때만 (없으면 섹션 색 그대로)
  const world = document.createElement('div');
  world.className = 'world';
  world.setAttribute('aria-hidden', 'true');
  const layers = SCENES.map((s) => {
    const el = document.createElement('i');
    el.style.setProperty('--bg', `url(${gen(s.bg)})`);
    if (s.veil) el.style.setProperty('--veil', s.veil);
    world.append(el);
    return { el, section: document.getElementById(s.id) };
  });
  document.body.prepend(world);
  document.documentElement.classList.add('world-on');

  const box = document.createElement('div');
  box.className = 'travelers';
  box.setAttribute('aria-hidden', 'true');
  const props = reduced ? [] : TRAVELERS.filter((p) => gen(p.img)).map((p) => {
    const img = new Image();
    img.src = gen(p.img);
    img.alt = '';
    box.append(img);
    return { ...p, el: img, section: document.getElementById(p.seam) };
  });
  document.body.append(box);

  // 다음 섹션의 윗변이 화면 아래 110% → 위 -50% 를 지나는 동안 0 → 1 (SEAM_START·SEAM_LENGTH 로 길이 조절)
  const seam = (section) => clamp01((innerHeight * SEAM_START - section.getBoundingClientRect().top) / (innerHeight * SEAM_LENGTH));
  const gap = $('.cloud-gap');
  const gapT = () => {
    const r = gap.getBoundingClientRect();
    return r.height ? clamp01((innerHeight - r.top) / (r.height + innerHeight)) : null;
  };
  let frame = 0;
  function update() {
    frame = 0;
    const cloudT = gapT();
    // 배경: 뒤 장면 위에 다음 장면이 겹쳐 나타나고, 완전히 덮인 아래 장면은 숨김
    // 친구들 배경은 구름이 화면을 덮고 있는 동안(구름 구간 35~65%) 바뀜
    const amounts = layers.map((l, i) => (i === 0 ? 1
      : i === 1 && cloudT !== null ? smooth(clamp01((cloudT - 0.35) / 0.3))
      : smooth(seam(l.section))));
    let base = 0;
    amounts.forEach((a, i) => { if (a >= 0.999) base = i; });
    layers.forEach((l, i) => {
      const a = amounts[i], show = i >= base && a > 0.001;
      l.el.style.visibility = show ? 'visible' : 'hidden';
      if (!show) return;
      l.el.style.opacity = a.toFixed(3);
      l.el.style.transform = reduced || i === 0 ? '' : `scale(${(1.08 - 0.08 * a).toFixed(4)})`;
    });
    // 소품: 구간 안에서만 보임
    const vw = innerWidth, vh = innerHeight;
    props.forEach((p) => {
      const t = p.seam === 'cloud-gap' ? (cloudT ?? 0) : seam(p.section);
      if (t <= 0 || t >= 1) { p.el.style.visibility = 'hidden'; return; }
      const { x, y, s = 1, r = 0 } = p.at(t);
      const [frac, min, max] = p.w;
      p.el.style.width = `${Math.min(max, Math.max(min, vw * frac))}px`;
      p.el.style.visibility = 'visible';
      p.el.style.opacity = fade(t).toFixed(3);
      p.el.style.transform = `translate(${(x * vw).toFixed(1)}px, ${(y * vh).toFixed(1)}px) translate(-50%, -50%) rotate(${r.toFixed(1)}deg) scale(${p.flip ? -s : s}, ${s})`;
    });
  }
  addEventListener('scroll', () => { frame ||= requestAnimationFrame(update); }, { passive: true });
  addEventListener('resize', update);
  update();
}

// ---------- 등장 애니메이션: 섹션 내용이 아래에서 차례로 떠오름 ----------
if (!reduced) {
  document.documentElement.classList.add('js-reveal');
  const groups = [
    ['#friends .section-head'], ['.family'], ['.duo .buddy', 2], ['.friends-more > *', 2],
    ['#reel .filmstrip'], ['#reel .reel-more'],
    ['#games .section-head'], ['.chips'], ['.game', 3],
    ['#about .section-head'], ['.about-stage'], ['.stats li', 4], ['#about .sub-head'], ['.values li', 3],
    ['.footer-copy > *', 3],
  ];
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  groups.forEach(([sel, per = 1]) => $$(sel).forEach((el, i) => {
    el.classList.add('reveal');
    el.style.setProperty('--i', i % per);
    io.observe(el);
  }));
}

// ---------- 푸터 볼풀 ----------
$$('[data-store]').forEach((a) => (a.href = stores[a.dataset.store]));
new IntersectionObserver(([en], obs) => {
  if (!en.isIntersecting) return;
  obs.disconnect();
  const pit = createPlayground($('.ballpit'), {
    intro: 0, maxBodies: 90, friends: friendArt,
    kinds: ['ball', 'ball', 'ball', 'blob', 'star', 'friend', 'friend'], sound: sfx,
  });
  pit.rain(reduced ? 20 : Math.round(60 * Math.min(1, Math.max(0.5, innerWidth / 1200)))); // 모바일은 공을 덜
}, { threshold: 0.25 }).observe($('.footer'));
