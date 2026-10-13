// 2D 물리 놀이터 (Matter.js + 직접 그리는 캔버스 렌더러)
// - 잡아서 던지기, 빈 곳 탭하면 새 친구 생성, 부딪히면 말랑하게 찌그러짐
// - 눈은 포인터를 따라봄, 가끔 깜빡임
// - 화면 밖이면 멈춤

// Matter.js(CDN)를 못 불러와도 나머지 페이지는 그대로 동작하도록 빈 객체로 받아 둠
const { Engine, Bodies, Body, Composite, Constraint, Query, Events } = window.Matter || {};

export const PALETTE = ['#ff8fb1', '#ffd45c', '#7ccbff', '#8fdb6e', '#b79cff', '#ff9e5e'];
const INK = '#3a2e5c';
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function createPlayground(canvas, opts = {}) {
  if (!Engine) return { spawn() {}, rain() {}, count: 0 }; // 물리 엔진이 없으면 놀이터만 생략
  const {
    letters = [],            // 처음 떨어질 글자 블록
    intro = 10,              // 처음 떨어질 친구 수
    maxBodies = 70,
    sign = null,             // { text, sub, onClick } 줄에 매달린 간판
    kinds = ['blob', 'blob', 'star', 'donut', 'pill', 'ball'],
    friends = [],            // [{ id, img, color }] 캐릭터 얼굴 공
    introFriends = [],       // 글자 다음에 꼭 떨어질 친구 (friends 의 index)
    floor = 0,               // 바닥을 캔버스 아래에서 이만큼 위로 (px)
    sound = () => {},
    scale: scaleFn = (w) => Math.max(0.62, Math.min(1, w / 1200)),
  } = opts;

  // 캐릭터 이미지 미리 불러오기 (못 불러오면 일반 말랑이로 그림)
  const friendArt = friends.map((f) => {
    const im = new Image();
    im.decoding = 'async';
    im.src = f.img;
    return { id: f.id, color: f.color, im };
  });
  // 지금 화면에 가장 적게 나온 친구를 골라 골고루 등장
  function pickFriend() {
    const count = new Map(friendArt.map((f) => [f, 0]));
    toys.forEach((t) => t.friend && count.set(t.friend, count.get(t.friend) + 1));
    const min = Math.min(...count.values());
    return pick(friendArt.filter((f) => count.get(f) === min));
  }

  const ctx = canvas.getContext('2d');
  const engine = Engine.create({ gravity: { y: 1 }, enableSleeping: false });
  const world = engine.world;
  let W = 0, H = 0, S = 1, dpr = 1;
  let walls = [];
  let toys = [];
  let signParts = null;
  const pointer = { x: -9999, y: -9999, active: false };
  let drag = null;   // { constraint, body, startX, startY, t }
  let running = false, raf = 0, last = 0, acc = 0;
  let introQueue = [];

  // ---------- 크기 ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height; S = scaleFn(W);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Composite.remove(world, walls);
    const t = 200;
    walls = [
      Bodies.rectangle(W / 2, H - floor + t / 2 - 2, W * 3, t, { isStatic: true, friction: 0.8 }),
      Bodies.rectangle(-t / 2, H / 2 - 1000, t, H * 2 + 2000, { isStatic: true }),
      Bodies.rectangle(W + t / 2, H / 2 - 1000, t, H * 2 + 2000, { isStatic: true }),
    ];
    Composite.add(world, walls);
    // 화면 밖으로 빠진 친구 되돌리기
    toys.forEach((b) => {
      if (b.position.x > W - 20 || b.position.y > H - floor) Body.setPosition(b, { x: Math.min(b.position.x, W - 60), y: Math.min(b.position.y, H - floor - 80) });
    });
    if (signParts) placeSign();
  }

  // ---------- 친구 만들기 ----------
  function makeToy(kind, x, y, extra = {}) {
    if (kind === 'friend' && !friendArt.length) kind = 'blob';
    const color = extra.color || pick(PALETTE);
    const common = { restitution: 0.45, friction: 0.25, frictionAir: 0.008, density: 0.0016 };
    let b;
    const s = S * (extra.size || rand(0.85, 1.25));
    switch (kind) {
      case 'letter': {
        const w = 104 * S, h = 116 * S;
        b = Bodies.rectangle(x, y, w, h, { ...common, chamfer: { radius: 26 * S }, restitution: 0.35, density: 0.002 });
        b.w = w; b.h = h; b.char = extra.char;
        break;
      }
      case 'pill': {
        const w = 120 * s, h = 54 * s;
        b = Bodies.rectangle(x, y, w, h, { ...common, chamfer: { radius: h / 2 - 1 } });
        b.w = w; b.h = h;
        break;
      }
      case 'ball': b = Bodies.circle(x, y, 26 * s, { ...common, restitution: 0.75 }); break;
      case 'star': b = Bodies.circle(x, y, 34 * s, { ...common, restitution: 0.5 }); break;
      case 'donut': b = Bodies.circle(x, y, 38 * s, common); break;
      case 'friend':
        b = Bodies.circle(x, y, 50 * S * (extra.size || rand(0.95, 1.15)), { ...common, restitution: 0.5 });
        b.friend = extra.friend || pickFriend();
        break;
      default: b = Bodies.circle(x, y, 44 * s, { ...common, restitution: 0.55 }); // blob
    }
    b.kind = kind; b.color = b.friend ? b.friend.color : color;
    b.squash = 0; b.born = performance.now();
    b.blink = rand(1500, 5000);
    b.face = kind === 'blob' || kind === 'letter' ? true : kind === 'pill' ? Math.random() < 0.6 : kind === 'ball' ? Math.random() < 0.4 : false;
    b.sprinkles = kind === 'donut' ? Array.from({ length: 9 }, () => ({ a: rand(0, Math.PI * 2), r: rand(0.55, 0.9), rot: rand(0, Math.PI), c: pick(PALETTE) })) : null;
    Body.setAngle(b, rand(-0.4, 0.4));
    Body.setAngularVelocity(b, rand(-0.06, 0.06));
    Composite.add(world, b);
    toys.push(b);
    // 너무 많으면 가장 오래된 친구부터 퇴장 (글자는 유지)
    if (toys.length > maxBodies) {
      const old = toys.find((t) => t.kind !== 'letter');
      if (old) removeToy(old);
    }
    return b;
  }
  function removeToy(b) {
    Composite.remove(world, b);
    toys = toys.filter((t) => t !== b);
  }
  function spawn(x, y, kind = pick(kinds)) {
    const b = makeToy(kind, x, y);
    b.squash = 1;
    Body.setVelocity(b, { x: rand(-3, 3), y: -rand(4, 8) });
    sound('pop');
    return b;
  }

  // ---------- 간판 (줄 두 개에 매달린 흔들 간판) ----------
  function placeSign() {
    const { body, ropes } = signParts;
    const narrow = W < 760;
    const ax = narrow ? W - body.w / 2 - 16 : Math.min(W - body.w / 2 - 30, W * 0.8);
    ropes[0].pointA = { x: ax - body.w * 0.38, y: -10 };
    ropes[1].pointA = { x: ax + body.w * 0.38, y: -10 };
    // 모바일은 탭이 두 줄이라 간판을 더 아래에 매답니다
    ropes.forEach((r) => (r.length = narrow ? 150 : 130 + 60 * S));
    Body.setPosition(body, { x: ax, y: narrow ? 176 : 180 + 60 * S });
  }
  function makeSign() {
    const narrow = W < 760;
    const w = narrow ? 172 : Math.max(210, 270 * S), h = narrow ? 74 : Math.max(88, 104 * S);
    const body = Bodies.rectangle(W * 0.78, 160 * S, w, h, { chamfer: { radius: 22 * S }, density: 0.003, frictionAir: 0.02, collisionFilter: { group: -1 } });
    body.kind = 'sign'; body.w = w; body.h = h; body.squash = 0;
    const mk = (dx) => Constraint.create({ pointA: { x: 0, y: 0 }, bodyB: body, pointB: { x: dx * w * 0.38, y: -h / 2 }, stiffness: 0.9, damping: 0.05 });
    const ropes = [mk(-1), mk(1)];
    Composite.add(world, [body, ...ropes]);
    signParts = { body, ropes, ...sign };
    placeSign();
  }

  // ---------- 충돌 → 말랑 ----------
  let lastSound = 0;
  Events.on(engine, 'collisionStart', (e) => {
    for (const p of e.pairs) {
      const v = Math.hypot(p.bodyA.velocity.x - p.bodyB.velocity.x, p.bodyA.velocity.y - p.bodyB.velocity.y);
      if (v < 2.5) continue;
      const k = Math.min(1, v / 14);
      [p.bodyA, p.bodyB].forEach((b) => { if (!b.isStatic) b.squash = Math.max(b.squash, k); });
      const now = performance.now();
      if (v > 6 && now - lastSound > 90) { lastSound = now; sound('boing', k); }
    }
  });

  // ---------- 포인터 ----------
  const localPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] || e.changedTouches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  };
  const draggable = () => (signParts ? [...toys, signParts.body] : toys);
  function down(e) {
    const p = localPoint(e);
    pointer.x = p.x; pointer.y = p.y; pointer.active = true;
    const hit = Query.point(draggable(), p)[0];
    if (hit) {
      if (e.cancelable) e.preventDefault();
      const local = { x: p.x - hit.position.x, y: p.y - hit.position.y };
      const cos = Math.cos(-hit.angle), sin = Math.sin(-hit.angle);
      const c = Constraint.create({
        pointA: { ...p }, bodyB: hit,
        pointB: { x: local.x * cos - local.y * sin, y: local.x * sin + local.y * cos },
        stiffness: 0.12, damping: 0.08, length: 0,
      });
      Composite.add(world, c);
      drag = { c, body: hit, sx: p.x, sy: p.y, t: performance.now(), moved: false };
      hit.squash = 0.8; hit.grabbed = true;
      canvas.style.cursor = 'grabbing';
      sound('grab');
    } else {
      drag = { c: null, sx: p.x, sy: p.y, t: performance.now(), moved: false };
    }
  }
  function move(e) {
    const p = localPoint(e);
    pointer.x = p.x; pointer.y = p.y;
    pointer.active = p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H;
    if (drag) {
      if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 8) drag.moved = true;
      if (drag.c) { drag.c.pointA = p; if (e.cancelable) e.preventDefault(); }
    } else {
      canvas.style.cursor = Query.point(draggable(), p)[0] ? 'grab' : 'pointer';
    }
  }
  function up(e) {
    if (!drag) return;
    const quick = !drag.moved && performance.now() - drag.t < 350;
    if (drag.c) {
      Composite.remove(world, drag.c);
      drag.body.grabbed = false;
      if (quick && drag.body === signParts?.body) signParts.onClick?.();
      else if (quick) { // 톡 치면 점프
        Body.setVelocity(drag.body, { x: rand(-2, 2), y: -10 });
        drag.body.squash = 1;
        sound('boing', 0.8);
      }
    } else if (quick) {
      spawn(drag.sx, drag.sy);
    }
    drag = null;
    canvas.style.cursor = '';
    if (e.type.startsWith('touch')) pointer.active = false;
  }
  canvas.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', up);
  canvas.addEventListener('mouseleave', () => { if (!drag) pointer.active = false; });

  // ---------- 그리기 ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  }
  function face(b, size, now) {
    // 포인터 쪽으로 눈동자 이동 (몸 회전 보정)
    let lx = 0, ly = 0;
    if (pointer.active) {
      const dx = pointer.x - b.position.x, dy = pointer.y - b.position.y;
      const a = Math.atan2(dy, dx) - b.angle;
      const d = Math.min(1, Math.hypot(dx, dy) / 200);
      lx = Math.cos(a) * d; ly = Math.sin(a) * d;
    }
    const blinking = (now - b.born) % b.blink < 120 || b.grabbed;
    const ex = size * 0.32, ey = -size * 0.08, er = size * 0.16;
    ctx.fillStyle = INK;
    for (const sx of [-1, 1]) {
      const cx = sx * ex, cy = ey;
      if (b.grabbed) { // > < 눈
        ctx.lineWidth = 3 * S; ctx.strokeStyle = INK; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - sx * er, cy - er * 0.8); ctx.lineTo(cx + sx * er * 0.4, cy); ctx.lineTo(cx - sx * er, cy + er * 0.8); ctx.stroke();
      } else if (blinking) {
        ctx.fillRect(cx - er, cy - 1.5 * S, er * 2, 3 * S);
      } else {
        ctx.beginPath(); ctx.ellipse(cx, cy, er * 0.8, er, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.lineWidth = 2.5 * S; ctx.strokeStyle = INK; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + lx * er * 0.35, cy + ly * er * 0.4, er * 0.48, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
        ctx.beginPath(); ctx.arc(cx + lx * er * 0.35 - er * 0.18, cy + ly * er * 0.4 - er * 0.2, er * 0.16, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
    // 볼터치
    ctx.fillStyle = 'rgba(255, 120, 150, .55)';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * size * 0.55, size * 0.18, size * 0.13, size * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
    // 입
    ctx.strokeStyle = INK; ctx.lineWidth = 3 * S; ctx.lineCap = 'round';
    ctx.beginPath();
    if (b.grabbed || b.squash > 0.5) { ctx.ellipse(0, size * 0.22, size * 0.1, size * 0.12, 0, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill(); }
    else { ctx.arc(0, size * 0.12, size * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  }
  function star(r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 ? r * 0.5 : r;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
  }
  function drawToy(b, now) {
    const { x, y } = b.position;
    const sq = b.squash;
    ctx.save();
    ctx.translate(x, y);
    // 바닥 그림자
    ctx.rotate(b.angle);
    const wob = Math.sin(now / 55) * sq * 0.18;
    ctx.scale(1 + wob, 1 - wob);
    ctx.lineWidth = 3.5 * S; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    const r = b.circleRadius || 0;
    ctx.fillStyle = b.color;
    switch (b.kind) {
      case 'letter': case 'sign': case 'pill': {
        const w = b.w, h = b.h, rad = b.kind === 'pill' ? h / 2 : 26 * S;
        rr(-w / 2, -h / 2 + 5 * S, w, h, rad); ctx.fillStyle = INK; ctx.fill(); // 입체 그림자
        rr(-w / 2, -h / 2, w, h, rad); ctx.fillStyle = b.kind === 'sign' ? '#fffdf7' : b.color; ctx.fill(); ctx.stroke();
        // 하이라이트
        ctx.fillStyle = 'rgba(255,255,255,.45)';
        rr(-w / 2 + 10 * S, -h / 2 + 8 * S, w * 0.35, 8 * S, 4 * S); ctx.fill();
        if (b.kind === 'letter') {
          ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `${78 * S}px Jua, sans-serif`;
          ctx.fillText(b.char, 0, -8 * S);
          ctx.save(); ctx.translate(0, 34 * S); ctx.scale(0.42, 0.42); face(b, 60 * S, now); ctx.restore();
        } else if (b.kind === 'sign') {
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const badge = signParts.badge || 'NEW!';
          ctx.font = `${15 * S}px Jua, sans-serif`;
          const bw = ctx.measureText(badge).width + 22 * S;
          ctx.fillStyle = '#ff6b6b'; rr(-w / 2 + 14 * S, -h / 2 + 14 * S, bw, 24 * S, 12 * S); ctx.fill(); ctx.lineWidth = 2.5 * S; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.fillText(badge, -w / 2 + 14 * S + bw / 2, -h / 2 + 27 * S);
          // 간판 폭에 맞춰 글자 크기 조절
          let fs = 26 * S;
          ctx.font = `${fs}px Jua, sans-serif`;
          const tw = ctx.measureText(signParts.text).width;
          if (tw > w - 36 * S) { fs *= (w - 36 * S) / tw; ctx.font = `${fs}px Jua, sans-serif`; }
          ctx.fillStyle = INK; ctx.fillText(signParts.text, 0, 8 * S);
          ctx.fillStyle = '#6b5f8a'; ctx.font = `${15 * S}px Jua, sans-serif`; ctx.fillText(signParts.sub, 0, 34 * S);
        } else if (b.face) {
          face(b, b.h * 0.9, now);
        }
        break;
      }
      case 'star':
        ctx.save(); ctx.translate(0, 4 * S); star(r * 1.25); ctx.fillStyle = INK; ctx.fill(); ctx.restore();
        star(r * 1.25); ctx.fillStyle = b.color; ctx.fill(); ctx.stroke();
        ctx.save(); ctx.scale(0.6, 0.6); face(b, r, now); ctx.restore();
        break;
      case 'donut': {
        ctx.beginPath(); ctx.arc(0, 4 * S, r, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#f2c38b'; ctx.fill(); ctx.stroke();
        // 아이싱 (물결)
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; const rad = r * (0.86 + Math.sin(i * 1.7) * 0.05); ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        ctx.closePath(); ctx.fillStyle = b.color; ctx.fill(); ctx.lineWidth = 2.5 * S; ctx.stroke();
        b.sprinkles.forEach((s) => {
          ctx.save(); ctx.rotate(s.a); ctx.translate(r * s.r * 0.85, 0); ctx.rotate(s.rot);
          ctx.fillStyle = s.c === b.color ? '#fff' : s.c; rr(-5 * S, -2 * S, 10 * S, 4 * S, 2 * S); ctx.fill(); ctx.restore();
        });
        ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fillStyle = '#e6f7ff'; ctx.fill(); ctx.lineWidth = 3 * S; ctx.stroke();
        break;
      }
      case 'friend': {
        const { im } = b.friend;
        ctx.beginPath(); ctx.arc(0, 4 * S, r, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = b.color; ctx.fill();
        // 안쪽 밝은 원 + 캐릭터 얼굴 (아래쪽 잘린 부분은 원 밖으로)
        ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
        if (im.complete && im.naturalWidth) {
          ctx.save();
          ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, Math.PI * 2); ctx.clip();
          const h = r * 2.05, w = h * (im.naturalWidth / im.naturalHeight);
          ctx.drawImage(im, -w / 2, r * 1.02 - h, w, h);
          ctx.restore();
        } else {
          face(b, r, now);
        }
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.lineWidth = 3.5 * S; ctx.stroke();
        break;
      }
      default: { // blob, ball
        ctx.beginPath(); ctx.arc(0, 4 * S, r, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = b.color; ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.45, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
        if (b.kind === 'blob') { // 더듬이
          ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.25, -r * 1.35, r * 0.1, -r * 1.45); ctx.stroke();
          ctx.beginPath(); ctx.arc(r * 0.1, -r * 1.48, r * 0.13, 0, Math.PI * 2); ctx.fillStyle = '#ffd45c'; ctx.fill(); ctx.lineWidth = 2.5 * S; ctx.stroke();
        }
        if (b.face) face(b, r, now);
      }
    }
    ctx.restore();
  }
  function render(now) {
    ctx.clearRect(0, 0, W, H);
    if (signParts) { // 줄
      ctx.strokeStyle = INK; ctx.lineWidth = 3 * S; ctx.lineCap = 'round';
      signParts.ropes.forEach((r) => {
        const b = signParts.body, p = r.pointB;
        const cos = Math.cos(b.angle), sin = Math.sin(b.angle);
        ctx.beginPath(); ctx.moveTo(r.pointA.x, r.pointA.y);
        ctx.lineTo(b.position.x + p.x * cos - p.y * sin, b.position.y + p.x * sin + p.y * cos); ctx.stroke();
      });
      drawToy(signParts.body, now);
    }
    toys.forEach((b) => drawToy(b, now));
    if (drag?.c) { // 잡은 줄
      const b = drag.body, p = drag.c.pointB, cos = Math.cos(b.angle), sin = Math.sin(b.angle);
      ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(58,46,92,.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(drag.c.pointA.x, drag.c.pointA.y);
      ctx.lineTo(b.position.x + p.x * cos - p.y * sin, b.position.y + p.x * sin + p.y * cos); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ---------- 루프 ----------
  const STEP = 1000 / 60;
  function tick(now) {
    if (!running) return;
    acc += Math.min(100, now - (last || now)); last = now;
    while (acc >= STEP) {
      Engine.update(engine, STEP);
      acc -= STEP;
      if (introQueue.length && now >= introQueue[0].at) { const q = introQueue.shift(); q.fn(); }
    }
    toys.forEach((b) => {
      b.squash *= 0.93;
      if (b.position.y > H + 300) removeToy(b);
      // 캐릭터 공은 오뚝이처럼 얼굴이 위로 오도록 살짝 되돌림
      if (b.friend && !b.grabbed) {
        const a = Math.atan2(Math.sin(b.angle), Math.cos(b.angle));
        Body.setAngularVelocity(b, b.angularVelocity * 0.97 - a * 0.006);
      }
    });
    if (signParts) signParts.body.squash *= 0.93;
    render(now);
    raf = requestAnimationFrame(tick);
  }
  function start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(tick); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // ---------- 시작 ----------
  resize();
  if (sign) makeSign();
  const t0 = performance.now() + 300;
  letters.forEach((ch, i) => {
    introQueue.push({ at: t0 + i * 160, fn: () => makeToy('letter', W * 0.12 + i * Math.min(120 * S * 1.15, (W * 0.7) / letters.length), -120, { char: ch, color: PALETTE[i % PALETTE.length] }) });
  });
  introFriends.forEach((n, i) => {
    introQueue.push({ at: t0 + 850 + i * 220, fn: () => makeToy('friend', W * (0.55 + i * 0.18), -100, { friend: friendArt[n], size: 1.2 }) });
  });
  for (let i = 0; i < intro; i++) {
    introQueue.push({ at: t0 + 1300 + i * 140, fn: () => makeToy(pick(kinds), rand(60, W - 60), -80 - rand(0, 200)) });
  }

  const io = new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop()), { threshold: 0.05 });
  io.observe(canvas);
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });

  return {
    spawn,
    rain(n = 12, kind) { for (let i = 0; i < n; i++) introQueue.push({ at: performance.now() + i * 90, fn: () => makeToy(kind || pick(kinds), rand(40, W - 40), -60 - rand(0, 120)) }); },
    get count() { return toys.length; },
  };
}
