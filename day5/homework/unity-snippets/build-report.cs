// /record-today 2단계: 마지막 빌드 리포트 → journal-tmp/build.json, journal-tmp/imports.json
// execute_code 로 실행한다. C# 6(codedom)이라 out var 같은 문법은 쓰지 않는다.
// OUT_DIR(끝에 / 포함한 journal-tmp 절대 경로)과 RECORD_DATE(YYYY-MM-DD)를 바꿔서 실행한다.
var outDir = "OUT_DIR";
var objs = UnityEditorInternal.InternalEditorUtility.LoadSerializedFileAndForget("Library/LastBuild.buildreport");
UnityEditor.Build.Reporting.BuildReport report = null;
foreach (var o in objs) { report = o as UnityEditor.Build.Reporting.BuildReport; if (report != null) break; }
if (report == null) return "no build report";
var endedAt = report.summary.buildEndedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm");
if (!endedAt.StartsWith("RECORD_DATE")) return "not today: " + endedAt;

var sizes = new System.Collections.Generic.Dictionary<string, ulong>();
foreach (var packed in report.packedAssets)
  foreach (var info in packed.contents)
  {
    var path = string.IsNullOrEmpty(info.sourceAssetPath) ? "(기타)" : info.sourceAssetPath;
    ulong prev;
    sizes.TryGetValue(path, out prev);
    sizes[path] = prev + info.packedSize;
  }
System.Func<string, string> q = s => "\"" + (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
var platform = report.summary.platform.ToString();

var sb = new System.Text.StringBuilder();
sb.Append("{\"platform\":" + q(platform) + ",\"totalBytes\":" + report.summary.totalSize + ",\"assets\":[");
var first = true;
foreach (var kv in sizes)
{
  if (!first) sb.Append(',');
  first = false;
  sb.Append("{\"path\":" + q(kv.Key) + ",\"bytes\":" + kv.Value + "}");
}
sb.Append("]}");
System.IO.Directory.CreateDirectory(outDir);
System.IO.File.WriteAllText(outDir + "build.json", sb.ToString());

// 용량 큰 에셋 40개의 임포트 설정
var texPlatform = platform.StartsWith("Standalone") ? "Standalone" : platform == "iOS" ? "iPhone" : platform;
var list = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string, ulong>>(sizes);
list.Sort((a, b) => b.Value.CompareTo(a.Value));
var ib = new System.Text.StringBuilder("[");
var taken = 0;
foreach (var kv in list)
{
  if (taken >= 40) break;
  var importer = UnityEditor.AssetImporter.GetAtPath(kv.Key);
  if (importer == null) continue;
  var detail = "";
  var ti = importer as UnityEditor.TextureImporter;
  var ai = importer as UnityEditor.AudioImporter;
  var mi = importer as UnityEditor.ModelImporter;
  if (ti != null)
  {
    int w, h;
    ti.GetSourceTextureWidthAndHeight(out w, out h);
    var ps = ti.GetPlatformTextureSettings(texPlatform);
    detail = "\"kind\":\"texture\",\"sourceSize\":" + q(w + "x" + h) + ",\"textureType\":" + q(ti.textureType.ToString()) + ",\"maxSize\":" + ti.maxTextureSize + ",\"compression\":" + q(ti.textureCompression.ToString()) + ",\"crunched\":" + (ti.crunchedCompression ? "true" : "false") + ",\"mipmap\":" + (ti.mipmapEnabled ? "true" : "false") + ",\"readable\":" + (ti.isReadable ? "true" : "false") + ",\"platformOverride\":" + (ps.overridden ? q(ps.format + " max " + ps.maxTextureSize) : "null");
  }
  else if (ai != null)
  {
    var s = ai.defaultSampleSettings;
    detail = "\"kind\":\"audio\",\"loadType\":" + q(s.loadType.ToString()) + ",\"compression\":" + q(s.compressionFormat.ToString()) + ",\"quality\":" + s.quality + ",\"forceToMono\":" + (ai.forceToMono ? "true" : "false");
  }
  else if (mi != null)
  {
    detail = "\"kind\":\"model\",\"meshCompression\":" + q(mi.meshCompression.ToString()) + ",\"readable\":" + (mi.isReadable ? "true" : "false") + ",\"importAnimation\":" + (mi.importAnimation ? "true" : "false");
  }
  else detail = "\"kind\":" + q(importer.GetType().Name);
  if (taken > 0) ib.Append(',');
  ib.Append("{\"path\":" + q(kv.Key) + ",\"kb\":" + (kv.Value / 1024) + "," + detail + "}");
  taken++;
}
ib.Append("]");
System.IO.File.WriteAllText(outDir + "imports.json", "{\"platform\":" + q(platform) + ",\"assets\":" + ib + "}");
return new { endedAt = endedAt, totalMB = report.summary.totalSize / 1048576.0, assetCount = sizes.Count, importsTaken = taken };
