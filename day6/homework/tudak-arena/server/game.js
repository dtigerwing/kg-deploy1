// 투닥 아레나 게임 엔진 — 서버가 물리와 승패를 모두 계산하고, 화면은 상태만 받아 그린다.
import { EventEmitter } from 'node:events';
import { think } from './bot-ai.js';

export const R0 = 320;          // 처음 경기장 반지름
const R_MIN = 70;               // 가장 작아졌을 때
const SHRINK_DELAY = 12;        // 이 시간(초) 뒤부터 줄어듦
const SHRINK_TIME = 70;         // 다 줄어드는 데 걸리는 시간(초)
export const PR = 22;           // 캐릭터 반지름
const ACCEL = 1500;
const MAX_SPEED = 270;
const FRICTION = 3.2;
const DASH_SPEED = 720;
const DASH_TIME = 0.16;
export const DASH_CD = 1.8;
const BOUNCE = 0.8;
const DASH_KNOCK = 380;
const PUSH_MEMORY = 3;          // 이 시간(초) 안에 부딪힌 상대를 "밀친 사람"으로 본다
const COUNTDOWN = 3;
const INTERMISSION = 10;

const rand = (a, b) => a + Math.random() * (b - a);

export class Game extends EventEmitter {
  constructor(bots) {
    super();
    this.bots = bots;
    this.phase = 'waiting';
    this.round = 0;
    this.wins = {};
    this.human = { name: '플레이어', active: false, input: {} };
    this.entities = [];
    this.t = 0;
    this.timer = 0;
    this.R = R0;
    this.winner = null;
  }

  setHuman(name) {
    this.human.name = name;
    this.human.active = true;
    if (this.phase === 'waiting') this.startCountdown();
  }

  removeHuman() {
    this.human.active = false;
    this.human.input = {};
    this.phase = 'waiting';
  }

  setInput(input) {
    this.human.input = input || {};
  }

  startCountdown() {
    this.round += 1;
    const list = [
      { id: 'player', name: this.human.name, speakName: this.human.name, bot: false },
      ...this.bots.map(b => ({ id: b.id, name: b.name, speakName: b.speakName, style: b.style, bot: true })),
    ];
    const offset = rand(0, Math.PI * 2);
    this.entities = list.map((c, i) => {
      const a = offset + (i / list.length) * Math.PI * 2;
      return {
        ...c,
        x: Math.cos(a) * R0 * 0.6, y: Math.sin(a) * R0 * 0.6,
        vx: 0, vy: 0, fx: -Math.cos(a), fy: -Math.sin(a),
        alive: true, dashT: 0, dashCd: 1.2,
        hitBy: null, hitAt: -99, edgeSince: null, closeCd: 0, outAt: null, ai: {},
      };
    });
    this.phase = 'countdown';
    this.timer = COUNTDOWN;
    this.t = 0;
    this.R = R0;
    this.winner = null;
    this.duelSaid = false;
    this.lastCount = COUNTDOWN + 1;
    this.emit('event', { type: 'round_start', round: this.round });
  }

  tick(dt) {
    if (this.phase === 'countdown') {
      this.timer -= dt;
      const n = Math.ceil(this.timer);
      if (n < this.lastCount && n > 0) { this.lastCount = n; this.emit('fx', { type: 'count' }); }
      if (this.timer <= 0) { this.phase = 'playing'; this.emit('fx', { type: 'go' }); }
    } else if (this.phase === 'playing') {
      this.simulate(dt);
    } else if (this.phase === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.human.active) this.startCountdown();
        else this.phase = 'waiting';
      }
    }
  }

  alive() {
    return this.entities.filter(e => e.alive);
  }

  get(id) {
    return this.entities.find(e => e.id === id);
  }

  simulate(dt) {
    this.t += dt;
    const k = Math.min(1, Math.max(0, (this.t - SHRINK_DELAY) / SHRINK_TIME));
    this.R = R0 - (R0 - R_MIN) * k;

    for (const e of this.alive()) {
      const input = e.bot ? think(e, this, dt) : this.humanInput();
      this.move(e, input, dt);
    }
    this.collide();
    this.checkFalls(dt);
    this.checkEnd();
  }

  humanInput() {
    const i = this.human.input;
    return {
      mx: (i.right ? 1 : 0) - (i.left ? 1 : 0),
      my: (i.down ? 1 : 0) - (i.up ? 1 : 0),
      dash: !!i.dash,
    };
  }

  move(e, { mx, my, dash }, dt) {
    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; e.fx = mx; e.fy = my; }
    e.dashCd = Math.max(0, e.dashCd - dt);

    if (dash && e.dashCd <= 0) {
      e.vx = e.fx * DASH_SPEED;
      e.vy = e.fy * DASH_SPEED;
      e.dashT = DASH_TIME;
      e.dashCd = DASH_CD;
      e.dashAt = this.t;
      this.emit('fx', { type: 'dash', id: e.id });
    }

    if (e.dashT > 0) {
      e.dashT -= dt;
    } else {
      e.vx += mx * ACCEL * dt;
      e.vy += my * ACCEL * dt;
      const damp = Math.max(0, 1 - FRICTION * dt);
      e.vx *= damp;
      e.vy *= damp;
      // 밀려난 속도는 한 번에 끊지 않고 서서히 줄여서 미끄러지듯 밀리게 한다
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > MAX_SPEED) {
        const s = Math.max(MAX_SPEED / sp, 1 - 4 * dt);
        e.vx *= s;
        e.vy *= s;
      }
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  collide() {
    const list = this.alive();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= PR * 2 || d < 0.0001) continue;
        const nx = dx / d, ny = dy / d;
        const overlap = PR * 2 - d;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;

        const ua = a.vx * nx + a.vy * ny;        // a가 b 쪽으로 미는 속도
        const ub = -(b.vx * nx + b.vy * ny);     // b가 a 쪽으로 미는 속도
        const rel = ua + ub;
        if (rel > 0) {
          const imp = (1 + BOUNCE) * rel / 2;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
        }

        const aDash = a.dashT > 0, bDash = b.dashT > 0;
        if (aDash && bDash) {
          a.vx -= nx * DASH_KNOCK * 0.6; a.vy -= ny * DASH_KNOCK * 0.6;
          b.vx += nx * DASH_KNOCK * 0.6; b.vy += ny * DASH_KNOCK * 0.6;
          a.dashT = b.dashT = 0;
        } else if (aDash) {
          b.vx += nx * DASH_KNOCK; b.vy += ny * DASH_KNOCK;
          a.dashT = 0;
          this.emit('event', { type: 'hard_hit', victim: b.id, attacker: a.id });
        } else if (bDash) {
          a.vx -= nx * DASH_KNOCK; a.vy -= ny * DASH_KNOCK;
          b.dashT = 0;
          this.emit('event', { type: 'hard_hit', victim: a.id, attacker: b.id });
        }

        // 더 세게 민 쪽을 "밀친 사람"으로 기록
        if (aDash || bDash || rel > 20) {
          if (aDash && !bDash || (!bDash && ua > ub + 30)) { b.hitBy = a.id; b.hitAt = this.t; }
          else if (bDash && !aDash || ub > ua + 30) { a.hitBy = b.id; a.hitAt = this.t; }
          else { a.hitBy = b.id; a.hitAt = this.t; b.hitBy = a.id; b.hitAt = this.t; }
          const power = Math.min(1, (rel + (aDash || bDash ? DASH_KNOCK : 0)) / 900);
          if (power > 0.08) this.emit('fx', { type: 'bump', power });
        }
      }
    }
  }

  checkFalls(dt) {
    for (const e of this.alive()) {
      const dist = Math.hypot(e.x, e.y);
      if (dist > this.R + PR * 0.3) {
        e.alive = false;
        e.outAt = this.t;
        // 자기가 막 돌진하다 떨어졌으면(그 뒤로 아무도 안 밀었으면) 자멸로 친다
        const ownDash = this.t - (e.dashAt ?? -99) < 0.8 && !(e.hitAt > e.dashAt);
        const pusher = !ownDash && e.hitBy && this.t - e.hitAt < PUSH_MEMORY ? e.hitBy : null;
        this.emit('fx', { type: 'fall' });
        this.emit('event', { type: 'out', victim: e.id, pusher, alive: this.alive().map(o => o.id) });
        continue;
      }
      // 아슬아슬: 가장자리까지 갔다가 다시 안쪽으로 돌아옴
      e.closeCd = Math.max(0, e.closeCd - dt);
      if (dist > this.R - PR - 12) {
        if (e.edgeSince === null) e.edgeSince = this.t;
      } else if (dist < this.R - PR - 55) {
        if (e.edgeSince !== null && this.t - e.edgeSince > 0.5 && e.closeCd <= 0) {
          e.closeCd = 8;
          this.emit('event', { type: 'close_call', id: e.id });
        }
        e.edgeSince = null;
      }
    }
  }

  checkEnd() {
    const left = this.alive();
    if (!this.duelSaid && left.length === 2) {
      this.duelSaid = true;
      this.emit('event', { type: 'duel', ids: left.map(e => e.id) });
    }
    if (left.length <= 1) {
      // 동시에 떨어지면 마지막에 떨어진 쪽이 이긴 걸로 친다
      const winner = left[0] ?? [...this.entities].sort((a, b) => b.outAt - a.outAt)[0];
      this.winner = winner.id;
      this.wins[winner.id] = (this.wins[winner.id] || 0) + 1;
      this.phase = 'intermission';
      this.timer = INTERMISSION;
      this.emit('fx', { type: 'win' });
      this.emit('event', { type: 'win', winner: winner.id });
    }
  }

  snapshot() {
    return {
      phase: this.phase,
      round: this.round,
      t: this.t,
      R: this.R,
      timer: this.timer,
      winner: this.winner,
      wins: this.wins,
      humanName: this.human.name,
      entities: this.entities.map(e => ({
        id: e.id, name: e.name, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10,
        alive: e.alive, dash: e.dashT > 0, cd: e.dashCd / DASH_CD,
      })),
    };
  }
}
