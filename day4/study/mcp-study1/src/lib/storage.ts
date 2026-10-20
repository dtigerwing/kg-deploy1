import type { WorkflowRun } from "../../shared/types";
import { migrateRun } from "./useWorkflow";

/**
 * 실행 기록 저장소 인터페이스.
 * 지금은 사용자 컴퓨터에 파일로 저장하는 구현만 있고,
 * 추후 같은 인터페이스로 Firestore 구현(`runs/{run.id}` 문서)을 추가하면 됩니다.
 */
export interface RunRepository {
  save(run: WorkflowRun): Promise<boolean>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
type SaveFilePicker = (options: SaveFilePickerOptions) => Promise<{
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}>;

/**
 * 사용자 컴퓨터에 파일을 저장합니다.
 * 지원 브라우저(Chrome/Edge)에서는 저장 위치를 고르는 대화상자를, 그 외에는 일반 다운로드를 사용합니다.
 * 사용자가 저장을 취소하면 false를 반환합니다.
 */
export async function saveFile(filename: string, content: string, mime: string): Promise<boolean> {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  const ext = filename.slice(filename.lastIndexOf("."));

  if (picker && window.self === window.top) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: ext.toUpperCase().slice(1), accept: { [mime]: [ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      // 권한 문제 등으로 실패하면 일반 다운로드로 대체합니다.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function stamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function fileBase(run: WorkflowRun): string {
  return `mockup-${stamp(run.createdAt)}`;
}

/** 로컬 파일 저장소: 실행 기록 전체를 JSON 원본으로 저장 */
export const localFileRepository: RunRepository = {
  save: (run) => saveFile(`${fileBase(run)}.json`, JSON.stringify(run, null, 2), "application/json"),
};

/** 목업 프리뷰 HTML 원본 저장 */
export function savePreviewHtml(run: WorkflowRun): Promise<boolean> {
  if (!run.previewHtml) return Promise.resolve(false);
  return saveFile(`${fileBase(run)}.html`, run.previewHtml, "text/html");
}

/** 세부 업무 결과(Markdown) 원본 저장 */
export function saveSubtaskResult(run: WorkflowRun, subtaskId: string): Promise<boolean> {
  const sub = run.subtasks.find((s) => s.id === subtaskId);
  if (!sub?.result) return Promise.resolve(false);
  return saveFile(`${fileBase(run)}-${sub.id}.md`, sub.result, "text/markdown");
}

/** 저장해 둔 JSON 기록을 다시 불러옵니다. 이전 버전 기록은 현재 형식으로 바꿉니다. */
export async function loadRunFile(file: File): Promise<WorkflowRun> {
  const data = JSON.parse(await file.text()) as Parameters<typeof migrateRun>[0];
  if (![1, 2].includes(data.schemaVersion) || !Array.isArray(data.subtasks)) {
    throw new Error("이 앱에서 저장한 작업 기록 파일이 아닙니다.");
  }
  return migrateRun(data);
}
