import { useMemo, useState } from "react";
import {
  FORMAT_LABEL,
  MIN_AGE_FOR_RANK_DAYS,
  buildAgentContext,
  buildAgentDigest,
  buildInsights,
  formatCount,
  formatDuration,
  kstDate,
  type VideoFormat,
  type VideoMetrics,
} from "../../shared/youtube";
import { saveFile } from "../lib/storage";
import { ViewsStripChart } from "./ViewsStripChart";

type ListKey = "recent" | "top" | "all";
type SortKey = "views" | "pace" | "date";

const LIST_LABEL: Record<ListKey, string> = { recent: "최근 업로드 50", top: "역대 조회수 상위 20", all: "수집한 전체" };
const SORT_LABEL: Record<SortKey, string> = { views: "조회수", pace: "일평균", date: "최신순" };

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} className={k === value ? "is-active" : ""} aria-pressed={k === value} onClick={() => onChange(k)}>
          {options[k]}
        </button>
      ))}
    </div>
  );
}

export function YoutubeInsights({ onToast }: { onToast: (msg: string) => void }) {
  const ins = useMemo(() => buildInsights(), []);
  const digest = useMemo(() => buildAgentDigest(ins), [ins]);
  const context = useMemo(() => buildAgentContext(digest), [digest]);

  const [list, setList] = useState<ListKey>("recent");
  const [format, setFormat] = useState<VideoFormat | "all">("all");
  const [sort, setSort] = useState<SortKey>("views");
  const [agentView, setAgentView] = useState<"md" | "json">("md");

  const { channel, formats } = ins;
  const shortsShare = formats.shorts.totalViews / (formats.shorts.totalViews + formats.long.totalViews);
  const paceGap = formats.long.medianViewsPerDay > 0 ? formats.shorts.medianViewsPerDay / formats.long.medianViewsPerDay : 0;
  const dormantThemes = ins.themes.filter((t) => t.recentShorts === 0 && t.inTop > 0);
  const maxThemePace = Math.max(...ins.themes.map((t) => t.recentShortsMedianViewsPerDay ?? 0));

  const rows = useMemo(() => {
    const source: VideoMetrics[] = list === "recent" ? ins.recent : list === "top" ? ins.top : ins.videos;
    const filtered = format === "all" ? source : source.filter((v) => v.format === format);
    const by: Record<SortKey, (a: VideoMetrics, b: VideoMetrics) => number> = {
      views: (a, b) => b.views - a.views,
      pace: (a, b) => b.viewsPerDay - a.viewsPerDay,
      date: (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    };
    return [...filtered].sort(by[sort]);
  }, [ins, list, format, sort]);

  const agentText = agentView === "md" ? context : JSON.stringify(digest, null, 2);
  const copyAgent = () =>
    navigator.clipboard.writeText(agentText).then(
      () => onToast("클립보드에 복사했습니다"),
      () => onToast("복사하지 못했습니다"),
    );
  const saveAgent = () =>
    saveFile(
      `cocobi-youtube-${kstDate(ins.snapshot.collectedAt)}.${agentView === "md" ? "md" : "json"}`,
      agentText,
      agentView === "md" ? "text/markdown" : "application/json",
    ).then((saved) => saved && onToast("내 컴퓨터에 저장했습니다"));

  return (
    <main className="content reveal yt">
      <section className="panel yt-head">
        <div>
          <span className="label">유튜브 채널 지표</span>
          <h2>
            <a href={`https://www.youtube.com/${channel.handle}`} target="_blank" rel="noreferrer">
              {channel.title}
            </a>{" "}
            <span className="muted yt-handle">{channel.handle}</span>
          </h2>
          <p className="muted small">
            {kstDate(ins.snapshot.collectedAt)} 수집 · {ins.snapshot.source} · 영상 {ins.videos.length}개, 채널{" "}
            {ins.network.length}개
          </p>
        </div>
        <span className="chip static">스냅샷 · 새로고침 시 MCP로 다시 수집</span>
      </section>

      <section className="stats">
        <div className="stat">
          <span className="label">구독자</span>
          <strong>{formatCount(channel.subscriberCount)}</strong>
          <small>채널 개설 {kstDate(channel.createdAt).slice(0, 4)}년</small>
        </div>
        <div className="stat">
          <span className="label">누적 조회수</span>
          <strong>{formatCount(channel.viewCount)}</strong>
          <small>영상 {channel.videoCount.toLocaleString("ko-KR")}개</small>
        </div>
        <div className="stat">
          <span className="label">영상당 평균 조회수</span>
          <strong>{formatCount(channel.viewCount / channel.videoCount)}</strong>
          <small>누적 조회수 ÷ 영상 수</small>
        </div>
        <div className="stat">
          <span className="label">최근 {ins.recentRange.days}일 업로드</span>
          <strong>{ins.recent.length}개</strong>
          <small>
            하루 {(ins.recent.length / ins.recentRange.days).toFixed(1)}개 · 쇼츠 {formats.shorts.count} / 롱폼{" "}
            {formats.long.count}
          </small>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>최근 업로드: 쇼츠 vs 롱폼</h2>
          <span className="muted small">
            {kstDate(ins.recentRange.from)} ~ {kstDate(ins.recentRange.to)} · 점 하나가 영상 하나, 가로축은 로그 눈금
          </span>
        </div>
        <div className="yt-compare">
          {(["shorts", "long"] as VideoFormat[]).map((f) => (
            <div key={f} className={`yt-compare-card ${f}`}>
              <span className="yt-swatch" aria-hidden />
              <div>
                <strong>{FORMAT_LABEL[f]}</strong> {formats[f].count}개
              </div>
              <dl>
                <dt>일평균 조회수 중앙값</dt>
                <dd>{formatCount(formats[f].medianViewsPerDay)}</dd>
                <dt>조회수 중앙값</dt>
                <dd>{formatCount(formats[f].medianViews)}</dd>
                <dt>조회수 합계</dt>
                <dd>{formatCount(formats[f].totalViews)}</dd>
              </dl>
            </div>
          ))}
          <p className="yt-callout">
            쇼츠 {formats.shorts.count}개, 롱폼 {formats.long.count}개를 올렸고 조회수의{" "}
            <b>{Math.round(shortsShare * 100)}%</b>가 쇼츠에서 나왔습니다. 일평균 중앙값은 쇼츠가 롱폼의{" "}
            <b>{Math.round(paceGap)}배</b>입니다.
          </p>
        </div>
        <ViewsStripChart videos={ins.recent} />
        <p className="muted small yt-note">
          속이 빈 점은 업로드 {MIN_AGE_FOR_RANK_DAYS}일 미만이라 일평균이 아직 흔들리는 영상입니다. 점을 누르면 유튜브에서
          열립니다.
        </p>
        <div className="yt-slots">
          <span className="label">업로드 시각 (한국 시간)</span>
          <ul>
            {ins.uploadSlots.map((s) => (
              <li key={`${s.format}-${s.hourKst}`}>
                <span className={`yt-swatch ${s.format}`} aria-hidden />
                {FORMAT_LABEL[s.format]} {String(s.hourKst).padStart(2, "0")}시 · {s.count}개 · 일평균 중앙값{" "}
                <b>{formatCount(s.medianViewsPerDay)}</b>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>테마별 성과</h2>
          <span className="muted small">제목 키워드로 분류 · 최근 쇼츠 기준 일평균 조회수 중앙값 순</span>
        </div>
        <div className="yt-table-wrap">
          <table className="yt-table">
            <thead>
              <tr>
                <th>테마</th>
                <th className="num">최근 쇼츠</th>
                <th className="bar-col">쇼츠 일평균 중앙값</th>
                <th className="num">역대 상위 20</th>
              </tr>
            </thead>
            <tbody>
              {ins.themes.map((t) => (
                <tr key={t.theme}>
                  <td className="nowrap">{t.theme}</td>
                  <td className="num">{t.recentShorts}개</td>
                  <td className="bar-col">
                    {t.recentShortsMedianViewsPerDay === null ? (
                      <span className="muted">최근 쇼츠 없음</span>
                    ) : (
                      <div className="yt-bar">
                        <span style={{ width: `${(t.recentShortsMedianViewsPerDay / maxThemePace) * 100}%` }} />
                        <b>{formatCount(t.recentShortsMedianViewsPerDay)}</b>
                      </div>
                    )}
                  </td>
                  <td className="num">{t.inTop > 0 ? `${t.inTop}개` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small yt-note">
          최근 쇼츠가 1~2개뿐인 테마는 한 영상이 값을 좌우합니다.
          {dormantThemes.length > 0 &&
            ` ${dormantThemes.map((t) => `"${t.theme}"(역대 상위 ${t.inTop}개)`).join(", ")}는 최근 업로드가 없습니다.`}
        </p>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>영상별 지표</h2>
          <span className="muted small">{rows.length}개</span>
        </div>
        <div className="row yt-filters">
          <Segmented label="목록" value={list} options={LIST_LABEL} onChange={setList} />
          <Segmented
            label="형식"
            value={format}
            options={{ all: "전체", shorts: "쇼츠", long: "롱폼" }}
            onChange={setFormat}
          />
          <Segmented label="정렬" value={sort} options={SORT_LABEL} onChange={setSort} />
        </div>
        <div className="yt-table-wrap">
          <table className="yt-table">
            <thead>
              <tr>
                <th>제목</th>
                <th>형식</th>
                <th>업로드</th>
                <th className="num">길이</th>
                <th className="num">조회수</th>
                <th className="num">일평균</th>
                <th className="num">좋아요</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="yt-title">
                    <a href={v.url} target="_blank" rel="noreferrer">
                      {v.title}
                    </a>
                    {v.topRank !== null && list !== "top" && <span className="yt-badge">역대 {v.topRank}위</span>}
                  </td>
                  <td>
                    <span className={`yt-swatch ${v.format}`} aria-hidden /> {FORMAT_LABEL[v.format]}
                  </td>
                  <td className="nowrap">{kstDate(v.publishedAt)}</td>
                  <td className="num">{formatDuration(v.durationSec)}</td>
                  <td className="num">{v.views.toLocaleString("ko-KR")}</td>
                  <td className={`num${v.ageDays < MIN_AGE_FOR_RANK_DAYS ? " muted" : ""}`}>
                    {formatCount(v.viewsPerDay)}
                  </td>
                  <td className="num">
                    {v.likes === null ? <span className="muted">비공개</span> : v.likes.toLocaleString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>코코비 채널 네트워크</h2>
          <span className="muted small">언어별 채널 · 누적 조회수 순</span>
        </div>
        <div className="yt-table-wrap">
          <table className="yt-table">
            <thead>
              <tr>
                <th>채널</th>
                <th>언어</th>
                <th className="num">구독자</th>
                <th className="num">누적 조회수</th>
                <th className="num">영상 수</th>
                <th className="num">영상당 평균</th>
              </tr>
            </thead>
            <tbody>
              {ins.network.map((c) => (
                <tr key={c.id} className={c.id === channel.id ? "is-main" : ""}>
                  <td>
                    <a href={`https://www.youtube.com/${c.handle}`} target="_blank" rel="noreferrer">
                      {c.title}
                    </a>
                    {c.id === channel.id && <span className="yt-badge">이 탭의 채널</span>}
                  </td>
                  <td className="nowrap">{c.language}</td>
                  <td className="num">{formatCount(c.subscriberCount)}</td>
                  <td className="num">{formatCount(c.viewCount)}</td>
                  <td className="num">{c.videoCount.toLocaleString("ko-KR")}</td>
                  <td className="num">{formatCount(c.viewCount / c.videoCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>데이터 한계</h2>
        </div>
        <ul className="yt-limits">
          {digest.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>에이전트 입력용</h2>
            <p className="muted small">
              워크플로우 에이전트 프롬프트에 그대로 붙일 수 있게 가공한 결과입니다. Markdown은 프롬프트용, JSON은 구조화
              입력용입니다.
            </p>
          </div>
          <div className="row">
            <Segmented label="형식" value={agentView} options={{ md: "Markdown", json: "JSON" }} onChange={setAgentView} />
            <button className="btn small" onClick={copyAgent}>
              복사
            </button>
            <button className="btn small" onClick={saveAgent}>
              파일로 저장
            </button>
          </div>
        </div>
        <pre className="yt-agent">{agentText}</pre>
      </section>
    </main>
  );
}
