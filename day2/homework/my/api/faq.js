// GET /api/faq — 챗봇 창을 열 때 필요한 것: 이름, 첫인사, 안내 문구, 주제별 자주 묻는 질문 (답변은 /api/chat 이 줌)
import { fill, json, route } from './_lib/http.js';
import { loadKb, publicKb } from './_lib/kb.js';
import { loadSettings } from './_lib/settings.js';
import { emotionReady } from './_lib/emotion.js';

export const GET = route(async () => {
  const [settings, kb] = await Promise.all([loadSettings(), loadKb()]);
  return json(
    {
      botName: settings.botName,
      greeting: settings.greeting,
      notice: fill(settings.notice, { days: settings.privacy.retentionDays }),
      maxChars: settings.limits.maxChars,
      typingAnalysis: emotionReady && settings.emotion.enabled && settings.emotion.typingAnalysis,
      ...publicKb(kb),
    },
    200,
    { 'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300' },
  );
});
