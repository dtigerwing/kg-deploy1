import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import type { HealthResponse } from "../../shared/types";
import { apiUrl, fetchApi } from "../lib/api";
import { auth, signInWithGoogle, signOutUser } from "../lib/firebase";
import { HeroDemo } from "./HeroDemo";

type State =
  | { kind: "checking" }
  | { kind: "open" } // 로컬 개발처럼 서버가 로그인을 요구하지 않음
  | { kind: "signedOut"; error: string | null }
  | { kind: "denied"; email: string | null; message: string }
  | { kind: "allowed"; user: User };

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * 배포 환경에서는 Google 로그인 후 허용된 이메일만 앱을 쓸 수 있게 막습니다.
 * 서버(/api/health)가 로그인을 요구하지 않으면(로컬 개발) 바로 앱을 보여 줍니다.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "checking" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    fetch(apiUrl("/api/health"))
      .then((r) => r.json() as Promise<HealthResponse>)
      .catch(() => null)
      .then((health) => {
        if (cancelled) return;
        // 서버에 닿지 못하면 앱이 직접 연결 오류를 안내하도록 그대로 보여 줍니다.
        if (!health?.authRequired) return setState({ kind: "open" });
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!user) return setState({ kind: "signedOut", error: null });
          setState({ kind: "checking" });
          try {
            await fetchApi("/api/me");
            setState({ kind: "allowed", user });
          } catch (e) {
            setState({ kind: "denied", email: user.email, message: (e as Error).message });
          }
        });
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const login = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setState({ kind: "signedOut", error: code === "auth/popup-blocked" ? "팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요." : "로그인하지 못했습니다. 다시 시도해 주세요." });
      }
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === "open") return <>{children}</>;

  if (state.kind === "allowed") {
    return (
      <>
        <div className="auth-bar">
          {state.user.photoURL && <img src={state.user.photoURL} alt="" referrerPolicy="no-referrer" />}
          <span>{state.user.email}</span>
          <button className="btn ghost small" onClick={() => void signOutUser()}>
            로그아웃
          </button>
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="login-page">
      <section className="login-card reveal">
        <span className="logo" aria-hidden>
          ◆
        </span>
        <h1>Agentic Workflow Studio</h1>
        <p className="muted">업무를 그래프로 나눠 서브에이전트들이 동시에 처리하고, 하나의 목업으로 모읍니다.</p>

        {state.kind === "checking" && (
          <div className="login-status">
            <span className="spinner" aria-hidden /> 확인하는 중…
          </div>
        )}

        {state.kind === "signedOut" && (
          <>
            <button className="btn google" onClick={() => void login()} disabled={busy}>
              <GoogleMark /> Google 계정으로 로그인
            </button>
            {state.error && <p className="login-error">{state.error}</p>}
            <p className="muted small">허용된 계정만 이용할 수 있어요.</p>
          </>
        )}

        {state.kind === "denied" && (
          <>
            <p className="login-error">
              {state.email ? <strong>{state.email}</strong> : "이 계정"}은(는) 사용이 허용되지 않았습니다.
              <br />
              <span className="small">{state.message}</span>
            </p>
            <button className="btn google" onClick={() => void login()} disabled={busy}>
              <GoogleMark /> 다른 계정으로 로그인
            </button>
          </>
        )}
      </section>
      <div className="login-demo reveal">
        <HeroDemo />
      </div>
    </div>
  );
}
