const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const express = require('express');
const multer = require('multer');
const { OpenAI, APIUserAbortError, toFile } = require('openai');

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

function requireImage(req) {
  if (!req.file) {
    const err = new Error('PNG, JPG, WEBP 사진을 올려주세요.');
    err.status = 400;
    throw err;
  }
  return req.file;
}

// ---------------------------------------------------------------------------
// 1) 그림판 스타일 변환 — gpt-image-2.5-sunburst (images.edit)
// ---------------------------------------------------------------------------

const PAINT_PROMPT = `Redraw this entire photo as a crude doodle made in classic MS Paint (Windows 그림판) by someone drawing with a computer mouse.

Style:
- Shaky, wobbly, uneven freehand mouse strokes with jagged, aliased pixel edges (no anti-aliasing).
- Outlines drawn with a thin pencil or small round brush, often not quite closed.
- Flat paint-bucket fills from the default Paint palette (black, white, gray, red, orange, yellow, green, sky blue, blue, purple, pink, brown); fills sometimes leak or leave little white gaps.
- No gradients, no shading, no texture, no photographic detail. Simplified shapes and slightly wrong proportions, like an amateur's quick mouse drawing.
- The background is drawn too, but only as big rough flat fills or scribbles on a white canvas.

Keep: the same subjects, their poses and positions, and the overall composition, with main colors roughly matching the photo, so it is clearly recognizable as this photo.
Avoid: any text, letters, signatures, watermarks, Paint window UI, toolbars, or mouse cursor.`;

// 입력 비율에 맞춰 약 1MP 크기를 고른다. (16의 배수, 비율 1:3 ~ 3:1)
function sizeFor(width, height) {
  const ratio = Math.min(3, Math.max(1 / 3, width / height || 1));
  const pixels = 1024 * 1024;
  const round16 = (n) => Math.round(n / 16) * 16;
  return `${round16(Math.sqrt(pixels * ratio))}x${round16(Math.sqrt(pixels / ratio))}`;
}

async function paint(file, width, height, signal) {
  const { apiKey, imageModel, imageQuality } = config();
  const client = getClient(apiKey);
  const result = await client.images.edit({
    model: imageModel,
    image: await toFile(file.buffer, file.originalname || 'photo.jpg', { type: file.mimetype }),
    prompt: PAINT_PROMPT,
    size: sizeFor(width, height),
    quality: imageQuality,
    output_format: 'png',
  }, { signal });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('이미지 모델이 그림을 돌려주지 않았어요.');
  return `data:image/png;base64,${b64}`;
}

// ---------------------------------------------------------------------------
// 2) 이름 짓기 + 시 쓰기 — gpt-5.6-terra (Responses API, 이미지 입력 + structured output)
// ---------------------------------------------------------------------------

const POEM_INSTRUCTIONS = `너는 사진 속 주인공에게 이름을 지어 주고, 그 이름으로 시를 쓰는 한국어 시인이다.

1. 사진에서 사람, 동물, 자연물(나무, 꽃, 풀, 산, 바다, 강, 하늘, 구름, 해, 달, 돌 등) 중 주인공 하나를 고른다. 여럿이면 가장 눈에 띄고 중심이 되는 하나를 고른다.
2. 셋 중 어느 것도 없으면(예: 건물, 음식, 물건, 화면 캡처만 있는 사진) found 를 false 로, category 를 "none" 으로 하고 나머지 문자열은 모두 빈 문자열로 둔다.
3. 주인공의 생김새, 색, 자세, 분위기에 어울리는 한국어 이름을 짓는다. 부르기 쉽고 다정한 2~4글자 이름.
   사람이라면 실제로 누구인지 추측하거나 밝히지 말고, 인종·나이·외모를 평가하거나 단정하지 말고, 사진에서 느껴지는 분위기만으로 별명 같은 이름을 짓는다.
4. 그 이름과 주인공이 직접 등장하는 한국어 자유시 한 편을 쓴다.
   - 3~4연, 전체 10~16행.
   - 사진 속 구체적인 디테일(색, 빛, 자세, 배경, 계절감)을 시어로 쓴다. 뻔한 상투어는 피한다.
   - 이름을 시 안에서 한 번 이상 부른다.
   - 행은 줄바꿈(\\n) 하나, 연은 빈 줄(\\n\\n)로 나눈다.
5. subject 는 주인공을 한 줄로 묘사한다(예: "창틀에 웅크린 회색 줄무늬 고양이"). name_reason 은 이름을 그렇게 지은 이유를 한두 문장으로 쓴다.`;

const POEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'category', 'subject', 'name', 'name_reason', 'title', 'poem'],
  properties: {
    found: { type: 'boolean', description: '사람/동물/자연물 주인공이 있는지' },
    category: { type: 'string', enum: ['person', 'animal', 'nature', 'none'] },
    subject: { type: 'string', description: '주인공 한 줄 묘사' },
    name: { type: 'string', description: '주인공에게 지어 준 이름' },
    name_reason: { type: 'string', description: '이름을 지은 이유' },
    title: { type: 'string', description: '시 제목' },
    poem: { type: 'string', description: '시 본문. 행은 \\n, 연은 \\n\\n' },
  },
};

async function poem(file, signal) {
  const { apiKey, textModel } = config();
  const client = getClient(apiKey);
  const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  const response = await client.responses.create({
    model: textModel,
    instructions: POEM_INSTRUCTIONS,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: '이 사진의 주인공에게 이름을 지어 주고, 그 이름으로 시를 한 편 써 줘.' },
          { type: 'input_image', image_url: dataUrl, detail: 'auto' },
        ],
      },
    ],
    text: { format: { type: 'json_schema', name: 'named_poem', strict: true, schema: POEM_SCHEMA } },
  }, { signal });
  return JSON.parse(response.output_text);
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
  const image = await paint(file, Number(req.body.width), Number(req.body.height), abortOnClose(res));
  res.json({ image });
});

app.post('/api/poem', upload.single('image'), async (req, res) => {
  const file = requireImage(req);
  res.json(await poem(file, abortOnClose(res)));
});

function friendlyError(err) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return [413, '사진이 너무 커요. 20MB 이하로 올려주세요.'];
  }
  if (err instanceof OpenAI.APIError) {
    const code = err.code || err.error?.code;
    if (err.status === 401) return [401, 'API 키가 올바르지 않아요. .env 의 OPENAI_API_KEY 를 확인해 주세요.'];
    if (err.status === 429) return [429, '요청이 너무 많거나 크레딧이 부족해요. 잠시 후 다시 시도해 주세요.'];
    if (code === 'moderation_blocked') return [400, '안전 정책 때문에 이 사진은 변환할 수 없어요.'];
    if (err.status === 404 || code === 'model_not_found') {
      return [404, `모델에 접근할 수 없어요. 이 키로 쓸 수 있는 모델인지 확인해 주세요. (${err.message})`];
    }
    return [err.status || 502, `OpenAI 오류: ${err.message}`];
  }
  return [err.status || 500, err.message || '알 수 없는 오류가 났어요.'];
}

app.use((err, req, res, next) => {
  if (err instanceof APIUserAbortError) return console.log(`[${req.method} ${req.path}] 브라우저가 취소함`);
  const [status, message] = friendlyError(err);
  console.error(`[${req.method} ${req.path}]`, status, err.message);
  res.status(status).json({ error: message });
});

const port = Number(env('PORT', '3000'));
app.listen(port, (err) => {
  // Express 5 는 포트를 못 열었을 때 에러를 콜백으로 넘긴다.
  if (err) {
    console.error(
      err.code === 'EADDRINUSE'
        ? `❌ ${port} 포트를 이미 다른 프로그램(이미 켜 둔 서버 등)이 쓰고 있어요. 그 서버를 끄거나 .env 에 PORT=3001 처럼 다른 포트를 지정하세요.`
        : `❌ 서버를 시작하지 못했어요: ${err.message}`,
    );
    process.exit(1);
  }
  const { apiKey, imageModel, textModel } = config();
  console.log(`그림판 시인: http://localhost:${port}`);
  console.log(`  이미지 모델: ${imageModel} / 텍스트 모델: ${textModel}`);
  if (!apiKey) console.log('  ⚠️  .env 에 OPENAI_API_KEY 가 비어 있어요. 넣고 저장하면 바로 적용됩니다.');
});
