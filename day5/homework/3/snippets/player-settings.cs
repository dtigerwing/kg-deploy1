// 출시 점검에 쓰는 플레이어 설정. 읽기만 하고, 키스토어 비밀번호 같은 비밀 값은 넣지 않는다(설정됐는지 여부만).
var android = UnityEditor.Build.NamedBuildTarget.Android;
var ios = UnityEditor.Build.NamedBuildTarget.iOS;
var standalone = UnityEditor.Build.NamedBuildTarget.Standalone;
var icons = UnityEditor.PlayerSettings.GetIcons(UnityEditor.Build.NamedBuildTarget.Unknown, UnityEditor.IconKind.Any);
var iconCount = 0;
foreach (var i in icons) if (i != null) iconCount++;
var enabledScenes = 0;
foreach (var s in UnityEditor.EditorBuildSettings.scenes) if (s.enabled) enabledScenes++;
System.Func<UnityEditor.BuildTarget, string> apis = t =>
  string.Join(",", System.Array.ConvertAll(UnityEditor.PlayerSettings.GetGraphicsAPIs(t), a => a.ToString()));

return new
{
  activeTarget = UnityEditor.EditorUserBuildSettings.activeBuildTarget.ToString(),
  common = new
  {
    productName = UnityEditor.PlayerSettings.productName,
    companyName = UnityEditor.PlayerSettings.companyName,
    version = UnityEditor.PlayerSettings.bundleVersion,
    developmentBuild = UnityEditor.EditorUserBuildSettings.development,
    defaultIconCount = iconCount,
    splashScreen = UnityEditor.PlayerSettings.SplashScreen.show,
    enabledScenes = enabledScenes,
    stripEngineCode = UnityEditor.PlayerSettings.stripEngineCode,
  },
  android = new
  {
    installed = UnityEditor.BuildPipeline.IsBuildTargetSupported(UnityEditor.BuildTargetGroup.Android, UnityEditor.BuildTarget.Android),
    id = UnityEditor.PlayerSettings.GetApplicationIdentifier(android),
    versionCode = UnityEditor.PlayerSettings.Android.bundleVersionCode,
    minSdk = UnityEditor.PlayerSettings.Android.minSdkVersion.ToString(),
    targetSdk = UnityEditor.PlayerSettings.Android.targetSdkVersion.ToString(),
    architectures = UnityEditor.PlayerSettings.Android.targetArchitectures.ToString(),
    scriptingBackend = UnityEditor.PlayerSettings.GetScriptingBackend(android).ToString(),
    stripping = UnityEditor.PlayerSettings.GetManagedStrippingLevel(android).ToString(),
    customKeystore = UnityEditor.PlayerSettings.Android.useCustomKeystore,
    keystoreNameSet = !string.IsNullOrEmpty(UnityEditor.PlayerSettings.Android.keystoreName),
    appBundle = UnityEditor.EditorUserBuildSettings.buildAppBundle,
    graphicsApis = apis(UnityEditor.BuildTarget.Android),
    defineSymbols = UnityEditor.PlayerSettings.GetScriptingDefineSymbols(android),
  },
  ios = new
  {
    installed = UnityEditor.BuildPipeline.IsBuildTargetSupported(UnityEditor.BuildTargetGroup.iOS, UnityEditor.BuildTarget.iOS),
    id = UnityEditor.PlayerSettings.GetApplicationIdentifier(ios),
    buildNumber = UnityEditor.PlayerSettings.iOS.buildNumber,
    minOS = UnityEditor.PlayerSettings.iOS.targetOSVersionString,
    scriptingBackend = UnityEditor.PlayerSettings.GetScriptingBackend(ios).ToString(),
    stripping = UnityEditor.PlayerSettings.GetManagedStrippingLevel(ios).ToString(),
    automaticSigning = UnityEditor.PlayerSettings.iOS.appleEnableAutomaticSigning,
    teamIdSet = !string.IsNullOrEmpty(UnityEditor.PlayerSettings.iOS.appleDeveloperTeamID),
    cameraUsageDescription = UnityEditor.PlayerSettings.iOS.cameraUsageDescription,
    graphicsApis = apis(UnityEditor.BuildTarget.iOS),
    defineSymbols = UnityEditor.PlayerSettings.GetScriptingDefineSymbols(ios),
  },
  standalone = new
  {
    id = UnityEditor.PlayerSettings.GetApplicationIdentifier(standalone),
    scriptingBackend = UnityEditor.PlayerSettings.GetScriptingBackend(standalone).ToString(),
    stripping = UnityEditor.PlayerSettings.GetManagedStrippingLevel(standalone).ToString(),
    macBuildNumber = UnityEditor.PlayerSettings.macOS.buildNumber,
    defineSymbols = UnityEditor.PlayerSettings.GetScriptingDefineSymbols(standalone),
  },
};
