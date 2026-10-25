// 배포된 보기 전용 웹(viewer.html)이 쓰는 Firebase 웹 앱 설정. 비밀값이 아니라 코드에 둬도 된다.
// 읽기 권한은 firestore.rules가 정한다(OWNER_EMAIL로 로그인한 사람만).
export const firebaseConfig = {
  apiKey: "AIzaSyCr3HtbH4-Qo3mueW5VxaVi6XrUD5e-C-M",
  authDomain: "kdh-agentic.firebaseapp.com",
  projectId: "kdh-agentic",
  appId: "1:330117896640:web:31c830e083fb91f5ce1025",
};

export const OWNER_EMAIL = "kimdohan2@gmail.com";
