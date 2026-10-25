// 노트북 없이 Bitbucket에 푸시된 내용만으로 현황을 읽는다. 읽기만 한다(저장소 읽기 전용 토큰).
// 노트북 서버의 현황과 같은 모양으로 돌려주되, 실행 중인 Unity에서만 알 수 있는 값(콘솔, 빌드 리포트,
// 지금 빌드 타깃, 씬별 Missing Script, 커밋 안 한 변경)은 null로 둔다.
const API = "https://api.bitbucket.org/2.0";
const RECENT_COMMITS = 10;
const MAX_TREE_PAGES = 40; // 에셋 목록 페이지 상한 (페이지당 100개)

export async function readFromBitbucket(token, { workspace, repo, unityFolder }) {
  const get = async (path, { raw = false } = {}) => {
    const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404 && raw) return null;
    if (!res.ok) throw new Error(`Bitbucket ${res.status}: ${path.slice(0, 120)}`);
    return raw ? res.text() : res.json();
  };
  const base = `/repositories/${workspace}/${repo}`;
  const repoInfo = await get(base);
  const branch = repoInfo.mainbranch?.name ?? "main";
  const commitList = (await get(`${base}/commits/${encodeURIComponent(branch)}?pagelen=${RECENT_COMMITS}`)).values ?? [];
  const head = commitList[0]?.hash;
  if (!head) throw new Error("저장소에 커밋이 없어요.");

  const prefix = unityFolder ? `${unityFolder}/` : "";
  const file = (p) => get(`${base}/src/${head}/${encodeURI(prefix + p)}`, { raw: true });
  const [settings, version, buildSettings, manifest, commits, assets] = await Promise.all([
    file("ProjectSettings/ProjectSettings.asset"),
    file("ProjectSettings/ProjectVersion.txt"),
    file("ProjectSettings/EditorBuildSettings.asset"),
    file("Packages/manifest.json"),
    Promise.all(commitList.map((c) => commitSummary(get, base, c))),
    assetSizes(get, `${base}/src/${head}/${encodeURI(`${prefix}Assets`)}/`),
  ]);
  if (!settings) throw new Error(`${prefix}ProjectSettings/ProjectSettings.asset을 저장소에서 찾지 못했어요.`);

  const ps = parseProjectSettings(settings);
  const packages = Object.entries(JSON.parse(manifest ?? "{}").dependencies ?? {})
    .filter(([name]) => !name.startsWith("com.unity.modules."))
    .map(([name, v]) => ({ name, displayName: name, version: v }));
  return {
    source: "bitbucket",
    readAt: new Date().toISOString(),
    project: {
      path: repo,
      productName: ps.productName,
      companyName: ps.companyName,
      unityVersion: version?.match(/m_EditorVersion: (.+)/)?.[1]?.trim() ?? "알 수 없음",
      renderPipeline: packages.some((p) => p.name === "com.unity.render-pipelines.universal")
        ? "URP"
        : packages.some((p) => p.name === "com.unity.render-pipelines.high-definition")
          ? "HDRP"
          : "Built-in",
      activeTarget: null, // Library/ 에만 있어서 저장소로는 알 수 없다
      isPlaying: false,
      version: ps.version,
    },
    android: { installed: null, id: ps.ids.Android ?? "", code: ps.androidCode, backend: ps.androidBackend, architectures: ps.androidArch },
    ios: { installed: null, id: ps.ids.iPhone ?? "", code: ps.iosBuild, minOS: ps.iosMinOS },
    scenes: parseScenes(buildSettings),
    assets,
    packages,
    lastBuild: null,
    console: null,
    git: {
      root: null,
      unityFolder: unityFolder || ".",
      remote: "bitbucket.org",
      branch,
      upstream: null,
      ahead: null,
      behind: null,
      commits,
      changes: null,
      checks: [],
    },
  };
}

// 커밋 하나: 메시지와 바뀐 파일 종류 (diffstat)
async function commitSummary(get, base, c) {
  const files = [];
  try {
    let next = `${base}/diffstat/${c.hash}?pagelen=500`;
    for (let page = 0; next && page < 4; page++) {
      const body = await get(next);
      for (const v of body.values ?? []) files.push(v.new?.path ?? v.old?.path);
      next = body.next;
    }
  } catch {
    // 첫 커밋처럼 비교할 부모가 없으면 diffstat이 없을 수 있다
  }
  return {
    hash: c.hash.slice(0, 7),
    fullHash: c.hash,
    author: c.author?.user?.display_name ?? c.author?.raw ?? "",
    date: localTime(c.date),
    message: (c.message ?? "").split("\n")[0],
    fileCount: files.length,
    kinds: countKinds(files.filter(Boolean)),
  };
}

// Assets 아래 파일을 종류별로 묶은 용량 (저장소에 올라간 크기, .meta 제외)
async function assetSizes(get, url) {
  const sizes = new Map();
  let next = `${url}?max_depth=50&pagelen=100&fields=values.path,values.size,values.type,next`;
  for (let page = 0; next && page < MAX_TREE_PAGES; page++) {
    const body = await get(next);
    for (const v of body.values ?? []) {
      if (v.type !== "commit_file" || v.path.endsWith(".meta")) continue;
      const kind = assetKind(v.path);
      const s = sizes.get(kind) ?? { kind, bytes: 0, count: 0 };
      s.bytes += v.size ?? 0;
      s.count += 1;
      sizes.set(kind, s);
    }
    next = body.next;
  }
  return [...sizes.values()];
}

// ---------- ProjectSettings.asset 읽기 ----------

function parseProjectSettings(text) {
  const value = (key) => text.match(new RegExp(`^  ${key}: ?(.*)$`, "m"))?.[1]?.trim() ?? null;
  // "  key:\n    Android: 1\n    iPhone: 0" 모양의 플랫폼별 값
  const map = (key) => {
    const block = text.match(new RegExp(`^  ${key}:\\n((?:    .+\\n?)*)`, "m"))?.[1] ?? "";
    return Object.fromEntries([...block.matchAll(/^    ([^:]+): ?(.*)$/gm)].map((m) => [m[1].trim(), m[2].trim()]));
  };
  const backend = map("scriptingBackend");
  const arch = Number(value("AndroidTargetArchitectures") ?? 0);
  const archNames = [arch & 1 && "ARMv7", arch & 2 && "ARM64", arch & 32 && "X86_64"].filter(Boolean);
  return {
    productName: value("productName"),
    companyName: value("companyName"),
    version: value("bundleVersion"),
    ids: map("applicationIdentifier"),
    androidCode: value("AndroidBundleVersionCode") ?? "",
    iosBuild: map("buildNumber").iPhone ?? "",
    iosMinOS: value("iOSTargetOSVersionString") ?? "",
    androidBackend: backend.Android === "1" ? "IL2CPP" : backend.Android === "0" ? "Mono2x" : "기본값",
    androidArch: archNames.join(", ") || "알 수 없음",
  };
}

// EditorBuildSettings.asset: "- enabled: 1\n    path: Assets/…"
function parseScenes(text) {
  if (!text) return [];
  return [...text.matchAll(/- enabled: (\d)\n\s+path: (.+)/g)].map((m) => ({
    path: m[2].trim(),
    enabled: m[1] === "1",
    exists: true,
    gameObjects: null,
    missingScripts: null, // 씬을 열거나 전체 .meta를 받아야 알 수 있어서 노트북에서만 센다
  }));
}

// ---------- 파일 종류 (노트북 서버의 git.mjs, snapshot.cs와 같은 기준) ----------

const COMMIT_KINDS = [
  ["meta", /\.meta$/i],
  ["씬", /\.unity$/i],
  ["프리팹", /\.prefab$/i],
  ["스크립트", /\.(cs|asmdef|asmref)$/i],
  ["셰이더", /\.(shader|cginc|hlsl|shadergraph|compute)$/i],
  ["텍스처", /\.(png|jpe?g|tga|psd|exr|hdr|tiff?|bmp|gif)$/i],
  ["모델", /\.(fbx|obj|blend|dae)$/i],
  ["오디오", /\.(wav|mp3|ogg|aiff?|flac)$/i],
  ["머티리얼", /\.mat$/i],
  ["애니메이션", /\.(anim|controller|overrideController)$/i],
  ["설정", /(^|\/)(ProjectSettings\/|Packages\/(manifest|packages-lock)\.json$)/],
  ["문서", /\.(md|txt|pdf|docx?|xlsx?|pptx?)$/i],
  ["에셋", /\.asset$/i],
];

function countKinds(files) {
  const counts = {};
  for (const f of files) {
    const kind = COMMIT_KINDS.find(([, re]) => re.test(f))?.[0] ?? "기타";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => (a.kind === "meta") - (b.kind === "meta") || b.count - a.count);
}

const ASSET_KINDS = [
  ["텍스처", /\.(png|jpe?g|tga|psd|exr|hdr|tiff?|bmp|gif)$/i],
  ["모델·데이터", /\.(fbx|obj|blend|dae|3ds|max|mesh|asset)$/i],
  ["오디오", /\.(wav|mp3|ogg|aiff?|flac)$/i],
  ["스크립트", /\.(cs|dll|asmdef)$/i],
  ["머티리얼·셰이더", /\.(mat|shader|shadergraph|hlsl|cginc|compute)$/i],
  ["프리팹·씬", /\.(prefab|unity)$/i],
  ["애니메이션", /\.(anim|controller|overrideController|playable)$/i],
];

function assetKind(file) {
  return ASSET_KINDS.find(([, re]) => re.test(file))?.[0] ?? "기타";
}

// Bitbucket 날짜(ISO)를 "YYYY-MM-DD HH:mm" 한국 시간으로
function localTime(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16).replace("T", " ");
}
