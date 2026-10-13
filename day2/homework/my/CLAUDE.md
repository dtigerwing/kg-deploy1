# KIGLE 놀이터 사이트

정식 주소: https://kg-deploy1-wheat.vercel.app/ (Vercel, GitHub `kimdohan2/kg-deploy1` main 에 push 하면 배포. Vercel 프로젝트 Root Directory 는 `day2/homework/my` 여야 함 — 폴더를 옮기면 같이 바꿀 것)

## 빌드 두 개: 테스트 → 정식

| | 경로 | 파일 |
|---|---|---|
| 정식 빌드 | `/` | 루트의 `index.html`, `styles.css`, `js/`, (`chatbot.css`) |
| 테스트 빌드 | `/test/` | `test/` 폴더 전체 (noindex, 왼쪽 아래 '테스트 빌드' 배지) |

- 새 기능·수정은 **항상 `test/` 에 먼저** 만든다. 정식 파일(루트)은 직접 고치지 않는다.
- 이미지 등 무거운 파일은 루트 `assets/` 하나를 같이 쓴다. `test/` 안에서는 `/assets/...` 처럼 절대 경로로, 테스트 전용 CSS/JS 는 `/test/...` 로 적는다.
- 테스트에만 필요한 것은 `<!-- test-only:start -->` ~ `<!-- test-only:end -->` (CSS/JS 는 `/* test-only:start */` ~ `/* test-only:end */`) 로 감싼다.

### "정식으로 올려 줘" 요청을 받으면
1. `npm run promote` 로 바뀔 파일 목록을 보여 주고 확인받는다.
2. `npm run promote -- --apply` → `test/` 내용이 루트로 복사되고 `/test/` 경로와 test-only 블록이 정리된다.
3. `git diff` 확인 → 커밋 → 사용자 확인 후 push (= 정식 배포).
되돌리기는 git (`git revert`).

## 챗봇 (정식·테스트 빌드 모두)

- 화면: `test/js/chatbot.js`, `test/chatbot.css` (정식은 promote 로 복사된 `js/chatbot.js`, `chatbot.css`) — 우측 하단 버튼
- 서버: `api/session.js`(대화 시작: 이름·이메일·동의), `api/emotion.js`(입력 중 감정 분석), `api/chat.js`(질문), `api/faq.js`(주제·질문 목록·동의 문구), `api/admin.js`(관리자) — Vercel 함수. 공통 코드는 `api/_lib/`
- 관리자 페이지: `/admin/` (ADMIN_PASSWORD 로그인) — 질문·답변 CRUD, 채팅 내역(이름·이메일·감정, 실시간), 감정 분류(바로 해 보기 + 응대 기준), 규칙·동의 문구, 차단 기록, 연결 상태
- 감정: TypeSafe AI 의 Jev(`api/_lib/emotion.js`, `TYPESAFE_API_KEY`)가 10가지 감정 확률로 분류 → 기준 확률 이상이면 감정별 첫 문장·응대 기준을 developer 메시지로 OpenAI 에 함께 보냄. 이용자에게는 분석 결과를 보여 주지 않음. 키가 없으면 감정 없이 동작
- 채팅 내역: `conv:{id}` + 정렬 목록 `convs` (`api/_lib/conv.js`), 동의한 보관 기간(기본 90일) 뒤 자동 삭제
- 기본 지식베이스: `api/_lib/seed-kb.js`, 기본 규칙: `api/_lib/settings.js` (관리자 페이지에서 저장하면 저장소 값이 우선)
- 답변 순서: 대화 시작 확인 → 제한 확인 → 감정 분류 → 규칙 검사(캐내기 패턴·의미 없는 입력·반복·인사, 크레딧 0) → 자주 묻는 질문과 같으면 저장된 답 → OpenAI(`gpt-5.6-terra`, 지식베이스 안에서만, JSON 판정) → 경고·제한
- 대화가 시작되면(대화당 1번) Gmail SMTP 로 NOTIFY_EMAIL 에 알림
- 저장소: 운영은 Upstash Redis(`KV_REST_API_URL`/`KV_REST_API_TOKEN`), 로컬은 `.data/dev-store.json`
- 환경 변수 목록: `.env.example` (운영은 Vercel > Settings > Environment Variables)
- Cloudflare(wrangler) 배포에는 `/api` 가 없어서 챗봇이 동작하지 않는다.

## 로컬 실행

```bash
npm run dev
```
http://localhost:5181 (정식) · /test/ · /admin/ — `.env` 를 읽는다. `api/` 코드를 고치면 서버를 다시 켠다.
