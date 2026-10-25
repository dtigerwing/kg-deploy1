// 대시보드 버튼으로 부르는 에이전트들. 모두 Unity와 git을 읽기만 하고, 결과는 제안과 보고서까지만 낸다.
//   출시 전 점검: 읽는 시점의 빌드 타깃 기준으로 설정을 직접 조회해 체크리스트를 만든다.
//   용량 다이어트: 큰 에셋과 임포트 설정을 직접 조회해 줄일 방법을 제안한다.
//   변경 분석: 최근 커밋과 커밋 안 한 변경을 git 읽기 도구로 조회해 한 일과 주의할 점을 정리한다.
//   업무 쪼개기: 쪼개기 에이전트 → 계획 에이전트(세부 업무마다) → [사용자 승인] → 실행 에이전트(세부 업무마다) → 취합·평가 에이전트.
//               대시보드에서 읽은 현황을 함께 넘겨 실제 프로젝트 상태를 반영한다.
import { ask, askJson, runAgent } from "./claude.mjs";
import { callGit, compactDiff, safeRevision } from "./git.mjs";
import { listLargeAssets, readImportSettings, readPlayerSettings } from "./unity.mjs";

const STYLE = "결과는 한국어로 쓰고, 문장은 해요체로 짧게 써. 데이터에 없는 사실(수치, 이름, 일정 등)은 지어내지 말고, 필요하면 '가정'이라고 밝혀.";
const READ_ONLY =
  "너는 Unity 프로젝트를 읽기만 할 수 있어. 설정을 바꾸거나 파일을 고치는 건 사용자가 Unity에서 직접 해. " +
  "그래서 제안은 사용자가 따라 할 수 있게 Unity 메뉴 경로와 바꿀 값을 구체적으로 써.";

// ---------- 출시 전 점검 ----------

const PLAYER_SETTINGS_TOOL = {
  name: "read_player_settings",
  description:
    "Unity 에디터에서 지금 플레이어 설정을 읽는다. 지금 빌드 타깃(activeTarget), 공통 설정(버전, 아이콘 수, 개발 빌드 여부, 켜진 씬 수), " +
    "Android·iOS·Standalone 각각의 앱 ID, 빌드 번호, 스크립팅 백엔드, 스트리핑, 서명 설정 여부를 돌려준다. 비밀 값은 들어 있지 않다.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
};

const RELEASE_SCHEMA = {
  type: "object",
  properties: {
    target: { type: "string" },
    verdict: { type: "string", enum: ["출시 가능", "보완 필요", "출시 어려움"] },
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          status: { type: "string", enum: ["통과", "실패", "확인 필요"] },
          current: { type: "string" },
          fix: { type: "string" },
        },
        required: ["title", "status", "current", "fix"],
        additionalProperties: false,
      },
    },
  },
  required: ["target", "verdict", "summary", "items"],
  additionalProperties: false,
};

export function releaseCheck(dashboard, onTool, signal) {
  return runAgent({
    system:
      "너는 Unity 게임 출시 전 점검 담당이야. 먼저 read_player_settings로 지금 설정을 읽어. 점검 기준은 읽은 시점의 activeTarget(지금 빌드 타깃)이야. " +
      "다른 플랫폼 설정은 참고만 하고 판정하지 마. 대시보드 현황(콘솔 에러, 빠진 스크립트, 씬, 마지막 빌드)도 같이 봐. " +
      "items는 8~12개로, 앱 ID가 템플릿 기본값인지, 버전·빌드 번호, 아이콘, 개발 빌드 여부, 스크립팅 백엔드·아키텍처, 스트리핑, 서명, 켜진 씬, 콘솔 에러, 빠진 스크립트처럼 그 타깃 출시에 실제로 걸리는 것만 넣어. " +
      "current는 읽은 실제 값, fix는 통과면 빈 문자열, 아니면 Unity 메뉴 경로와 바꿀 값. 데이터로 판단할 수 없으면 '확인 필요'. " +
      "verdict는 실패가 하나라도 출시를 막으면 '출시 어려움', 고칠 게 있으면 '보완 필요', 아니면 '출시 가능'. summary는 2문장 이내. " +
      READ_ONLY + " " + STYLE,
    content: { dashboard: brief(dashboard) },
    tools: [PLAYER_SETTINGS_TOOL],
    handlers: { read_player_settings: () => readPlayerSettings() },
    schema: RELEASE_SCHEMA,
    onTool,
    signal,
  });
}

// ---------- 용량 다이어트 ----------

const LARGE_ASSETS_TOOL = {
  name: "list_large_assets",
  description:
    "용량이 큰 에셋 목록을 큰 순서로 돌려준다. 마지막 빌드 리포트가 있으면 빌드에 실제로 들어간 크기(source: lastBuild, platform: 빌드한 플랫폼), " +
    "없으면 Assets 아래 원본 파일 크기(source: files)다. importer가 null이면 엔진 기본 리소스라 설정을 바꿀 수 없다.",
  input_schema: {
    type: "object",
    properties: { limit: { type: "integer", description: "몇 개를 받을지 (1~60)" } },
    required: ["limit"],
    additionalProperties: false,
  },
};

const IMPORT_SETTINGS_TOOL = {
  name: "read_import_settings",
  description:
    "에셋들의 임포트 설정을 읽는다. 텍스처는 원본 크기, Max Size, 압축, 밉맵, Read/Write, 지금 빌드 타깃의 플랫폼 오버라이드를, " +
    "오디오는 Load Type, 압축 형식, 품질, 모노 여부를, 모델은 메시 압축, Read/Write, 애니메이션·블렌드셰이프 임포트 여부를 돌려준다. 한 번에 20개까지.",
  input_schema: {
    type: "object",
    properties: { paths: { type: "array", items: { type: "string" }, description: "Assets/ 또는 Packages/ 로 시작하는 에셋 경로" } },
    required: ["paths"],
    additionalProperties: false,
  },
};

const DIET_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    basis: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          priority: { type: "string", enum: ["높음", "보통", "낮음"] },
          issue: { type: "string" },
          fix: { type: "string" },
          savingKB: { type: "integer" },
        },
        required: ["path", "priority", "issue", "fix", "savingKB"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "basis", "suggestions"],
  additionalProperties: false,
};

export function sizeDiet(dashboard, onTool, signal) {
  return runAgent({
    system:
      "너는 Unity 빌드 용량 분석가야. list_large_assets로 큰 에셋을 보고, 바꿀 수 있는 것들은 read_import_settings로 설정을 확인해. " +
      "기준은 지금 빌드 타깃이야. 빌드 리포트의 플랫폼이 지금 타깃과 다르면 그 점을 basis에 밝혀. " +
      "suggestions는 효과가 큰 순으로 최대 6개, 임포트 설정이나 사용하지 않는 기능 끄기처럼 실제로 바꿀 수 있는 것만 넣어. Packages/ 아래 에셋은 직접 못 바꾸니 대안이 있을 때만. " +
      "savingKB는 줄어들 용량을 KB로 대략 추정하고, 어려우면 0. headline은 용량 상황 한 문장, basis는 어떤 데이터를 봤는지 한 문장. " +
      READ_ONLY + " " + STYLE,
    content: { dashboard: brief(dashboard) },
    tools: [LARGE_ASSETS_TOOL, IMPORT_SETTINGS_TOOL],
    handlers: {
      list_large_assets: ({ limit }) => listLargeAssets(limit),
      read_import_settings: ({ paths }) => readImportSettings(paths),
    },
    schema: DIET_SCHEMA,
    onTool,
    signal,
  });
}

// ---------- 변경 분석 ----------

const NO_INPUT = { type: "object", properties: {}, required: [], additionalProperties: false };
const GIT_TOOLS = [
  {
    name: "git_log",
    description: "최근 커밋 목록(해시, 작성자, 날짜, 메시지)을 읽는다.",
    input_schema: {
      type: "object",
      properties: { max_count: { type: "integer", description: "몇 개를 받을지 (1~30)" } },
      required: ["max_count"],
      additionalProperties: false,
    },
  },
  {
    name: "git_show",
    description:
      "커밋 하나의 내용(메시지와 diff)을 읽는다. .meta 변경은 빠지고, 씬·프리팹 같은 Unity YAML은 바뀐 줄 수와 앞부분만, 큰 커밋은 일부 파일이 폴더별 개수로만 나온다. " +
      "'<커밋>:<경로>'로 그 시점의 파일 내용도 읽을 수 있다.",
    input_schema: {
      type: "object",
      properties: { revision: { type: "string", description: "커밋 해시, 브랜치 이름 또는 '<커밋>:<경로>'" } },
      required: ["revision"],
      additionalProperties: false,
    },
  },
  { name: "git_status", description: "지금 브랜치, 원격과의 차이, 커밋 안 한 파일 상태를 읽는다.", input_schema: NO_INPUT },
  { name: "git_diff_unstaged", description: "아직 스테이징하지 않은 변경의 diff를 읽는다(줄인 형태).", input_schema: NO_INPUT },
  { name: "git_diff_staged", description: "스테이징한 변경의 diff를 읽는다(줄인 형태).", input_schema: NO_INPUT },
  {
    name: "git_diff",
    description: "지금 작업 상태와 다른 커밋·브랜치를 비교한 diff를 읽는다(줄인 형태).",
    input_schema: {
      type: "object",
      properties: { target: { type: "string", description: "비교할 커밋 해시나 브랜치 이름" } },
      required: ["target"],
      additionalProperties: false,
    },
  },
];

const CHANGES_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    done: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, detail: { type: "string" }, commits: { type: "array", items: { type: "string" } } },
        required: ["title", "detail", "commits"],
        additionalProperties: false,
      },
    },
    cautions: {
      type: "array",
      items: {
        type: "object",
        properties: { level: { type: "string", enum: ["높음", "보통", "낮음"] }, title: { type: "string" }, detail: { type: "string" } },
        required: ["level", "title", "detail"],
        additionalProperties: false,
      },
    },
    beforeCommit: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "done", "cautions", "beforeCommit"],
  additionalProperties: false,
};

export function changeAnalysis(dashboard, onTool, signal) {
  return runAgent({
    system:
      "너는 Unity 프로젝트의 git 변경 분석가야. git에는 최근 커밋 10개(종류별 파일 수), 커밋 안 한 변경, Unity 규칙 점검 결과가 이미 있어. " +
      "필요한 것만 git 도구로 더 읽어: 내용이 궁금한 커밋은 git_show, 작업 중인 변경은 git_diff_unstaged·git_diff_staged. 커밋을 전부 열어 보지는 마. " +
      "done은 최근에 한 일을 작업 단위로 2~5개(commits에 관련 커밋 해시 7자리), cautions는 신경 쓸 점 최대 5개" +
      "(예: 설정 파일 변경, 씬·프리팹 충돌 위험, 큰 바이너리, .meta 문제, 메시지만으로 알 수 없는 커밋, 원격과 어긋남), " +
      "beforeCommit은 커밋 안 한 변경을 커밋하기 전에 할 일과 커밋 메시지 제안(없으면 빈 배열). headline은 전체 상황 한 문장. " +
      "너는 git을 읽기만 할 수 있어. 커밋·푸시·되돌리기는 사용자가 직접 해. " + STYLE,
    content: { git: dashboard.git, project: dashboard.project ?? null },
    tools: GIT_TOOLS,
    handlers: {
      git_log: ({ max_count }) => callGit("git_log", { max_count: Math.max(1, Math.min(Number(max_count) || 10, 30)) }),
      git_show: ({ revision }) => callGit("git_show", { revision: safeRevision(revision) }).then(compactDiff),
      git_status: () => callGit("git_status"),
      git_diff_unstaged: () => callGit("git_diff_unstaged", { context_lines: 1 }).then(compactDiff),
      git_diff_staged: () => callGit("git_diff_staged", { context_lines: 1 }).then(compactDiff),
      git_diff: ({ target }) => callGit("git_diff", { target: safeRevision(target), context_lines: 1 }).then(compactDiff),
    },
    schema: CHANGES_SCHEMA,
    onTool,
    signal,
  });
}

// ---------- 업무 쪼개기 ----------

const SUBTASKS_SCHEMA = {
  type: "object",
  properties: {
    goal: { type: "string" },
    subtasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["id", "title", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["goal", "subtasks"],
  additionalProperties: false,
};

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    approach: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    deliverable: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: ["approach", "steps", "deliverable", "assumptions"],
  additionalProperties: false,
};

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    score: { type: "integer" },
    summary: { type: "string" },
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          score: { type: "integer" },
          good: { type: "string" },
          improve: { type: "string" },
        },
        required: ["id", "score", "good", "improve"],
        additionalProperties: false,
      },
    },
    html: { type: "string" },
  },
  required: ["title", "score", "summary", "reviews", "html"],
  additionalProperties: false,
};

const PROJECT_NOTE =
  "project에는 사용자의 Unity 프로젝트 현황(버전, 빌드 타깃, 씬, 에셋, 콘솔, 마지막 빌드)이 있어. 업무와 관련 있으면 이 실제 값을 근거로 써. ";

// 업무 한 줄 → 목표 + 세부 업무 2~5개
export function decompose(task, dashboard, signal) {
  return askJson(
    "너는 업무를 나누는 담당이야. 사용자가 지금 하는 업무를 간단히 적어 주면, 이 업무의 목표를 한 문장으로 정리하고 " +
      "서로 겹치지 않고 각자 따로 진행할 수 있는 세부 업무 2~5개로 나눠. " +
      "각 세부 업무는 글로 된 결과물(문서, 목록, 초안, 코드, 표 등)을 하나 만들어 낼 수 있는 크기여야 해. " +
      "id는 t1, t2처럼 순서대로, title은 짧은 이름, description은 무엇을 만들어야 하는지 2문장 이내로. " + PROJECT_NOTE + STYLE,
    { task, project: brief(dashboard) },
    SUBTASKS_SCHEMA,
    signal,
  );
}

// 세부 업무 하나 → 실행 계획. 다른 세부 업무 목록도 같이 줘서 겹치지 않게 한다.
export function plan(task, goal, subtasks, subtask, dashboard, signal) {
  return askJson(
    "너는 세부 업무 하나를 맡은 계획 담당이야. 전체 업무와 목표, 다른 담당들이 맡은 세부 업무 목록을 참고해서 " +
      "네 세부 업무를 어떻게 진행할지 계획만 세워. 아직 실행하지는 마. 사용자가 이 계획을 보고 승인할지 정해. " +
      "approach는 접근 방법 1~2문장, steps는 실행 순서 3~6개, deliverable은 최종 결과물이 무엇인지(형식과 분량), " +
      "assumptions는 정보가 부족해서 세운 가정(없으면 빈 배열). 다른 담당의 일은 하지 마. 실행 담당은 글만 쓸 수 있고 Unity를 바꾸거나 검색할 수 없어. " +
      PROJECT_NOTE + STYLE,
    { task, goal, otherSubtasks: subtasks.filter((s) => s.id !== subtask.id), mySubtask: subtask, project: brief(dashboard) },
    PLAN_SCHEMA,
    signal,
  );
}

// 승인된 계획 → 결과물(마크다운). note는 사용자가 승인하며 남긴 수정 요청이다.
export function execute(task, goal, item, dashboard, signal) {
  return ask(
    "너는 세부 업무 하나를 맡은 실행 담당이야. 사용자가 승인한 계획대로 결과물을 실제로 만들어. " +
      "userNote가 있으면 계획보다 그 요청을 먼저 따라. 결과물만 마크다운으로 써. 앞뒤 인사말이나 설명은 붙이지 마. " +
      "계획의 deliverable에 적힌 형식과 분량을 지켜. " + PROJECT_NOTE + STYLE,
    {
      task,
      goal,
      subtask: { title: item.title, description: item.description },
      approvedPlan: item.plan,
      userNote: item.note || null,
      project: brief(dashboard),
    },
    signal,
  );
}

// 모든 결과물 → 평가 + 하나로 합친 HTML 프리뷰
export function review(task, goal, items, signal) {
  return askJson(
    "너는 취합·평가 담당이야. 여러 담당이 만든 세부 결과물을 받아 두 가지를 해. " +
      "1) 평가: 각 결과물이 승인된 계획과 업무 목표를 얼마나 채웠는지 10점 만점으로 매기고(reviews, id는 받은 그대로), 잘된 점(good)과 고칠 점(improve)을 한두 문장으로. " +
      "전체 점수(score, 10점 만점)와 전체 평가(summary, 3문장 이내)도 써. 후하게 주지 말고 근거 있게 매겨. " +
      "2) 프리뷰: 결과물들을 겹치는 내용은 합치고 순서를 다듬어 하나의 완성된 문서로 만들어 html에 넣어. " +
      "html은 <!doctype html>로 시작하는 완전한 문서여야 하고, CSS는 <style> 안에 직접 쓰고, <script>와 외부 파일(폰트, 이미지, CDN)은 쓰지 마. " +
      "맨 위에 제목(title)과 목표, 그 아래 세부 업무별 섹션을 두고, 표나 목록은 HTML 표·목록으로 바꿔. 읽기 편하게 여백과 글자 크기를 잡아. " +
      "title은 프리뷰 문서의 제목이야. " + STYLE,
    {
      task,
      goal,
      results: items.map((i) => ({ id: i.id, title: i.title, approvedPlan: i.plan, userNote: i.note || null, result: i.result })),
    },
    REVIEW_SCHEMA,
    signal,
  );
}

// 프롬프트에 넣을 대시보드 현황. 패키지는 이름과 버전만 남긴다.
function brief(dashboard) {
  if (!dashboard) return null;
  return { ...dashboard, packages: dashboard.packages?.map((p) => `${p.name}@${p.version}`) };
}
