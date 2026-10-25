// /record-today 1단계 끝: 버전과 Android·iOS 플레이어 설정 → journal-tmp/project-info.json
// execute_code 로 실행한다. C# 6(codedom)이라 out var 같은 문법은 쓰지 않는다.
// OUT_DIR(끝에 / 포함한 journal-tmp 절대 경로)을 바꿔서 실행한다.
var outDir = "OUT_DIR";
System.Func<string, string> q = s => "\"" + (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
System.Func<bool, string> b = v => v ? "true" : "false";
System.Func<UnityEditor.BuildTarget, string> apis = t =>
  q(string.Join(",", System.Array.ConvertAll(UnityEditor.PlayerSettings.GetGraphicsAPIs(t), a => a.ToString())));
var android = UnityEditor.Build.NamedBuildTarget.Android;
var ios = UnityEditor.Build.NamedBuildTarget.iOS;

var sb = new System.Text.StringBuilder("{");
sb.Append("\"unityVersion\":" + q(UnityEngine.Application.unityVersion));
sb.Append(",\"productName\":" + q(UnityEditor.PlayerSettings.productName));
sb.Append(",\"version\":" + q(UnityEditor.PlayerSettings.bundleVersion));
sb.Append(",\"activeTarget\":" + q(UnityEditor.EditorUserBuildSettings.activeBuildTarget.ToString()));
sb.Append(",\"stripEngineCode\":" + b(UnityEditor.PlayerSettings.stripEngineCode));

sb.Append(",\"android\":{");
sb.Append("\"installed\":" + b(UnityEditor.BuildPipeline.IsBuildTargetSupported(UnityEditor.BuildTargetGroup.Android, UnityEditor.BuildTarget.Android)));
sb.Append(",\"id\":" + q(UnityEditor.PlayerSettings.GetApplicationIdentifier(android)));
sb.Append(",\"code\":" + q(UnityEditor.PlayerSettings.Android.bundleVersionCode.ToString()));
sb.Append(",\"minSdk\":" + q(UnityEditor.PlayerSettings.Android.minSdkVersion.ToString()));
sb.Append(",\"targetSdk\":" + q(UnityEditor.PlayerSettings.Android.targetSdkVersion.ToString()));
sb.Append(",\"architectures\":" + q(UnityEditor.PlayerSettings.Android.targetArchitectures.ToString()));
sb.Append(",\"scriptingBackend\":" + q(UnityEditor.PlayerSettings.GetScriptingBackend(android).ToString()));
sb.Append(",\"stripping\":" + q(UnityEditor.PlayerSettings.GetManagedStrippingLevel(android).ToString()));
sb.Append(",\"graphicsApis\":" + apis(UnityEditor.BuildTarget.Android));
sb.Append("}");

sb.Append(",\"ios\":{");
sb.Append("\"installed\":" + b(UnityEditor.BuildPipeline.IsBuildTargetSupported(UnityEditor.BuildTargetGroup.iOS, UnityEditor.BuildTarget.iOS)));
sb.Append(",\"id\":" + q(UnityEditor.PlayerSettings.GetApplicationIdentifier(ios)));
sb.Append(",\"code\":" + q(UnityEditor.PlayerSettings.iOS.buildNumber));
sb.Append(",\"minOS\":" + q(UnityEditor.PlayerSettings.iOS.targetOSVersionString));
sb.Append(",\"scriptingBackend\":" + q(UnityEditor.PlayerSettings.GetScriptingBackend(ios).ToString()));
sb.Append(",\"stripping\":" + q(UnityEditor.PlayerSettings.GetManagedStrippingLevel(ios).ToString()));
sb.Append(",\"graphicsApis\":" + apis(UnityEditor.BuildTarget.iOS));
sb.Append("}}");

System.IO.Directory.CreateDirectory(outDir);
System.IO.File.WriteAllText(outDir + "project-info.json", sb.ToString());
return sb.ToString();
