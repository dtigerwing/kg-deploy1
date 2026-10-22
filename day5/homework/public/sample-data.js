// firebase-config.js가 비어 있을 때 보여주는 예시 기록입니다.
export const days = [
  {
    date: "2026-10-22",
    summary:
      "전투 UI를 개편하고 보상 팝업 버그를 고쳤어요. 새 UI 텍스처 2장이 비압축 상태라 빌드가 18MB 늘었어요. 전투 씬 프레임 시간이 7일 평균보다 17% 나빠졌는데, 히트 이펙트 파티클 추가 커밋이 의심돼요.",
    commits: [
      { hash: "a1b2c3d", time: "14:20", msg: "전투 UI 레이아웃 개편", files: [] },
      { hash: "b2c3d4e", time: "16:05", msg: "히트 이펙트 파티클 추가", files: [] },
      { hash: "c3d4e5f", time: "17:40", msg: "보상 팝업 중복 표시 버그 수정", files: [] },
    ],
    changedPrefabs: 4,
    changedScenes: 1,
    build: {
      platform: "Android",
      totalMB: 142.3,
      deltaMB: 18.1,
      grown: [
        { path: "Assets/UI/Battle/bg_result.png", deltaKB: 8192, isNew: true },
        { path: "Assets/UI/Battle/frame_skill.png", deltaKB: 6246, isNew: false },
        { path: "Assets/VFX/hit_spark.prefab", deltaKB: 2458, isNew: true },
      ],
    },
    perf: {
      scenes: [
        { name: "Lobby", frameMs: 9.8, drawCalls: 120, status: "정상", changePct: 2 },
        { name: "Battle", frameMs: 18.2, drawCalls: 310, status: "하락", changePct: 17 },
        { name: "Shop", frameMs: 11.0, drawCalls: 95, status: "정상", changePct: -3 },
      ],
    },
    analysis: {
      build: {
        headline: "새 전투 UI 텍스처 두 장이 비압축으로 들어와 늘어난 18MB의 대부분을 차지해요.",
        suggestions: [
          {
            path: "Assets/UI/Battle/bg_result.png",
            issue: "2048x2048 원본이 압축 없이 들어가 8MB를 차지해요.",
            fix: "Android 오버라이드를 ASTC 6x6으로 켜고, 화면에 맞게 Max Size를 1024로 낮춰 보세요.",
            savingKB: 7200,
          },
          {
            path: "Assets/UI/Battle/frame_skill.png",
            issue: "Read/Write가 켜져 있어 메모리에 사본이 하나 더 올라가요.",
            fix: "Read/Write를 끄고 ASTC로 압축해 보세요.",
            savingKB: 4600,
          },
        ],
      },
      warnings: {
        headline: "경고 12건 중 대부분이 히트 이펙트 프리팹의 머티리얼 누락이에요.",
        errors: 0,
        warnings: 12,
        items: [
          {
            title: "hit_spark 머티리얼 누락",
            count: 10,
            cause: "오늘 추가한 hit_spark.prefab의 Particle System에 머티리얼이 비어 있어요.",
            fix: "프리팹을 열어 Renderer 모듈에 파티클 머티리얼을 연결하고 저장해요.",
          },
        ],
      },
    },
  },
  {
    date: "2026-10-21",
    summary: "상점 화면의 상품 목록을 스크롤 뷰로 바꾸고 로딩 속도를 개선했어요. 빌드 용량과 성능은 어제와 비슷해요.",
    commits: [
      { hash: "d4e5f6a", time: "11:10", msg: "상점 상품 목록 스크롤 뷰 적용", files: [] },
      { hash: "e5f6a7b", time: "15:30", msg: "상점 아이콘 비동기 로딩", files: [] },
    ],
    changedPrefabs: 2,
    changedScenes: 0,
    build: { platform: "Android", totalMB: 124.2, deltaMB: 0.4, grown: [{ path: "Assets/UI/Shop/icon_sheet.png", deltaKB: 410, isNew: false }] },
    perf: {
      scenes: [
        { name: "Lobby", frameMs: 9.6, drawCalls: 118, status: "정상", changePct: 0 },
        { name: "Battle", frameMs: 15.4, drawCalls: 260, status: "정상", changePct: 1 },
        { name: "Shop", frameMs: 11.2, drawCalls: 96, status: "정상", changePct: -1 },
      ],
    },
  },
  {
    date: "2026-10-20",
    summary: "로비 배너를 Addressables로 옮겼어요. 오늘은 빌드를 하지 않았어요.",
    commits: [{ hash: "f6a7b8c", time: "17:05", msg: "로비 배너 Addressables 전환", files: [] }],
    changedPrefabs: 1,
    changedScenes: 1,
    build: null,
    perf: null,
  },
];

export const weeks = [
  {
    start: "2026-10-12",
    end: "2026-10-18",
    text:
      "이번 주 주요 작업\n- 로비 UI 리뉴얼 1차 완료\n- 전투 결과 화면 연출 추가\n- 메모리 누수 2건 수정\n\n빌드 용량은 121MB에서 123MB로 소폭 늘었고, 씬 성능은 큰 변화가 없었어요.",
  },
];
