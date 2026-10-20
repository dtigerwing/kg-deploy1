import { useState } from "react";

const DEVICES = [
  { key: "desktop", label: "데스크톱", width: "100%" },
  { key: "tablet", label: "태블릿", width: "820px" },
  { key: "mobile", label: "모바일", width: "390px" },
] as const;

export function PreviewPanel({
  html,
  onSaveHtml,
  onSaveRun,
  onRebuild,
}: {
  html: string;
  onSaveHtml: () => void;
  onSaveRun: () => void;
  onRebuild: () => void;
}) {
  const [device, setDevice] = useState<(typeof DEVICES)[number]["key"]>("desktop");
  const width = DEVICES.find((d) => d.key === device)!.width;

  return (
    <section className="panel preview">
      <div className="preview-bar">
        <h2 className="panel-title">목업 프리뷰</h2>
        <div className="segmented" role="group" aria-label="미리보기 크기">
          {DEVICES.map((d) => (
            <button key={d.key} className={d.key === device ? "is-active" : ""} onClick={() => setDevice(d.key)}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn ghost" onClick={onRebuild}>
            프리뷰 다시 만들기
          </button>
          <button className="btn" onClick={onSaveRun}>
            전체 기록 저장 (.json)
          </button>
          <button className="btn primary" onClick={onSaveHtml}>
            저장
          </button>
        </div>
      </div>
      <div className="frame-wrap">
        {/* 생성된 HTML은 앱과 분리된 샌드박스(별도 origin)에서 실행됩니다. */}
        <iframe
          title="목업 프리뷰"
          srcDoc={html}
          sandbox="allow-scripts allow-forms allow-modals allow-popups"
          style={{ width }}
        />
      </div>
    </section>
  );
}
