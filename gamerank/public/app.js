// 순위 화면. 서버가 준 순위를 국가·플랫폼 탭·장르로 거르기만 한다.
const UNCLASSIFIED = "분류 전";
const KIDS = "키즈";
const state = { country: "kr", platform: "both", genre: "전체", data: null, loading: false };

const $ = (id) => document.getElementById(id);

$("tabs").addEventListener("click", (e) => {
  const platform = e.target.dataset?.platform;
  if (!platform) return;
  state.platform = platform;
  if (state.genre !== KIDS) state.genre = "전체";
  render();
});

$("genres").addEventListener("click", (e) => {
  const genre = e.target.closest("button")?.dataset.genre;
  if (!genre) return;
  state.genre = genre;
  render();
});

$("country").addEventListener("change", (e) => {
  state.country = e.target.value;
  state.genre = "전체";
  load();
});

$("refresh").addEventListener("click", refresh);

load();

async function load() {
  state.data = await (await fetch(`/api/ranks?country=${state.country}`)).json();
  render();
  // 이 나라를 처음 열었을 때는 순위가 없으니 바로 읽어 온다
  if (!state.data.latest) refresh();
}

async function refresh() {
  state.loading = true;
  render();
  try {
    const res = await fetch(`/api/refresh?country=${state.country}`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    state.data = body;
  } catch (err) {
    state.data = { ...state.data, failed: err.message };
  } finally {
    state.loading = false;
    render();
  }
}

function country() {
  return state.data?.countries?.find((c) => c.code === state.country);
}

// 지금 탭에 맞는 게임 목록. "둘 다"는 같은 게임을 이름으로 묶는다.
function rows(chart) {
  const lists = state.data?.latest?.[chart];
  if (!lists) return [];
  if (state.platform !== "both") {
    return lists[state.platform].map((a) => ({ ...a, genre: a.genre ?? UNCLASSIFIED, ranks: { [a.platform]: a } }));
  }
  const byKey = new Map();
  for (const a of [...lists.aos, ...lists.ios]) {
    const key = nameKey(a.title);
    const row = byKey.get(key) ?? { ...a, genre: a.genre ?? UNCLASSIFIED, ranks: {} };
    row.ranks[a.platform] = a;
    byKey.set(key, row);
  }
  // 두 스토어 순위의 합으로 정렬한다. 한쪽에만 있으면 그쪽은 순위 밖(51위)으로 친다.
  const outside = Math.max(lists.aos.length, lists.ios.length) + 1;
  const score = (r) => (r.ranks.aos?.rank ?? outside) + (r.ranks.ios?.rank ?? outside);
  return [...byKey.values()].sort((a, b) => score(a) - score(b));
}

// "블록 블라스트 (Block Blast)"와 "블록 블라스트!"를 같은 게임으로 본다
function nameKey(title) {
  return title
    .split(/\s[:\-–|(\[]|[:(\[]/)[0]
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function render() {
  const data = state.data;
  const latest = data?.latest;
  const noAos = country()?.aos === false;

  renderCountries(data);
  $("country-name").textContent = country()?.name ?? "";
  $("model").textContent = data?.model ?? "Claude";
  $("updated").textContent = latest ? `· ${new Date(latest.updatedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })} 기준` : "";
  $("refresh").disabled = state.loading;
  $("country").disabled = state.loading;
  $("refresh").textContent = state.loading ? "불러오는 중…" : "새로고침";
  for (const b of $("tabs").children) b.classList.toggle("on", b.dataset.platform === state.platform);

  const all = rows("all");
  const kids = rows("kids");
  renderGenres(all, kids);
  renderNotices(data);

  const shown = state.genre === KIDS ? kids : state.genre === "전체" ? all : all.filter((r) => r.genre === state.genre);
  $("hint").textContent = hint(latest);
  $("list").replaceChildren(...shown.map((r, i) => renderRow(r, i + 1, noAos)));
  if (latest && shown.length === 0) {
    const message = noAos && state.platform === "aos" ? `${country().name}은 Google Play가 정식 서비스되지 않아 AOS 순위가 없어요.` : "이 장르에는 순위 안에 든 게임이 없어요.";
    $("list").innerHTML = `<li class="empty">${message}</li>`;
  }
}

function hint(latest) {
  if (state.loading) return "스토어 순위를 읽고, 처음 보는 게임은 Claude가 장르와 소개를 붙여요. 나라를 처음 열 때는 1~2분 걸릴 수 있어요.";
  if (!latest) return "";
  if (state.genre === KIDS) return "두 스토어에 키즈 게임 순위가 따로 없어서, iOS는 게임 › 가족, AOS는 게임 › 교육 순위를 보여 줘요.";
  if (state.platform === "both") return "두 스토어 순위를 합쳐서 정렬했어요.";
  if (state.genre !== "전체") return `${state.genre} 장르 안에서의 순위예요. 오른쪽은 스토어 전체 순위예요.`;
  return "";
}

function renderCountries(data) {
  if (!data?.countries || $("country").options.length === data.countries.length) return;
  $("country").replaceChildren(...data.countries.map((c) => new Option(c.aos ? c.name : `${c.name} (iOS만)`, c.code)));
  $("country").value = state.country;
}

function renderGenres(all, kids) {
  const counts = new Map();
  for (const r of all) counts.set(r.genre, (counts.get(r.genre) ?? 0) + 1);
  const names = ["전체", ...(state.data?.genres ?? []), UNCLASSIFIED].filter((g) => g === "전체" || counts.has(g));
  const chip = (g, n, className = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.genre = g;
    b.className = `${className} ${g === state.genre ? "on" : ""}`.trim();
    b.textContent = g;
    const span = document.createElement("span");
    span.textContent = n;
    b.append(span);
    return b;
  };
  $("genres").replaceChildren(...names.map((g) => chip(g, g === "전체" ? all.length : counts.get(g))), chip(KIDS, kids.length, "kids"));
}

function renderNotices(data) {
  const messages = [];
  if (data?.failed) messages.push(data.failed);
  if (data && !data.hasKey) messages.push("ANTHROPIC_API_KEY가 없어서 장르와 한 줄 소개 없이 순위만 보여 줘요. .env에 키를 넣고 서버를 다시 켜 주세요.");
  messages.push(...Object.values(data?.latest?.errors ?? {}));
  $("notices").replaceChildren(
    ...[...new Set(messages)].map((m) => {
      const p = document.createElement("p");
      p.className = "notice";
      p.textContent = m;
      return p;
    }),
  );
}

function renderRow(r, position, noAos) {
  const li = document.createElement("li");
  li.className = "row";
  const single = state.platform !== "both";
  // 단일 스토어에서 전체나 키즈 순위를 볼 때는 스토어 순위 그대로, 장르로 걸렀거나 "둘 다"면 목록 안에서의 순서
  const storeOrder = single && (state.genre === "전체" || state.genre === KIDS);
  const number = storeOrder ? r.rank : position;

  li.innerHTML = `
    <span class="num"></span>
    <img class="icon" alt="" loading="lazy" referrerpolicy="no-referrer" />
    <div class="info">
      <div class="title-line"><a class="title" target="_blank" rel="noopener"></a><span class="tag"></span></div>
      <div class="dev"></div>
      <p class="summary"></p>
    </div>
    <div class="ranks"></div>`;
  li.querySelector(".num").textContent = number;
  li.querySelector(".icon").src = r.icon;
  const title = li.querySelector(".title");
  title.textContent = r.title;
  title.href = r.url;
  li.querySelector(".tag").textContent = r.genre;
  li.querySelector(".tag").classList.toggle("muted", r.genre === UNCLASSIFIED);
  li.querySelector(".dev").textContent = r.developer;
  li.querySelector(".summary").textContent = r.summary || "";

  // 왼쪽 숫자가 곧 스토어 순위면 따로 적지 않는다
  if (storeOrder) return li;
  const ranks = li.querySelector(".ranks");
  const platforms = single ? [state.platform] : noAos ? ["ios"] : ["aos", "ios"];
  for (const platform of platforms) {
    const app = r.ranks[platform];
    const badge = document.createElement(app ? "a" : "span");
    badge.className = `badge ${platform}${app ? "" : " none"}`;
    badge.textContent = `${platform === "aos" ? "AOS" : "iOS"} ${app ? `${app.rank}위` : "순위 밖"}`;
    if (app) {
      badge.href = app.url;
      badge.target = "_blank";
      badge.rel = "noopener";
    }
    ranks.append(badge);
  }
  return li;
}
