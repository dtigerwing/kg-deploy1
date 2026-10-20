// Firebase Cloud Functions(2세대) 진입점: 로컬 서버와 같은 Express 앱을 그대로 감쌉니다.
// 빌드 시 esbuild가 server/, shared/ 코드와 의존성을 lib/index.js 하나로 묶습니다.
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { createApp } from "../../server/app";

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");
const accessCode = defineSecret("ACCESS_CODE");

export const api = onRequest(
  {
    region: "asia-northeast3", // 서울
    // 에이전트 호출은 수 분이 걸립니다 (프리뷰는 10분 이상). HTTP 함수의 최대치인 60분으로 둡니다.
    timeoutSeconds: 3600,
    memory: "512MiB",
    // 비용 폭주를 막기 위한 상한. 한 인스턴스가 여러 요청을 동시에 처리합니다.
    maxInstances: 3,
    concurrency: 40,
    secrets: [anthropicKey, accessCode],
    cors: ["https://kg-kdh-agentic.web.app", "https://kg-kdh-agentic.firebaseapp.com", "http://localhost:5173"],
  },
  createApp(),
);
