# 프로젝트 현황

Unity 프로젝트의 현황을 날짜별로 쌓는 웹이에요. 퇴근 전에 Claude Code에서 `/record-today` 를 실행하면
AOS·iOS 버전 정보, 커밋 상태, 빌드 용량, 콘솔 경고, 씬 성능을 모아 Claude 분석 에이전트들이 최적화 제안과 요약을 쓴 뒤 Firestore에 저장해요.
웹(`xxx.web.app`)은 그 기록을 날짜별로 보여줘요. 지금 진행 상황은 [PROGRESS.md](PROGRESS.md)에 있어요.

```
Unity 에디터 ──(Unity MCP)──> 버전·플레이어 설정, 빌드 리포트 + 임포트 설정, 콘솔 경고 + Missing Script, 씬 성능
Unity 프로젝트 git ─────────> 오늘 커밋, 커밋 안 한 파일, 푸시 안 한 커밋
          └─> scripts/journal.mjs
                ├─ 빌드 분석 에이전트 ─┐  (동시에 실행)
                ├─ 설정 분석 에이전트 ─┤
                ├─ 경고 분석 에이전트 ─┤
                └──────────────────────┴─> 요약 ─> Firestore days/{날짜} ─> 웹 (Firebase Hosting)
```

## 과제 항목

| 과제 | 이 프로젝트에서 |
|---|---|
| 1단계 MCP 연결 | Unity MCP로 버전·플레이어 설정, 빌드 리포트·임포트 설정 읽기, 콘솔 경고와 Missing Script 세기, Play 모드 성능 측정 (`.claude/commands/record-today.md`, `unity-snippets/`) |
| 2단계 데이터가 쌓이는 웹 + Firebase 배포 | Firestore `days`, `weeks` 컬렉션 + Firebase Hosting (`public/`) |
| 추가 Claude API 기능 | 빌드 용량·설정·콘솔 경고 분석 에이전트(최적화 제안), 현황 요약, 주간 보고 작성 (`scripts/agents.mjs`, `scripts/journal.mjs`) |

## 처음 설정

1. 패키지 설치: `npm install`
2. `.env` 에 `ANTHROPIC_API_KEY` 넣기 (`.env.example` 참고)
3. `journal.config.json` 의 `unityProject` 에 Unity 프로젝트 경로 넣기. `scenes` 를 비워 두면 Build Settings의 씬을 전부 측정해요.
4. Firebase
   1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 만들고 Firestore 데이터베이스를 만들어요.
   2. 프로젝트 설정 > 내 앱 > 웹 앱을 추가하고, 나온 값을 `public/firebase-config.js` 에 넣어요.
   3. 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성으로 받은 파일을 `serviceAccount.json` 이름으로 이 폴더에 둬요. git에는 올라가지 않아요.
   4. `npx firebase login` 후 `npx firebase use --add` 로 프로젝트를 골라요.
5. 배포: `npm run deploy`

## 매일 쓰기

- 퇴근 전: Claude Code에서 `/record-today` (Unity 에디터가 켜져 있어야 해요)
- 금요일: `/weekly-report`
- 로컬에서 화면 보기: `python3 -m http.server 5173 --directory public`
- Firestore에 저장하지 않고 결과만 보기: `npm run record -- --dry-run`

## 파일 구성

| 경로 | 하는 일 |
|---|---|
| `.claude/commands/record-today.md` | `/record-today` 절차 (Unity MCP로 수집 → 저장) |
| `.claude/commands/weekly-report.md` | `/weekly-report` 절차 |
| `unity-snippets/` | Unity `execute_code`로 실행하는 C# (버전·설정, 빌드 리포트, 콘솔 경고, 성능 측정) |
| `scripts/journal.mjs` | 기록·주간 보고 스크립트 (git 커밋·커밋 상태 읽기, Firestore 저장) |
| `scripts/compare.mjs` | 이전 기록과 비교 (빌드 증감, 성능 하락) |
| `scripts/agents.mjs` | 빌드 분석·설정 분석·경고 분석 에이전트 |
| `scripts/claude.mjs` | Claude API 호출 |
| `public/` | 웹 화면. `firebase-config.js`가 비어 있거나 주소에 `?sample`을 붙이면 `sample-data.js`를 보여줘요 |
| `journal-tmp/` | 수집한 중간 파일 (git에 안 올라가요) |

## 판정 기준

- 빌드 용량: 같은 플랫폼(Android/iOS)으로 가장 최근에 빌드를 기록한 날과 비교해요. 에셋별로 커진 것 10개를 보여줘요.
- 씬 성능: 최근 7일 기록의 평균 프레임 시간보다 10% 넘게 느려지면 "하락"이에요. 에디터에서 잰 값이라 실기기와 다르니 추이 비교용으로 보세요.
- 비교 로직은 `scripts/compare.mjs`에 따로 있어서 Firebase 없이도 테스트할 수 있어요.

## 알아둘 점

- 커밋은 Unity 프로젝트의 git에서 읽어요. git 저장소가 아니면 커밋 없이 기록돼요.
- 커밋 상태(커밋 안 한 파일, 푸시 안 한 커밋)는 기록하는 순간의 값이에요. 원격 브랜치가 없으면 푸시 여부는 "원격 브랜치 없음"으로 보여요.
- 버전은 기록하는 날의 Player Settings 값이에요. 그날 빌드했으면 그 빌드의 버전으로도 저장해요. 화면의 "마지막 빌드"는 그 플랫폼으로 마지막에 빌드한 기록이에요.
- 빌드 용량은 `Library/LastBuild.buildreport`에서 읽어요. 기록하는 날 빌드를 안 했으면 건너뛰어요.
- 성능 측정은 씬마다 Play 모드를 켜서 재기 때문에, 씬 6개 기준 2~3분 걸려요. 측정이 끝나면 원래 열려 있던 씬으로 돌아가요.
- 프레임 시간은 `get_frame_timing`의 `cpu_frame_time_ms`, 드로우콜은 Render 카운터의 `Draw Calls Count`예요.
