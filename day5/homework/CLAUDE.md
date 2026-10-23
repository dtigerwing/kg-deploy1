# 개발 일지 (5일차 과제)

- 작업을 시작하기 전에 `PROGRESS.md`를 읽고 현재 상태와 결정한 것을 파악한다.
- 의미 있는 작업을 마치면 `PROGRESS.md`의 "지금 상태"와 "다음 할 일"을 갱신하고 "마지막 갱신" 날짜를 바꾼다.
- 사용자는 Unity 클라이언트 개발자이고 한국어로 소통한다. 과제는 핵심 목표만 유지하고 기능을 함부로 덧붙이지 않는다.
- `.env`, `serviceAccount.json`은 git에 올리지 않는다.
- **회사 Unity 프로젝트(`Cocobi_BabyCare2` 등 `journal.config.json`의 `unityProject`가 아닌 프로젝트)에는 Unity MCP로 접근하지 않는다.** 읽기도 안 된다. Unity 도구를 쓰기 전에 `~/.unity-mcp/unity-mcp-status-*.json`에서 ai-agent 인스턴스를 찾아 `set_active_instance`로 먼저 고른다.
- ai-agent 인스턴스가 없으면(MCP가 꺼져 있으면) 다른 인스턴스로 진행하지 말고, 사용자에게 ai-agent 에디터에서 MCP for Unity 연결을 켜 달라고 요청한다.
