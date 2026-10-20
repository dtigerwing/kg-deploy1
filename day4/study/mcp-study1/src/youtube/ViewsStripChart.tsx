import { useLayoutEffect, useRef, useState } from "react";
import {
  FORMAT_LABEL,
  MIN_AGE_FOR_RANK_DAYS,
  formatCount,
  kstDate,
  median,
  type VideoFormat,
  type VideoMetrics,
} from "../../shared/youtube";

const ROWS: VideoFormat[] = ["shorts", "long"];
const ROW_H = 64;
const PAD = { top: 8, right: 16, bottom: 30, left: 56 };
const R = 5;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** 영상 id로 정하는 고정 세로 흔들림(-1~1). 다시 그려도 점 위치가 바뀌지 않습니다. */
function jitter(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * 2 - 1;
}

/** 최근 업로드의 일평균 조회수를 형식별 한 줄씩, 로그 축 위에 점으로 찍습니다. */
export function ViewsStripChart({ videos }: { videos: VideoMetrics[] }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<VideoMetrics | null>(null);

  const values = videos.map((v) => v.viewsPerDay);
  const lo = Math.floor(Math.log10(Math.max(1, Math.min(...values))));
  const hi = Math.ceil(Math.log10(Math.max(...values)));
  const plotW = Math.max(120, width - PAD.left - PAD.right);
  const x = (v: number) => PAD.left + ((Math.log10(v) - lo) / (hi - lo)) * plotW;
  const rowY = (f: VideoFormat) => PAD.top + ROWS.indexOf(f) * ROW_H + ROW_H / 2;
  const height = PAD.top + ROWS.length * ROW_H + PAD.bottom;
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => 10 ** (lo + i));
  // 좁은 화면에서는 눈금 글자가 겹치지 않게 건너뛰며 표시합니다 (마지막 눈금 기준).
  const labelStep = Math.ceil(52 / (plotW / Math.max(1, ticks.length - 1)));
  const showLabel = (i: number) => (ticks.length - 1 - i) % labelStep === 0;

  const hx = hover ? x(hover.viewsPerDay) : 0;
  const hy = hover ? rowY(hover.format) + jitter(hover.id) * (ROW_H / 2 - R - 6) : 0;

  return (
    <div className="yt-strip" ref={wrapRef}>
      <svg width={width} height={height} role="img" aria-label="최근 업로드 영상의 형식별 일평균 조회수 분포 (로그 축)">
        {ticks.map((t, i) => (
          <g key={t}>
            <line className="yt-grid" x1={x(t)} x2={x(t)} y1={PAD.top} y2={height - PAD.bottom} />
            {showLabel(i) && (
              <text
                className="yt-axis"
                x={x(t)}
                y={height - PAD.bottom + 18}
                textAnchor={t === ticks[ticks.length - 1] ? "end" : "middle"}
              >
                {formatCount(t)}
              </text>
            )}
          </g>
        ))}
        {ROWS.map((f) => {
          const list = videos.filter((v) => v.format === f);
          const med = median(list.map((v) => v.viewsPerDay));
          const y = rowY(f);
          return (
            <g key={f}>
              <text className="yt-row-label" x={PAD.left - 10} y={y + 4} textAnchor="end">
                {FORMAT_LABEL[f]}
              </text>
              {list.length > 0 && (
                <g>
                  <line className="yt-median" x1={x(med)} x2={x(med)} y1={y - ROW_H / 2 + 4} y2={y + ROW_H / 2 - 4} />
                  <text className="yt-median-label" x={x(med) + 5} y={y - ROW_H / 2 + 13}>
                    중앙값 {formatCount(med)}
                  </text>
                </g>
              )}
              {list.map((v) => {
                const young = v.ageDays < MIN_AGE_FOR_RANK_DAYS;
                return (
                  <circle
                    key={v.id}
                    className={`yt-dot ${f}${young ? " young" : ""}${hover?.id === v.id ? " is-hover" : ""}`}
                    cx={x(v.viewsPerDay)}
                    cy={y + jitter(v.id) * (ROW_H / 2 - R - 6)}
                    r={R}
                  />
                );
              })}
            </g>
          );
        })}
        {/* 점보다 넓은 투명 히트 영역 */}
        {videos.map((v) => (
          <circle
            key={`hit-${v.id}`}
            className="yt-hit"
            cx={x(v.viewsPerDay)}
            cy={rowY(v.format) + jitter(v.id) * (ROW_H / 2 - R - 6)}
            r={11}
            onPointerEnter={() => setHover(v)}
            onPointerLeave={() => setHover((cur) => (cur?.id === v.id ? null : cur))}
            onClick={() => window.open(v.url, "_blank", "noopener")}
          />
        ))}
      </svg>
      {hover && (
        <div
          className={`yt-tooltip${hy < 80 ? " below" : ""}`}
          style={{
            left: Math.min(Math.max(hx, 120), width - 120),
            top: hy < 80 ? hy + 14 : hy - 12,
          }}
          role="status"
        >
          <strong>{hover.title}</strong>
          <span>
            일평균 <b>{formatCount(hover.viewsPerDay)}</b> · 조회수 {formatCount(hover.views)}
          </span>
          <span className="muted">
            {FORMAT_LABEL[hover.format]} · {kstDate(hover.publishedAt)} 업로드
            {hover.ageDays < MIN_AGE_FOR_RANK_DAYS ? ` · ${MIN_AGE_FOR_RANK_DAYS}일 미만` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
