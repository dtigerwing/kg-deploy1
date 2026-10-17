// 설정값 읽기. 로컬은 .env (node/env.mjs), 배포는 Workers 환경 변수·Secrets (worker/index.mjs) 에서 읽도록
// 시작할 때 setConfig 로 정한다.
let source = () => undefined;

export const setConfig = (fn) => {
  source = fn;
};

export const cfg = (name, fallback = '') => String(source(name) ?? '').trim() || fallback;
