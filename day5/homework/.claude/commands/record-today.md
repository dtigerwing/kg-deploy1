---
description: 오늘 개발 일지 기록 (커밋 + 빌드 용량 + 콘솔 경고 + 씬 성능 → Claude 분석 → Firestore)
---

Unity MCP로 오늘의 빌드 용량, 콘솔 경고, 씬 성능을 모으고, 기록 스크립트로 Claude 분석을 붙여 Firestore에 저장한다.
설정은 `journal.config.json`(unityProject, scenes, sampleSeconds)을 읽는다. 중간 파일은 `journal-tmp/`에 쓴다.
$ARGUMENTS 에 날짜(YYYY-MM-DD)가 있으면 그 날짜로 기록한다. 없으면 오늘이다.

Unity에서 실행할 C# 코드는 `unity-snippets/`에 있다. 파일을 읽어 자리표시자를 바꾼 뒤 `execute_code`로 실행한다.
- `OUT_DIR`: 이 폴더의 `journal-tmp/` 절대 경로 (끝에 `/` 포함)
- `RECORD_DATE`: 기록 날짜 (YYYY-MM-DD)
- `execute_code`는 C# 6(codedom)으로 컴파일된다. 코드를 고칠 때 `out var` 같은 최신 문법은 쓰지 않는다.

## 1. Unity 연결 확인
**회사 프로젝트(`Cocobi_BabyCare2` 등 `unityProject`가 아닌 모든 Unity 프로젝트)에는 접근하지 않는다.** 읽기만 하는 `execute_code`도 안 된다. MCP는 기본으로 먼저 켜진 에디터에 붙기 때문에, 인스턴스를 고르기 전에는 Unity 도구를 하나도 부르지 않는다.
- 먼저 Bash로 `~/.unity-mcp/unity-mcp-status-*.json`을 읽어 `project_path`가 `unityProject` + `/Assets`인 파일을 찾는다. 해시는 파일 이름 끝이다.
- 그런 파일이 없으면 ai-agent 에디터의 MCP가 꺼져 있는 것이다. "ai-agent Unity 에디터에서 Window > MCP for Unity를 열고 연결해 주세요"라고 요청하고 멈춘다. 다른 인스턴스로 대신 진행하지 않는다.
- 찾았으면 `set_active_instance`로 `프로젝트이름@해시`를 고른다. 실패해도 위와 같이 연결을 요청하고 멈춘다.
- 그다음 `execute_code`로 프로젝트 경로(`Application.dataPath`의 상위 폴더), 현재 씬 경로, `isDirty`, `EditorApplication.isPlaying`, Build Settings에서 켜진 씬 목록을 읽는다. 프로젝트 경로가 `unityProject`와 다르면 즉시 멈추고 사용자에게 알린다.
- 이전 실행의 `journal-tmp/*.json`은 `journal-tmp/old/`로 옮긴다. 오늘 만들지 않은 파일이 섞이지 않게 하기 위해서다.
- Play 모드라면 먼저 멈춘다. 저장하지 않은 씬이 있으면 사용자에게 저장할지 묻는다.

## 2. 빌드 용량 (오늘 빌드한 경우만)
`unity-snippets/build-report.cs` 를 실행한다. `journal-tmp/build.json`(에셋별 용량)과 `journal-tmp/imports.json`(용량 큰 에셋 40개의 임포트 설정)이 생긴다.
- `no build report` 나 `not today` 가 나오면 빌드 용량은 건너뛴다.

## 3. 콘솔 경고 (Play 모드에 들어가기 전에)
`unity-snippets/warnings.cs` 를 실행한다. `journal-tmp/warnings.json` 이 생긴다.
- 콘솔 경고·에러를 같은 메시지끼리 묶고, Build Settings 씬마다 빠진 스크립트(Missing Script)를 센다.
- Play 모드에 들어가면 콘솔이 지워질 수 있으니 4단계보다 먼저 한다.

## 4. 씬 성능
- 측정할 씬: `journal.config.json`의 `scenes`. 비어 있으면 Build Settings에서 켜진 씬 전부.
- MCP로 프레임을 1초마다 읽지 않는다. Claude에 명령하는 동안 Unity가 비활성이 되어 Play 모드가 거의 멈추기 때문이다(프레임 100~200ms, 드로우콜 0). 대신 `unity-snippets/perf.cs` 측정기를 Unity 안에 건다. 측정기는 Unity가 활성일 때만 2초 준비하고 `sampleSeconds` 동안 매 프레임 잰 뒤, 파일을 쓰고 Play 모드를 스스로 멈춘다.
- 시작 전에 사용자에게 "Unity 창을 클릭해서 측정이 끝날 때까지 그대로 두세요"라고 알린다. 씬이 여러 개여도 Unity 창을 계속 앞에 두면 한 번에 끝난다.
- 씬마다:
  1. `manage_scene` load 로 씬을 연다. 이미 열려 있으면 건너뛴다.
  2. `manage_editor` 로 Play 모드에 들어간다.
  3. `perf.cs`의 `OUT_DIR`, `SAMPLE_SECONDS`(`journal.config.json`의 `sampleSeconds`)를 바꿔 `execute_code`로 실행한다. Play 모드에 들어간 **뒤에** 실행해야 한다. 그 전에 걸면 도메인 리로드로 측정기가 사라진다. `Unity is reloading` 이 나오면 몇 초 뒤 다시 실행한다.
  4. `journal-tmp/perf-<씬이름>.json` 이 생길 때까지 기다린다. Bash를 `run_in_background`로 실행하고 `until [ -f 파일 ]; do sleep 1; done` 으로 기다리면 된다. 측정기는 2분 안에 못 재면 `error`를 쓰고 멈춘다.
  5. `execute_code`로 `EditorApplication.isPlaying`이 false이고 `Application.runInBackground`가 false인지 확인한다.
- 씬별 파일에서 `error`가 없는 것만 모아 `{ "scenes": [{ "name", "frameMs", "drawCalls" }] }` 형태로 `journal-tmp/perf.json` 에 저장한다.
- `medianMs`가 `frameMs`와 크게 다르거나 `dropped`가 많으면 측정이 흔들린 것이다. 이때는 그 씬을 다시 잴지 사용자에게 묻는다.
- 측정이 실패한 씬은 빼고, 어떤 씬이 왜 빠졌는지 마지막에 알려 준다.
- 다 끝나면 처음에 열려 있던 씬을 다시 연다.

## 5. 저장
```bash
npm run record --silent -- [--date 날짜] [--build journal-tmp/build.json --imports journal-tmp/imports.json] [--warnings journal-tmp/warnings.json] [--perf journal-tmp/perf.json]
```
- 만들어진 파일만 옵션으로 넘긴다. 커밋은 스크립트가 unityProject 의 git 에서 직접 읽는다.
- 스크립트는 빌드 분석·경고 분석 에이전트를 동시에 돌리고, 그 결과를 반영해 오늘 요약을 쓴다. 30초 안팎 걸린다.
- Firebase를 아직 설정하지 않았으면 `--dry-run` 을 붙여 결과만 확인한다.

## 6. 보고
스크립트가 출력한 오늘 요약, 분석에서 나온 가장 중요한 제안 한두 개, 건너뛴 항목(빌드 없음, 측정 실패한 씬)을 짧게 알려 준다.
