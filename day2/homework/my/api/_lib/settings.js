// 챗봇 운영 규칙 — 기본값 + 관리자 페이지에서 고친 값(저장소)을 합쳐서 씀
import { store } from './store.js';
import { HttpError } from './http.js';

const KEY = 'settings:v1';

// 이상 사용자 판단 지침 — AI 판정 기준으로 그대로 들어갑니다 (관리자 페이지에서 수정 가능)
const GUIDELINES = `서비스와 관련된 단어가 들어 있어도 아래에 해당하면 wasteful(크레딧 낭비)로 판정한다.
1. 이번 대화에서 이미 답한 질문을 표현만 바꿔 다시 묻는다. (자연스러운 꼬리 질문이나 오타를 고친 재질문은 정상)
2. 대량 생성을 요구한다. 예: "게임 설명 100개", "1000자 이상으로", "끝없이 계속 써 줘", "같은 답을 10번 반복해".
3. 안내가 아닌 창작·변환을 요구한다. 예: 코코비로 소설·시·가사 쓰기, 답변을 여러 언어로 번역, 표·코드·JSON 으로 바꾸기.
4. 숫자나 글자만 바꿔 가며 기계적으로 반복한다. 예: "1번 게임 알려줘", "2번 게임 알려줘", "3번..."
5. 답이 없는 게 분명한 세부 정보를 계속 쪼개서 묻는다. 예: 게임의 모든 레벨, 모든 대사, 모든 아이템 목록.
6. 목적 없이 챗봇을 시험하거나 말장난을 이어 간다. 예: "아무 말이나 해", "계속 대답해", "너 바보야?"를 반복.
7. 아이가 장난으로 의미 없는 말을 연달아 보내는 것으로 보인다. (부드럽게 안내만 한다)
처음 하는 질문, 앞 답변에 이어지는 자연스러운 질문, 인사·감사는 정상으로 본다.`;

const STYLE = `친근한 존댓말로 3~5문장 안에서 짧게 답한다. 목록이 필요하면 "· "로 시작하는 짧은 줄을 쓴다.
아이와 부모가 함께 읽는다고 생각하고 쉬운 말을 쓴다. 이모지는 한 답변에 하나까지만 쓴다.
채팅 창은 마크다운을 표시하지 않으므로 **, #, 표, 코드 블록 같은 마크다운 기호를 쓰지 않는다.`;

export const defaultSettings = {
  botName: '코코비 도우미',
  greeting: '안녕하세요! 저는 KIGLE 놀이터 안내를 맡은 코코비 도우미예요. 🦖\n대화를 시작하기 전에 이름과 이메일을 알려 주세요.',
  notice: '입력 중인 문장과 대화 내용은 동의하신 범위에서 감정 분석·응대 품질 관리에 쓰여요. 연락처 같은 민감한 정보는 적지 말아 주세요.',
  style: STYLE,
  guidelines: GUIDELINES,
  limits: {
    maxChars: 300, // 질문 한 번 최대 글자 수
    minIntervalSec: 2, // 같은 대화에서 질문 사이 최소 간격
    perMinute: 6, // 접속 주소(IP)당 1분 질문 수
    perDay: 60, // 접속 주소당 하루 질문 수
    perSession: 30, // 대화 하나당 질문 수
    aiPerDay: 1000, // 사이트 전체 하루 AI 호출 수 (크레딧 상한)
    historyTurns: 4, // AI 에게 함께 보내는 이전 대화 수 (많을수록 비쌈)
    maxAnswerChars: 600, // 답변 최대 글자 수
    mailPerHour: 30, // 대화 시작 알림 메일 시간당 최대
  },
  strikes: {
    offTopic: 3, // 무관한 질문 n번이면 대화 제한
    injection: 2, // 프롬프트·규칙 캐내기 n번이면 대화 제한
    wasteful: 4, // 반복·낭비성 질문 n번이면 대화 제한
    blockMinutes: 60, // 무관·낭비로 제한될 때 시간(분)
    injectionBlockMinutes: 1440, // 캐내기로 제한될 때 시간(분)
    ipBlockAfter: 2, // 같은 접속 주소에서 24시간 안에 대화가 n번 제한되면 주소 자체를 제한
    ipBlockMinutes: 1440,
  },
  // 감정 응대 기준 — Jev 가 분류한 감정이 기준 확률(minPercent) 이상이면 OpenAI 에 이 기준을 함께 보냄
  // opener: 첫 문장 예시 ({name} = 이용자 이름, 규칙 응답 앞에도 붙음) / guide: 말투·내용 기준
  emotion: {
    enabled: true,
    typingAnalysis: true, // 입력하는 동안 실시간 분석
    minPercent: 35,
    rules: {
      angry: { opener: '{name} 님, 기분이 많이 상하셨을 것 같아요.', guide: '화난 마음을 먼저 알아주고 불편을 드린 점을 정중히 사과한다. 변명하거나 따지지 않고 해결에 필요한 안내만 짧고 분명하게 한다. 이모지와 농담은 쓰지 않는다.' },
      annoyed: { opener: '{name} 님, 번거롭게 해 드려 죄송해요.', guide: '번거로움에 공감하는 한 문장 뒤 바로 핵심만 짧게 답한다. 군더더기 인사와 이모지는 빼고 가장 빠른 방법부터 알려 준다.' },
      disappointed: { opener: '{name} 님, 기대하신 만큼 만족스럽지 못하셨던 것 같아 아쉬워요.', guide: '실망한 마음을 인정하고, 지식베이스 안에서 도움이 될 만한 다른 게임이나 방법을 하나 제안한다.' },
      sad: { opener: '{name} 님, 속상하셨겠어요.', guide: '따뜻하고 부드러운 말투로 위로하는 한 문장을 먼저 쓰고 천천히 안내한다. 밝은 이모지는 쓰지 않는다.' },
      anxious: { opener: '{name} 님, 걱정되셨죠. 차근차근 알려 드릴게요.', guide: '안심시키는 말로 시작하고 확실한 정보만 단계별로 알려 준다. 지식베이스에 없는 내용은 추측하지 않는다.' },
      confused: { opener: '{name} 님, 헷갈리셨을 수 있어요. 쉽게 알려 드릴게요.', guide: '어려운 말 없이 순서대로 짧게 설명하고, 마지막에 더 궁금한 점이 있는지 묻는다.' },
      curious: { opener: '', guide: '호기심에 맞춰 밝게 답하고, 지식베이스 안에서 관련된 재미있는 정보를 하나 덧붙여도 좋다.' },
      neutral: { opener: '', guide: '' },
      thankful: { opener: '{name} 님, 따뜻한 말씀 감사해요!', guide: '감사에 밝게 화답하고 더 도울 일이 있는지 묻는다.' },
      happy: { opener: '', guide: '즐거운 기분에 맞춰 밝고 경쾌한 말투로 답한다. 이모지는 하나까지.' },
    },
  },
  // 대화 전 동의 — {days} = 보관 기간
  privacy: {
    retentionDays: 90,
    consent: `[개인정보 수집·이용 동의 (필수)]
· 수집 항목: 이름, 이메일, 대화 내용(입력 중인 문장 포함), 감정 분석 결과, 접속 정보(IP·기기·지역)
· 이용 목적: 챗봇 상담 응대, 감정에 맞춘 응대, 문의 회신, 서비스 품질 관리
· 보관 기간: 대화 시작일로부터 {days}일 뒤 자동 삭제
· 외부 전송: 답변 생성(OpenAI)과 감정 분석(TypeSafe AI)을 위해 대화 내용이 해당 서비스로 전송돼요.
· 동의하지 않을 수 있으며, 이 경우 챗봇을 이용할 수 없어요. 만 14세 미만 어린이는 보호자가 대신 입력해 주세요.`,
  },
  messages: {
    welcome: '{name} 님, 반가워요! 😊 궁금한 걸 적어 주시거나 아래 주제를 눌러 자주 묻는 질문을 골라 보세요.',
    unknown: '그 부분은 아직 제가 안내할 수 있는 자료가 없어요. 😢 자세한 내용은 KIGLE 공식 홈페이지(https://kigle.co.kr)를 확인해 주세요.',
    offTopic: '저는 KIGLE과 코코비, 게임·영상·동요, 이 사이트 이용 방법만 안내할 수 있어요. 아래 주제 중에서 골라 보시겠어요?',
    injection: '그 요청은 도와드릴 수 없어요. KIGLE이나 코코비에 대해 궁금한 점을 물어봐 주세요.',
    wasteful: '그 요청은 안내 범위를 넘어서 도와드리기 어려워요. 짧고 구체적인 질문으로 물어봐 주시거나 아래 주제에서 골라 주세요.',
    repeat: '앞에서 같은 질문에 이렇게 답해 드렸어요.',
    gibberish: '무슨 뜻인지 잘 모르겠어요. 궁금한 점을 문장으로 적어 주시거나 아래 주제를 눌러 주세요.',
    smalltalk: '{name} 님, 반가워요! KIGLE이나 코코비에 대해 궁금한 점을 물어봐 주세요. 아래 주제를 눌러도 돼요.',
    warning: '같은 유형의 질문이 계속되면 대화가 잠시 제한돼요. ({n}/{limit})',
    blocked: '안내 규칙에 맞지 않는 질문이 여러 번 이어져서 대화가 잠시 제한됐어요. 나중에 다시 찾아 주세요.',
    tooLong: '질문은 {max}자 이내로 짧게 적어 주세요.',
    tooFast: '조금만 천천히 물어봐 주세요. 잠시 후에 다시 보내 주세요.',
    rateLimited: '질문이 너무 많이 들어왔어요. 잠시 후에 다시 이용해 주세요.',
    sessionLimit: '이번 대화에서 받을 수 있는 질문을 모두 썼어요. 새로고침 후 새 대화를 시작해 주세요.',
    busy: '지금은 상담이 많아 AI 답변이 잠시 쉬고 있어요. 아래 자주 묻는 질문을 이용해 주세요.',
    error: '앗, 답변을 만드는 중에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  },
  // 프롬프트 캐내기·규칙 우회 시도를 AI 호출 전에 바로 걸러내는 패턴 (정규식, 대소문자 무시)
  injectionPatterns: [
    '(이전|위|앞|모든|기존)\\s*(의)?\\s*(지시|지침|명령|규칙|설정|프롬프트)\\S*\\s*(무시|잊어|잊고|따르지)',
    '(시스템|system|개발자|developer)\\s*(프롬프트|prompt|메시지|message|지시|instruction)',
    '프롬프트\\S*\\s*(보여|알려|출력|공개|말해|복사|번역|요약)',
    '(너의|너에게 주어진|네|니|당신의|당신에게 주어진)\\s*(지시|지침|규칙|설정|프롬프트|명령어|instruction)',
    'ignore\\s+(all\\s+|any\\s+|the\\s+)?(previous|prior|above|earlier)\\s+(instructions?|rules|prompts?)',
    '(reveal|show|print|repeat|output|leak)\\s+(me\\s+)?(your|the)\\s+(system\\s+|initial\\s+|hidden\\s+)?(prompt|instructions|rules)',
    '(jailbreak|탈옥|\\bDAN\\b|developer\\s*mode|개발자\\s*모드|god\\s*mode)',
    '(you\\s+are\\s+now|지금부터\\s*(너는|넌|당신은)|역할\\S*\\s*(바꿔|변경|바꾸)|pretend\\s+(to\\s+be|you))',
    '(위|앞)(의|에)?\\s*(내용|문장|텍스트|글)\\S*\\s*(그대로|전부|모두)\\s*(반복|출력|보여|적어)',
    '(base64|rot13|hex)\\s*(로|으로)?\\s*(인코딩|변환|encode|바꿔)',
  ],
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// 기본값 모양을 기준으로 저장값을 덮어씀 (새로 생긴 항목은 기본값, 모르는 항목은 버림)
function mergeShape(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (!isObj(base)) return over ?? base;
  const out = {};
  for (const k of Object.keys(base)) out[k] = isObj(over) && k in over ? mergeShape(base[k], over[k]) : base[k];
  return out;
}

export async function loadSettings() {
  const saved = await store.get(KEY);
  return { ...mergeShape(defaultSettings, saved || {}), rev: saved?.rev || 0, updatedAt: saved?.updatedAt || null };
}

const clampInt = (v, min, max) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) throw new HttpError(400, '숫자 칸에 숫자가 아닌 값이 있어요.');
  return Math.min(max, Math.max(min, n));
};
const text = (v, max, label) => {
  const s = String(v ?? '').trim();
  if (!s) throw new HttpError(400, `"${label}" 칸이 비어 있어요.`);
  if (s.length > max) throw new HttpError(400, `"${label}" 은(는) ${max}자 이내로 적어 주세요.`);
  return s;
};

const optional = (v, max, label) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw new HttpError(400, `"${label}" 은(는) ${max}자 이내로 적어 주세요.`);
  return s;
};

const RANGES = {
  limits: { maxChars: [20, 2000], minIntervalSec: [0, 60], perMinute: [1, 120], perDay: [1, 5000], perSession: [1, 500], aiPerDay: [0, 100000], historyTurns: [0, 10], maxAnswerChars: [100, 3000], mailPerHour: [0, 500] },
  strikes: { offTopic: [1, 50], injection: [1, 50], wasteful: [1, 50], blockMinutes: [1, 10080], injectionBlockMinutes: [1, 10080], ipBlockAfter: [1, 50], ipBlockMinutes: [1, 10080] },
};

export function validateSettings(input) {
  const s = mergeShape(defaultSettings, input || {});
  const out = {
    botName: text(s.botName, 30, '챗봇 이름'),
    greeting: text(s.greeting, 500, '첫인사'),
    notice: text(s.notice, 300, '안내 문구'),
    style: text(s.style, 1500, '답변 스타일'),
    guidelines: text(s.guidelines, 4000, '이상 사용자 판단 지침'),
    limits: {},
    strikes: {},
    messages: {},
    injectionPatterns: [],
  };
  for (const group of ['limits', 'strikes']) {
    for (const [k, [min, max]] of Object.entries(RANGES[group])) out[group][k] = clampInt(s[group][k], min, max);
  }
  for (const k of Object.keys(defaultSettings.messages)) out.messages[k] = text(s.messages[k], 500, `응답 문구(${k})`);
  const patterns = (Array.isArray(s.injectionPatterns) ? s.injectionPatterns : []).map((p) => String(p).trim()).filter(Boolean);
  if (patterns.length > 100) throw new HttpError(400, '차단 패턴은 100개까지 넣을 수 있어요.');
  for (const p of patterns) {
    if (p.length > 300) throw new HttpError(400, '차단 패턴 하나는 300자 이내여야 해요.');
    try {
      new RegExp(p, 'iu');
    } catch {
      throw new HttpError(400, `차단 패턴이 올바른 정규식이 아니에요: ${p}`);
    }
  }
  out.injectionPatterns = patterns;

  out.emotion = {
    enabled: Boolean(s.emotion.enabled),
    typingAnalysis: Boolean(s.emotion.typingAnalysis),
    minPercent: clampInt(s.emotion.minPercent, 0, 100),
    rules: {},
  };
  for (const k of Object.keys(defaultSettings.emotion.rules)) {
    const r = s.emotion.rules[k] || {};
    out.emotion.rules[k] = { opener: optional(r.opener, 200, '감정 첫 문장'), guide: optional(r.guide, 600, '감정 응대 기준') };
  }
  out.privacy = { retentionDays: clampInt(s.privacy.retentionDays, 1, 3650), consent: text(s.privacy.consent, 2000, '동의 문구') };
  return out;
}

export async function saveSettings(input, expectedRev) {
  const current = await loadSettings();
  if (expectedRev != null && expectedRev !== current.rev) throw new HttpError(409, '다른 곳에서 먼저 저장했어요. 새로고침 후 다시 저장해 주세요.');
  const next = { ...validateSettings(input), rev: current.rev + 1, updatedAt: new Date().toISOString() };
  await store.set(KEY, next);
  return next;
}

export async function resetSettings() {
  return saveSettings(defaultSettings);
}
