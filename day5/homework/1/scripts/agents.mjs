// 분야별 분석 에이전트. 각자 자기 데이터만 받아 정해진 JSON으로 돌려주고, 요약은 이 결과를 모아 쓴다.
import { askJson } from "./claude.mjs";

const STYLE = "결과 문장은 한국어 해요체로 짧게 쓰고, 데이터에 없는 내용은 지어내지 마.";

const BUILD_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          issue: { type: "string" },
          fix: { type: "string" },
          savingKB: { type: "integer" },
        },
        required: ["path", "issue", "fix", "savingKB"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "suggestions"],
  additionalProperties: false,
};

const WARNING_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          count: { type: "integer" },
          cause: { type: "string" },
          fix: { type: "string" },
        },
        required: ["title", "count", "cause", "fix"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "items"],
  additionalProperties: false,
};

const SETUP_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          priority: { type: "string", enum: ["높음", "보통", "낮음"] },
          issue: { type: "string" },
          fix: { type: "string" },
        },
        required: ["title", "priority", "issue", "fix"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "items"],
  additionalProperties: false,
};

// build: compareBuild 결과, buildReport: build.json, imports: imports.json
export function analyzeBuild(build, buildReport, imports) {
  const assetsMB = Math.round(buildReport.assets.reduce((sum, a) => sum + a.bytes, 0) / 1024 / 1024 * 10) / 10;
  return askJson(
    "너는 Unity 빌드 용량 분석가야. 빌드 정보와 용량 큰 에셋들의 임포트 설정을 보고 용량을 줄일 방법을 찾아. " +
      "totalMB는 실행 파일 전체, assetsMB는 그중 에셋이 차지하는 양이야. 차이는 엔진·런타임 몫이라 에셋 설정으로 줄일 수 없다는 점을 고려해. " +
      "grown은 지난 빌드보다 커진 에셋이야. 커진 에셋이 있으면 먼저 봐. " +
      "suggestions는 효과가 큰 순으로 최대 5개, 실제로 바꿀 수 있는 설정만 넣어. Packages/ 아래 에셋은 직접 바꾸기 어려우니 대안(사용 안 하는 기능 끄기 등)이 있을 때만 넣어. " +
      "savingKB는 줄어들 용량을 KB로 대략 추정하고, 추정이 어려우면 0. " +
      "headline은 빌드 용량 상황을 한 문장으로. " + STYLE,
    {
      platform: build.platform,
      totalMB: build.totalMB,
      deltaMB: build.deltaMB,
      assetsMB,
      grown: build.grown,
      largestAssets: imports.assets,
    },
    BUILD_SCHEMA,
  );
}

// info: project-info.json, perf: judgePerf 결과(없으면 null), build: compareBuild 결과(없으면 null)
export function analyzeSetup(info, perf, build) {
  return askJson(
    "너는 Unity 모바일 출시·최적화 담당이야. 버전과 Android·iOS 플레이어 설정, 씬별 성능, 빌드 용량 요약을 보고 손볼 설정과 최적화 방법을 제안해. " +
      "installed가 false인 플랫폼은 빌드 모듈이 없는 것이니 설정만 보고 판단해. " +
      "씬 성능은 에디터에서 잰 값이라 실기기와 다르니, 절대값보다 씬끼리 차이와 드로우콜 수로 판단해. " +
      "items는 중요한 순으로 최대 5개, 데이터로 근거를 댈 수 있는 것만 넣어. title은 짧은 이름, issue는 지금 설정·수치와 왜 문제인지, " +
      "fix는 Unity 메뉴 경로를 포함한 해결 순서, priority는 출시에 미치는 영향으로 높음·보통·낮음. " +
      "headline은 설정·성능 상황을 한 문장으로. " + STYLE,
    {
      ...info,
      scenes: perf?.scenes ?? [],
      build: build && { platform: build.platform, totalMB: build.totalMB, deltaMB: build.deltaMB },
    },
    SETUP_SCHEMA,
  );
}

// warnings: warnings.json, scriptFileCount: Unity 프로젝트 Assets 아래 .cs 파일 수
export function analyzeWarnings(warnings, scriptFileCount) {
  return askJson(
    "너는 Unity 콘솔 경고 분석가야. 같은 메시지끼리 묶은 경고·에러 목록과 씬별 빠진 스크립트(Missing Script) 정보를 보고 원인과 해결 방법을 정리해. " +
      "missingScripts는 씬마다 빠진 스크립트 수와 가장 많이 빠진 오브젝트들이야. scriptFileCount는 프로젝트 Assets 아래 C# 파일 수야. " +
      "items는 원인별로 하나씩, 영향이 큰 순으로 최대 5개. 원인이 같으면 씬이 달라도 한 항목으로 묶고 count는 합계로 써. title은 경고를 사람이 알아볼 짧은 이름으로, cause는 데이터로 추정한 원인, fix는 Unity에서 바로 할 수 있는 해결 순서. " +
      "headline은 오늘 경고 상황을 한 문장으로. " + STYLE,
    { ...warnings, scriptFileCount },
    WARNING_SCHEMA,
  );
}
