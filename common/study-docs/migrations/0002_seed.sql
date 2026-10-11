-- 샘플 데이터. 'studybot' 계정은 password_hash 가 '!' 라서 로그인할 수 없습니다.
INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES
  (1, 'studybot', '스터디 봇', '!', datetime('now', '-7 days'));

-- 1. 사용법 ------------------------------------------------------------
INSERT INTO posts (id, title, category, content, author_id, last_editor_id, version, created_at, updated_at) VALUES
(1, '이 사이트 사용법', '공지',
'AI를 공부하면서 알게 된 내용을 **함께 쓰고, 고치고, 토론하는** 공간입니다.

## 할 수 있는 것

| 기능 | 설명 |
|---|---|
| 글쓰기 | 로그인한 뒤 오른쪽 위 **새 글 쓰기**를 누릅니다 |
| 편집 | 로그인한 사람은 누구나 모든 문서를 고칠 수 있습니다 (위키 방식) |
| 변경 이력 | 저장할 때마다 버전이 남고, 이전 버전과 비교하거나 되돌릴 수 있습니다 |
| 댓글 | 문서 아래에 질문이나 의견을 남깁니다 |

## 작성 규칙

1. 본문은 **마크다운**으로 씁니다. 편집 화면의 *미리보기* 탭으로 결과를 확인하세요.
2. 다른 사람의 글을 고칠 때는 **수정 메모**에 무엇을 바꿨는지 적어 주세요.
3. 두 사람이 같은 문서를 동시에 고치면, 나중에 저장한 사람에게 알림이 뜹니다. 바뀐 내용을 비교한 뒤 다시 저장하면 됩니다.
4. 실수로 글을 망쳤다면 **변경 이력**에서 이전 버전을 골라 되돌리세요.

> 샘플 사이트입니다. 비밀번호는 다른 서비스와 다르게 설정해 주세요.',
1, 1, 1, datetime('now', '-7 days'), datetime('now', '-7 days'));

-- 2. LLM 기본 개념 (v1 -> v2 수정 이력 예시) -----------------------------
INSERT INTO posts (id, title, category, content, author_id, last_editor_id, version, created_at, updated_at) VALUES
(2, 'LLM 기본 개념: 토큰, 컨텍스트, 온도', '기초',
'LLM(대규모 언어 모델)을 쓸 때 꼭 알아야 하는 세 가지 개념입니다.

## 토큰 (Token)

모델은 글자를 그대로 읽지 않고 **토큰** 단위로 잘라서 처리합니다.

- 영어는 대략 단어 1개가 토큰 1~2개입니다.
- 한국어는 같은 내용이라도 영어보다 토큰이 더 많이 나오는 편입니다.
- API 요금과 길이 제한은 모두 토큰 수로 계산합니다.

## 컨텍스트 윈도우 (Context Window)

모델이 **한 번에 볼 수 있는 토큰의 최대 길이**입니다. 입력(프롬프트, 대화 기록, 첨부 문서)과 출력을 합친 길이가 이 안에 들어가야 합니다.

> 대화가 길어지면 앞부분을 요약하거나 잘라내야 하는 이유가 바로 이것입니다.

## 온도 (Temperature)

답변의 **무작위성**을 조절하는 값입니다.

| 값 | 특징 | 어울리는 작업 |
|---|---|---|
| 0 ~ 0.3 | 거의 같은 답이 나옴 | 코드, 데이터 추출, 분류 |
| 0.7 ~ 1.0 | 다양한 답이 나옴 | 아이디어, 글쓰기 |

## 더 알아볼 것

- 시스템 프롬프트와 사용자 메시지의 차이
- 프롬프트 캐싱으로 비용 줄이기',
1, 1, 2, datetime('now', '-6 days'), datetime('now', '-2 days'));

-- 3. 프롬프트 ----------------------------------------------------------
INSERT INTO posts (id, title, category, content, author_id, last_editor_id, version, created_at, updated_at) VALUES
(3, '프롬프트 잘 쓰는 법', '기초',
'같은 모델이라도 **어떻게 요청하느냐**에 따라 결과가 크게 달라집니다.

## 기본 원칙

1. **목적을 먼저 말하기**: 무엇을, 왜 하려는지 설명합니다.
2. **맥락 주기**: 독자가 누구인지, 어떤 제약이 있는지 알려 줍니다.
3. **출력 형식 지정하기**: 표, JSON, 글머리표 등 원하는 모양을 정합니다.
4. **예시 보여 주기**: 원하는 결과의 예를 1~3개 넣으면 정확도가 올라갑니다.

## 나쁜 예 vs 좋은 예

```text
나쁜 예: 이 코드 고쳐줘
```

```text
좋은 예: 아래 Python 함수가 빈 리스트를 받으면 IndexError가 납니다.
빈 리스트일 때는 None을 반환하도록 고쳐 주세요.
기존 동작은 바꾸지 말고, 바뀐 부분만 설명해 주세요.
```

## 팁

- 긴 문서는 프롬프트 **앞쪽**에, 질문은 **뒤쪽**에 두면 결과가 좋아지는 경우가 많습니다.
- 한 번에 완벽한 답을 기대하기보다 **대화로 다듬는** 편이 빠릅니다.',
1, 1, 1, datetime('now', '-5 days'), datetime('now', '-5 days'));

-- 4. 에이전트 ----------------------------------------------------------
INSERT INTO posts (id, title, category, content, author_id, last_editor_id, version, created_at, updated_at) VALUES
(4, 'AI 에이전트의 동작 원리', '에이전트',
'**에이전트**는 LLM이 스스로 도구를 골라 쓰면서 목표를 이룰 때까지 반복하는 프로그램입니다.

## 기본 루프

```text
1. 사용자 요청 + 사용 가능한 도구 목록을 모델에 보낸다
2. 모델이 답한다
   - 도구가 필요하면 → "이 도구를 이 인자로 실행해 줘" (tool_use)
   - 끝났으면 → 최종 답변
3. 프로그램이 도구를 실행하고 결과를 모델에 다시 보낸다 (tool_result)
4. 2번으로 돌아간다
```

## 핵심 구성 요소

| 구성 요소 | 역할 | 예시 |
|---|---|---|
| 모델 | 다음에 할 일을 판단 | Claude |
| 도구 | 실제 행동 | 파일 읽기, 웹 검색, API 호출 |
| 메모리 | 이전 결과 기억 | 대화 기록, 메모 파일 |
| 종료 조건 | 무한 반복 방지 | 최대 반복 횟수, 완료 판단 |

## 주의할 점

- 도구 설명(description)을 명확하게 써야 모델이 올바른 도구를 고릅니다.
- 삭제, 결제처럼 되돌릴 수 없는 작업은 **사람의 확인**을 거치게 합니다.',
1, 1, 1, datetime('now', '-4 days'), datetime('now', '-4 days'));

-- 5. Workers 배포 ------------------------------------------------------
INSERT INTO posts (id, title, category, content, author_id, last_editor_id, version, created_at, updated_at) VALUES
(5, 'Cloudflare Workers와 Wrangler로 배포하기', '배포',
'**Wrangler**는 Cloudflare Workers를 만들고 배포하는 명령줄 도구입니다.

## 순서

```bash
# 1. 로그인 (브라우저가 열림)
npx wrangler login

# 2. 내 컴퓨터에서 실행해 보기
npx wrangler dev

# 3. 배포
npx wrangler deploy
```

배포가 끝나면 `https://<이름>.<계정>.workers.dev` 주소가 생깁니다.

## wrangler.jsonc 예시

```jsonc
{
  "name": "my-site",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "./public" }
}
```

## 무료 플랜 한도

| 항목 | 무료 한도 |
|---|---|
| 요청 수 | 하루 10만 건 |
| CPU 시간 | 요청당 10ms |
| 정적 파일 요청 | 무제한 |',
1, 1, 1, datetime('now', '-3 days'), datetime('now', '-3 days'));

-- 6. D1 ----------------------------------------------------------------
INSERT INTO posts (id, title, category, content, author_id, last_editor_id, version, created_at, updated_at) VALUES
(6, 'D1으로 데이터 저장하기', '배포',
'**D1**은 Cloudflare가 제공하는 SQLite 기반 데이터베이스입니다. 이 사이트의 글, 댓글, 변경 이력이 모두 D1에 저장됩니다.

## 만들기

```bash
npx wrangler d1 create my-db
npx wrangler d1 migrations apply my-db --remote
```

## Worker에서 쓰기

```js
const { results } = await env.DB
  .prepare("SELECT id, title FROM posts WHERE category = ?")
  .bind("기초")
  .all();
```

`?` 자리에 값을 넣는 **bind**를 쓰면 SQL 인젝션을 막을 수 있습니다.

## 무료 플랜 한도

| 항목 | 무료 한도 |
|---|---|
| 저장 용량 | 5GB |
| 읽기 | 하루 500만 행 |
| 쓰기 | 하루 10만 행 |',
1, 1, 1, datetime('now', '-1 days'), datetime('now', '-1 days'));

-- 변경 이력 --------------------------------------------------------------
INSERT INTO revisions (post_id, version, title, category, content, editor_id, message, created_at)
SELECT id, 1, title, category, content, 1, '새 문서 작성', created_at FROM posts WHERE id IN (1, 3, 4, 5, 6);

-- 2번 문서의 v1 (온도 표와 더 알아볼 것이 없던 버전)
INSERT INTO revisions (post_id, version, title, category, content, editor_id, message, created_at) VALUES
(2, 1, 'LLM 기본 개념', '기초',
'LLM(대규모 언어 모델)을 쓸 때 꼭 알아야 하는 세 가지 개념입니다.

## 토큰 (Token)

모델은 글자를 그대로 읽지 않고 **토큰** 단위로 잘라서 처리합니다.

- 영어는 대략 단어 1개가 토큰 1~2개입니다.
- API 요금과 길이 제한은 모두 토큰 수로 계산합니다.

## 컨텍스트 윈도우 (Context Window)

모델이 **한 번에 볼 수 있는 토큰의 최대 길이**입니다.

## 온도 (Temperature)

답변의 무작위성을 조절하는 값입니다. 낮으면 일관되고, 높으면 다양합니다.',
1, '새 문서 작성', datetime('now', '-6 days'));

INSERT INTO revisions (post_id, version, title, category, content, editor_id, message, created_at)
SELECT id, 2, title, category, content, 1, '한국어 토큰 설명, 온도 표, 더 알아볼 것 추가', updated_at FROM posts WHERE id = 2;

-- 댓글 ------------------------------------------------------------------
INSERT INTO comments (post_id, author_id, body, created_at) VALUES
(1, 1, '궁금한 점이나 고칠 부분이 보이면 언제든 댓글로 남겨 주세요!', datetime('now', '-7 days')),
(4, 1, '도구 실행 결과를 다시 모델에게 보내는 3번 단계가 핵심입니다.
실제 코드 예시를 추가해 주실 분 계신가요?', datetime('now', '-4 days'));
