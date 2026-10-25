// /record-today 4단계: 지금 Play 중인 씬의 프레임 시간·드로우콜 → journal-tmp/perf-<씬이름>.json
// execute_code 로 실행한다. C# 6(codedom)이라 out var 같은 문법은 쓰지 않는다.
// OUT_DIR(끝에 / 포함한 journal-tmp 절대 경로)과 SAMPLE_SECONDS(숫자)를 바꿔서, Play 모드에 들어간 "뒤에" 실행한다.
// Play 모드에 들어갈 때 도메인 리로드가 있어서, 그 전에 걸면 측정기가 사라진다.
//
// MCP로 1초마다 읽으면 안 되는 이유: Claude에 명령하는 동안 Unity가 비활성이 되어 Play 모드가 거의 멈춘다
// (프레임 100~200ms, 드로우콜 0). 그래서 Unity 안에서 매 프레임 재고, Unity가 활성일 때만 센다.
// 2초 준비 → SAMPLE_SECONDS 동안 측정 → 파일 쓰기 → Play 모드 멈춤. 2분 안에 못 재면 error를 쓰고 멈춘다.
var outDir = "OUT_DIR";
var sampleSeconds = SAMPLE_SECONDS;
var sceneName = UnityEngine.SceneManagement.SceneManager.GetActiveScene().name;
var outPath = outDir + "perf-" + sceneName + ".json";
var inv = System.Globalization.CultureInfo.InvariantCulture;
var recorder = Unity.Profiling.ProfilerRecorder.StartNew(Unity.Profiling.ProfilerCategory.Render, "Draw Calls Count");
var ft = new FrameTiming[1];
var frames = new System.Collections.Generic.List<double>();
var startedAt = EditorApplication.timeSinceStartup;
double warm = 0, measured = 0, sumDc = 0;
int dropped = 0;
System.IO.Directory.CreateDirectory(outDir);

EditorApplication.CallbackFunction finish = null;
EditorApplication.CallbackFunction cb = null;
finish = () =>
{
  EditorApplication.update -= cb;
  recorder.Dispose();
  Application.runInBackground = false;
  EditorApplication.isPlaying = false;
};
cb = () =>
{
  if (!EditorApplication.isPlaying) { EditorApplication.update -= cb; recorder.Dispose(); return; }
  if (EditorApplication.timeSinceStartup - startedAt > 120)
  {
    System.IO.File.WriteAllText(outPath, "{\"name\":\"" + sceneName + "\",\"error\":\"2분 동안 Unity 창이 활성화되지 않음\"}");
    finish();
    return;
  }
  if (!UnityEditorInternal.InternalEditorUtility.isApplicationActive) return;
  var dt = Time.unscaledDeltaTime;
  if (warm < 2) { warm += dt; return; }

  // FrameTimingManager가 가끔 터무니없는 값(수십억 ms)을 주므로, 1초를 넘거나 0 이하면 그 프레임 간격으로 바꾼다.
  FrameTimingManager.CaptureFrameTimings();
  double ms = dt * 1000.0;
  if (FrameTimingManager.GetLatestTimings(1, ft) > 0) ms = ft[0].cpuFrameTime;
  if (double.IsNaN(ms) || ms <= 0 || ms > 1000) { dropped++; ms = dt * 1000.0; }
  frames.Add(ms);
  sumDc += recorder.LastValue;
  measured += dt;
  if (measured < sampleSeconds) return;

  double sum = 0;
  foreach (var f in frames) sum += f;
  frames.Sort();
  System.IO.File.WriteAllText(outPath,
    "{\"name\":\"" + sceneName + "\"" +
    ",\"frameMs\":" + System.Math.Round(sum / frames.Count, 2).ToString(inv) +
    ",\"drawCalls\":" + System.Math.Round(sumDc / frames.Count, 1).ToString(inv) +
    ",\"samples\":" + frames.Count + ",\"dropped\":" + dropped +
    ",\"medianMs\":" + System.Math.Round(frames[frames.Count / 2], 2).ToString(inv) + "}");
  finish();
};
EditorApplication.update += cb;
return "측정기 시작: " + sceneName;
