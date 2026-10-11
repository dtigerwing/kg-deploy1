/**
 * AI 스터디 공유 문서 - Cloudflare Worker
 * - /api/*, /auth/* : 이 파일에서 처리 (D1 데이터베이스 사용)
 * - 그 외           : public 폴더의 정적 파일
 * 글 읽기는 누구나, 글쓰기·편집·댓글은 구글 계정으로 로그인한 뒤 할 수 있습니다.
 * 무료 플랜(Workers + D1)과 Google OAuth(무료)만 사용합니다.
 */

const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 14;
const OAUTH_COOKIE = 'oauth';
const LIMITS = { title: 100, category: 20, content: 50000, comment: 2000, message: 100 };

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/auth/')) return handleAuth(request, env, url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status);
      console.error(err);
      return json({ error: '서버 오류가 발생했습니다.' }, 500);
    }
  },
};

// ---------- 라우팅 ----------

async function handleApi(request, env, url) {
  const method = request.method;
  const path = url.pathname.replace(/\/+$/, '');
  if (method !== 'GET') checkSameOrigin(request, url);

  let userPromise;
  const getUser = () => (userPromise ??= currentUser(request, env));
  const needUser = async () => {
    const user = await getUser();
    if (!user) throw new HttpError(401, '로그인이 필요합니다.', { code: 'login_required' });
    return user;
  };
  // 관리자가 승인한 회원만 내용을 볼 수 있음
  const needMember = async () => {
    const user = await needUser();
    if (user.status !== 'approved') throw new HttpError(403, '가입 승인 후 이용할 수 있습니다.', { code: 'not_member' });
    return user;
  };
  const needAdmin = async () => {
    const user = await needUser();
    if (!user.isAdmin) throw new HttpError(403, '관리자만 사용할 수 있습니다.');
    return user;
  };

  let m;
  // 로그인 / 가입 신청 (승인 전에도 사용)
  if (path === '/api/me') {
    if (method === 'GET') return json({ user: await getUser() });
    if (method === 'PUT') return updateMe(request, env, await needMember());
  }
  if (path === '/api/join' && method === 'POST') return applyJoin(request, env, await needUser());
  if (path === '/api/logout' && method === 'POST') return logout(request, env);

  // 관리자: 회원 관리
  if (path === '/api/admin/members' && method === 'GET') return listMembers(env, await needAdmin());
  if ((m = path.match(/^\/api\/admin\/members\/(\d+)$/)) && method === 'POST') {
    return reviewMember(request, env, await needAdmin(), Number(m[1]));
  }

  // 여기부터는 회원만
  const user = await needMember();
  if (path === '/api/activity' && method === 'GET') return activity(env);
  if (path === '/api/boards' && method === 'GET') return listBoards(env, user);
  if (path === '/api/images' && method === 'POST') return uploadImage(request, env, user);
  if ((m = path.match(/^\/api\/images\/([0-9a-f]{32})$/)) && method === 'GET') return getImage(env, m[1]);

  if (path === '/api/posts') {
    if (method === 'GET') return listPosts(env, url);
    if (method === 'POST') return createPost(request, env, user);
  }
  if ((m = path.match(/^\/api\/posts\/(\d+)$/))) {
    const id = Number(m[1]);
    if (method === 'GET') return getPost(env, id, url);
    if (method === 'PUT') return updatePost(request, env, user, id);
    if (method === 'DELETE') return deletePost(env, user, id);
  }
  if ((m = path.match(/^\/api\/posts\/(\d+)\/revisions$/)) && method === 'GET') {
    return listRevisions(env, Number(m[1]));
  }
  if ((m = path.match(/^\/api\/revisions\/(\d+)$/)) && method === 'GET') {
    return getRevision(env, Number(m[1]));
  }
  if ((m = path.match(/^\/api\/posts\/(\d+)\/comments$/)) && method === 'POST') {
    return createComment(request, env, user, Number(m[1]));
  }
  if ((m = path.match(/^\/api\/comments\/(\d+)$/)) && method === 'DELETE') {
    return deleteComment(env, user, Number(m[1]));
  }
  throw new HttpError(404, '존재하지 않는 API입니다.');
}

// ---------- 구글 로그인 (OAuth 2.0 / OpenID Connect) ----------

async function handleAuth(request, env, url) {
  try {
    if (request.method === 'GET' && url.pathname === '/auth/login') return await googleLogin(env, url);
    if (request.method === 'GET' && url.pathname === '/auth/callback') return await googleCallback(request, env, url);
    return new Response('Not found', { status: 404 });
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    const message = err instanceof HttpError ? err.message : '로그인 중 오류가 발생했습니다.';
    return redirect(`/#/login?error=${encodeURIComponent(message)}`, [['set-cookie', cookie(OAUTH_COOKIE, '', 0, '/auth')]]);
  }
}

// 1단계: 구글 로그인 화면으로 보내기
async function googleLogin(env, url) {
  const next = safeNext(url.searchParams.get('next'));

  // 로컬 개발(wrangler dev): 구글 대신 .dev.vars 의 DEV_USER_EMAIL(또는 ?as=주소) 사용자로 바로 로그인
  if (isDev(env, url)) {
    const email = (url.searchParams.get('as') || env.DEV_USER_EMAIL).toLowerCase();
    return startSession(env, await findOrCreateUser(env, email, email.split('@')[0]), next);
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(500, '구글 로그인 설정(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)이 아직 되어 있지 않습니다.');
  }

  // state: 다른 사이트가 로그인 결과를 끼워 넣는 것 방지 / nonce: 토큰 재사용 방지 / PKCE: 인가 코드 가로채기 방지
  const state = randomHex(16);
  const nonce = randomHex(16);
  const verifier = randomHex(32);
  const challenge = b64urlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  if (env.ALLOWED_EMAIL_DOMAIN) params.set('hd', env.ALLOWED_EMAIL_DOMAIN);

  const saved = b64urlEncode(new TextEncoder().encode(JSON.stringify({ state, nonce, verifier, next })));
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, [['set-cookie', cookie(OAUTH_COOKIE, saved, 600, '/auth')]]);
}

// 2단계: 구글이 돌려보낸 인가 코드를 토큰으로 바꾸고 사용자 확인
async function googleCallback(request, env, url) {
  if (url.searchParams.get('error')) throw new HttpError(400, '구글 로그인이 취소되었습니다.');
  let saved = null;
  try {
    saved = JSON.parse(new TextDecoder().decode(b64urlDecode(readCookie(request, OAUTH_COOKIE) || '')));
  } catch { /* 쿠키 없음/손상 */ }
  const code = url.searchParams.get('code');
  if (!saved || !code || url.searchParams.get('state') !== saved.state) {
    throw new HttpError(400, '로그인 요청이 만료되었습니다. 다시 시도해 주세요.');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/callback`,
      grant_type: 'authorization_code',
      code_verifier: saved.verifier,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) {
    console.error('google token error', res.status, data.error);
    throw new HttpError(502, '구글 로그인에 실패했습니다. 다시 시도해 주세요.');
  }

  // 구글 토큰 서버에서 HTTPS로 직접 받은 ID 토큰이므로 서명 검증 대신 내용을 확인합니다 (OpenID Connect Core 3.1.3.7)
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(data.id_token.split('.')[1])));
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const validIssuer = ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss);
  if (!validIssuer || !aud.includes(env.GOOGLE_CLIENT_ID) || claims.exp < Date.now() / 1000 || claims.nonce !== saved.nonce) {
    throw new HttpError(400, '로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.');
  }
  if (typeof claims.email !== 'string' || claims.email_verified !== true) {
    throw new HttpError(403, '이메일 인증이 끝난 구글 계정만 사용할 수 있습니다.');
  }
  const email = claims.email.toLowerCase();
  const domain = String(env.ALLOWED_EMAIL_DOMAIN || '').toLowerCase();
  if (domain && (claims.hd !== domain || !email.endsWith('@' + domain))) {
    throw new HttpError(403, `@${domain} 계정만 사용할 수 있습니다.`);
  }

  const name = String(claims.name || email.split('@')[0]).trim().slice(0, 20);
  return startSession(env, await findOrCreateUser(env, email, name), saved.next);
}

async function findOrCreateUser(env, email, displayName) {
  const found = await env.DB.prepare('SELECT id, email, display_name AS displayName, status FROM users WHERE email = ?').bind(email).first();
  if (found) return found;
  const created = await env.DB.prepare(
    `INSERT INTO users (email, display_name) VALUES (?, ?)
     ON CONFLICT (email) DO UPDATE SET email = excluded.email
     RETURNING id, email, display_name AS displayName, status`
  ).bind(email, displayName).first();
  return { ...created, isNew: true };
}

async function startSession(env, user, next) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')"),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256(token), user.id, sqlDate(expires)),
  ]);
  // 처음 로그인한 사람은 가입 신청서로 (관리자는 바로 홈으로)
  return redirect(user.isNew && !isAdminEmail(env, user.email) ? '/#/join' : `/${next}`, [
    ['set-cookie', cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400)],
    ['set-cookie', cookie(OAUTH_COOKIE, '', 0, '/auth')],
  ]);
}

const USER_COLUMNS = `u.id, u.email, u.display_name AS displayName, u.status, u.intro, u.applied_at AS appliedAt`;

const isAdminEmail = (env, email) => String(env.ADMIN_EMAILS || '')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(String(email).toLowerCase());

async function currentUser(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const user = await env.DB.prepare(
    `SELECT ${USER_COLUMNS}
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
  ).bind(await sha256(token)).first();
  if (!user) return null;
  user.isAdmin = isAdminEmail(env, user.email);
  // 관리자는 항상 회원 (처음 한 번만 DB 에 반영)
  if (user.isAdmin && user.status !== 'approved') {
    await env.DB.prepare("UPDATE users SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?").bind(user.id).run();
    user.status = 'approved';
  }
  return user;
}

async function logout(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': cookie(SESSION_COOKIE, '', 0) });
}

async function updateMe(request, env, user) {
  const displayName = text((await readJson(request)).displayName, '닉네임', 20);
  await env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(displayName, user.id).run();
  return json({ user: { ...user, displayName } });
}

// 가입 신청서 제출 (승인 대기 중에는 다시 고쳐서 낼 수 있음)
async function applyJoin(request, env, user) {
  if (user.status === 'approved') throw new HttpError(400, '이미 가입된 회원입니다.');
  if (user.status !== 'pending') throw new HttpError(403, '가입 신청을 할 수 없는 계정입니다.');
  const body = await readJson(request);
  const displayName = text(body.displayName, '닉네임', 20);
  const intro = text(body.intro, '한 줄 소개', 200);
  await env.DB.prepare("UPDATE users SET display_name = ?, intro = ?, applied_at = datetime('now') WHERE id = ?")
    .bind(displayName, intro, user.id).run();
  return json({ user: { ...user, displayName, intro, appliedAt: sqlDate(new Date()) } });
}

// ---------- 회원 관리 (관리자) ----------

async function listMembers(env) {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name AS displayName, u.status, u.intro,
       u.applied_at AS appliedAt, u.reviewed_at AS reviewedAt, u.created_at AS createdAt,
       (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS postCount,
       (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id) AS commentCount
     FROM users u
     WHERE u.email NOT LIKE '%@legacy.invalid'
     ORDER BY COALESCE(u.applied_at, u.created_at) DESC`
  ).all();
  for (const member of results) member.isAdmin = isAdminEmail(env, member.email);
  return json({ members: results });
}

const REVIEW_ACTIONS = { approve: 'approved', reject: 'rejected', ban: 'banned' };

async function reviewMember(request, env, admin, id) {
  const status = REVIEW_ACTIONS[(await readJson(request)).action];
  if (!status) throw new HttpError(400, '알 수 없는 작업입니다.');
  const member = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(id).first();
  if (!member || member.email.endsWith('@legacy.invalid')) throw new HttpError(404, '회원을 찾을 수 없습니다.');
  if (isAdminEmail(env, member.email)) throw new HttpError(400, '관리자 계정은 바꿀 수 없습니다.');

  const statements = [
    env.DB.prepare("UPDATE users SET status = ?, reviewed_at = datetime('now') WHERE id = ?").bind(status, id),
  ];
  // 거절·강퇴하면 로그인도 끊음
  if (status !== 'approved') statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
  await env.DB.batch(statements);
  return json({ ok: true, status });
}

const isDev = (env, url) => Boolean(env.DEV_USER_EMAIL) && ['localhost', '127.0.0.1'].includes(url.hostname);

// 로그인 후 돌아갈 화면. 같은 사이트의 #/ 경로만 허용 (다른 사이트로 보내는 것 방지)
const safeNext = (next) => (typeof next === 'string' && /^#\/[^\s]{0,300}$/.test(next) ? next : '#/');

// ---------- 게시판 ----------

const PAGE_SIZE = 15;

async function listBoards(env, user) {
  const [boardRes, statRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT b.id, b.name, b.description, b.group_name AS groupName, b.is_notice AS isNotice,
         COUNT(p.id) AS postCount,
         COALESCE(SUM(p.created_at > datetime('now', '-1 day')), 0) AS newCount
       FROM boards b LEFT JOIN posts p ON p.board_id = b.id
       GROUP BY b.id ORDER BY b.sort_order, b.id`
    ),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM users WHERE status = 'approved' AND email NOT LIKE '%@legacy.invalid') AS members,
              (SELECT COUNT(*) FROM users WHERE status = 'pending' AND applied_at IS NOT NULL) AS pendingMembers,
              (SELECT COUNT(*) FROM posts) AS posts,
              (SELECT COUNT(*) FROM posts WHERE created_at > datetime('now', '-1 day')) AS newPosts`
    ),
  ]);
  const stats = statRes.results[0];
  if (!user.isAdmin) delete stats.pendingMembers;
  return json({ boards: boardRes.results, stats });
}

async function findBoard(env, boardId) {
  const board = await env.DB.prepare('SELECT id, name, is_notice AS isNotice FROM boards WHERE id = ?').bind(Number(boardId) || 0).first();
  if (!board) throw new HttpError(400, '게시판을 선택해 주세요.');
  return board;
}

// ---------- 게시글 ----------

const POST_COLUMNS = `p.id, p.title, p.category, p.board_id AS boardId, b.name AS boardName, p.version,
  p.view_count AS viewCount, p.created_at AS createdAt, p.updated_at AS updatedAt,
  p.author_id AS authorId, a.display_name AS author, e.display_name AS editor`;
const POST_JOINS = `FROM posts p JOIN boards b ON b.id = p.board_id
  JOIN users a ON a.id = p.author_id JOIN users e ON e.id = p.last_editor_id`;
const LIST_COLUMNS = `p.id, p.title, p.board_id AS boardId, b.name AS boardName, p.view_count AS viewCount,
  p.created_at AS createdAt, a.display_name AS author,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentCount`;
const LIST_JOINS = 'FROM posts p JOIN boards b ON b.id = p.board_id JOIN users a ON a.id = p.author_id';

// 게시판 글 목록 (최신 글이 위, 페이지 단위). board 가 없으면 전체글보기
async function listPosts(env, url) {
  const boardId = Number(url.searchParams.get('board')) || null;
  const q = (url.searchParams.get('q') || '').trim().slice(0, 50);
  const page = Math.max(1, Math.min(1000, Number(url.searchParams.get('page')) || 1));
  const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  const where = `WHERE (?1 IS NULL OR p.board_id = ?1)
    AND (?2 = '' OR p.title LIKE ?3 ESCAPE '\\' OR p.content LIKE ?3 ESCAPE '\\')`;

  const statements = [
    env.DB.prepare(`SELECT ${LIST_COLUMNS} ${LIST_JOINS} ${where} ORDER BY p.id DESC LIMIT ?4 OFFSET ?5`)
      .bind(boardId, q, like, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    env.DB.prepare(`SELECT COUNT(*) AS total ${LIST_JOINS} ${where}`).bind(boardId, q, like),
  ];
  // 첫 페이지에는 공지 게시판 글을 위에 고정 (공지 게시판 자체를 볼 때와 검색할 때는 제외)
  const showNotices = page === 1 && !q;
  if (showNotices) {
    statements.push(env.DB.prepare(
      `SELECT ${LIST_COLUMNS} ${LIST_JOINS} WHERE b.is_notice = 1 AND (?1 IS NULL OR p.board_id != ?1)
       ORDER BY p.id DESC LIMIT 3`
    ).bind(boardId));
  }
  const [listRes, countRes, noticeRes] = await env.DB.batch(statements);
  return json({
    posts: listRes.results,
    notices: noticeRes ? noticeRes.results : [],
    total: countRes.results[0].total,
    page,
    pageSize: PAGE_SIZE,
  });
}

async function getPost(env, id, url) {
  // 수정 화면에서 불러올 때(noview=1)는 조회수를 올리지 않음
  if (url.searchParams.get('noview') !== '1') {
    await env.DB.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').bind(id).run();
  }
  const [postRes, commentRes] = await env.DB.batch([
    env.DB.prepare(`SELECT ${POST_COLUMNS}, p.content ${POST_JOINS} WHERE p.id = ?`).bind(id),
    env.DB.prepare(
      `SELECT c.id, c.body, c.created_at AS createdAt, c.author_id AS authorId, u.display_name AS author
       FROM comments c JOIN users u ON u.id = c.author_id
       WHERE c.post_id = ? ORDER BY c.id`
    ).bind(id),
  ]);
  const post = postRes.results[0];
  if (!post) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  post.comments = commentRes.results;

  // 같은 게시판의 이전글(더 오래된 글) / 다음글(더 최근 글)
  const [prevRes, nextRes] = await env.DB.batch([
    env.DB.prepare('SELECT id, title FROM posts WHERE board_id = ? AND id < ? ORDER BY id DESC LIMIT 1').bind(post.boardId, id),
    env.DB.prepare('SELECT id, title FROM posts WHERE board_id = ? AND id > ? ORDER BY id ASC LIMIT 1').bind(post.boardId, id),
  ]);
  post.prev = prevRes.results[0] || null;
  post.next = nextRes.results[0] || null;
  return json({ post });
}

async function createPost(request, env, user) {
  const fields = await postFields(env, await readJson(request), user);
  const row = await env.DB.prepare(
    'INSERT INTO posts (title, category, board_id, content, author_id, last_editor_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
  ).bind(fields.title, fields.category, fields.boardId, fields.content, user.id, user.id).first();
  await insertRevision(env, row.id, 1, fields, user.id, '새 글 작성');
  return json({ id: row.id, version: 1 }, 201);
}

async function updatePost(request, env, user, id) {
  const body = await readJson(request);
  const fields = await postFields(env, body, user);
  if (!user.isAdmin) {
    const existing = await env.DB.prepare('SELECT b.is_notice AS isNotice FROM posts p JOIN boards b ON b.id = p.board_id WHERE p.id = ?').bind(id).first();
    if (existing?.isNotice) throw new HttpError(403, '공지사항은 관리자만 수정할 수 있습니다.');
  }
  const baseVersion = Number(body.version);
  if (!Number.isInteger(baseVersion)) throw new HttpError(400, '버전 정보가 없습니다.');
  const message = text(body.message, '수정 메모', LIMITS.message, { min: 0 });

  // 편집을 시작한 버전(baseVersion)이 아직 최신일 때만 저장 → 동시 편집 시 덮어쓰기 방지
  const res = await env.DB.prepare(
    `UPDATE posts SET title = ?, category = ?, board_id = ?, content = ?, last_editor_id = ?,
       version = version + 1, updated_at = datetime('now')
     WHERE id = ? AND version = ?`
  ).bind(fields.title, fields.category, fields.boardId, fields.content, user.id, id, baseVersion).run();

  if (!res.meta.changes) {
    const current = await env.DB.prepare(`SELECT ${POST_COLUMNS}, p.content ${POST_JOINS} WHERE p.id = ?`).bind(id).first();
    if (!current) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
    throw new HttpError(409, '편집하는 동안 다른 사람이 이 글을 수정했습니다.', { current });
  }
  await insertRevision(env, id, baseVersion + 1, fields, user.id, message);
  return json({ id, version: baseVersion + 1 });
}

async function deletePost(env, user, id) {
  const post = await env.DB.prepare('SELECT author_id, board_id FROM posts WHERE id = ?').bind(id).first();
  if (!post) throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  if (post.author_id !== user.id && !user.isAdmin) throw new HttpError(403, '게시글은 처음 작성한 사람과 관리자만 삭제할 수 있습니다.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM comments WHERE post_id = ?').bind(id),
    env.DB.prepare('DELETE FROM revisions WHERE post_id = ?').bind(id),
    env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id),
  ]);
  return json({ ok: true, boardId: post.board_id });
}

// 변경 이력에는 게시판 이름(category)을 함께 남깁니다.
async function postFields(env, body, user) {
  const board = await findBoard(env, body.boardId);
  if (board.isNotice && !user.isAdmin) throw new HttpError(403, '공지사항 게시판에는 관리자만 글을 쓸 수 있습니다.');
  return {
    title: text(body.title, '제목', LIMITS.title),
    boardId: board.id,
    category: board.name,
    content: text(body.content, '본문', LIMITS.content, { trim: false }),
  };
}

function insertRevision(env, postId, version, fields, editorId, message) {
  return env.DB.prepare(
    'INSERT INTO revisions (post_id, version, title, category, content, editor_id, message) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(postId, version, fields.title, fields.category, fields.content, editorId, message).run();
}

// ---------- 변경 이력 ----------

async function listRevisions(env, postId) {
  const [postRes, revRes] = await env.DB.batch([
    env.DB.prepare('SELECT id, title, category, board_id AS boardId, version FROM posts WHERE id = ?').bind(postId),
    env.DB.prepare(
      `SELECT r.id, r.version, r.title, r.message, r.created_at AS createdAt, length(r.content) AS size,
         u.display_name AS editor
       FROM revisions r JOIN users u ON u.id = r.editor_id
       WHERE r.post_id = ? ORDER BY r.version DESC`
    ).bind(postId),
  ]);
  const post = postRes.results[0];
  if (!post) throw new HttpError(404, '문서를 찾을 수 없습니다.');
  return json({ post, revisions: revRes.results });
}

async function getRevision(env, id) {
  const revision = await env.DB.prepare(
    `SELECT r.id, r.post_id AS postId, r.version, r.title, r.category, r.content, r.message,
       r.created_at AS createdAt, u.display_name AS editor,
       p.version AS currentVersion, p.title AS currentTitle, p.board_id AS currentBoardId
     FROM revisions r JOIN users u ON u.id = r.editor_id JOIN posts p ON p.id = r.post_id
     WHERE r.id = ?`
  ).bind(id).first();
  if (!revision) throw new HttpError(404, '버전을 찾을 수 없습니다.');
  const previous = await env.DB.prepare(
    'SELECT id, version, title, category, content FROM revisions WHERE post_id = ? AND version < ? ORDER BY version DESC LIMIT 1'
  ).bind(revision.postId, revision.version).first();
  return json({ revision, previous });
}

// ---------- 댓글 ----------

async function createComment(request, env, user, postId) {
  const body = text((await readJson(request)).body, '댓글', LIMITS.comment);
  const post = await env.DB.prepare('SELECT 1 FROM posts WHERE id = ?').bind(postId).first();
  if (!post) throw new HttpError(404, '문서를 찾을 수 없습니다.');
  const comment = await env.DB.prepare(
    'INSERT INTO comments (post_id, author_id, body) VALUES (?, ?, ?) RETURNING id, body, created_at AS createdAt, author_id AS authorId'
  ).bind(postId, user.id, body).first();
  return json({ comment: { ...comment, author: user.displayName } }, 201);
}

async function deleteComment(env, user, id) {
  const comment = await env.DB.prepare('SELECT author_id FROM comments WHERE id = ?').bind(id).first();
  if (!comment) throw new HttpError(404, '댓글을 찾을 수 없습니다.');
  if (comment.author_id !== user.id && !user.isAdmin) throw new HttpError(403, '내가 쓴 댓글만 삭제할 수 있습니다.');
  await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// ---------- 이미지 ----------

const IMAGE_MAX_BYTES = 1024 * 1024;
const IMAGE_DAILY_LIMIT = 100;

// 파일 앞부분(매직 넘버)으로 실제 이미지 형식 확인. SVG 처럼 스크립트가 들어갈 수 있는 형식은 받지 않음
function sniffImage(bytes) {
  const at = (i, ...vals) => vals.every((v, k) => bytes[i + k] === v);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

async function uploadImage(request, env, user) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) throw new HttpError(400, '이미지 파일이 비어 있습니다.');
  if (bytes.length > IMAGE_MAX_BYTES) throw new HttpError(413, '이미지는 1MB 이하만 올릴 수 있습니다.');
  const mime = sniffImage(bytes);
  if (!mime) throw new HttpError(415, 'PNG, JPG, GIF, WEBP 이미지만 올릴 수 있습니다.');

  const { count } = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM images WHERE uploader_id = ? AND created_at > datetime('now', '-1 day')"
  ).bind(user.id).first();
  if (count >= IMAGE_DAILY_LIMIT) throw new HttpError(429, `이미지는 하루 ${IMAGE_DAILY_LIMIT}장까지 올릴 수 있습니다.`);

  const id = randomHex(16);
  await env.DB.prepare('INSERT INTO images (id, mime, data, size, uploader_id) VALUES (?, ?, ?, ?, ?)')
    .bind(id, mime, bytes, bytes.length, user.id).run();
  return json({ url: `/api/images/${id}` }, 201);
}

async function getImage(env, id) {
  const row = await env.DB.prepare('SELECT mime, data FROM images WHERE id = ?').bind(id).first();
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      'content-type': row.mime,
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}

// ---------- 최근 활동 ----------

async function activity(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM (
       SELECT 'edit' AS type, r.id AS refId, r.post_id AS postId, p.title, r.version, r.message AS detail,
         u.display_name AS who, r.created_at AS createdAt
       FROM revisions r JOIN posts p ON p.id = r.post_id JOIN users u ON u.id = r.editor_id
       ORDER BY r.created_at DESC LIMIT 30
     )
     UNION ALL
     SELECT * FROM (
       SELECT 'comment', c.id, c.post_id, p.title, NULL, substr(c.body, 1, 80), u.display_name, c.created_at
       FROM comments c JOIN posts p ON p.id = c.post_id JOIN users u ON u.id = c.author_id
       ORDER BY c.created_at DESC LIMIT 30
     )
     ORDER BY createdAt DESC
     LIMIT 30`
  ).all();
  return json({ items: results });
}

// ---------- 유틸 ----------

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

// 다른 사이트에서 로그인 쿠키를 이용해 요청을 보내는 것(CSRF)을 막습니다.
function checkSameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) throw new HttpError(403, '허용되지 않은 요청입니다.');
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    throw new HttpError(415, 'JSON 형식으로 보내 주세요.');
  }
  try {
    return (await request.json()) || {};
  } catch {
    throw new HttpError(400, '요청 형식이 올바르지 않습니다.');
  }
}

function text(value, name, max, { min = 1, trim = true } = {}) {
  let v = typeof value === 'string' ? value : '';
  if (trim) v = v.trim();
  if (v.trim().length < min) throw new HttpError(400, `${name}을(를) 입력해 주세요.`);
  if (v.length > max) throw new HttpError(400, `${name}은(는) ${max}자 이하로 입력해 주세요.`);
  return v;
}

function redirect(location, headerPairs = []) {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const [k, v] of headerPairs) headers.append(k, v);
  return new Response(null, { status: 302, headers });
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function cookie(name, value, maxAge, path = '/') {
  return `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

const sqlDate = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const b64urlEncode = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlDecode = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
