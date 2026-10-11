# AI 스터디

AI 공부 내용을 게시판에 함께 쓰고, 고치고, 댓글로 토론하는 사이트입니다.
Cloudflare **Workers + D1 무료 플랜**과 **Google 로그인(무료)**만 사용합니다.

- 배포 주소: https://ai-study-docs.kimdohan2.workers.dev

## 기능

| 기능 | 설명 |
|---|---|
| 가입 승인제 | 구글 로그인 → 가입 신청서(닉네임, 한 줄 소개) → **관리자 승인 후에만** 글 열람·작성 가능. 서버가 모든 데이터 요청에서 승인 여부 확인 |
| 회원 관리 | 관리자(`ADMIN_EMAILS`)에게만 보이는 메뉴. 승인 대기/회원/거절·강퇴 탭, 승인·거절·강퇴(강퇴 시 로그인도 끊김) |
| 관리자 권한 | 모든 글·댓글 삭제, 공지사항 게시판 작성·수정 |
| 게시판 | 왼쪽 메뉴의 게시판(그룹별) → 글 목록(번호·제목[댓글]·작성자·작성일·조회, 페이지 이동, 게시판 안 검색) → 글 보기(이전글/다음글) |
| 공지 고정 | 공지사항 게시판 글은 다른 게시판 첫 페이지 맨 위에 고정 |
| 글쓰기 | 게시판 선택 + 버튼식 편집기(TOAST UI Editor: 굵게·제목·목록·표·이미지·링크·코드). 저장은 마크다운 |
| 이미지 | 버튼/붙여넣기/끌어놓기로 첨부. 브라우저에서 긴 변 1600px·1MB 이하로 줄여 D1 `images` 테이블에 저장 (1인 하루 100장) |
| 누구나 편집 | 로그인한 사람은 모든 문서 수정 가능 (위키 방식) |
| 변경 이력 | 저장할 때마다 버전 기록, 줄 단위 비교(diff), 되돌리기 |
| 동시 편집 충돌 감지 | 편집 중 다른 사람이 먼저 저장하면 비교 화면을 띄움 |
| 댓글 | 작성/삭제 (본인 댓글만 삭제) |
| 검색, 최근 활동 | 제목·본문 검색, 수정/댓글 타임라인 |

문서 삭제는 처음 작성한 사람만 할 수 있습니다.

## 구조

```
public/              정적 파일 (화면)
  index.html, style.css, app.js, _headers(보안 헤더)
  vendor/toastui-editor-3.2.2/  편집기 파일 (MIT, NHN 공식 CDN에서 받아 직접 제공)
src/index.js         /api/*, /auth/* 를 처리하는 Worker
migrations/          D1 테이블(0001), 샘플 데이터(0002), 구글 로그인 전환(0003), 사용법 수정(0004), 게시판·조회수(0005), 이미지(0006), 사용법 수정(0007), 가입 승인제(0008), 사용법 수정(0009)
wrangler.jsonc       배포 설정
```

## 게시판 추가/변경

게시판은 `boards` 테이블에 있습니다. 화면에서 만드는 기능은 없고, 마이그레이션 파일을 추가해 반영합니다.

```sql
-- migrations/0006_add_board.sql
INSERT INTO boards (name, description, group_name, sort_order) VALUES ('논문 리뷰', '읽은 논문 정리', 'AI 스터디', 65);
```

```bash
npm run db:migrate:remote
```

## 로그인 구조 (Google OAuth)

1. `/auth/login` → 구글 로그인 화면으로 이동 (state·nonce·PKCE 로 위조 방지)
2. `/auth/callback` → 구글에서 받은 코드를 토큰으로 바꾸고, 발급처·대상·만료·nonce·이메일 인증 여부를 확인
3. 이메일 기준으로 사용자를 찾거나 새로 만들고, HttpOnly 쿠키 세션(14일)을 발급

설정값 (`wrangler.jsonc` 의 `vars`, 비밀값은 `wrangler secret`):

| 이름 | 설명 |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console 의 OAuth 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | 클라이언트 보안 비밀. `npx wrangler secret put GOOGLE_CLIENT_SECRET` 으로 등록 |
| `ADMIN_EMAILS` | 카페 관리자 이메일(쉼표로 여러 명). 관리자는 자동 승인 |
| `ALLOWED_EMAIL_DOMAIN` | 비우면 모든 구글 계정 허용. `kiglestudio.com` 처럼 넣으면 그 회사(Google Workspace) 계정만 허용 |

구글 OAuth 클라이언트의 **승인된 리디렉션 URI**: `https://ai-study-docs.kimdohan2.workers.dev/auth/callback`

로컬(`wrangler dev`)에서는 구글 대신 `.dev.vars` 의 `DEV_USER_EMAIL` 사용자로 바로 로그인합니다.
`/auth/login?as=다른주소@example.com` 으로 다른 사용자를 흉내 낼 수 있습니다 (localhost 에서만 동작).

## 명령어

```bash
npm install
echo 'DEV_USER_EMAIL=tester@kiglestudio.com' > .dev.vars
npm run db:migrate:local    # 내 컴퓨터 DB 만들기
npm run dev                 # http://localhost:8787
npm run deploy              # 배포
npm run db:migrate:remote   # migrations 폴더에 새 파일을 추가했을 때 운영 DB에 반영
```
