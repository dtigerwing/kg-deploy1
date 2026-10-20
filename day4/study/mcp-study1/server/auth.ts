import type { NextFunction, Request, Response } from "express";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * 허용 이메일 목록 (쉼표로 구분). 배포 환경에서는 Secret Manager의 ALLOWED_EMAILS가 들어옵니다.
 * 비어 있으면(로컬 개발) 로그인 검사를 하지 않습니다.
 */
function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const authRequired = () => allowedEmails().length > 0;

function adminAuth() {
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? "kg-kdh-agentic" });
  }
  return getAuth();
}

export interface AuthedRequest extends Request {
  userEmail?: string;
}

/** Authorization: Bearer <Firebase ID 토큰>을 검증하고, 허용 목록에 있는 이메일인지 확인합니다. */
export async function authGuard(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!authRequired() || req.path === "/api/health") return next();

  const token = req.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    if (!email || !decoded.email_verified || !allowedEmails().includes(email)) {
      res.status(403).json({ error: "이 계정은 사용이 허용되지 않았습니다.", email: decoded.email ?? null });
      return;
    }
    req.userEmail = email;
    next();
  } catch {
    res.status(401).json({ error: "로그인 정보가 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요." });
  }
}
