// Hermes 프로필 3개(코코·러비·Rou)를 이 프로젝트 설정대로 만들고 맞춘다.
// 여러 번 실행해도 안전하다: 없는 프로필만 만들고, 설정은 필요한 키만 덮어쓴다.
//   npm run setup-hermes
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import YAML from 'yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = dotenv.parse(readFileSync(`${root}.env`, 'utf8'));
const characters = JSON.parse(readFileSync(`${root}config/characters.json`, 'utf8'));
const HERMES_HOME = process.env.HERMES_HOME || `${homedir()}/.hermes`;

const idFromToken = t => Buffer.from(t.split('.')[0], 'base64').toString('utf8');

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

// ---------- 확인 ----------

const required = ['ANTHROPIC_API_KEY', 'DISCORD_TOKEN_REFEREE', 'DISCORD_OWNER_ID', 'DISCORD_TEXT_CHANNEL_ID',
  ...characters.bots.map(b => b.tokenEnv)];
const missing = required.filter(k => !env[k]);
if (missing.length) fail(`.env에 아직 비어 있는 값이 있어요: ${missing.join(', ')}`);

const hermesBin = [`${homedir()}/.local/bin/hermes`, 'hermes'].find(p => {
  try { execFileSync(p, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
});
if (!hermesBin) fail('hermes 명령을 찾을 수 없어요. 먼저 Hermes를 설치해 주세요 (README 참고).');

const refereeId = idFromToken(env.DISCORD_TOKEN_REFEREE);
const names = Object.fromEntries(characters.bots.map(b => [b.id, b.name]));

// ---------- 도우미 ----------

function mergeEnv(path, values) {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
  const done = new Set();
  const out = lines.map(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1] in values) { done.add(m[1]); return `${m[1]}=${values[m[1]]}`; }
    return line;
  });
  for (const [k, v] of Object.entries(values)) if (!done.has(k)) out.push(`${k}=${v}`);
  writeFileSync(path, out.join('\n').replace(/\n*$/, '\n'));
  chmodSync(path, 0o600);
}

function mergeYaml(path, values) {
  const doc = existsSync(path) ? YAML.parseDocument(readFileSync(path, 'utf8')) : new YAML.Document({});
  if (!doc.contents) doc.contents = doc.createNode({});
  for (const [key, value] of Object.entries(values)) doc.setIn(key.split('.'), value);
  writeFileSync(path, doc.toString());
}

function render(text, self) {
  return text
    .replaceAll('{{coco}}', names.coco)
    .replaceAll('{{lovey}}', names.lovey)
    .replaceAll('{{rou}}', names.rou)
    .replaceAll('{{self}}', self);
}

// ---------- 봇 프로필 ----------

const common = readFileSync(`${root}bots/common.md`, 'utf8');

for (const bot of characters.bots) {
  const home = `${HERMES_HOME}/profiles/${bot.id}`;
  if (!existsSync(home)) {
    console.log(`· 프로필 만들기: ${bot.id}`);
    execFileSync(hermesBin, ['profile', 'create', bot.id], { stdio: 'inherit' });
  }
  mkdirSync(home, { recursive: true });

  const soul = render(`${readFileSync(`${root}bots/${bot.id}.md`, 'utf8')}\n${common}`, bot.name);
  writeFileSync(`${home}/SOUL.md`, soul);

  mergeEnv(`${home}/.env`, {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    DISCORD_BOT_TOKEN: env[bot.tokenEnv],
    // 나와 심판만 말을 걸 수 있다
    DISCORD_ALLOWED_USERS: `${env.DISCORD_OWNER_ID},${refereeId}`,
    DISCORD_ALLOW_BOTS: 'mentions',
    DISCORD_ALLOWED_CHANNELS: env.DISCORD_TEXT_CHANNEL_ID,
    DISCORD_REQUIRE_MENTION: 'true',
    DISCORD_AUTO_THREAD: 'false',
    DISCORD_REACTIONS: 'false',
    DISCORD_REPLY_TO_MODE: 'off',
    DISCORD_HISTORY_BACKFILL_LIMIT: '12',
  });

  mergeYaml(`${home}/config.yaml`, {
    'model.provider': 'anthropic',
    'model.default': characters.model,
    'tts.provider': 'edge',
    'tts.speed': bot.speed,
    'tts.edge.voice': bot.voice,
    'tts.edge.speed': bot.speed,
    'stt.language': 'ko',
    'discord.require_mention': true,
    'discord.auto_thread': false,
    'discord.reactions': false,
    'discord.history_backfill_limit': 12,
    // 음성방에서 조용해도 나가지 않기 (0 = /voice leave 할 때까지 유지)
    'discord.voice_channel_inactivity_timeout_seconds': 0,
    // 디스코드에서는 도구를 거의 쓰지 않게 (대화만)
    'platform_toolsets.discord': ['todo'],
  });
  console.log(`✓ ${bot.name}: SOUL.md · .env · config.yaml (목소리 ${bot.voice}, 속도 ${bot.speed})`);
}

// ---------- 기본 프로필: 게이트웨이와 별도 포트 ----------
// 기본 프로필의 게이트웨이 하나가 세 봇을 함께 실행한다. Hermes API 서버를 별도 포트로 연다.

const defaultEnv = `${HERMES_HOME}/.env`;
const existingKey = existsSync(defaultEnv) && readFileSync(defaultEnv, 'utf8').match(/^API_SERVER_KEY=(.+)$/m)?.[1];
mergeEnv(defaultEnv, {
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
  API_SERVER_ENABLED: 'true',
  API_SERVER_PORT: String(characters.hermesApiPort),
  API_SERVER_HOST: '127.0.0.1',
  API_SERVER_KEY: existingKey || randomBytes(24).toString('hex'),
});
mergeYaml(`${HERMES_HOME}/config.yaml`, {
  'model.provider': 'anthropic',
  'model.default': characters.model,
});
console.log(`✓ 기본 프로필: Hermes API 서버 포트 ${characters.hermesApiPort}`);

console.log(`
다음 단계
  1) 게이트웨이 켜기 (봇 3개가 함께 켜져요):  ${hermesBin} gateway
  2) 디스코드 음성방 "투닥-아레나"에 들어간 뒤, #투닥-중계에서 봇마다 /voice join 실행
  3) 게임 켜기:  npm start  →  http://localhost:${env.GAME_PORT || 3300}
`);
