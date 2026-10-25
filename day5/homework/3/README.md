# Unity 현황 대시보드

이 노트북에서 열려 있는 Unity 프로젝트의 지금 상태를 Unity MCP와 git MCP로 읽어 한 화면에 보여줘요.
버튼으로 Claude 에이전트를 불러 출시 전 점검, 용량 다이어트, 변경 분석, 업무 쪼개기를 할 수 있어요.

**사이트는 프로젝트를 읽기만 해요.** 씬을 열거나, 설정을 바꾸거나, 파일을 쓰거나, 커밋하지 않아요. 에이전트도 제안까지만 하고 적용·커밋은 직접 해요.

```
브라우저 ── server.mjs (이 노트북) ──┬─ Unity MCP (uvx mcp-for-unity) ── Unity 에디터 (UNITY_PROJECT만)
                                    ├─ git MCP (mcp-server-git, 읽기 도구만) + git 명령 ── 로컬 저장소 (원격은 Bitbucket이어도 됨)
                                    └─ Claude API (claude-opus-5-5, effort high)
```

## 배포된 기록 웹: https://kdh-agentic-unity.web.app

노트북 서버가 읽은 현황과 에이전트 보고서를 Firestore에 쌓고, 배포된 웹은 그 기록을 보여주기만 해요.
Unity를 읽거나 에이전트를 돌리는 건 노트북 화면(http://localhost:3000)에서만 돼요.

```
노트북 3번 서버 ──(서비스 계정)──> Firestore unitySnapshots, unityReports
                                        ▲ 구글 로그인한 본인만 읽기 (firestore.rules)
                    kdh-agentic-unity.web.app (viewer.html, Firebase Hosting)
```

- 저장 시점: "새로 읽기"가 성공할 때, 에이전트가 결과를 낼 때. 화면에 "기록 저장됨"이 떠요. `serviceAccount.json`이 없으면 저장을 건너뛰어요.
- 읽기 권한: `kimdohan2@gmail.com`으로 구글 로그인했을 때만 읽혀요(`firestore.rules`, `public/firebase-config.js`의 OWNER_EMAIL).
- 같은 Firebase 프로젝트(kdh-agentic)를 1번과 함께 써요. Firestore 규칙은 프로젝트에 하나뿐이라 `1/firestore.rules`와 `3/firestore.rules`는 같은 내용이어야 해요. 한쪽을 고치면 다른 쪽도 똑같이 고쳐요.
- 배포: `npm run deploy` (hosting, firestore 규칙, 클라우드 함수). `firebase login`이 돼 있어야 해요. 노트북 전용 파일(index.html, app.js, workflow.js)은 배포에서 빠져요.

### 노트북 없이 "새로 읽기" (Bitbucket 기준)

배포된 웹의 "새로 읽기" 버튼은 클라우드 함수 `refreshFromBitbucket`(`functions/`, asia-northeast3)을 불러요.
함수는 Bitbucket 저장소 `kimdohan2/proejct_a`에 **푸시된** 내용을 읽어 `unitySnapshots`에 저장해요(`source: "bitbucket"`).

| 노트북 없이 갱신됨 | 노트북에서 읽을 때만 |
|---|---|
| 최근 커밋 10개와 바뀐 파일 종류, 버전·versionCode·빌드 번호·앱 ID·백엔드, Unity 버전, 렌더 파이프라인, 패키지, 빌드 씬 목록, 에셋 종류별 용량 | 콘솔, 마지막 빌드, 지금 빌드 타깃, 씬별 Missing Script, 커밋 안 한 변경·푸시 안 한 커밋 |

- Bitbucket 토큰은 저장소 하나만 읽는 **Repository access token**(Repositories: Read)이고, Firebase 비밀값 `BITBUCKET_TOKEN`에 들어 있어요. 바꾸려면 `npx firebase functions:secrets:set BITBUCKET_TOKEN` 후 함수를 다시 배포해요.
- 함수도 구글 로그인한 본인만 부를 수 있어요. 저장소·Unity 폴더·계정은 `functions/index.js`의 `REPO`, `OWNER_EMAIL`에 있어요.

## 화면

| 영역 | 내용 |
|---|---|
| 숫자 카드 | 콘솔 에러·경고, Missing Script 합계, 마지막 빌드 용량, 커밋 상태 |
| AOS · iOS | 버전, versionCode·빌드 번호, 백엔드, 앱 ID. 지금 빌드 타깃이면 표시 |
| 씬 | Build Settings 씬별 Missing Script와 오브젝트 수 (씬을 열지 않고 씬 파일에서 셈) |
| 에셋 구성 | Assets 아래 원본 파일을 종류별로 묶은 용량 |
| 최근 커밋 | 최근 10개 커밋과 커밋별로 바뀐 파일 종류(스크립트·씬·텍스처·문서 등, .meta는 따로) |
| 커밋 안 한 변경 | 바뀐 파일 목록, 원격과의 차이, Unity 규칙 점검(.meta 짝, 프로젝트 설정 변경, 50MB 넘는 파일, 씬 변경) |
| 콘솔 · 패키지 | 많이 나온 에러·경고 메시지, 직접 설치한 패키지 |

"새로 읽기"를 누를 때만 Unity에서 읽어요. 자동으로 다시 읽지 않아요.

## 에이전트

| 버튼 | 하는 일 | 쓰는 조회 도구 |
|---|---|---|
| 출시 전 점검 | 읽는 시점의 빌드 타깃 기준으로 통과·실패·확인 필요 체크리스트를 만들어요 | 플레이어 설정 읽기 |
| 용량 다이어트 | 큰 에셋과 임포트 설정을 보고 줄일 방법을 제안해요 | 큰 에셋 목록, 임포트 설정 읽기 |
| 변경 분석 | 최근에 한 일, 주의할 점, 커밋 전에 할 일과 커밋 메시지를 정리해요 | git_log, git_show, git_status, git_diff 계열 (읽기만) |
| 업무 쪼개기 | 업무 입력 → 쪼개기·계획 → 사용자 승인 → 실행 → 평가·HTML 프리뷰. 대시보드 현황을 함께 참고해요 | 없음 (현황만 참고) |

에이전트에게 Unity MCP 도구를 그대로 주지 않아요. 서버가 정해 둔 조회 도구만 주고, 각 도구는 `snippets/`에 있는 정해진 C#만 실행해요.

## 실행

1. `.env`를 채워요.
   - `ANTHROPIC_API_KEY`: Anthropic 콘솔에서 만든 키 (현황 읽기는 키 없이도 돼요)
   - `UNITY_PROJECT`: 읽을 Unity 프로젝트 경로. 지금은 Project_B_RayFire
   - `UNITY_MCP_COMMAND`: Unity MCP 서버 실행 명령. 프로젝트의 MCP for Unity 패키지 버전(지금 10.3.0)과 맞춰요
   - `GIT_MCP_COMMAND`: git MCP 서버 실행 명령 (기본 `uvx mcp-server-git==2026.10.19`)
2. Unity에서 그 프로젝트를 열고 Window > MCP for Unity에서 연결을 켜요.
3. 서버를 켜요.

```bash
npm install
npm start
```

4. http://localhost:3000 을 열고 "새로 읽기"를 눌러요.

## 안전장치

- `~/.unity-mcp/unity-mcp-status-*.json`에서 `UNITY_PROJECT`와 경로가 같은 에디터만 골라 연결하고, 연결한 뒤 프로젝트 경로를 한 번 더 확인해요. 다른 프로젝트(회사 프로젝트 포함)면 읽지 않고 멈춰요.
- 부르는 MCP 도구는 `set_active_instance`, `execute_code`(정해진 조회용 C#만), `read_console`(get)뿐이에요.
- 임포트 설정 조회는 `Assets/`, `Packages/`로 시작하는 경로만 받아요.
- 플레이어 설정 조회는 키스토어 비밀번호 같은 비밀 값을 읽지 않아요(설정됐는지 여부만).
- git MCP는 `--repository`로 그 저장소 안만 읽게 묶고, `git_status`·`git_log`·`git_show`·`git_diff` 계열·`git_branch`만 불러요. `git_commit`·`git_add`·`git_reset`·`git_checkout`·`git_create_branch`는 서버가 막아요. 에이전트가 넘긴 커밋 이름도 검사해요.
- fetch를 하지 않아서, 원격(Bitbucket)과의 차이는 마지막으로 fetch·push한 시점 기준이에요.
- diff는 Claude에게 넘기기 전에 줄여요: .meta는 빼고, 씬·프리팹 같은 Unity YAML은 바뀐 줄 수와 앞부분만, 큰 커밋은 일부 파일을 폴더별 개수로만 넘겨요.

## 파일

| 파일 | 하는 일 |
|---|---|
| `server.mjs` | 웹 서버와 API |
| `unity.mjs` | Unity MCP 연결, 프로젝트 확인, 조회 함수 |
| `snippets/` | Unity에서 실행하는 조회용 C# (현황, 플레이어 설정, 큰 에셋, 임포트 설정) |
| `git.mjs` | git MCP 연결(읽기 도구만), 최근 커밋·변경·Unity 규칙 점검, diff 줄이기 |
| `functions/` | 배포 웹의 "새로 읽기"용 클라우드 함수 (Bitbucket 읽기 → Firestore 저장) |
| `store.mjs` | Firestore에 현황·보고서 저장 (서비스 계정) |
| `agents.mjs` | 에이전트 지시문, 도구, 결과 형식 |
| `claude.mjs` | Claude API 호출과 도구 사용 반복 |
| `public/` | 화면. 노트북용 `index.html`·`app.js`·`workflow.js`, 배포용 `viewer.html`·`viewer.js`, 같이 쓰는 `dashboard.js`·`util.js` |
| `firebase.json`, `firestore.rules` | 배포 설정 (사이트 kdh-agentic-unity) |

## 알아둘 점

- 현황 읽기는 5~10초, 출시 전 점검과 변경 분석은 30초, 용량 다이어트는 1분 정도 걸려요. 업무 쪼개기는 몇 분 걸리고 Claude를 여러 번 불러요.
- Unity가 꺼져 있으면 현황 읽기와 점검·다이어트는 안 돼요. 변경 분석은 git만으로, 업무 쪼개기는 현황 없이 진행해요.
- 프로젝트가 git 저장소가 아니면(예: RayFire) git 섹션에 "git 저장소가 아니에요"가 나와요.
- Missing Script 수는 씬 파일 안의 스크립트 참조 중 프로젝트에 없는 것을 센 값이에요. 프리팹 안쪽은 세지 않아요.
- Play 모드 성능 측정은 에디터 상태를 바꾸기 때문에 넣지 않았어요.
