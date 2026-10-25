// 배포된 웹의 "새로 읽기"가 부르는 클라우드 함수. 노트북이 꺼져 있어도 Bitbucket에 푸시된 내용으로 현황을 갱신한다.
// 구글 로그인한 본인만 부를 수 있고, 결과는 노트북 서버와 같은 unitySnapshots 컬렉션에 쌓는다.
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { readFromBitbucket } from "./bitbucket.js";

initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const BITBUCKET_TOKEN = defineSecret("BITBUCKET_TOKEN");
const OWNER_EMAIL = "kimdohan2@gmail.com";
const REPO = { workspace: "kimdohan2", repo: "proejct_a", unityFolder: "ProjectA" };

export const refreshFromBitbucket = onCall(
  { region: "asia-northeast3", secrets: [BITBUCKET_TOKEN], timeoutSeconds: 120, memory: "256MiB" },
  async (request) => {
    const token = request.auth?.token;
    if (!token || token.email !== OWNER_EMAIL || !token.email_verified) {
      throw new HttpsError("permission-denied", "등록된 계정만 새로 읽을 수 있어요.");
    }
    let snapshot;
    try {
      snapshot = await readFromBitbucket(BITBUCKET_TOKEN.value(), REPO);
    } catch (err) {
      throw new HttpsError("unavailable", `Bitbucket을 읽지 못했어요. ${err.message}`);
    }
    const id = snapshot.readAt.replace(/[:.]/g, "-");
    await db.collection("unitySnapshots").doc(id).set({ ...snapshot, savedAt: FieldValue.serverTimestamp() });
    return { id };
  },
);
