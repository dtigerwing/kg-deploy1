// 게임 순위 사이트 서버. API 키는 이 서버에만 있고 브라우저로는 나가지 않는다.
// "새로고침" 버튼을 누를 때만 그 나라의 스토어 순위를 새로 읽는다. Claude는 처음 보는 게임만 분류한다.
//   GET  /api/ranks?country=kr     그 나라에서 마지막으로 읽은 순위
//   POST /api/refresh?country=kr   그 나라의 게임 전체·키즈 순위를 새로 읽고, 새 게임은 Claude로 장르·한 줄 소개를 붙인다
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GENRES, MODEL, classify, hasKey } from "./claude.mjs";
import { COUNTRIES, readAos, readIos } from "./stores.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
const dataDir = path.join(here, "data");
// 게임별 장르·한 줄 소개. 한 번 분류한 게임은 나라가 달라도 다시 Claude에 묻지 않는다.
const gamesFile = path.join(dataDir, "games.json");
// 나라마다 마지막으로 읽은 순위. 서버를 다시 켜도 바로 보이게 한다.
const latestFile = (country) => path.join(dataDir, `latest-${country}.json`);
try {
  process.loadEnvFile(path.join(here, ".env"));
} catch {
  // .env가 없으면 순위만 보여 주고, 화면에 키 없음 안내를 띄운다
}
const PORT = Number(process.env.PORT) || 3100;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const LABELS = { "all.ios": "iOS 순위", "all.aos": "AOS 순위", "kids.ios": "iOS 키즈 순위", "kids.aos": "AOS 키즈 순위" };

// 나라별로 진행 중인 새로고침. 버튼을 여러 번 눌러도 한 번만 읽는다.
const refreshing = new Map();

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const country = url.searchParams.get("country") ?? "kr";
      if (url.pathname.startsWith("/api/") && !COUNTRIES[country]) return json(res, { error: `모르는 나라예요: ${country}` }, 400);
      if (req.method === "GET" && url.pathname === "/api/ranks") return json(res, view(country, readJson(latestFile(country))));
      if (req.method === "POST" && url.pathname === "/api/refresh") {
        if (!refreshing.has(country)) refreshing.set(country, refresh(country).finally(() => refreshing.delete(country)));
        return json(res, view(country, await refreshing.get(country)));
      }
      if (req.method === "GET") return serveStatic(url, res);
      res.writeHead(404).end();
    } catch (err) {
      console.error(err);
      json(res, { error: err.message }, 500);
    }
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));

async function refresh(country) {
  const previous = readJson(latestFile(country));
  const hasAos = COUNTRIES[country].aos;
  const jobs = {
    "all.ios": readIos(country, "all"),
    "all.aos": hasAos ? readAos(country, "all") : [],
    "kids.ios": readIos(country, "kids"),
    "kids.aos": hasAos ? readAos(country, "kids") : [],
  };
  const settled = await Promise.allSettled(Object.values(jobs));
  const lists = {};
  const errors = {};
  Object.keys(jobs).forEach((key, i) => {
    const r = settled[i];
    if (r.status === "fulfilled") lists[key] = r.value;
    else errors[key] = `${LABELS[key]}를 읽지 못해 이전 순위를 보여 줘요. (${r.reason.message})`;
  });
  if (errors["all.ios"] && (!hasAos || errors["all.aos"])) throw new Error(Object.values(errors).join(" "));

  const games = readJson(gamesFile) ?? {};
  const unknown = new Map();
  for (const app of Object.values(lists).flat()) if (!games[app.id]) unknown.set(app.id, app);
  if (unknown.size > 0) {
    if (!hasKey()) errors.claude = "ANTHROPIC_API_KEY가 없어서 새 게임의 장르와 한 줄 소개를 붙이지 못했어요.";
    else {
      try {
        Object.assign(games, await classify([...unknown.values()]));
        writeJson(gamesFile, games);
      } catch (err) {
        errors.claude = `Claude 분류에 실패했어요. 다음 새로고침 때 다시 시도해요. (${err.message})`;
      }
    }
  }

  const withInfo = (apps) => apps.map(({ description, storeGenres, ...a }) => ({ ...a, genre: games[a.id]?.genre ?? null, summary: games[a.id]?.summary ?? "" }));
  const pick = (chart, platform) => {
    const list = lists[`${chart}.${platform}`];
    return list ? withInfo(list) : previous?.[chart]?.[platform] ?? [];
  };
  const latest = {
    updatedAt: new Date().toISOString(),
    all: { ios: pick("all", "ios"), aos: pick("all", "aos") },
    kids: { ios: pick("kids", "ios"), aos: pick("kids", "aos") },
    errors,
  };
  writeJson(latestFile(country), latest);
  return latest;
}

function view(country, latest) {
  const countries = Object.entries(COUNTRIES).map(([code, c]) => ({ code, name: c.name, aos: c.aos }));
  return { model: MODEL, hasKey: hasKey(), genres: GENRES, countries, country, latest };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function json(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function serveStatic(url, res) {
  const urlPath = decodeURIComponent(url.pathname);
  const file = path.join(publicDir, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}
