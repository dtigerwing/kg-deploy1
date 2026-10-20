import { useRef, useState } from "react";

const EXAMPLES = [
  "다음 달 사내 해커톤 운영 준비 (공지, 일정표, 참가 신청, 심사 기준)",
  "1인 카페 창업을 위한 메뉴 기획과 SNS 홍보 계획",
  "B2B SaaS 신규 기능 출시 랜딩 페이지 제작",
];

export function TaskForm({
  disabled,
  onSubmit,
  onLoadFile,
}: {
  disabled: boolean;
  onSubmit: (task: string) => void;
  onLoadFile: (file: File) => void;
}) {
  const [task, setTask] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const canSubmit = !disabled && task.trim().length > 0;

  return (
    <form
      className="panel task-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(task);
      }}
    >
      <label htmlFor="task" className="panel-title">
        지금 진행 중인 업무를 간단히 적어 주세요
      </label>
      <p className="muted">
        업무를 세부 단위로 나누고, 각 서브에이전트가 세운 계획을 승인하면 실행 후 하나의 목업으로 취합해 드립니다.
      </p>
      <textarea
        id="task"
        rows={4}
        value={task}
        placeholder="예) 신규 회원 대상 온보딩 이메일 시퀀스와 안내 페이지 만들기"
        onChange={(e) => setTask(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) onSubmit(task);
        }}
      />
      <div className="chips">
        {EXAMPLES.map((ex) => (
          <button type="button" key={ex} className="chip" onClick={() => setTask(ex)}>
            {ex}
          </button>
        ))}
      </div>
      <div className="row end">
        <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
          저장한 기록 불러오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoadFile(file);
            e.target.value = "";
          }}
        />
        <button type="submit" className="btn primary" disabled={!canSubmit}>
          워크플로우 시작 <kbd>⌘↵</kbd>
        </button>
      </div>
    </form>
  );
}
