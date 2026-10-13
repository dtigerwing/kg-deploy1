// OG 이미지 만들기: imagegen 배경(assets/gen/og-bg.jpg) 위에 코코비 공식 캐릭터와 로고·제목·주소를 얹어 1200x630 으로 저장
// 배경: scripts/prompts.jsonl 의 og-bg 로 만든 그림에서 imagegen edit 로 장난감들을 지운 빈 언덕
// 캐릭터: kigle.co.kr 공식 3D 캐릭터 그림 (AI 로 다시 그리지 않고 원본 그대로 사용)
// 사용: node scripts/make-og-image.cjs og-image.jpg   (전역 playwright + Chrome 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || 'og-image.jpg';
const ROOT = path.join(__dirname, '..');
const bg = fs.readFileSync(path.join(ROOT, 'assets/gen/og-bg.jpg')).toString('base64');

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">
<style>
  :root { --ink: #3a2e5c; --pink: #ff8fb1; --yellow: #ffd45c; --green: #8fdb6e; --paper: #fffdf7; --line: 4px solid var(--ink); }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; position: relative; overflow: hidden; font-family: 'Jua', sans-serif; color: var(--ink);
    background: url(data:image/jpeg;base64,${bg}) center 62% / cover; }
  .copy { position: absolute; left: 64px; top: 58px; }
  .logo { display: flex; align-items: center; gap: 12px; font-size: 40px; line-height: 1; }
  .blob { position: relative; width: 50px; height: 44px; background: var(--green); border: var(--line);
    border-radius: 55% 45% 50% 50% / 60% 60% 40% 40%; }
  .blob i { position: absolute; top: 12px; width: 8px; height: 11px; background: var(--ink); border-radius: 50%; }
  .blob i:first-child { left: 11px; } .blob i:last-child { right: 11px; }
  .badge { display: inline-block; margin: 46px 0 18px; padding: 6px 20px; font-size: 26px; background: var(--paper);
    border: var(--line); border-radius: 999px; transform: rotate(-3deg); }
  h1 { font-weight: 400; font-size: 92px; line-height: 1.12; letter-spacing: -0.01em; text-shadow: 0 5px 0 #fff; }
  h1 span { display: inline-block; color: var(--pink); -webkit-text-stroke: 3px var(--ink); paint-order: stroke fill;
    transform: rotate(-2deg); font-size: 112px; }
  .chars { position: absolute; right: 18px; bottom: 26px; width: 660px; filter: drop-shadow(0 10px 8px rgba(58,46,92,.18)); }
  .url { position: absolute; left: 64px; bottom: 50px; padding: 10px 24px; font-size: 26px; background: var(--yellow);
    border: var(--line); border-radius: 999px; box-shadow: 0 5px 0 var(--ink); }
</style></head><body>
  <div class="copy">
    <div class="logo"><span class="blob"><i></i><i></i></span>KIGLE</div>
    <div class="badge">꼬마공룡 코코비 &amp; 친구들</div>
    <h1>아이들의 첫 번째<br><span>놀이터</span></h1>
  </div>
  <img class="chars" src="https://kigle.co.kr/img/custom/main_visual_character_m.png" alt="">
  <div class="url">kg-deploy1-wheat.vercel.app</div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, type: 'jpeg', quality: 88, scale: 'css' });
  await browser.close();
  console.log('저장:', OUT);
})();
