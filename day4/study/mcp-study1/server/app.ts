import { timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import type {
  DecomposeRequest,
  EvaluateRequest,
  ExecuteRequest,
  HealthResponse,
  PlanRequest,
  PreviewRequest,
  StreamEvent,
} from "../shared/types";
import { EFFORT, MODEL, describeError, hasApiKey, type AgentHooks } from "./claude";
import { decompose } from "./agents/decomposer";
import { plan } from "./agents/planner";
import { execute } from "./agents/executor";
import { evaluate } from "./agents/evaluator";
import { buildPreview } from "./agents/previewBuilder";

/** 접속 코드가 설정돼 있으면(배포 환경) 요청 헤더의 코드와 비교합니다. 로컬에서는 설정하지 않으면 검사하지 않습니다. */
function accessCodeGuard(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ACCESS_CODE?.trim();
  if (!expected || req.path === "/api/health") return next();
  const given = Buffer.from(String(req.get("x-access-code") ?? ""));
  const want = Buffer.from(expected);
  if (given.length === want.length && timingSafeEqual(given, want)) return next();
  res.status(401).json({ error: "접속 코드가 필요합니다." });
}

/**
 * 에이전트 실행을 NDJSON 스트림으로 감싸는 라우트.
 * 긴 작업 동안 사고 과정 요약과 진행 상황을 흘려보내고, 마지막 줄에 결과(done) 또는 오류(error)를 보냅니다.
 * 클라이언트가 연결을 끊으면 Anthropic 요청도 함께 취소합니다.
 */
function agentRoute<Body, Result>(run: (body: Body, hooks: AgentHooks) => Promise<Result>) {
  return async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) abort.abort();
    });

    const send = (event: StreamEvent<Result>) => {
      if (!res.writableEnded) res.write(JSON.stringify(event) + "\n");
    };

    let lastProgress = 0;
    const hooks: AgentHooks = {
      signal: abort.signal,
      onThinking: (text) => send({ type: "thinking", text }),
      onText: (chars) => {
        const now = Date.now();
        if (now - lastProgress > 250) {
          lastProgress = now;
          send({ type: "progress", chars });
        }
      },
    };

    try {
      const data = await run(req.body as Body, hooks);
      send({ type: "done", data });
    } catch (error) {
      if (!abort.signal.aborted) console.error(`[${req.path}]`, error);
      send({ type: "error", message: describeError(error) });
    } finally {
      res.end();
    }
  };
}

/** API 라우트만 담은 Express 앱. 로컬 서버(server/index.ts)와 Cloud Functions(functions/)가 함께 씁니다. */
export function createApp() {
  const app = express();
  const json = express.json({ limit: "10mb" });
  // Cloud Functions는 본문을 미리 파싱해 두므로, 아직 파싱되지 않은 경우에만 파싱합니다.
  app.use((req, res, next) => (req.body !== undefined ? next() : json(req, res, next)));
  app.use(accessCodeGuard);

  app.get("/api/health", (_req, res) => {
    const body: HealthResponse = {
      ok: true,
      hasApiKey: hasApiKey(),
      model: MODEL,
      effort: EFFORT,
      accessRequired: Boolean(process.env.ACCESS_CODE?.trim()),
    };
    res.json(body);
  });

  app.post("/api/decompose", agentRoute<DecomposeRequest, Awaited<ReturnType<typeof decompose>>>(decompose));
  app.post("/api/plan", agentRoute<PlanRequest, Awaited<ReturnType<typeof plan>>>(plan));
  app.post("/api/execute", agentRoute<ExecuteRequest, string>(execute));
  app.post("/api/evaluate", agentRoute<EvaluateRequest, Awaited<ReturnType<typeof evaluate>>>(evaluate));
  app.post("/api/preview", agentRoute<PreviewRequest, string>(buildPreview));
  return app;
}
