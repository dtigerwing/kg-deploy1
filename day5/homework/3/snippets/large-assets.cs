// 용량이 큰 에셋 목록. 마지막 빌드 리포트가 있으면 빌드에 실제로 들어간 크기, 없으면 Assets 아래 원본 파일 크기로 센다. 읽기만 한다.
var limit = int.Parse({{LIMIT}});
var sizes = new System.Collections.Generic.Dictionary<string, ulong>();
string source = "files";
string platform = null;
var objs = UnityEditorInternal.InternalEditorUtility.LoadSerializedFileAndForget("Library/LastBuild.buildreport");
foreach (var o in objs)
{
  var report = o as UnityEditor.Build.Reporting.BuildReport;
  if (report == null) continue;
  source = "lastBuild";
  platform = report.summary.platform.ToString();
  foreach (var packed in report.packedAssets)
    foreach (var info in packed.contents)
    {
      if (string.IsNullOrEmpty(info.sourceAssetPath)) continue;
      ulong prev;
      sizes.TryGetValue(info.sourceAssetPath, out prev);
      sizes[info.sourceAssetPath] = prev + info.packedSize;
    }
  break;
}
if (source == "files")
{
  var root = System.IO.Path.GetDirectoryName(UnityEngine.Application.dataPath) + "/";
  foreach (var f in System.IO.Directory.EnumerateFiles(UnityEngine.Application.dataPath, "*", System.IO.SearchOption.AllDirectories))
    if (!f.EndsWith(".meta")) sizes[f.Substring(root.Length)] = (ulong)new System.IO.FileInfo(f).Length;
}
var list = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string, ulong>>(sizes);
list.Sort((a, b) => b.Value.CompareTo(a.Value));
var items = new System.Collections.Generic.List<object>();
for (var i = 0; i < list.Count && i < limit; i++)
{
  var importer = UnityEditor.AssetImporter.GetAtPath(list[i].Key);
  items.Add(new { path = list[i].Key, kb = (long)(list[i].Value / 1024), importer = importer == null ? null : importer.GetType().Name });
}
return new { source = source, platform = platform, activeTarget = UnityEditor.EditorUserBuildSettings.activeBuildTarget.ToString(), totalAssets = sizes.Count, items = items };
