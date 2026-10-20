import snapshotJson from "./data/cocobi-youtube.json";

// ---------------------------------------------------------------------------
// 코코비 유튜브 지표 스냅샷.
// playmcp YouTubeData MCP로 수집한 원본(`data/cocobi-youtube.json`)을 읽어
// 화면과 에이전트 입력에 쓸 파생 지표로 가공합니다. 모델 호출 없이 순수 계산만 합니다.
// ---------------------------------------------------------------------------

export interface YoutubeChannel {
  id: string;
  title: string;
  handle: string;
  language: string;
  country: string;
  createdAt: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}

/** API가 돌려준 값 그대로의 영상 기록 */
export interface YoutubeVideoRaw {
  id: string;
  title: string;
  publishedAt: string;
  /** ISO 8601 기간 (예: PT32M36S) */
  duration: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface NetworkTopVideo {
  channelId: string;
  id: string;
  title: string;
  publishedAt: string;
  viewCount: number;
}

export interface YoutubeSnapshot {
  schemaVersion: 1;
  collectedAt: string;
  source: string;
  tools: string[];
  mainChannelId: string;
  collectionNotes: string[];
  channels: YoutubeChannel[];
  recentUploadIds: string[];
  topVideoIds: string[];
  videos: YoutubeVideoRaw[];
  networkTopVideos: NetworkTopVideo[];
}

export type VideoFormat = "shorts" | "long";

export interface VideoMetrics {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  format: VideoFormat;
  durationSec: number;
  views: number;
  /** 아동용 영상은 API가 0을 돌려주므로 null(비공개)로 바꿉니다 */
  likes: number | null;
  likeRate: number | null;
  /** 수집 시점까지 경과 일수 (1일 미만은 1일로 계산) */
  ageDays: number;
  viewsPerDay: number;
  /** 업로드 시각 (한국 시간 기준 시) */
  publishHourKst: number;
  themes: string[];
  inRecent: boolean;
  topRank: number | null;
}

export interface FormatSummary {
  format: VideoFormat;
  count: number;
  totalViews: number;
  medianViews: number;
  medianViewsPerDay: number;
}

export interface ThemeSummary {
  theme: string;
  recentShorts: number;
  recentShortsMedianViewsPerDay: number | null;
  inTop: number;
}

export interface UploadSlot {
  format: VideoFormat;
  hourKst: number;
  count: number;
  medianViewsPerDay: number;
}

export interface YoutubeInsights {
  snapshot: YoutubeSnapshot;
  channel: YoutubeChannel;
  network: YoutubeChannel[];
  videos: VideoMetrics[];
  recent: VideoMetrics[];
  top: VideoMetrics[];
  recentRange: { from: string; to: string; days: number };
  formats: Record<VideoFormat, FormatSummary>;
  themes: ThemeSummary[];
  uploadSlots: UploadSlot[];
  likesVisibleCount: number;
}

export const FORMAT_LABEL: Record<VideoFormat, string> = { shorts: "쇼츠", long: "롱폼" };

/** 제목 키워드로 붙이는 콘텐츠 테마 (한 영상에 여러 개가 붙을 수 있음) */
const THEME_RULES: { theme: string; pattern: RegExp }[] = [
  { theme: "핑크 vs 블랙·색깔", pattern: /핑크|블랙|바비|색깔|색칠|크레용/ },
  { theme: "로봇 엄마·아빠", pattern: /로봇/ },
  { theme: "뱀파이어·악마", pattern: /뱀파이어|악마|데몬/ },
  { theme: "좀비·몬스터·괴물", pattern: /좀비|몬스터|괴물|귀신|유령|해골/ },
  { theme: "어른이 아기로", pattern: /아기가 됐|아기가 되었/ },
  { theme: "아기 슈퍼맨·히어로", pattern: /슈퍼맨|히어로/ },
  { theme: "병원·의사", pattern: /병원|의사/ },
  { theme: "방귀·변기·응가", pattern: /방귀|변기|응가/ },
  { theme: "음식·식습관", pattern: /햄버거|패스트푸드|아이스크림|음식|사탕|먹/ },
  { theme: "생활안전", pattern: /안전|반지|벌레|알약|콘센트|모기/ },
  { theme: "감정 표현", pattern: /화났|무서워|무섭/ },
  { theme: "챌린지·댄스", pattern: /챌린지|dance/i },
];

const DAY_MS = 86_400_000;

/** 일평균 조회수 순위에 넣는 최소 경과 일수. 업로드 직후 영상은 일평균이 크게 흔들립니다. */
export const MIN_AGE_FOR_RANK_DAYS = 3;

export const snapshot = snapshotJson as YoutubeSnapshot;

export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((v) => Number(v ?? 0));
  return d * 86_400 + h * 3_600 + min * 60 + s;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toMetrics(v: YoutubeVideoRaw, snap: YoutubeSnapshot, collectedMs: number): VideoMetrics {
  const durationSec = parseIsoDuration(v.duration);
  const format: VideoFormat = durationSec <= 180 || /#shorts/i.test(v.title) ? "shorts" : "long";
  const ageDays = Math.max(1, (collectedMs - Date.parse(v.publishedAt)) / DAY_MS);
  const likes = v.likeCount > 0 ? v.likeCount : null;
  const topIndex = snap.topVideoIds.indexOf(v.id);
  return {
    id: v.id,
    title: v.title,
    url: format === "shorts" ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
    publishedAt: v.publishedAt,
    format,
    durationSec,
    views: v.viewCount,
    likes,
    likeRate: likes !== null && v.viewCount > 0 ? likes / v.viewCount : null,
    ageDays,
    viewsPerDay: v.viewCount / ageDays,
    publishHourKst: (new Date(v.publishedAt).getUTCHours() + 9) % 24,
    themes: THEME_RULES.filter((r) => r.pattern.test(v.title)).map((r) => r.theme),
    inRecent: snap.recentUploadIds.includes(v.id),
    topRank: topIndex >= 0 ? topIndex + 1 : null,
  };
}

function summarizeFormat(format: VideoFormat, list: VideoMetrics[]): FormatSummary {
  const items = list.filter((v) => v.format === format);
  return {
    format,
    count: items.length,
    totalViews: items.reduce((sum, v) => sum + v.views, 0),
    medianViews: median(items.map((v) => v.views)),
    medianViewsPerDay: median(items.map((v) => v.viewsPerDay)),
  };
}

export function buildInsights(snap: YoutubeSnapshot = snapshot): YoutubeInsights {
  const collectedMs = Date.parse(snap.collectedAt);
  const videos = snap.videos.map((v) => toMetrics(v, snap, collectedMs));
  const byId = new Map(videos.map((v) => [v.id, v]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((v): v is VideoMetrics => !!v);
  const recent = pick(snap.recentUploadIds);
  const top = pick(snap.topVideoIds);

  const recentTimes = recent.map((v) => Date.parse(v.publishedAt));
  const from = new Date(Math.min(...recentTimes)).toISOString();
  const to = new Date(Math.max(...recentTimes)).toISOString();

  const recentShorts = recent.filter((v) => v.format === "shorts");
  const themes = THEME_RULES.map(({ theme }) => {
    const shorts = recentShorts.filter((v) => v.themes.includes(theme));
    return {
      theme,
      recentShorts: shorts.length,
      recentShortsMedianViewsPerDay: shorts.length ? median(shorts.map((v) => v.viewsPerDay)) : null,
      inTop: top.filter((v) => v.themes.includes(theme)).length,
    };
  })
    .filter((t) => t.recentShorts > 0 || t.inTop > 0)
    .sort((a, b) => (b.recentShortsMedianViewsPerDay ?? -1) - (a.recentShortsMedianViewsPerDay ?? -1));

  const slotMap = new Map<string, VideoMetrics[]>();
  for (const v of recent) {
    const key = `${v.format}:${v.publishHourKst}`;
    slotMap.set(key, [...(slotMap.get(key) ?? []), v]);
  }
  const uploadSlots = [...slotMap.entries()]
    .map(([key, list]) => {
      const [format, hour] = key.split(":");
      return {
        format: format as VideoFormat,
        hourKst: Number(hour),
        count: list.length,
        medianViewsPerDay: median(list.map((v) => v.viewsPerDay)),
      };
    })
    .sort((a, b) => a.format.localeCompare(b.format) || a.hourKst - b.hourKst);

  const channel = snap.channels.find((c) => c.id === snap.mainChannelId);
  if (!channel) throw new Error("메인 채널 정보가 스냅샷에 없습니다");

  return {
    snapshot: snap,
    channel,
    network: [...snap.channels].sort((a, b) => b.viewCount - a.viewCount),
    videos,
    recent,
    top,
    recentRange: { from, to, days: Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1 },
    formats: { shorts: summarizeFormat("shorts", recent), long: summarizeFormat("long", recent) },
    themes,
    uploadSlots,
    likesVisibleCount: videos.filter((v) => v.likes !== null).length,
  };
}

// ---------------------------------------------------------------------------
// 표기
// ---------------------------------------------------------------------------

/** 186만, 31.6억처럼 한국어 단위로 줄여 씁니다. */
export function formatCount(n: number): string {
  const abs = Math.abs(n);
  const trim = (v: number) => (v >= 100 ? Math.round(v).toLocaleString("ko-KR") : String(Number(v.toFixed(1))));
  if (abs >= 1e8) return `${trim(n / 1e8)}억`;
  if (abs >= 1e4) return `${trim(n / 1e4)}만`;
  return Math.round(n).toLocaleString("ko-KR");
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** ISO 시각을 한국 시간 날짜(YYYY-MM-DD)로 */
export function kstDate(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 에이전트 입력용 가공
// 워크플로우 에이전트(분해·계획·실행)의 프롬프트에 그대로 붙일 수 있는 형태로 만듭니다.
// ---------------------------------------------------------------------------

export interface AgentVideoRow {
  title: string;
  url: string;
  format: VideoFormat;
  publishedAt: string;
  views: number;
  viewsPerDay: number;
}

/** 구조화된 요약. 스키마 기반 에이전트 입력이나 Firestore 저장에 그대로 쓸 수 있습니다. */
export interface YoutubeAgentDigest {
  channel: { title: string; handle: string; subscribers: number; totalViews: number; videos: number; avgViewsPerVideo: number };
  collectedAt: string;
  source: string;
  recentWindow: { from: string; to: string; uploads: number };
  formats: FormatSummary[];
  uploadSlots: UploadSlot[];
  topRecentShorts: AgentVideoRow[];
  topRecentLong: AgentVideoRow[];
  allTimeTop: AgentVideoRow[];
  themes: ThemeSummary[];
  network: { title: string; language: string; subscribers: number; totalViews: number }[];
  limitations: string[];
}

const toRow = (v: VideoMetrics): AgentVideoRow => ({
  title: v.title,
  url: v.url,
  format: v.format,
  publishedAt: kstDate(v.publishedAt),
  views: v.views,
  viewsPerDay: Math.round(v.viewsPerDay),
});

export function buildAgentDigest(ins: YoutubeInsights = buildInsights()): YoutubeAgentDigest {
  const byPace = (format: VideoFormat) =>
    ins.recent
      .filter((v) => v.format === format && v.ageDays >= MIN_AGE_FOR_RANK_DAYS)
      .sort((a, b) => b.viewsPerDay - a.viewsPerDay);
  return {
    channel: {
      title: ins.channel.title,
      handle: ins.channel.handle,
      subscribers: ins.channel.subscriberCount,
      totalViews: ins.channel.viewCount,
      videos: ins.channel.videoCount,
      avgViewsPerVideo: Math.round(ins.channel.viewCount / ins.channel.videoCount),
    },
    collectedAt: ins.snapshot.collectedAt,
    source: ins.snapshot.source,
    recentWindow: { from: kstDate(ins.recentRange.from), to: kstDate(ins.recentRange.to), uploads: ins.recent.length },
    formats: [ins.formats.shorts, ins.formats.long],
    uploadSlots: ins.uploadSlots,
    topRecentShorts: byPace("shorts").slice(0, 5).map(toRow),
    topRecentLong: byPace("long").slice(0, 3).map(toRow),
    allTimeTop: ins.top.slice(0, 10).map(toRow),
    themes: ins.themes,
    network: ins.network.map((c) => ({
      title: c.title,
      language: c.language,
      subscribers: c.subscriberCount,
      totalViews: c.viewCount,
    })),
    limitations: [
      `좋아요 수: 아동용(Made for Kids) 영상이라 API가 0을 돌려줍니다. 수집한 ${ins.videos.length}개 중 ${ins.likesVisibleCount}개(2021~2022년 영상)만 값이 있습니다.`,
      "댓글: 아동용 영상이라 비활성화되어 수집할 수 없습니다.",
      `일평균 조회수 = 누적 조회수 ÷ 업로드 후 경과 일수(1일 미만은 1일). 업로드 직후 영상은 값이 크게 흔들리고 오래된 영상은 초반 몰림이 희석되므로, 순위는 업로드 ${MIN_AGE_FOR_RANK_DAYS}일 이상 지난 영상만 쓰고 비슷한 시기 영상끼리 비교하세요.`,
      "테마는 제목 키워드로 자동 분류했고, 한 영상에 여러 테마가 붙을 수 있습니다.",
      "시청 시간, 노출 클릭률, 수익, 시청자 연령·국가 등 YouTube Studio(Analytics) 지표는 공개 Data API로 가져올 수 없습니다.",
    ],
  };
}

/** 에이전트 프롬프트에 붙일 Markdown 블록 */
export function buildAgentContext(d: YoutubeAgentDigest = buildAgentDigest()): string {
  const row = (v: AgentVideoRow, i: number) =>
    `${i + 1}. ${v.title} — 조회수 ${formatCount(v.views)}, 일평균 ${formatCount(v.viewsPerDay)} (${v.publishedAt}) ${v.url}`;
  const fmt = (f: FormatSummary) =>
    `- ${FORMAT_LABEL[f.format]} ${f.count}개: 조회수 중앙값 ${formatCount(f.medianViews)}, 일평균 조회수 중앙값 ${formatCount(f.medianViewsPerDay)}, 합계 ${formatCount(f.totalViews)}`;
  const slot = (s: UploadSlot) =>
    `- ${FORMAT_LABEL[s.format]} ${String(s.hourKst).padStart(2, "0")}시: ${s.count}개, 일평균 조회수 중앙값 ${formatCount(s.medianViewsPerDay)}`;
  const theme = (t: ThemeSummary) =>
    `| ${t.theme} | ${t.recentShorts} | ${t.recentShortsMedianViewsPerDay === null ? "—" : formatCount(t.recentShortsMedianViewsPerDay)} | ${t.inTop} |`;

  return `<youtube_channel_metrics channel="${d.channel.title} (${d.channel.handle})" collected_at="${d.collectedAt}" source="${d.source}">
## 채널 현황
- 구독자 ${formatCount(d.channel.subscribers)}명 · 누적 조회수 ${formatCount(d.channel.totalViews)}회 · 영상 ${d.channel.videos.toLocaleString("ko-KR")}개 · 영상당 평균 조회수 ${formatCount(d.channel.avgViewsPerVideo)}

## 최근 업로드 ${d.recentWindow.uploads}개 (${d.recentWindow.from} ~ ${d.recentWindow.to}, 한국 시간)
${d.formats.map(fmt).join("\n")}

업로드 시각(한국 시간)별:
${d.uploadSlots.map(slot).join("\n")}

## 최근 쇼츠 상위 5 (일평균 조회수 순, 업로드 ${MIN_AGE_FOR_RANK_DAYS}일 이상 경과)
${d.topRecentShorts.map(row).join("\n")}

## 최근 롱폼 상위 3 (일평균 조회수 순, 업로드 ${MIN_AGE_FOR_RANK_DAYS}일 이상 경과)
${d.topRecentLong.map(row).join("\n")}

## 역대 조회수 상위 10
${d.allTimeTop.map(row).join("\n")}

## 테마별 성과 (제목 키워드 기준)
| 테마 | 최근 쇼츠 수 | 쇼츠 일평균 조회수 중앙값 | 역대 상위 20 포함 수 |
|---|---|---|---|
${d.themes.map(theme).join("\n")}

## 코코비 채널 네트워크 (누적 조회수 순)
${d.network.map((c) => `- ${c.title} (${c.language}): 구독자 ${formatCount(c.subscribers)}, 누적 조회수 ${formatCount(c.totalViews)}`).join("\n")}

## 데이터 한계
${d.limitations.map((l) => `- ${l}`).join("\n")}
</youtube_channel_metrics>`;
}
