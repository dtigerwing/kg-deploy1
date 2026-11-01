# 진행 상황 (6일차 과제: 투닥 아레나)

> 마지막 갱신: 2026-11-02
> 다른 노트북에서 이어서 할 때는 이 문서를 먼저 읽으세요. Claude Code에는 "tudak-arena/PROGRESS.md 읽고 이어서 하자"라고 하면 돼요.

## 과제와 결정한 것

과제: "discord + hermes agent로 남들도 쓰고 싶은 에이전트 만들기". 별도 포트, 이름, 설명, 프로필 사진, Soul.md가 모두 있어야 해요.

- **게임**: Only One류 밀치기 웹 게임 "투닥 아레나". 사람 1명 + 봇 3명이 원형 경기장에서 부딪혀 밀어내고, 마지막 1명이 우승해요. 방향키(WASD) 이동, 스페이스 돌진, 경기장은 점점 좁아져요. 웹에서는 게임 효과음만 나요.
- **봇 3명**: 게임에서는 서버의 규칙 AI로 움직이고, 말은 Hermes 프로필(각자 Soul.md, 토큰, 목소리)이 디스코드 음성방에서 해요.
  - 코코(여, 활발, ESFJ, 추격형) / 러비(남, 시크, ISTJ, 생존형) / Rou(남, 장난꾸러기, ENFP, 막 돌진형)
  - 디스코드 이름은 2글자 이상이어야 해서 "루" 대신 "Rou"로 정했어요. 말할 때는 "루"라고 불러요.
- **심판 봇**: 4번째 디스코드 봇이고, 게임 서버 코드(`server/referee.js`)예요. 게임 사건을 보고 누구를 언제 멘션할지 정해요. Hermes 봇은 멘션받을 때만 말해요.
  - 사건별 확률(떨어진 봇·우승 100%, 충돌 25% 등), 대꾸 40% → 20% → 끝, 봇별 쿨다운 8~15초, 분당 6마디, 동시 최대 2명. 수치는 `config/referee.json`에 있어요.
  - 음성은 겹쳐도 괜찮다고 했어요(순서 장치 없음).
- **목소리**: 개발 중에는 Edge TTS(무료)를 써요. 코코 `ko-KR-SunHiNeural`, 러비 `ko-KR-InJoonNeural`, Rou `ko-KR-HyunsuMultilingualNeural`. **완성 단계에서 ElevenLabs로 바꾸기로** 했어요(비용 때문에 나중에).
- **모델**: `claude-opus-5-5`. 대답이 느리면 `config/characters.json`에서 `claude-haiku-5-5`로 바꿔요.
- **포트**: 웹 게임 3300, Hermes API 서버 8650.
- **디스코드 쪽 준비는 끝났어요**(노트북과 상관없음): 서버 "투닥-봇과함께"에 봇 4개(심판·코코·러비·Rou)를 초대했고, 메시지 콘텐츠 인텐트를 켰어요. 채널은 텍스트 `#투닥-중계`, 음성 `투닥-아레나`예요.

## 지금 상태

### 끝난 것 (2026-11-02, 처음 만든 Mac에서 테스트함)
- 웹 게임(`server/game.js`, `public/`): 카운트다운, 탈락, 우승, 점수판, 말풍선, 효과음을 브라우저에서 확인했어요.
- 봇 움직임(`server/bot-ai.js`): 시뮬레이션으로 맞췄어요. 한 판 25~30초, 우승 비율 러비 약 50%, 코코 약 25%, Rou 약 10%. Rou 탈락의 3분의 1 이상이 자멸이에요.
- 심판(`server/referee.js`): 대꾸 체인이 3마디에서 멈추는지, 이름이 언급된 친구에게 넘기는지 테스트했어요. 토큰이 없으면 터미널에만 찍혀요.
- Soul.md 원본(`bots/`), 프로필 사진(`public/img/`), 설정 스크립트(`scripts/setup-hermes.js`, 가짜 hermes로 테스트), README.

### 아직 안 된 것
- **디스코드 실제 연동을 한 번도 안 돌려 봤어요.** Hermes가 아직 설치되지 않았고 `.env`도 비어 있어요. Claude Code의 자동 보안 확인이 Hermes 설치 스크립트 실행을 막아서, 사용자가 터미널에서 직접 설치해야 해요(README 2단계).
- 실제로 확인해야 할 것:
  - 심판(봇)이 멘션하면 Hermes가 대답하는지 (`DISCORD_ALLOW_BOTS=mentions`)
  - 채팅 대답이 음성방에서 목소리로도 나오는지
  - `platform_toolsets.discord: [todo]`로 도구를 줄인 설정이 먹히는지
  - `tts.speed`, `tts.edge.speed` 키가 실제로 적용되는지
  - 봇 3개가 동시에 음성방에 있을 때 잘 되는지
  - Opus 5.5 대답 속도가 게임 템포에 맞는지

## 다음 할 일
1. 이 노트북 준비(아래 "노트북마다 할 것")
2. `hermes gateway` → 음성방 입장 → 봇 1개만 `/voice join` → 게임 한 판으로 "심판 멘션에 소리로 대답하는지" 확인
3. 봇 3개 모두 연결해서 수다 빈도 조절(`config/referee.json`)
4. 완성 단계에서 ElevenLabs로 교체(README "조절하기")

## 노트북마다 할 것
깃에는 코드만 있어요. 아래는 노트북마다 따로 해야 해요.

1. `git pull` → `cd day6/homework/tudak-arena && npm install`
2. `brew install ffmpeg opus portaudio`
3. Hermes 설치(README 2단계, 음성 추가 설치 포함)
4. `cp .env.example .env` 후 값 채우기. 키와 토큰은 채팅에 붙여넣지 말고 사용자가 직접 넣어요.
5. `npm run setup-hermes`

**봇은 한 노트북에서만 켜세요.** 두 노트북에서 동시에 `hermes gateway`나 `npm start`를 켜면 같은 봇 토큰으로 두 번 접속해서, 대답이 두 번 나오거나 서로 꼬여요.
