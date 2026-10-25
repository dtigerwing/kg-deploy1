// Firestore 기록 저장. "새로 읽기" 결과와 에이전트 보고서를 쌓아 두면 배포된 웹(보기 전용)이 보여준다.
// 서비스 계정 키(serviceAccount.json)로 서버에서만 쓴다. 키가 없으면 저장을 건너뛴다.
//   unitySnapshots/{읽은 시각}  대시보드 현황
//   unityReports/{자동 ID}      에이전트 보고서 (release, diet, changes, workflow)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_DOC_BYTES = 900 * 1024; // Firestore 문서 한도 1MB보다 조금 작게

let db;

function keyPath() {
  return path.resolve(here, process.env.FIREBASE_SERVICE_ACCOUNT ?? "serviceAccount.json");
}

export function storeEnabled() {
  return fs.existsSync(keyPath());
}

function firestore() {
  if (!db) {
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath(), "utf8"))) });
    db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

// 문서 ID로 쓸 수 있게 읽은 시각의 ':'와 '.'을 바꾼다.
function snapshotId(readAt) {
  return readAt.replace(/[:.]/g, "-");
}

export async function saveSnapshot(snapshot) {
  if (!storeEnabled()) return null;
  const id = snapshotId(snapshot.readAt);
  await firestore()
    .collection("unitySnapshots")
    .doc(id)
    .set({ ...snapshot, project: { ...snapshot.project, path: path.basename(snapshot.project.path ?? "") }, savedAt: FieldValue.serverTimestamp() });
  return id;
}

// type: release | diet | changes | workflow
export async function saveReport(type, data, snapshot) {
  if (!storeEnabled()) return null;
  let doc = {
    type,
    data,
    project: snapshot?.project?.productName ?? null,
    snapshotId: snapshot?.readAt ? snapshotId(snapshot.readAt) : null,
    createdAt: FieldValue.serverTimestamp(),
  };
  // 업무 쪼개기 HTML 프리뷰가 너무 크면 프리뷰만 빼고 저장한다.
  if (Buffer.byteLength(JSON.stringify(doc)) > MAX_DOC_BYTES && data?.review?.html) {
    doc = { ...doc, data: { ...data, review: { ...data.review, html: null, htmlDropped: true } } };
  }
  const ref = await firestore().collection("unityReports").add(doc);
  return ref.id;
}
