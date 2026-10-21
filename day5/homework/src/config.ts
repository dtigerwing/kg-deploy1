import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// .env 파일이 없어도 서버는 뜨고, 화면에서 "API 키를 입력하세요"를 안내한다.
// process.loadEnvFile()은 이미 있는 환경변수를 덮어쓰지 않아서, 터미널에 빈 ANTHROPIC_API_KEY가
// 잡혀 있으면 .env 값이 무시된다. 그래서 .env를 직접 읽어 값이 있으면 그것을 우선한다.
function readDotEnv(): Record<string, string | undefined> {
  try {
    return parseEnv(readFileSync(path.join(ROOT, ".env"), "utf8"));
  } catch {
    console.warn("[config] .env 파일을 찾지 못했습니다. .env.example을 복사해 .env를 만들어 주세요.");
    return {};
  }
}

const dotEnv = readDotEnv();

export const ANTHROPIC_API_KEY = (dotEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "").trim();
export const hasApiKey = ANTHROPIC_API_KEY.length > 0;

// 과제 요구사항: Claude Opus 5.5, effort high
export const MODEL = "claude-opus-5-5";
export const EFFORT = "high" as const;

// Claude Code가 대화 기록(*.jsonl)을 남기는 곳. 폴더 하나가 작업 폴더(프로젝트) 하나다.
export const CLAUDE_PROJECTS_DIR =
  dotEnv.CLAUDE_PROJECTS_DIR || process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), ".claude", "projects");

// 세션 요약 서브에이전트를 한 번에 몇 개까지 동시에 돌릴지
export const SUMMARY_CONCURRENCY = 4;

export const PUBLIC_DIR = path.join(ROOT, "public");
export const PORT = Number(process.env.PORT ?? 3000);
