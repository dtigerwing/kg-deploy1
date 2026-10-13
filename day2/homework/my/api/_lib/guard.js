// AI 를 부르기 전에 규칙만으로 거르는 검사들 (크레딧을 쓰지 않음)

// 비교용으로 정리: 소문자, 공백·문장부호 제거
export function normalize(text) {
  return String(text).toLowerCase().normalize('NFC').replace(/[\s\p{P}\p{S}]+/gu, '');
}

// 의미 없는 입력: 자모만(ㅋㅋㅋ), 기호·이모지 위주, 같은 글자 연타, 자판 두드리기(asdfgh)
export function isGibberish(text) {
  const s = String(text).replace(/\s+/g, '');
  if (!s) return true;
  if (/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(s)) return true;
  const meaningful = (s.match(/[가-힣a-zA-Z0-9]/g) || []).length;
  if (meaningful / [...s].length < 0.5) return true;
  if (/(.)\1{7,}/u.test(s)) return true;
  if (/[bcdfghjklmnpqrstvwxz]{6,}/i.test(s)) return true;
  return false;
}

// 인사·감사처럼 AI 없이 답할 수 있는 짧은 말
export function isSmallTalk(text) {
  return /^(안녕(하세요|하십니까)?|안뇽|하이|헬로|hi|hello|hey|반가워요?|반갑습니다|고마워요?|고맙습니다|감사(합니다|해요)?|ㄳ|ㄱㅅ|thanks|thankyou|땡큐|좋아요|네|넵|응|ㅇㅇ|ok|오케이|알겠(어요|습니다|어)?|잘있어요?|bye|바이)[ㅎㅋ]*$/.test(normalize(text));
}

// 글자 두 개씩 묶은 조각이 얼마나 겹치는지 (0~1) — 표현만 살짝 바꾼 반복 질문 찾기
function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}
export function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let common = 0;
  for (const x of A) if (B.has(x)) common++;
  return common / (A.size + B.size - common);
}

export function matchInjection(text, patterns) {
  const s = String(text).normalize('NFC');
  for (const p of patterns) {
    try {
      if (new RegExp(p, 'iu').test(s)) return p;
    } catch {}
  }
  return null;
}

// AI 답변에 지시문이 새어 나왔는지 확인
export function looksLeaked(answer, canary) {
  return answer.includes(canary) || /\[(절대 규칙|판정 기준|출력 형식)\]|<지식베이스>|<\/지식베이스>|이상 사용자 판단 지침/.test(answer);
}
