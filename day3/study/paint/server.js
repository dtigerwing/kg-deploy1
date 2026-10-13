const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const express = require('express');
const multer = require('multer');
const { OpenAI, APIUserAbortError, toFile } = require('openai');
const { findJob, pickEra, pickFate, publicJobs } = require('./joseon');

const ENV_PATH = path.join(__dirname, '.env');

// .env 는 요청마다 다시 읽는다. 서버를 켠 뒤에 키를 넣어도 재시작 없이 바로 쓸 수 있게.
// 셸에서 export 한 값이 있으면 그쪽이 우선 (dotenv 와 같은 규칙).
function env(name, fallback = '') {
  let fileEnv = {};
  try {
    fileEnv = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
  } catch {}
  return (process.env[name] || fileEnv[name] || fallback).trim();
}

const config = () => ({
  apiKey: env('OPENAI_API_KEY'),
  imageModel: env('IMAGE_MODEL', 'gpt-image-2.5-sunburst'),
  textModel: env('TEXT_MODEL', 'gpt-5.6-terra'),
  imageQuality: env('IMAGE_QUALITY', 'medium'),
  // 썸네일은 한글 글자가 또렷해야 해서 한 단계 높게 그린다.
  thumbQuality: env('THUMB_QUALITY', 'high'),
});

let cachedClient = null;
function getClient(apiKey) {
  if (!apiKey) {
    const err = new Error('.env 파일의 OPENAI_API_KEY= 뒤에 API 키를 넣고 저장해 주세요.');
    err.status = 400;
    throw err;
  }
  if (cachedClient?.apiKey !== apiKey) {
    // 이미지 편집은 1분 넘게 걸리기도 해서 타임아웃을 넉넉히 둔다.
    cachedClient = new OpenAI({ apiKey, timeout: 5 * 60 * 1000, maxRetries: 1 });
  }
  return cachedClient;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpeg|webp)$/.test(file.mimetype)),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function requireImage(req) {
  if (!req.file) throw badRequest('PNG, JPG, WEBP 사진을 올려주세요.');
  return req.file;
}

function requireJob(req) {
  const job = findJob(req.body.job);
  if (!job) throw badRequest('알 수 없는 직업이에요. 직업을 다시 뽑아 주세요.');
  return job;
}

// 입력 비율에 맞춰 약 1MP 크기를 고른다. (16의 배수, 비율 1:3 ~ 3:1)
function sizeFor(width, height) {
  const ratio = Math.min(3, Math.max(1 / 3, width / height || 1));
  const pixels = 1024 * 1024;
  const round16 = (n) => Math.round(n / 16) * 16;
  return `${round16(Math.sqrt(pixels * ratio))}x${round16(Math.sqrt(pixels / ratio))}`;
}

async function editImage(file, { prompt, size, quality }, signal) {
  const { apiKey, imageModel } = config();
  const result = await getClient(apiKey).images.edit({
    model: imageModel,
    image: await toFile(file.buffer, file.originalname || 'image.png', { type: file.mimetype }),
    prompt,
    size,
    quality,
    output_format: 'png',
  }, { signal });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('이미지 모델이 그림을 돌려주지 않았어요.');
  return `data:image/png;base64,${b64}`;
}

// ---------------------------------------------------------------------------
// 1) 그림판 + 조선 직업 옷 입히기 — images.edit
// ---------------------------------------------------------------------------

const paintPrompt = (job) => `Redraw this photo as a clumsy doodle that an amateur made in classic MS Paint (Windows 그림판) with a computer mouse in a few minutes, and turn the main person into a character from Korea's Joseon dynasty (1392-1897) whose job is: ${job.en}.

Joseon costume and props (period-accurate): ${job.costume}.
Background: a very simple suggestion of ${job.scene} — a few big flat color areas and scribbled shapes; leaving lots of white canvas is fine.

Keep from the photo, so friends can still tell who it is: the main person's face shape, hairline, expression (smile, etc.), glasses if any, skin tone, and roughly the same pose and position in the frame. Hair may change to a Joseon style or be hidden under the hat.
Change: clothes, headwear, props and background to the Joseon look above. If there are several people, dress all of them in plain Joseon clothes, and make the most central person the ${job.en}.

It must look crude and funny, NOT like a polished illustration, webtoon, anime, or vector art:
- Shaky, wobbly mouse strokes with jagged, aliased pixel edges (no anti-aliasing); thick 3-5 px black outlines that overshoot and often don't quite close.
- Simple face: basic outline, dot or short-line eyes, a simple curved mouth, glasses as two wobbly circles — few details, but still recognizable.
- Only flat paint-bucket fills from the classic 28-color Paint palette; fills leak through gaps or leave little white specks.
- No gradients, shading, highlights, texture or fine detail. Slightly wrong proportions (a bit big head, mitten-like hands).
- The whole picture looks like a small low-resolution Paint canvas zoomed in: visible chunky pixel stair-steps on every edge and curve.

Avoid: any text, letters, hanja, hangul, signatures, watermarks, Paint window UI, toolbars, or mouse cursor.`;

async function paint(file, job, width, height, signal) {
  const { imageQuality } = config();
  return editImage(file, { prompt: paintPrompt(job), size: sizeFor(width, height), quality: imageQuality }, signal);
}

// ---------------------------------------------------------------------------
// 2) 이름 + 일대기 — Responses API (이미지 입력 + structured output)
// ---------------------------------------------------------------------------

const storyInstructions = (job, era, fate) => `너는 조선왕조실록과 야담에 밝은 이야기꾼이다. 사진 속 인물이 조선시대에 '${job.name}'(으)로 태어났다면 어떤 삶을 살았을지, 가상의 일대기를 쓴다.

[뽑힌 설정 — 반드시 따른다]
- 직업: ${job.name}${job.hanja ? `(${job.hanja})` : ''} — ${job.desc}
- 시대: ${era.label} (${era.years}). 이 시대의 실제 사건: ${era.events}
- 운명의 결: ${fate.label} — ${fate.guide}

[주인공]
- 사진에서 가장 중심이 되는 한 사람이 주인공이다. 사람이 없으면 가장 눈에 띄는 동물이나 사물을 의인화한다.
- 사진에서 보이는 인상(표정, 눈빛, 머리 모양, 안경, 자세, 분위기)을 성격과 행색 묘사에 녹인다. 외모를 깎아내리거나 평가하지 말고, 실제로 누구인지 추측하거나 밝히지 않는다.
- 직업이 사진 속 인물과 어울리지 않아 보여도 직업은 바꾸지 않는다. 남장 여인, 여장한 남사당, 신분을 숨긴 사람처럼 조선의 실제 풍속이나 고전소설 같은 설정으로 재미있게 엮되, 인물을 조롱하지 않는다.
- 기생·주모 같은 직업은 예인·생활인으로서의 삶에 초점을 두고 선정적으로 쓰지 않는다.

[이름]
- 신분과 직업에 걸맞은 조선식 이름. 천민·노비·광대·장사치는 '막동, 돌쇠, 개똥, 끝순, 언년'처럼 순우리말 아명이나 천한 이름, 양반·중인은 한자 이름(어울리면 호도), 기생은 '홍랑, 매창, 초월'처럼 기명. 실존 인물의 이름은 쓰지 않는다.
- hanja: 한자 이름이면 한자, 순우리말 이름이면 빈 문자열.
- name_story: 이름에 얽힌 사연이나 뜻을 한 문장으로.

[역사의 한 장면 — 가장 중요]
- 위 시대의 실제 사건 하나를 골라 주인공이 그 현장에 있거나 휘말리게 한다.
- 연도, 장소, 실존 인물과 그들의 행적 같은 역사 사실은 정확하게 쓰고, 주인공의 행적만 지어낸다. 실제 역사의 결과를 바꾸지 않는다. 판타지여도 큰 사건의 뒤편에서 일어난 일로 쓴다.
- 확실하지 않은 세부(정확한 궁궐·전각 이름, 날짜)는 지어내지 말고 "한양 궁궐", "그해 여름"처럼 넓게 쓴다.
- 그 장면은 눈앞에 보이듯 구체적으로: 날씨, 소리, 냄새, 누군가의 대사 한 마디.
- scene: "1636년 겨울, 남한산성"처럼 연도와 사건(또는 장소)을 짧게.

[글]
- chapters 는 정확히 4개: ① 태어남과 어린 시절 ② ${job.name}이(가) 되기까지와 그 나날 ③ 역사의 그 장면 ④ 최후 또는 말년.
- 각 chapter 의 title 은 짧고 멋지게(예: "운종가의 어린 줄꾼"), text 는 3~5문장.
- 문체는 담백한 이야기체(~했다). 운명의 결에 맞는 톤으로. 처형·전사 같은 잔혹한 장면은 결과만 담담하게 쓰고 자세히 그리지 않는다.
- 조선에 없던 물건과 개념은 쓰지 않는다. 판타지 요소는 조선 설화 속 존재만.
- epithet: 세상이 이 사람을 부르던 별호나 별명, 12자 이내.
- lifespan: "1572 ~ 1637"처럼 생몰년. 시대와 사건에 맞게.
- hometown: 태어난 고장(예: "한양 운종가", "전라도 남원").
- appearance: 사진 속 인상과 ${job.name}의 행색을 섞은 묘사 한두 문장. 함께 나가는 그림에는 이 차림으로 그려지니 옷 색과 소품을 맞춘다: ${job.costume}

[한 줄 — 썸네일에 들어간다]
- one_line_label: 이 인생에서 가장 강렬한 것. 큰일을 해냈으면 "업적", 죽음의 원인이 인상적이면 "사인", 끝 모습이 인상적이면 "최후".
- one_line: 그 내용을 18자 이내 한 줄로. 쉼표·따옴표 없이 뾰족하고 기억에 남게(예: "임금을 웃기다 웃음을 잃음", "남한산성의 마지막 북소리").`;

const STORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'hanja', 'name_story', 'epithet', 'lifespan', 'hometown', 'appearance', 'scene', 'chapters', 'one_line_label', 'one_line'],
  properties: {
    name: { type: 'string', description: '한글 이름' },
    hanja: { type: 'string', description: '한자 이름. 없으면 빈 문자열' },
    name_story: { type: 'string', description: '이름에 얽힌 사연 한 문장' },
    epithet: { type: 'string', description: '별호/별명, 12자 이내' },
    lifespan: { type: 'string', description: '생몰년, 예: 1572 ~ 1637' },
    hometown: { type: 'string', description: '태어난 고장' },
    appearance: { type: 'string', description: '행색 묘사 한두 문장' },
    scene: { type: 'string', description: '엮은 역사 장면, 예: 1636년 겨울, 남한산성' },
    chapters: {
      type: 'array',
      description: '정확히 4개',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'text'],
        properties: {
          title: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
    one_line_label: { type: 'string', enum: ['업적', '사인', '최후'] },
    one_line: { type: 'string', description: '썸네일용 한 줄, 18자 이내' },
  },
};

async function story(file, job, signal) {
  const { apiKey, textModel } = config();
  const era = pickEra(job);
  const fate = pickFate();
  const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const response = await getClient(apiKey).responses.create({
    model: textModel,
    instructions: storyInstructions(job, era, fate),
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `이 사진 속 인물이 조선시대 ${job.name}(으)로 태어났다면? 이름을 지어 주고 일대기를 써 줘.` },
          { type: 'input_image', image_url: dataUrl, detail: 'auto' },
        ],
      },
    ],
    text: { format: { type: 'json_schema', name: 'joseon_life', strict: true, schema: STORY_SCHEMA } },
  }, { signal });
  const life = JSON.parse(response.output_text);
  return { ...life, era: { label: era.label, years: era.years }, fate: { id: fate.id, label: fate.label } };
}

// ---------------------------------------------------------------------------
// 3) 공유용 썸네일 — 그림판 그림 + 이름 + 한 줄을 images.edit 로 합성
// ---------------------------------------------------------------------------

const THUMB_SIZE = '1360x768'; // 16:9
const LABELS = ['업적', '사인', '최후'];

// 프롬프트에 그대로 들어가니 따옴표·줄바꿈을 걷어내고 길이를 자른다.
const clean = (value, max) => String(value || '').replace(/["“”'‘’\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const spell = (text) => [...text].filter((ch) => ch !== ' ').join(' / ');

function thumbFields(body) {
  const fields = {
    name: clean(body.name, 12),
    job: clean(body.jobName, 12),
    label: LABELS.includes(body.label) ? body.label : '최후',
    line: clean(body.line, 30),
  };
  if (!fields.name || !fields.line) throw badRequest('이름과 한 줄이 있어야 썸네일을 만들 수 있어요.');
  return fields;
}

const thumbPrompt = ({ name, job, label, line }) => `Turn this MS Paint doodle of a Joseon-dynasty character into a 16:9 share thumbnail that still looks like it was made entirely in classic MS Paint (Windows 그림판).

Layout:
- Keep the doodle character big and clearly the same: same face, costume, colors and crude mouse-drawn Paint style. You may move or slightly scale it and extend the white canvas or the rough background to fill 16:9, but do not redraw it in a polished style.
- Put the text on the side that does not cover the face, inside a rough hand-drawn box filled with a flat paint-bucket color, like an old hanji paper sign.

Text — render exactly these Korean words and nothing else, every Hangul syllable exactly as given, no hanja, no English, no extra characters:
1. Small tag at the top of the box: "조선 ${job}"
2. The character's name, very big and bold: "${name}"  (syllables: ${spell(name)})
3. One line under the name, medium size: "${label} · ${line}"  (syllables: ${spell(`${label}${line}`)})
Typography: as if typed with MS Paint's text tool — plain bold Korean gothic font like Gulim, black, the name with a thick white or yellow outline, high contrast and easy to read even when small.

Decoration: two or three tiny crude Paint doodles that fit the mood of the line (for example sparkles for a great deed, a wilted flower or a little ghost for a sad end), kept sparse.
Avoid: Paint window UI, toolbars, cursor, watermarks, logos, signatures, and any words other than the three lines above.`;

async function thumbnail(file, fields, signal) {
  const { thumbQuality } = config();
  return editImage(file, { prompt: thumbPrompt(fields), size: THUMB_SIZE, quality: thumbQuality }, signal);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  const { apiKey, imageModel, textModel } = config();
  res.json({ hasKey: Boolean(apiKey), imageModel, textModel });
});

app.get('/api/jobs', (req, res) => {
  res.json(publicJobs());
});

// 브라우저가 요청을 취소하면(다른 사진 선택 등) OpenAI 호출도 같이 끊어서 비용을 아낀다.
function abortOnClose(res) {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}

app.post('/api/paint', upload.single('image'), async (req, res) => {
  const file = requireImage(req);
  const job = requireJob(req);
  const image = await paint(file, job, Number(req.body.width), Number(req.body.height), abortOnClose(res));
  res.json({ image });
});

app.post('/api/story', upload.single('image'), async (req, res) => {
  const file = requireImage(req);
  const job = requireJob(req);
  res.json(await story(file, job, abortOnClose(res)));
});

app.post('/api/thumbnail', upload.single('image'), async (req, res) => {
  const file = requireImage(req);
  const image = await thumbnail(file, thumbFields(req.body), abortOnClose(res));
  res.json({ image });
});

function friendlyError(err) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return [413, '사진이 너무 커요. 20MB 이하로 올려주세요.'];
  }
  if (err instanceof OpenAI.APIError) {
    const code = err.code || err.error?.code;
    if (err.status === 401) return [401, 'API 키가 올바르지 않아요. .env 의 OPENAI_API_KEY 를 확인해 주세요.'];
    if (err.status === 429) return [429, '요청이 너무 많거나 크레딧이 부족해요. 잠시 후 다시 시도해 주세요.'];
    if (code === 'moderation_blocked') return [400, '안전 정책 때문에 이 사진은 변환할 수 없어요. 다른 사진이나 다른 직업으로 해 보세요.'];
    if (err.status === 404 || code === 'model_not_found') {
      return [404, `모델에 접근할 수 없어요. 이 키로 쓸 수 있는 모델인지 확인해 주세요. (${err.message})`];
    }
    return [err.status || 502, `OpenAI 오류: ${err.message}`];
  }
  if (err instanceof SyntaxError) return [502, '이야기를 받아 적다가 글이 엉켰어요. 다시 시도해 주세요.'];
  return [err.status || 500, err.message || '알 수 없는 오류가 났어요.'];
}

app.use((err, req, res, next) => {
  if (err instanceof APIUserAbortError) return console.log(`[${req.method} ${req.path}] 브라우저가 취소함`);
  const [status, message] = friendlyError(err);
  console.error(`[${req.method} ${req.path}]`, status, err.message);
  res.status(status).json({ error: message });
});

const port = Number(env('PORT', '3001'));
app.listen(port, (err) => {
  // Express 5 는 포트를 못 열었을 때 에러를 콜백으로 넘긴다.
  if (err) {
    console.error(
      err.code === 'EADDRINUSE'
        ? `❌ ${port} 포트를 이미 다른 프로그램(이미 켜 둔 서버 등)이 쓰고 있어요. 그 서버를 끄거나 .env 에 PORT=3002 처럼 다른 포트를 지정하세요.`
        : `❌ 서버를 시작하지 못했어요: ${err.message}`,
    );
    process.exit(1);
  }
  const { apiKey, imageModel, textModel } = config();
  console.log(`조선 전생 그림판: http://localhost:${port}`);
  console.log(`  이미지 모델: ${imageModel} / 텍스트 모델: ${textModel}`);
  if (!apiKey) console.log('  ⚠️  .env 에 OPENAI_API_KEY 가 비어 있어요. 넣고 저장하면 바로 적용됩니다.');
});
