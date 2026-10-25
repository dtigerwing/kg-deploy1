// 대시보드 한 화면에 필요한 현황을 한 번에 읽는다. 읽기만 한다: 씬을 열지 않고, 파일을 쓰지 않고, 설정을 바꾸지 않는다.
// execute_code(C# 6, codedom)로 실행되고, 돌려준 객체는 JSON으로 서버에 간다.
var root = System.IO.Path.GetDirectoryName(UnityEngine.Application.dataPath);
var android = UnityEditor.Build.NamedBuildTarget.Android;
var ios = UnityEditor.Build.NamedBuildTarget.iOS;
var pipeline = UnityEngine.Rendering.GraphicsSettings.defaultRenderPipeline;

// 씬 파일(YAML)을 텍스트로 읽어 오브젝트 수와 빠진 스크립트 수를 센다. 씬을 열면 에디터 상태가 바뀌니 열지 않는다.
var guidExists = new System.Collections.Generic.Dictionary<string, bool>();
var scriptRef = new System.Text.RegularExpressions.Regex(@"m_Script: \{fileID: \d+, guid: ([0-9a-f]{32}), type: \d\}");
var scenes = new System.Collections.Generic.List<object>();
foreach (var s in UnityEditor.EditorBuildSettings.scenes)
{
  var file = System.IO.Path.Combine(root, s.path);
  if (!System.IO.File.Exists(file)) { scenes.Add(new { path = s.path, enabled = s.enabled, exists = false, gameObjects = 0, missingScripts = 0 }); continue; }
  var text = System.IO.File.ReadAllText(file);
  var objects = System.Text.RegularExpressions.Regex.Matches(text, @"^--- !u!1 &", System.Text.RegularExpressions.RegexOptions.Multiline).Count;
  var missing = 0;
  foreach (System.Text.RegularExpressions.Match m in scriptRef.Matches(text))
  {
    var guid = m.Groups[1].Value;
    bool ok;
    if (!guidExists.TryGetValue(guid, out ok)) { ok = !string.IsNullOrEmpty(UnityEditor.AssetDatabase.GUIDToAssetPath(guid)); guidExists[guid] = ok; }
    if (!ok) missing++;
  }
  scenes.Add(new { path = s.path, enabled = s.enabled, exists = true, gameObjects = objects, missingScripts = missing });
}

// Assets 아래 원본 파일을 종류별로 묶어 개수와 용량을 센다.
var kinds = new System.Collections.Generic.Dictionary<string, string>();
foreach (var e in new[] { "png", "jpg", "jpeg", "tga", "psd", "exr", "hdr", "tif", "tiff", "bmp", "gif" }) kinds[e] = "텍스처";
foreach (var e in new[] { "fbx", "obj", "blend", "dae", "3ds", "max", "mesh", "asset" }) kinds[e] = "모델·데이터";
foreach (var e in new[] { "wav", "mp3", "ogg", "aif", "aiff", "flac" }) kinds[e] = "오디오";
foreach (var e in new[] { "cs", "dll", "asmdef" }) kinds[e] = "스크립트";
foreach (var e in new[] { "mat", "shader", "shadergraph", "hlsl", "cginc", "compute" }) kinds[e] = "머티리얼·셰이더";
foreach (var e in new[] { "prefab", "unity" }) kinds[e] = "프리팹·씬";
foreach (var e in new[] { "anim", "controller", "overrideController", "playable" }) kinds[e] = "애니메이션";
var sizes = new System.Collections.Generic.Dictionary<string, long>();
var counts = new System.Collections.Generic.Dictionary<string, int>();
foreach (var f in System.IO.Directory.EnumerateFiles(UnityEngine.Application.dataPath, "*", System.IO.SearchOption.AllDirectories))
{
  var ext = System.IO.Path.GetExtension(f).TrimStart('.').ToLowerInvariant();
  if (ext == "meta") continue;
  string kind;
  if (!kinds.TryGetValue(ext, out kind)) kind = "기타";
  long prev;
  sizes.TryGetValue(kind, out prev);
  sizes[kind] = prev + new System.IO.FileInfo(f).Length;
  int c;
  counts.TryGetValue(kind, out c);
  counts[kind] = c + 1;
}
var assets = new System.Collections.Generic.List<object>();
foreach (var kv in sizes) assets.Add(new { kind = kv.Key, bytes = kv.Value, count = counts[kv.Key] });

var packages = new System.Collections.Generic.List<object>();
foreach (var p in UnityEditor.PackageManager.PackageInfo.GetAllRegisteredPackages())
  if (p.isDirectDependency && !p.name.StartsWith("com.unity.modules.")) packages.Add(new { name = p.name, displayName = p.displayName, version = p.version, source = p.source.ToString() });

// 마지막 빌드 리포트 (없으면 null)
object lastBuild = null;
var objs = UnityEditorInternal.InternalEditorUtility.LoadSerializedFileAndForget("Library/LastBuild.buildreport");
foreach (var o in objs)
{
  var report = o as UnityEditor.Build.Reporting.BuildReport;
  if (report == null) continue;
  lastBuild = new
  {
    platform = report.summary.platform.ToString(),
    result = report.summary.result.ToString(),
    totalBytes = (long)report.summary.totalSize,
    endedAt = report.summary.buildEndedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm"),
  };
  break;
}

return new
{
  project = new
  {
    path = root,
    productName = UnityEditor.PlayerSettings.productName,
    companyName = UnityEditor.PlayerSettings.companyName,
    unityVersion = UnityEngine.Application.unityVersion,
    renderPipeline = pipeline == null ? "Built-in" : pipeline.GetType().Name,
    activeTarget = UnityEditor.EditorUserBuildSettings.activeBuildTarget.ToString(),
    isPlaying = UnityEditor.EditorApplication.isPlaying,
    isCompiling = UnityEditor.EditorApplication.isCompiling,
    version = UnityEditor.PlayerSettings.bundleVersion,
  },
  android = new
  {
    installed = UnityEditor.BuildPipeline.IsBuildTargetSupported(UnityEditor.BuildTargetGroup.Android, UnityEditor.BuildTarget.Android),
    id = UnityEditor.PlayerSettings.GetApplicationIdentifier(android),
    code = UnityEditor.PlayerSettings.Android.bundleVersionCode.ToString(),
    backend = UnityEditor.PlayerSettings.GetScriptingBackend(android).ToString(),
    architectures = UnityEditor.PlayerSettings.Android.targetArchitectures.ToString(),
  },
  ios = new
  {
    installed = UnityEditor.BuildPipeline.IsBuildTargetSupported(UnityEditor.BuildTargetGroup.iOS, UnityEditor.BuildTarget.iOS),
    id = UnityEditor.PlayerSettings.GetApplicationIdentifier(ios),
    code = UnityEditor.PlayerSettings.iOS.buildNumber,
    backend = UnityEditor.PlayerSettings.GetScriptingBackend(ios).ToString(),
    minOS = UnityEditor.PlayerSettings.iOS.targetOSVersionString,
  },
  scenes = scenes,
  assets = assets,
  packages = packages,
  lastBuild = lastBuild,
};
