// 공유용 결과 페이지: /share/<주제>/<후보>?q=<맞힌 질문 수>
// 링크를 열면 목각인형 그림과 [나도 해보기] 버튼이 나온다. 카카오톡·슬랙 등에 붙이면
// og 태그를 읽어서 그림을 미리보기로 보여준다 (그림 주소는 전체 주소여야 해서 요청 주소에서 origin 을 쓴다).
import { ACTORS } from './actors.mjs';
import { topicData } from './topics.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const subject = (name) => {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return name + (code >= 0 && code <= 11171 && code % 28 ? '이' : '가');
};

export async function sharePage(request, topicId, candidateId, store) {
  const url = new URL(request.url);
  const data = topicData(topicId);
  const candidate = data?.candidates.find((c) => c.id === candidateId) || (data && (await store.getFound(`${topicId}/${candidateId}`)));
  if (!candidate) return html(404, page({ origin: url.origin, title: '루소 목공소', heading: '찾을 수 없는 작품이에요', body: '' }));

  const key = `${topicId}/${candidateId}`;
  const v = await store.imageVersion(topicId, candidateId);
  const actor = ACTORS[(await store.getActor(key))?.id];
  const count = Number(url.searchParams.get('q')) || 0;
  const image = v ? `${url.origin}/images/${topicId}/${candidateId}?v=${v}` : null;

  const title = `루소 목공소 · ${candidate.name} 목각인형`;
  const desc = `${count ? `목수 루소가 스무고개 ${count}번 만에 맞히고` : '목수 루소가 스무고개로 맞히고'} 뚝딱 만든 ${candidate.name} 목각인형이에요. 나도 해보기!`;
  const body = `
    <figure>
      ${image ? `<img src="${esc(image)}" alt="${esc(candidate.name)} 목각인형">` : '<div class="empty">🪵</div>'}
      <figcaption>${esc(candidate.name)}</figcaption>
    </figure>
    <p class="meta">${esc(data.name)}${actor ? ` · ${esc(subject(actor.name))} 흉내를 냈어요` : ''}${count ? ` · ${count}번 만에 맞힘` : ''}</p>`;
  return html(200, page({ origin: url.origin, title, desc, image, pageUrl: url.href, heading: '루소가 만든 작품', body }));
}

function html(status, text) {
  return new Response(text, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}

function page({ origin, title, desc = '목수 루소가 스무고개로 맞히고 뚝딱 만들어 주는 게임', image, pageUrl, heading, body }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="루소 목공소">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${pageUrl ? `<meta property="og:url" content="${esc(pageUrl)}">` : ''}
${image ? `<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1024">
<meta property="og:image:height" content="1024">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(image)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&display=swap" rel="stylesheet">
<style>
  body { margin: 0; min-height: 100vh; background: #fff6e6; color: #3b2a1a; font-family: 'Gowun Dodum', system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; }
  header { width: 100%; box-sizing: border-box; padding: 12px 24px; background: #c0824a; border-bottom: 5px solid #8d5527; }
  header a { color: #fff; font-family: 'Jua', sans-serif; font-size: 22px; text-decoration: none; }
  main { width: min(92vw, 460px); padding: 28px 0 40px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  h1 { margin: 0; font-family: 'Jua', sans-serif; font-weight: normal; font-size: 26px; color: #8d5527; }
  figure { margin: 0; width: 100%; }
  img, .empty { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 18px; border: 6px solid #fffdf8; box-shadow: 0 12px 26px rgba(60, 30, 10, 0.3); background: #f6e3c4; }
  .empty { display: grid; place-items: center; font-size: 90px; }
  figcaption { width: 70%; margin: -16px auto 0; position: relative; padding: 10px 16px; text-align: center; background: linear-gradient(#e8b981, #c0824a); border: 3px solid #8d5527; border-radius: 10px; font-family: 'Jua', sans-serif; font-size: 28px; box-shadow: 0 4px 0 rgba(90, 50, 20, 0.35); }
  .meta { margin: 6px 0 0; color: #8a7258; font-size: 15px; text-align: center; }
  .cta { margin-top: 8px; padding: 14px 40px; border-radius: 14px; background: #2f6fd6; border: 3px solid #2457ab; color: #fff; font-family: 'Jua', sans-serif; font-size: 22px; text-decoration: none; box-shadow: 0 6px 0 #2457ab; }
</style>
</head>
<body>
<header><a href="${esc(origin)}/">루소 목공소</a></header>
<main>
  <h1>${esc(heading)}</h1>
  ${body}
  <a class="cta" href="${esc(origin)}/">나도 해보기</a>
</main>
</body>
</html>`;
}
