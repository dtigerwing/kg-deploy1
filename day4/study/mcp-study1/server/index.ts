// 로컬 실행용 진입점. 배포 환경에서는 functions/src/index.ts가 같은 앱을 Cloud Functions로 감쌉니다.
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { EFFORT, MODEL, hasApiKey } from "./claude";
import { createApp } from "./app";

const app = createApp();

// 프로덕션 모드에서는 빌드된 프론트엔드(dist)를 함께 서빙합니다.
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.API_PORT ?? 8787);
app.listen(port, () => {
  console.log(`API 서버: http://localhost:${port}  (model: ${MODEL}, effort: ${EFFORT})`);
  if (!hasApiKey()) {
    console.warn("⚠️  .env 파일에 ANTHROPIC_API_KEY가 비어 있습니다. 키를 입력한 뒤 서버를 재시작하세요.");
  }
});
