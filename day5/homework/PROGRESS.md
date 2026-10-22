# 진행 상황 (5일차 과제: 개발 일지)

> 마지막 갱신: 2026-10-22
> 다른 노트북에서 이어서 할 때는 이 문서를 먼저 읽으세요. Claude Code에는 "PROGRESS.md 읽고 이어서 하자"라고 하면 돼요.

## 과제와 결정한 것

과제는 세 단계예요. 1) 업무 프로그램의 MCP를 Claude에 연결해 쓰기, 2) MCP로 데이터가 쌓이는 웹을 만들어 Firebase로 배포하기, 3) Claude API 키로 동작하는 기능 넣기.

- **주제: Unity "개발 일지" 웹.** 하루마다 커밋, 빌드 용량, 콘솔 경고, 씬 성능을 Unity MCP로 모으고, Claude 분석 에이전트가 분석과 요약을 써서 Firestore에 쌓아요. 웹은 날짜별로 보여줘요.
- 화면은 사용자가 고른 목업 그대로예요. 왼쪽에 날짜 목록, 오른쪽에 Claude 요약, 숫자 카드 3개, Claude 분석, 커진 에셋, 씬별 성능, 커밋이 있어요.
- 검토하고 고르지 않은 안: 에러 로그 보드(콘솔과 겹침), 수정 요청함, 해상도 리뷰 보드, 리소스 전달함.
- **나중에 하기로 한 것:** 게임 프로젝트에 Firebase SDK를 붙여 웹 → 게임 공지, 게임 → 웹 플레이 기록, 푸시 알림. 개발 일지를 먼저 마무리하기로 했어요.

## 지금 상태

### 끝난 것 (실제 Unity 프로젝트로 테스트함)
- 웹 화면 (`public/`). `firebase-config.js`가 비어 있으면 예시 데이터를 보여줘요. 휴대폰 화면도 확인했어요.
- `/record-today` 절차와 Unity C# 코드 (`.claude/commands/record-today.md`, `unity-snippets/`)
  - 빌드 리포트에서 에셋별 용량과 용량 큰 에셋 40개의 임포트 설정 읽기
  - 콘솔 경고 묶기, 씬별 Missing Script 세기
  - 씬마다 Play 모드로 프레임 시간과 드로우콜 재기
- 기록 스크립트 (`scripts/journal.mjs`): git 커밋 읽기, 이전 기록과 비교, Claude 분석, 요약 쓰기, Firestore 저장
- 분석 에이전트 2개 (`scripts/agents.mjs`): 빌드 분석, 경고 분석. 동시에 돌고 결과를 JSON으로 돌려줘요. 요약은 이 결과를 반영해요.
- 비교 로직 (`scripts/compare.mjs`): 가짜 이전 기록으로 빌드 증감과 성능 하락 판정을 테스트했어요.
- 모델은 `claude-opus-5-5`, effort `low`이고, 거절 시 다른 모델로 넘기는 fallback을 켜 뒀어요. 기록 한 번에 Claude 호출 3번, 20초 안팎 걸려요.

### 아직 안 된 것
- **Firebase 설정 진행 중.** 그래서 Firestore 저장과 배포(`npm run deploy`)를 아직 못 했어요. 지금은 `--dry-run`으로만 확인했어요. 아래 체크리스트를 따라 하고 있어요.
- 이전 기록과의 비교("+X MB", "하락")는 Firestore에 기록이 이틀 이상 쌓여야 실제 화면에서 확인할 수 있어요.

### Firebase 설정 체크리스트 (진행 중)
새 Firebase 프로젝트를 만들기로 했어요. 1~2단계는 안내를 받았고, 실제로 끝났는지는 아직 확인 전이에요. 프로젝트 ID도 아직 기록하지 않았어요.

- [ ] **1단계: 프로젝트 만들기** ([Firebase 콘솔](https://console.firebase.google.com))
  - 개인 Google 계정 추천. 프로젝트 이름 예: `dev-journal-kdh`
  - 프로젝트 ID가 웹 주소(`프로젝트ID.web.app`)가 되고, 만든 뒤에는 바꿀 수 없어요.
  - Gemini 옵션은 상관없음, Google 애널리틱스는 사용 안 함, 요금제는 Spark(무료) 그대로
  - 프로젝트 ID: `(아직 기록 안 함)`
- [ ] **2단계: Firestore 데이터베이스 만들기** (빌드 > Firestore Database > 데이터베이스 만들기)
  - Standard 에디션, 데이터베이스 ID는 `(default)` 그대로
  - 위치는 `asia-northeast3 (서울)`. 나중에 못 바꿔요.
  - 보안 규칙은 프로덕션 모드. 배포할 때 `firestore.rules`(읽기만 허용)로 바뀌어요.
- [ ] **3단계: 웹 앱 등록** (프로젝트 설정 > 내 앱 > 웹 `</>`)
  - 나오는 설정 값(apiKey, authDomain, projectId, appId)을 `public/firebase-config.js`에 넣기
- [ ] **4단계: 서비스 계정 키** (프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성)
  - 받은 파일을 `day5/homework/serviceAccount.json`으로 저장. git에는 안 올라가요. 노트북마다 따로 받아야 해요.
- [ ] **5단계: CLI 로그인과 프로젝트 연결** (`day5/homework`에서)
  - `npx firebase login`
  - `npx firebase use --add` 로 프로젝트 고르기 (`.firebaserc`가 생겨요)
- [ ] **6단계: 첫 기록 저장** — `/record-today` 또는 모아 둔 `journal-tmp/`로 `npm run record` (`--dry-run` 없이)
- [ ] **7단계: 배포** — `npm run deploy` 후 `프로젝트ID.web.app` 확인

## 테스트한 Unity 프로젝트에서 알게 된 것

- 프로젝트: `Project_B_RayFire` (Unity 6000.3.18f1, URP, 빌드 대상 macOS). Build Settings 씬은 StageSelect, Stage01~05예요.
- **git 저장소가 아니라서** 커밋이 기록되지 않아요. `git init`을 하면 다음 기록부터 커밋이 남아요.
- 테스트 빌드는 118.2MB였어요. 그중 에셋은 9.2MB뿐이고 나머지는 엔진·런타임이에요.
- **Stage01~05에 Missing Script가 2,568개 있어요.** 빌드 경고 2,568개와 같은 수예요. Assets 아래 C# 파일이 4개뿐이라 원래 게임 스크립트(RayFire 포함)가 프로젝트에 없는 것으로 보여요.
- 씬 성능은 에디터 기준 프레임 3.0~4.9ms, 드로우콜 6~8이에요. 씬이 단순해서(렌더러 38개 정도) 드로우콜이 적은 게 맞아요.

## 다른 노트북에서 이어서 하기

git에는 코드와 문서만 올라가요. 아래 파일은 노트북마다 따로 준비해야 해요.

| 파일 | 왜 따로 준비하나 | 준비 방법 |
|---|---|---|
| `.env` | API 키라 git에 안 올려요 | `.env.example`을 복사해 `ANTHROPIC_API_KEY` 입력 |
| `serviceAccount.json` | Firebase 비밀 키라 git에 안 올려요 | Firebase 콘솔 > 프로젝트 설정 > 서비스 계정에서 새로 받기 |
| `journal.config.json`의 `unityProject` | 노트북마다 Unity 프로젝트 경로가 달라요 | 그 노트북의 경로로 바꾸기 |
| `journal-tmp/` | 그날 수집한 중간 파일이라 git에 안 올려요 | `/record-today`를 다시 실행하면 생겨요 |
| `node_modules/` | 설치 파일 | `npm install` |

순서:
1. `git pull`
2. `cd day5/homework && npm install`
3. `.env` 만들기, `journal.config.json`의 `unityProject` 고치기
4. Unity에 MCP for Unity 패키지를 설치하고, Claude Code에 `unityMCP` 서버가 연결됐는지 확인하기
5. Unity 프로젝트를 열고 Claude Code에서 `/record-today` 실행. Firebase 설정 전이면 저장 단계에서 `--dry-run`을 붙이기
6. 로컬 화면 보기: `python3 -m http.server 5173 --directory public`

## 다음 할 일

1. 위 "Firebase 설정 체크리스트" 1~5단계 마치기
2. 첫 기록 저장: `/record-today` (또는 이미 모아 둔 `journal-tmp/`로 `npm run record`)
3. `npm run deploy`로 배포하고 `xxx.web.app` 확인하기
4. 다음 날 한 번 더 기록해서 비교 화면 확인하기
5. (선택) Unity 프로젝트 `git init`, 성능 분석·코드 리뷰 에이전트 추가, 게임 Firebase 연동
