// 감정 분류 — TypeSafe AI 의 Jev (System One) 모델이 분류하고, 응대는 OpenAI 가 함
// API 문서: https://docs.typesafe.ai/api  ·  .env: TYPESAFE_API_KEY (선택: TYPESAFE_MODEL)
// Jev 는 글을 만들지 않고 정해진 선택지별 확률만 돌려줌 → "분노 65%" 처럼 그대로 씀
import crypto from 'node:crypto';
import { normalize } from './guard.js';

const KEY = process.env.TYPESAFE_API_KEY || '';
export const JEV_MODEL = process.env.TYPESAFE_MODEL || 'jev-latest';
const BASE_URL = (process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai').replace(/\/$/, '');
export const emotionReady = Boolean(KEY);

// 분류 선택지 — desc 는 Jev 에 보내는 설명, label·emoji 는 화면용. 순서 = 관리자 화면 순서
export const EMOTIONS = {
  angry: { label: '분노', emoji: '😠', negative: true, desc: 'Anger: angry, hostile, complaining harshly, blaming or insulting' },
  annoyed: { label: '짜증', emoji: '😤', negative: true, desc: 'Irritation: annoyed, impatient, finds something bothersome, slow or tedious' },
  disappointed: { label: '실망', emoji: '😞', negative: true, desc: 'Disappointment: let down, expectations were not met' },
  sad: { label: '슬픔', emoji: '😢', negative: true, desc: 'Sadness: upset, hurt, feeling down' },
  anxious: { label: '불안', emoji: '😟', negative: true, desc: 'Anxiety: worried, nervous, concerned about a problem or about their child' },
  confused: { label: '혼란', emoji: '😵', negative: true, desc: 'Confusion: does not understand, feels lost, unsure how something works' },
  curious: { label: '호기심', emoji: '🤔', negative: false, desc: 'Curiosity: interested, wants to learn or explore something' },
  neutral: { label: '중립', emoji: '😐', negative: false, desc: 'Neutral: plain question or statement with no clear emotion' },
  thankful: { label: '감사', emoji: '🙏', negative: false, desc: 'Gratitude: thanking, appreciating or praising' },
  happy: { label: '기쁨', emoji: '😊', negative: false, desc: 'Joy: happy, excited, delighted' },
};

const INTENSITY = ['Calm, no emotion shown', 'Slight', 'Clearly expressed', 'Strong', 'Very intense or agitated'];

export const textHash = (text) => crypto.createHash('sha1').update(normalize(text)).digest('hex').slice(0, 16);

// 문장 하나의 감정 분류 → { top, percent, probs: {감정: %}, intensity: 1~5, confidence }
export async function classify(text, recent = [], timeoutMs = 4000) {
  if (!KEY) return null;
  const res = await fetch(`${BASE_URL}/v1/systemone`, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: JEV_MODEL,
      state: { message: text, earlier_messages: recent },
      questions: {
        emotion: {
          type: 'choice',
          instructions: 'A visitor is writing to the help chatbot of a kids app company (KIGLE). The text is usually Korean and `message` may be unfinished because they are still typing. Which emotion does `message` express? Use `earlier_messages` only as context.',
          criteria: Object.fromEntries(Object.entries(EMOTIONS).map(([k, e]) => [k, e.desc])),
        },
        intensity: { type: 'score', instructions: 'How strongly is emotion expressed in `message`?', criteria: INTENSITY },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Jev ${res.status}: ${data.error?.message || data.message || JSON.stringify(data).slice(0, 200)}`);

  const e = data.answers?.emotion || {};
  const probs = Object.fromEntries(Object.keys(EMOTIONS).map((k) => [k, Math.round((e.probabilities?.[k] || 0) * 100)]));
  const top = e.choice in EMOTIONS ? e.choice : Object.keys(probs).sort((a, b) => probs[b] - probs[a])[0];

  // 세기: score 는 단계 사이 값일 수 있음 → 1~5 로 맞춤
  const s = data.answers?.intensity || {};
  const levels = Object.keys(s.legend || {}).map(Number).filter(Number.isFinite);
  const [min, max] = levels.length ? [Math.min(...levels), Math.max(...levels)] : [0, INTENSITY.length - 1];
  const intensity = typeof s.score === 'number' && max > min ? Math.round((1 + ((s.score - min) / (max - min)) * 4) * 10) / 10 : null;

  return { top, percent: probs[top], probs, intensity, confidence: typeof e.confidence === 'number' ? Math.round(e.confidence * 100) / 100 : null };
}

const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const fmt = (k, p) => `${EMOTIONS[k].label} ${p}%`;

// 응대 기준 고르기: 이번 메시지 감정 중 기준 확률을 넘고 기준이 적힌 것 (최대 2개)
export function pickRules(emotion, policy) {
  if (!emotion || !policy.enabled) return [];
  return Object.entries(emotion.probs)
    .filter(([k, p]) => p >= policy.minPercent && (policy.rules[k]?.opener || policy.rules[k]?.guide))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, p]) => ({ id: k, percent: p, ...policy.rules[k] }));
}

// 규칙 응답(자료 없음·무관 등) 앞에 붙일 첫 문장
export function openerFor(emotion, policy, name) {
  const r = pickRules(emotion, policy).find((x) => x.opener);
  return r ? fill(r.opener, { name }) : '';
}

// OpenAI 에 이용자 메시지와 함께 보내는 참고 정보 (developer 메시지)
export function contextBlock({ name, emotion, peak, trend, policy }) {
  const lines = ['[이용자]', `이름: "${name}" — 답변에서 "${name} 님"으로 자연스럽게 한 번 정도 부른다.`];
  if (emotion && policy.enabled) {
    const top3 = Object.entries(emotion.probs).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, p]) => p > 0);
    lines.push('', '[감정 분석 결과 (Jev) — 말투를 정하는 참고용. 분석했다는 사실과 수치는 이용자에게 말하지 않는다]');
    lines.push(`이번 메시지: ${top3.map(([k, p]) => fmt(k, p)).join(' · ')}${emotion.intensity ? ` (감정 세기 ${emotion.intensity}/5)` : ''}`);
    if (peak && peak.percent > (emotion.probs[peak.top] || 0)) lines.push(`작성하는 동안 가장 강했던 감정: ${fmt(peak.top, peak.percent)}`);
    if (trend?.length > 1) lines.push(`이번 대화의 감정 흐름: ${trend.map((k) => EMOTIONS[k]?.label || k).join(' → ')}`);
    const rules = pickRules(emotion, policy);
    if (rules.length) {
      lines.push('', `[이번 답변의 응대 기준] (기준 확률 ${policy.minPercent}% 이상)`);
      for (const r of rules) {
        const parts = [];
        if (r.opener) parts.push(`첫 문장 예시: "${fill(r.opener, { name })}"`);
        if (r.guide) parts.push(r.guide);
        lines.push(`- ${fmt(r.id, r.percent)}: ${parts.join(' / ')}`);
      }
    }
  }
  return lines.join('\n');
}
