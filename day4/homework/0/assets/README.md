# 이미지 넣는 곳

없어도 사이트는 돌아갑니다. 넣으면 그다음 생성부터 바로 쓰입니다.

| 폴더 | 파일 | 용도 |
|---|---|---|
| `characters/` | `russo.png`, `lobi.png`, `coco.png`, `bell.png`, `jackjack.png`, `elon.png` | 루소와 흉내 배우 참고 그림 (글씨를 잘라낸 사본, 받은 원본은 `characters/original/`). 목각인형·루소 포즈를 그릴 때 함께 보냄. 배포에는 `.png` 만 올라감 |
| `style/` | 아무 이름 `.png` / `.jpg` 2장까지 | 키글 그림체 참고 이미지 |
| `russo/` | `basic.png`, `think.png`, `happy.png`, `sweat.png`, `making.png` | 루소 포즈 5장 (기본 / 고민 / 기쁨 / 땀방울 / 만들기). `node scripts/make-russo.mjs` 로 생성. png 만, 없으면 임시 그림 |

characters, style 은 `.jpg`, `.webp` 도 됩니다.
