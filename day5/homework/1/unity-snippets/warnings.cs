// /record-today 3단계: 콘솔 경고·에러 묶음 + 씬별 빠진 스크립트 → journal-tmp/warnings.json
// execute_code 로 실행한다. C# 6(codedom)이라 out var 같은 문법은 쓰지 않는다.
// OUT_DIR(끝에 / 포함한 journal-tmp 절대 경로)을 바꿔서 실행한다. Play 모드에 들어가기 전에 실행한다(Play 시 콘솔이 지워질 수 있다).
var outDir = "OUT_DIR";
System.Func<string, string> q = s => "\"" + (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\t", " ").Replace("\r", " ") + "\"";

// 콘솔: 첫 줄이 같은 메시지끼리 묶는다. MCP 자체 로그는 뺀다.
var asm = typeof(UnityEditor.Editor).Assembly;
var entries = asm.GetType("UnityEditor.LogEntries");
var entryType = asm.GetType("UnityEditor.LogEntry");
var get = entries.GetMethod("GetEntryInternal");
var entry = System.Activator.CreateInstance(entryType);
var msgF = entryType.GetField("message"); var modeF = entryType.GetField("mode"); var fileF = entryType.GetField("file");
const int errorMask = 1 | 2 | 16 | 64 | 256 | 2048;
const int warningMask = 128 | 512 | 4096;
var groups = new System.Collections.Generic.Dictionary<string, int>();
var files = new System.Collections.Generic.Dictionary<string, string>();
int errors = 0, warnings = 0;
entries.GetMethod("StartGettingEntries").Invoke(null, null);
var n = (int)entries.GetMethod("GetCount").Invoke(null, null);
for (int i = 0; i < n; i++)
{
  get.Invoke(null, new object[] { i, entry });
  var mode = (int)modeF.GetValue(entry);
  string type = (mode & errorMask) != 0 ? "error" : (mode & warningMask) != 0 ? "warning" : null;
  if (type == null) continue;
  var msg = ((string)msgF.GetValue(entry) ?? "").Split('\n')[0].Trim();
  if (msg.Contains("MCP-FOR-UNITY")) continue;
  if (type == "error") errors++; else warnings++;
  if (msg.Length > 300) msg = msg.Substring(0, 300);
  var key = type + "|" + msg;
  int c; groups.TryGetValue(key, out c); groups[key] = c + 1;
  if (!files.ContainsKey(key)) files[key] = (string)fileF.GetValue(entry) ?? "";
}
entries.GetMethod("EndGettingEntries").Invoke(null, null);
var list = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string, int>>(groups);
list.Sort((a, b) => b.Value.CompareTo(a.Value));

// 씬별 빠진 스크립트: Build Settings의 씬을 추가로 열어 세고 닫는다.
var scenes = new System.Text.StringBuilder("[");
var firstScene = true;
foreach (var s in UnityEditor.EditorBuildSettings.scenes)
{
  if (!s.enabled) continue;
  var already = UnityEngine.SceneManagement.SceneManager.GetSceneByPath(s.path);
  var scene = already.isLoaded ? already : UnityEditor.SceneManagement.EditorSceneManager.OpenScene(s.path, UnityEditor.SceneManagement.OpenSceneMode.Additive);
  var perObject = new System.Collections.Generic.Dictionary<string, int>();
  int total = 0;
  var stack = new System.Collections.Generic.Stack<UnityEngine.Transform>();
  foreach (var root in scene.GetRootGameObjects()) stack.Push(root.transform);
  while (stack.Count > 0)
  {
    var t = stack.Pop();
    var m = UnityEditor.GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(t.gameObject);
    if (m > 0)
    {
      total += m;
      var path = t.name; var p = t.parent;
      while (p != null) { path = p.name + "/" + path; p = p.parent; }
      perObject[path] = m;
    }
    foreach (UnityEngine.Transform child in t) stack.Push(child);
  }
  var sceneName = scene.name; // 닫은 뒤에는 이름을 읽을 수 없다
  if (!already.isLoaded) UnityEditor.SceneManagement.EditorSceneManager.CloseScene(scene, true);
  if (total == 0) continue;
  var objs = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string, int>>(perObject);
  objs.Sort((a, b) => b.Value.CompareTo(a.Value));
  var ob = new System.Text.StringBuilder("[");
  for (int i = 0; i < objs.Count && i < 5; i++) { if (i > 0) ob.Append(','); ob.Append("{\"object\":" + q(objs[i].Key) + ",\"count\":" + objs[i].Value + "}"); }
  ob.Append("]");
  if (!firstScene) scenes.Append(',');
  firstScene = false;
  scenes.Append("{\"scene\":" + q(sceneName) + ",\"missing\":" + total + ",\"objectsWithMissing\":" + perObject.Count + ",\"top\":" + ob + "}");
}
scenes.Append("]");

var sb = new System.Text.StringBuilder();
sb.Append("{\"errors\":" + errors + ",\"warnings\":" + warnings + ",\"distinct\":" + list.Count + ",\"groups\":[");
for (int i = 0; i < list.Count && i < 30; i++)
{
  var parts = list[i].Key.Split(new[] { '|' }, 2);
  if (i > 0) sb.Append(',');
  sb.Append("{\"type\":" + q(parts[0]) + ",\"message\":" + q(parts[1]) + ",\"count\":" + list[i].Value + ",\"file\":" + q(files[list[i].Key]) + "}");
}
sb.Append("],\"missingScripts\":" + scenes + "}");
System.IO.Directory.CreateDirectory(outDir);
System.IO.File.WriteAllText(outDir + "warnings.json", sb.ToString());
return new { errors = errors, warnings = warnings, distinct = list.Count };
