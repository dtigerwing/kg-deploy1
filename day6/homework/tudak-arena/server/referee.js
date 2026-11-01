// 심판(사회자) 봇 — 게임 사건을 보고 "누가, 언제" 말할지 정해서 디스코드에서 그 봇을 멘션한다.
// 봇들(Hermes)은 멘션받을 때만 말하므로, 수다의 양과 간격은 전부 여기서 조절된다.
import { Client, GatewayIntentBits, Events } from 'discord.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// 받침 있으면 첫 번째, 없으면 두 번째 조사 (한글이 아니면 받침 없음으로 본다)
function josa(word, withBatchim, without) {
  const code = word.charCodeAt(word.length - 1);
  const has = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return word + (has ? withBatchim : without);
}
const iga = w => josa(w, '이', '가');
const eulreul = w => josa(w, '을', '를');

// 토큰 첫 부분은 봇 사용자 ID를 base64로 담고 있다
function idFromToken(token) {
  try { return Buffer.from(token.split('.')[0], 'base64').toString('utf8'); } catch { return null; }
}

export class Referee {
  constructor({ game, bots, cfg, env, io }) {
    this.game = game;
    this.bots = bots;
    this.cfg = cfg;
    this.env = env;
    this.io = io;
    this.enabled = true;
    this.discord = null;
    this.status = 'off';
    this.botIds = new Map();      // botId -> 디스코드 사용자 ID
    this.idToBot = new Map();     // 디스코드 사용자 ID -> botId
    this.nextFree = new Map();    // botId -> 다시 말할 수 있는 시각
    this.speaking = new Map();    // botId -> 대답을 기다리기 시작한 시각
    this.pending = new Map();     // botId -> 대꾸 깊이
    this.recent = [];             // 최근 1분 동안 부른 시각
    this.buffer = [];
    this.lastSpeech = Date.now();
    this.resetStats();
    for (const b of bots) {
      const id = env[b.tokenEnv] ? idFromToken(env[b.tokenEnv]) : null;
      if (id) { this.botIds.set(b.id, id); this.idToBot.set(id, b.id); }
    }
    game.on('event', ev => this.onGameEvent(ev));
    setInterval(() => this.idleCheck(), 5000);
  }

  resetStats() {
    this.pushes = {};      // pushes[a][b] = a가 b를 떨어뜨린 횟수
    this.selfOuts = {};
    this.streak = { id: null, n: 0 };
    this.roundLog = [];
  }

  async start() {
    const { DISCORD_TOKEN_REFEREE: token, DISCORD_TEXT_CHANNEL_ID: channelId } = this.env;
    if (!token || !channelId) {
      console.log('[심판] 디스코드 토큰이나 채널 ID가 없어서 콘솔에만 기록합니다.');
      return;
    }
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });
    client.on(Events.MessageCreate, msg => this.onDiscordMessage(msg));
    try {
      await client.login(token);
      this.channel = await client.channels.fetch(channelId);
      this.discord = client;
      this.setStatus('connected');
      console.log(`[심판] 디스코드 연결됨: #${this.channel.name}`);
    } catch (err) {
      this.setStatus('error');
      console.error('[심판] 디스코드 연결 실패:', err.message);
    }
  }

  setStatus(s) {
    this.status = s;
    this.io.emit('status', { discord: s, chatter: this.enabled });
  }

  setEnabled(on) {
    this.enabled = on;
    this.setStatus(this.status);
  }

  // ---------- 이름과 기억 ----------

  name(id) {
    if (id === 'player') return this.game.human.name;
    return this.bots.find(b => b.id === id)?.speakName ?? id;
  }

  aliveExcept(target) {
    return this.game.alive().map(e => e.id).filter(id => id !== target).map(id => this.name(id));
  }

  memoryPushed(victim, pusher) {
    const n = this.pushes[pusher]?.[victim] || 0;
    return n >= 2 ? `오늘 ${this.name(pusher)}한테 ${n}번째로 당함` : '';
  }

  memoryPusher(victim, pusher) {
    const n = this.pushes[pusher]?.[victim] || 0;
    return n >= 2 ? `오늘 ${eulreul(this.name(victim))} ${n}번째 떨어뜨림` : '';
  }

  memorySelf(id) {
    const n = this.selfOuts[id] || 0;
    return n >= 2 ? `오늘 혼자 떨어진 게 ${n}번째` : '';
  }

  memoryWin(id) {
    if (this.streak.id === id && this.streak.n >= 2) return `${this.streak.n}연승 중`;
    const n = this.game.wins[id] || 0;
    return n >= 2 ? `오늘 ${n}번째 우승` : '';
  }

  // ---------- 게임 사건 ----------

  onGameEvent(ev) {
    if (ev.type === 'round_start') { this.roundLog = []; return; }
    if (ev.type === 'out') {
      this.roundLog.push(ev);
      if (ev.pusher) {
        this.pushes[ev.pusher] ??= {};
        this.pushes[ev.pusher][ev.victim] = (this.pushes[ev.pusher][ev.victim] || 0) + 1;
      } else {
        this.selfOuts[ev.victim] = (this.selfOuts[ev.victim] || 0) + 1;
      }
    }
    if (ev.type === 'win') {
      this.streak = this.streak.id === ev.winner ? { id: ev.winner, n: this.streak.n + 1 } : { id: ev.winner, n: 1 };
      setTimeout(() => this.summary(), this.cfg.summaryDelaySec * 1000);
    }
    const kind = this.classify(ev);
    if (!kind) return;
    this.buffer.push({ ...ev, kind });
    if (this.buffer.length === 1) setTimeout(() => this.flush(), this.cfg.batchWindowMs);
  }

  classify(ev) {
    const isBot = id => id && id !== 'player';
    switch (ev.type) {
      case 'out':
        if (isBot(ev.victim)) {
          if (!ev.pusher) return 'self_out';
          return ev.pusher === 'player' ? 'player_pushed_bot' : 'pushed_out';
        }
        return ev.pusher ? 'player_out' : 'player_self_out';
      case 'hard_hit': return isBot(ev.victim) ? 'hard_hit' : null;
      case 'close_call': return isBot(ev.id) ? 'close_call' : null;
      case 'duel': return 'duel';
      case 'win': return ev.winner === 'player' ? 'player_win' : 'bot_win';
      default: return null;
    }
  }

  // 1초 안에 몰린 사건 중 가장 중요한 것 하나만 말하게 한다
  flush() {
    const events = this.buffer;
    this.buffer = [];
    const prio = e => this.cfg.events[e.kind].priority;
    const ev = events.sort((a, b) => prio(b) - prio(a))[0];
    if (ev) this.react(ev);
  }

  react(ev) {
    const r = this.cfg.events[ev.kind];
    const bots = this.bots.map(b => b.id);
    const chance = p => Math.random() < p;
    const say = (id, desc, mem, important = false) => {
      // 판이 끝난 뒤에는 "남은 사람"이 의미 없으니 뺀다
      const left = this.game.phase === 'playing' ? this.aliveExcept(id) : [];
      let text = `[게임] 사건: ${desc}`;
      if (left.length) text += ` / 남은 사람: ${left.join(', ')}`;
      if (mem) text += ` / 기억: ${mem}`;
      this.call(id, text, { important, depth: 0 });
    };
    const n = id => this.name(id);

    switch (ev.kind) {
      case 'pushed_out': {
        const { victim: v, pusher: p } = ev;
        say(v, `${iga(n(p))} 너를 밀어서 떨어뜨림`, this.memoryPushed(v, p), true);
        if (chance(r.pusher)) say(p, `네가 ${eulreul(n(v))} 밀어서 떨어뜨림`, this.memoryPusher(v, p));
        const by = bots.filter(id => id !== v && id !== p);
        if (by.length && chance(r.bystander)) say(pick(by), `${iga(n(p))} ${eulreul(n(v))} 밀어서 떨어뜨림`);
        break;
      }
      case 'self_out': {
        const v = ev.victim;
        say(v, '아무도 안 밀었는데 너 혼자 떨어짐', this.memorySelf(v), true);
        const others = bots.filter(id => id !== v);
        const mocker = others.includes(r.preferMocker) ? r.preferMocker : pick(others);
        if (mocker && chance(r.mocker)) say(mocker, `${iga(n(v))} 아무도 안 밀었는데 혼자 떨어짐`, this.memorySelf(v));
        break;
      }
      case 'player_pushed_bot': {
        const v = ev.victim;
        say(v, `${iga(n('player'))} 너를 밀어서 떨어뜨림`, this.memoryPushed(v, 'player'), true);
        break;
      }
      case 'player_out': {
        const p = ev.pusher;
        if (p !== 'player' && chance(r.pusher)) say(p, `네가 ${eulreul(n('player'))} 밀어서 떨어뜨림`, this.memoryPusher('player', p));
        const others = bots.filter(id => id !== p);
        if (chance(r.other)) say(pick(others), `${iga(n(p))} ${eulreul(n('player'))} 밀어서 떨어뜨림`);
        break;
      }
      case 'player_self_out':
        if (chance(r.other)) say(pick(bots), `${iga(n('player'))} 아무도 안 밀었는데 혼자 떨어짐`, this.memorySelf('player'));
        break;
      case 'hard_hit':
        if (chance(r.victim)) say(ev.victim, `${iga(n(ev.attacker))} 돌진해서 너를 세게 들이받음 (안 떨어지고 버팀)`);
        break;
      case 'close_call':
        if (chance(r.self)) say(ev.id, '경기장 끝에서 떨어질 뻔했는데 아슬아슬하게 버팀');
        break;
      case 'duel': {
        const inDuel = ev.ids.filter(id => id !== 'player');
        if (inDuel.length && chance(r.one)) {
          const me = pick(inDuel);
          const rival = ev.ids.find(id => id !== me);
          say(me, `이제 너랑 ${n(rival)}만 남음. 1:1 마지막 승부`);
        }
        break;
      }
      case 'bot_win': {
        const w = ev.winner;
        say(w, '네가 이번 판 우승함!', this.memoryWin(w), true);
        for (const id of bots) if (id !== w && chance(r.others)) say(id, `${iga(n(w))} 이번 판 우승함`, this.memoryWin(w));
        break;
      }
      case 'player_win':
        for (const id of bots) if (chance(r.each)) say(id, `${iga(n('player'))} 이번 판 우승함`, this.memoryWin('player'));
        break;
    }
  }

  summary() {
    if (!this.roundLog.length) return;
    const parts = this.roundLog.map(o => o.pusher
      ? `${iga(this.name(o.pusher))} ${eulreul(this.name(o.victim))} 떨어뜨림`
      : `${iga(this.name(o.victim))} 혼자 떨어짐`);
    const text = `[수다] 이번 판 정리: ${parts.join(', ')}. 우승은 ${this.name(this.game.winner)}. 판 끝나고 쉬는 시간이니 한마디 해.`;
    const free = this.bots.map(b => b.id).filter(id => this.available(id));
    if (free.length) this.call(pick(free), text, { depth: 0 });
  }

  idleCheck() {
    const g = this.game;
    if (!g.human.active || !['playing', 'intermission'].includes(g.phase)) return;
    if (Date.now() - this.lastSpeech < this.cfg.idleSec * 1000) return;
    const free = this.bots.map(b => b.id).filter(id => this.available(id));
    if (free.length) this.call(pick(free), '[수다] 다들 조용하다. 게임이나 친구들 얘기로 아무 말이나 가볍게 꺼내.', { depth: 0 });
  }

  // ---------- 말 시키기 ----------

  available(id) {
    const now = Date.now();
    if (!this.enabled) return false;
    if ((this.nextFree.get(id) || 0) > now) return false;
    this.recent = this.recent.filter(t => now - t < 60000);
    const cap = this.cfg.perMinuteCap[this.game.phase === 'playing' ? 'playing' : 'intermission'];
    if (this.recent.length >= cap) return false;
    for (const [bid, since] of this.speaking) {
      if (now - since > this.cfg.speakingTimeoutSec * 1000) this.speaking.delete(bid);
    }
    return this.speaking.size < this.cfg.maxSimultaneous;
  }

  // important: 자기가 떨어졌거나 우승한 순간은 휴식 시간·상한을 무시하고 부른다
  async call(id, text, { important = false, depth = 0 } = {}) {
    if (!this.enabled) return;
    if (!important && !this.available(id)) return;
    const now = Date.now();
    this.nextFree.set(id, now + rand(...this.cfg.cooldownSec) * 1000);
    this.recent.push(now);
    this.speaking.set(id, now);
    this.pending.set(id, depth);
    this.lastSpeech = now;

    const userId = this.botIds.get(id);
    console.log(`[심판 → ${this.name(id)}] ${text}`);
    if (!this.discord || !userId) return;
    try {
      await this.channel.send({ content: `<@${userId}> ${text}`, allowedMentions: { users: [userId] } });
    } catch (err) {
      console.error('[심판] 메시지 전송 실패:', err.message);
    }
  }

  // ---------- 봇의 대답 ----------

  onDiscordMessage(msg) {
    if (msg.channelId !== this.env.DISCORD_TEXT_CHANNEL_ID) return;
    const id = this.idToBot.get(msg.author.id);
    if (!id) return;
    const line = msg.content.replace(/<@!?\d+>/g, '').trim();
    if (!line) return;
    console.log(`[${this.name(id)}] ${line}`);
    this.io.emit('say', { id, text: line });
    this.speaking.delete(id);
    this.lastSpeech = Date.now();

    const depth = this.pending.get(id);
    this.pending.delete(id);
    if (depth === undefined) return;
    const p = this.cfg.chainChance[depth];
    if (!p || Math.random() >= p) return;

    // 대답에 이름이 나온 친구가 받아치고, 없으면 아무나
    const others = this.bots.filter(b => b.id !== id);
    const named = others.find(b => line.includes(b.speakName) || line.includes(b.name));
    const next = named ?? pick(others);
    setTimeout(() => {
      if (!this.available(next.id)) return;
      this.call(next.id, `[수다] ${iga(this.name(id))} "${line}"라고 함. 대꾸해.`, { depth: depth + 1 });
    }, rand(...this.cfg.chainDelaySec) * 1000);
  }
}
