// 봇 3명의 움직임 — 성격이 플레이 스타일에도 드러나게 한다.
//  Rou(reckless): 가장자리 신경 안 쓰고 막 돌진, 가끔 혼자 떨어짐
//  러비(cautious): 가운데에서 버티다가, 상대가 가장자리 쪽에 있을 때만 밀어냄
//  코코(chaser): 가까운 상대를 쫓아다니며 들이받음

const STYLE = {
  reckless: { margin: 35, decide: [0.12, 0.25], dashRange: 230, dashChance: 0.5, randomDash: 0.06, aim: 0.25 },
  chaser: { margin: 55, decide: [0.18, 0.32], dashRange: 150, dashChance: 0.35, randomDash: 0, aim: 0.15 },
  cautious: { margin: 60, decide: [0.2, 0.4], dashRange: 100, dashChance: 0.5, randomDash: 0, aim: 0.08, dodge: 0.3 },
};

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function nearest(me, others) {
  let best = null, bd = Infinity;
  for (const o of others) {
    const d = dist(me, o);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function think(me, game, dt) {
  const s = STYLE[me.style];
  const ai = me.ai;
  ai.wait = (ai.wait ?? 0) - dt;
  // 사람처럼 반응이 살짝 늦게: 매 순간이 아니라 0.1~0.3초마다 판단
  if (ai.wait > 0 && ai.out) return { ...ai.out, dash: false };
  ai.wait = rand(...s.decide);

  const others = game.alive().filter(o => o !== me);
  const R = game.R;
  const d0 = Math.hypot(me.x, me.y) || 1;
  let mx = 0, my = 0, dash = false;

  if (!ai.target || !ai.target.alive || Math.random() < 0.08) {
    // 오늘 가장 많이 이긴 친구는 다 같이 노린다
    const leader = others.reduce((a, b) => ((game.wins[b.id] || 0) > (game.wins[a?.id] || 0) ? b : a), null);
    if (leader && (game.wins[leader.id] || 0) > 0 && Math.random() < 0.5) ai.target = leader;
    else ai.target = me.style === 'reckless'
      ? others[Math.floor(Math.random() * others.length)]
      : nearest(me, others);
  }

  if (me.style === 'cautious') {
    const threat = nearest(me, others);
    let hx = 0, hy = 0;
    if (threat) {
      const ax = me.x - threat.x, ay = me.y - threat.y, al = Math.hypot(ax, ay) || 1;
      hx = ax / al * R * 0.45;
      hy = ay / al * R * 0.45;
    }
    mx = hx - me.x;
    my = hy - me.y;
    for (const o of others) {
      if (o.dashT <= 0 || dist(me, o) > 180 || Math.random() > s.dodge) continue;
      // 돌진해 오는 상대는 옆으로 피한다
      const ox = me.x - o.x, oy = me.y - o.y;
      const px = -o.vy, py = o.vx;
      const side = px * ox + py * oy > 0 ? 1 : -1;
      mx += px * side;
      my += py * side;
    }
    if (threat && me.dashCd <= 0 && dist(me, threat) < s.dashRange
        && Math.hypot(threat.x, threat.y) > d0 + 30 && Math.random() < s.dashChance) {
      mx = threat.x - me.x;
      my = threat.y - me.y;
      dash = true;
    }
  } else if (ai.target) {
    const tg = ai.target;
    mx = tg.x + tg.vx * 0.15 - me.x;
    my = tg.y + tg.vy * 0.15 - me.y;
    if (me.dashCd <= 0 && Math.hypot(mx, my) < s.dashRange && Math.random() < s.dashChance) dash = true;
  }

  if (s.randomDash && me.dashCd <= 0 && Math.random() < s.randomDash) {
    const a = Math.random() * Math.PI * 2;
    mx = Math.cos(a);
    my = Math.sin(a);
    dash = true;
  }

  const l = Math.hypot(mx, my) || 1;
  mx /= l;
  my /= l;

  const danger = (d0 - (R - s.margin)) / s.margin;
  if (danger > 0 && !dash) {
    const k = Math.min(1.5, danger * 2);
    mx -= me.x / d0 * k;
    my -= me.y / d0 * k;
  }
  mx += (Math.random() - 0.5) * s.aim * 2;
  my += (Math.random() - 0.5) * s.aim * 2;

  ai.out = { mx, my };
  return { mx, my, dash };
}
