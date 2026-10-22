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
- `execute_code`로 현재 씬 경로, `isDirty`, `EditorApplication.isPlaying`, Build Settings에서 켜진 씬 목록을 읽는다. 연결이 안 되면 "Unity 에디터를 열어 주세요"라고 말하고 멈춘다.
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
- 씬마다:
  1. `manage_scene` load 로 씬을 연다.
  2. `manage_editor` 로 Play 모드에 들어가고 6초 기다린다. Play 모드에 들어갈 때 도메인 리로드가 있어서, 그 전에 읽으면 `Unity is reloading` 이 나온다. 그러면 몇 초 더 기다렸다 다시 읽는다.
  3. `sampleSeconds` 동안 1초 간격으로 읽는다.
     - 프레임 시간: `manage_profiler` `get_frame_timing` 의 `cpu_frame_time_ms`
     - 드로우콜: `manage_profiler` `get_counters` (category `Render`, counters `["Draw Calls Count"]`). counters를 빼면 결과가 수천 개라 꼭 지정한다.
  4. Play 모드를 멈춘다.
  5. 평균 프레임 시간(ms)과 평균 드로우콜을 구한다. 이름은 씬 파일 이름(확장자 없이)으로 쓴다.
- 결과를 `{ "scenes": [{ "name", "frameMs", "drawCalls" }] }` 형태로 `journal-tmp/perf.json` 에 저장한다.
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
