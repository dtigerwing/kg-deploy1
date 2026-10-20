import { initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut, type User } from "firebase/auth";

// Firebase 웹 앱 설정. 브라우저에 공개되는 식별값이라 비밀이 아닙니다 (접근 제어는 서버의 허용 이메일 검사로 합니다).
const firebaseConfig = {
  apiKey: "AIzaSyAwn-aqq7HhVq_WCGNTOkM0kHGVuGYnSS0",
  authDomain: "kg-kdh-agentic.firebaseapp.com",
  projectId: "kg-kdh-agentic",
  storageBucket: "kg-kdh-agentic.firebasestorage.app",
  messagingSenderId: "867586525854",
  appId: "1:867586525854:web:da9d1c0ff930ab42a2c98f",
};

export const auth = getAuth(initializeApp(firebaseConfig));

export function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider).then((r) => r.user);
}

export const signOutUser = () => signOut(auth);

/** API 호출에 붙일 ID 토큰. 로그인하지 않았으면 null. (만료가 가까우면 SDK가 알아서 갱신합니다) */
export const currentIdToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve(null);
