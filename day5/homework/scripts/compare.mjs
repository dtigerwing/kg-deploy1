// 이전 기록과 비교하는 순수 함수들. Firebase 없이 테스트할 수 있게 분리했다.

export const PERF_HISTORY_DAYS = 7;
const PERF_DROP_RATIO = 0.1; // 7일 평균보다 10% 넘게 느려지면 하락
// 다음 빌드와 비교하려고 용량 큰 순으로 저장하는 에셋 수.
// 여기서 잘린 에셋이 다음 빌드에서 커지면 "새 파일"로 보이니 넉넉히 잡는다(5000개 ≈ 400KB, Firestore 문서 한도 1MB).
const STORED_ASSETS = 5000;
const GROWN_ASSETS = 10;
const MB = 1024 * 1024;

export function compareBuild(report, previousDay) {
  const top = report.assets
    .map((a) => ({ path: a.path, kb: Math.round(a.bytes / 1024) }))
    .sort((a, b) => b.kb - a.kb)
    .slice(0, STORED_ASSETS);
  const totalMB = round1(report.totalBytes / MB);
  const result = { platform: report.platform, totalMB, deltaMB: null, comparedWith: null, grown: [], top };
  if (!previousDay) return result;

  const before = new Map(previousDay.build.top.map((a) => [a.path, a.kb]));
  result.deltaMB = round1(totalMB - previousDay.build.totalMB);
  result.comparedWith = previousDay.date;
  result.grown = top
    .map((a) => ({ path: a.path, deltaKB: a.kb - (before.get(a.path) ?? 0), isNew: !before.has(a.path) }))
    .filter((a) => a.deltaKB > 0)
    .sort((a, b) => b.deltaKB - a.deltaKB)
    .slice(0, GROWN_ASSETS);
  return result;
}

export function judgePerf(measured, history) {
  const scenes = measured.scenes.map((scene) => {
    const past = history
      .flatMap((d) => d.perf?.scenes ?? [])
      .filter((s) => s.name === scene.name)
      .map((s) => s.frameMs);
    const frameMs = round1(scene.frameMs);
    if (!past.length) return { ...scene, frameMs, avgFrameMs: null, changePct: null, status: "기준 없음" };
    const avg = past.reduce((sum, v) => sum + v, 0) / past.length;
    const ratio = frameMs / avg - 1;
    return {
      ...scene,
      frameMs,
      avgFrameMs: round1(avg),
      changePct: Math.round(ratio * 100),
      status: ratio > PERF_DROP_RATIO ? "하락" : "정상",
    };
  });
  return { scenes };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
