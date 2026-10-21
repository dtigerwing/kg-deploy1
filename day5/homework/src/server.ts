import express from "express";
import { CLAUDE_PROJECTS_DIR, EFFORT, hasApiKey, MODEL, PORT, PUBLIC_DIR } from "./config.js";
import { listUnityProjects, loadChunks, previewOf, statsOf } from "./transcripts.js";
import type { ProjectInfo, WorkflowEvent } from "./types.js";
import { runWorkflow } from "./workflow.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

const DATE = /^\d{4}-\d{2}-\d{2}$/;

app.get("/api/status", (_req, res) => {
  res.json({ hasApiKey, model: MODEL, effort: EFFORT, projectsDir: CLAUDE_PROJECTS_DIR });
});

// Claude Code 기록이 있는 Unity 프로젝트 목록
app.get("/api/projects", async (_req, res) => {
  res.json(await listUnityProjects());
});

// 기간 안의 작업 묶음 미리보기 (코드로만 계산, API 비용 없음)
app.get("/api/projects/:id/chunks", async (req, res) => {
  const project = await findProject(req.params.id);
  const period = periodOf(req.query.from, req.query.to);
  if (!project || !period) {
    res.status(400).json({ error: "프로젝트나 기간이 올바르지 않습니다." });
    return;
  }
  const chunks = await loadChunks(project, period.from, period.to);
  res.json({ chunks: chunks.map(previewOf), stats: statsOf(chunks) });
});

// 리포트 만들기. 진행 상황을 한 줄에 JSON 하나씩(NDJSON) 흘려보낸다.
app.post("/api/report", async (req, res) => {
  const body = req.body as { projectId?: unknown; from?: unknown; to?: unknown; chunkIds?: unknown };
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const emit = (event: WorkflowEvent) => res.write(JSON.stringify(event) + "\n");

  try {
    if (!hasApiKey) throw new Error(".env 파일에 ANTHROPIC_API_KEY를 넣고 서버를 다시 시작해 주세요.");
    const project = typeof body.projectId === "string" ? await findProject(body.projectId) : null;
    const period = periodOf(body.from, body.to);
    if (!project || !period) throw new Error("프로젝트와 기간을 골라 주세요.");
    const chunkIds = Array.isArray(body.chunkIds) ? body.chunkIds.filter((id): id is string => typeof id === "string") : null;
    if (chunkIds && chunkIds.length === 0) throw new Error("리포트에 넣을 작업 묶음을 하나 이상 골라 주세요.");
    const run = await runWorkflow(project, period, chunkIds, emit);
    emit({ type: "done", run });
  } catch (error) {
    console.error(error);
    emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    res.end();
  }
});

// 목록에 있는 프로젝트 id만 받아서 ~/.claude/projects 밖을 읽지 못하게 한다.
async function findProject(id: string): Promise<ProjectInfo | null> {
  return (await listUnityProjects()).find((project) => project.id === id) ?? null;
}

function periodOf(from: unknown, to: unknown): { from: string; to: string } | null {
  if (typeof from !== "string" || typeof to !== "string" || !DATE.test(from) || !DATE.test(to) || from > to) return null;
  return { from, to };
}

// Express 5는 포트 에러도 이 콜백으로 넘기므로, 에러면 "열렸습니다"를 찍지 않고 끝낸다.
app.listen(PORT, (error) => {
  if (error) {
    const inUse = (error as NodeJS.ErrnoException).code === "EADDRINUSE";
    console.error(inUse ? `${PORT}번 포트를 이미 다른 서버가 쓰고 있습니다. 먼저 켜 둔 서버를 끄고 다시 실행해 주세요.` : error);
    process.exit(1);
  }
  console.log(`http://localhost:${PORT} 에서 열렸습니다. (모델 ${MODEL}, effort ${EFFORT})`);
  if (!hasApiKey) console.warn("ANTHROPIC_API_KEY가 비어 있습니다. .env에 키를 넣고 다시 시작해 주세요.");
});
