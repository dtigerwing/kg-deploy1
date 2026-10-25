// 스토어 순위 읽기. 순위는 스토어가 보여주는 그대로 쓰고, 여기서 손대지 않는다.
//   iOS: 애플 공개 순위 피드(무료, 게임) + 앱 조회 API(스토어 장르)
//   AOS: google-play-scraper (Google Play에는 공식 순위 API가 없다)
import gplay from "google-play-scraper";

export const LIMIT = 50;

// aos: false인 나라는 Google Play가 정식 서비스되지 않아 순위를 읽지 않는다.
export const COUNTRIES = {
  kr: { name: "한국", lang: "ko", aos: true },
  us: { name: "미국", lang: "en", aos: true },
  jp: { name: "일본", lang: "ja", aos: true },
  tw: { name: "대만", lang: "zh_TW", aos: true },
  cn: { name: "중국", lang: "zh_CN", aos: false },
};

// all: 게임 전체 순위. kids: 두 스토어에 키즈 게임 순위가 따로 없어서 가장 가까운 순위를 쓴다.
const CHARTS = {
  all: { iosGenre: 6014, aosCategory: gplay.category.GAME },
  kids: { iosGenre: 7009, aosCategory: gplay.category.GAME_EDUCATIONAL }, // iOS 게임 › 가족, AOS 게임 › 교육
};

// 앱 하나: { id, platform, rank, title, developer, icon, url, storeGenres, description }
export async function readIos(country, chart) {
  const feed = await getJson(`https://itunes.apple.com/${country}/rss/topfreeapplications/limit=${LIMIT}/genre=${CHARTS[chart].iosGenre}/json`);
  const entries = [feed.feed?.entry ?? []].flat();
  if (entries.length === 0) return [];
  const ids = entries.map((e) => e.id.attributes["im:id"]);
  // 피드에는 장르가 "게임"으로만 나와서, 세부 장르는 조회 API로 한 번에 받는다.
  const lookup = await getJson(`https://itunes.apple.com/lookup?id=${ids.join(",")}&country=${country}`);
  const details = new Map(lookup.results.map((r) => [String(r.trackId), r]));

  return entries.map((e, i) => {
    const id = e.id.attributes["im:id"];
    const detail = details.get(id);
    return {
      id: `ios:${id}`,
      platform: "ios",
      rank: i + 1,
      title: e["im:name"].label,
      developer: e["im:artist"]?.label ?? detail?.sellerName ?? "",
      icon: detail?.artworkUrl100 ?? e["im:image"].at(-1).label,
      url: detail?.trackViewUrl ?? e.id.label,
      storeGenres: detail?.genres ?? [],
      description: clean(detail?.description ?? e.summary?.label ?? ""),
    };
  });
}

export async function readAos(country, chart) {
  const apps = await gplay.list({
    collection: gplay.collection.TOP_FREE,
    category: CHARTS[chart].aosCategory,
    country,
    lang: COUNTRIES[country].lang,
    num: LIMIT,
  });
  return apps.map((a, i) => ({
    id: `aos:${a.appId}`,
    platform: "aos",
    rank: i + 1,
    title: a.title,
    developer: a.developer,
    icon: a.icon,
    url: a.url,
    storeGenres: [], // 순위 목록에는 장르가 없어서 Claude가 설명을 보고 정한다
    description: clean(a.summary ?? ""),
  }));
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`스토어 응답 오류 ${res.status}: ${url}`);
  return res.json();
}

// Claude에 넘길 설명은 앞부분만. HTML 태그와 줄바꿈을 걷어낸다.
function clean(text) {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
