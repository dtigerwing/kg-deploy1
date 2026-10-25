// 에셋별 임포트 설정. 읽기만 한다(임포터 값을 바꾸거나 다시 임포트하지 않는다).
var paths = {{PATHS}}.Split('\n');
var group = UnityEditor.BuildPipeline.GetBuildTargetGroup(UnityEditor.EditorUserBuildSettings.activeBuildTarget);
var texPlatform = group == UnityEditor.BuildTargetGroup.iOS ? "iPhone" : group == UnityEditor.BuildTargetGroup.Android ? "Android" : group == UnityEditor.BuildTargetGroup.Standalone ? "Standalone" : group.ToString();
var items = new System.Collections.Generic.List<object>();
foreach (var p in paths)
{
  var importer = UnityEditor.AssetImporter.GetAtPath(p);
  if (importer == null) { items.Add(new { path = p, error = "임포터 없음" }); continue; }
  var ti = importer as UnityEditor.TextureImporter;
  var ai = importer as UnityEditor.AudioImporter;
  var mi = importer as UnityEditor.ModelImporter;
  if (ti != null)
  {
    int w, h;
    ti.GetSourceTextureWidthAndHeight(out w, out h);
    var ps = ti.GetPlatformTextureSettings(texPlatform);
    items.Add(new
    {
      path = p, kind = "texture", sourceSize = w + "x" + h, textureType = ti.textureType.ToString(), maxSize = ti.maxTextureSize,
      compression = ti.textureCompression.ToString(), crunched = ti.crunchedCompression, mipmap = ti.mipmapEnabled, readable = ti.isReadable,
      platform = texPlatform, platformOverride = ps.overridden, platformFormat = ps.format.ToString(), platformMaxSize = ps.maxTextureSize,
    });
  }
  else if (ai != null)
  {
    var s = ai.defaultSampleSettings;
    items.Add(new
    {
      path = p, kind = "audio", loadType = s.loadType.ToString(), compression = s.compressionFormat.ToString(), quality = s.quality,
      sampleRate = s.sampleRateSetting.ToString(), forceToMono = ai.forceToMono, loadInBackground = ai.loadInBackground,
    });
  }
  else if (mi != null)
  {
    items.Add(new
    {
      path = p, kind = "model", meshCompression = mi.meshCompression.ToString(), readable = mi.isReadable, importAnimation = mi.importAnimation,
      importBlendShapes = mi.importBlendShapes, optimizeMesh = mi.optimizeMeshPolygons, generateColliders = mi.addCollider,
    });
  }
  else items.Add(new { path = p, kind = importer.GetType().Name });
}
return new { activeTarget = UnityEditor.EditorUserBuildSettings.activeBuildTarget.ToString(), items = items };
