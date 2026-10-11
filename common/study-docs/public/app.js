(() => {
  'use strict';

  // ---------- helpers ----------
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;

  const ICONS = {
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const GOOGLE_LOGO = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.2 0-11.5-4.1-13.4-9.9l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

  // 이름으로 아바타 색 정하기
  function avatar(name, small = false) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    const initial = [...String(name || '?')][0];
    return `<span class="avatar${small ? ' sm' : ''}" style="--av:hsl(${h % 360} 45% 50%)" aria-hidden="true">${esc(initial)}</span>`;
  }

  // D1의 datetime('now')는 UTC "YYYY-MM-DD HH:MM:SS"
  const toDate = (s) => new Date(String(s).replace(' ', 'T') + 'Z');
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}.`;
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fullDate = (s) => { const d = toDate(s); return `${ymd(d)} ${hm(d)}`; };
  // 목록 날짜: 오늘 글은 시간만, 그 외는 날짜만 (게시판 목록 형식)
  const listDate = (s) => { const d = toDate(s); return ymd(d) === ymd(new Date()) ? hm(d) : ymd(d); };
  const isNew = (s) => Date.now() - toDate(s) < 86400000;
  function ago(s) {
    const sec = (Date.now() - toDate(s)) / 1000;
    if (sec < 60) return '방금 전';
    if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
    if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}일 전`;
    return ymd(toDate(s));
  }
  const fmtSize = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k자` : `${n}자`);

  // 마크다운 → 안전한 HTML (DOMPurify가 없으면 렌더링하지 않고 원문 표시)
  if (window.DOMPurify) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') || '')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }
  function renderMd(text) {
    if (!window.marked || !window.DOMPurify) return `<pre>${esc(text)}</pre>`;
    return DOMPurify.sanitize(marked.parse(text || '', { gfm: true, breaks: true }));
  }
  function highlight(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    const needle = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(needle, 'gi'), (m) => `<mark>${m}</mark>`);
  }

  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
      });
    } catch {
      throw Object.assign(new Error('서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.'), { status: 0 });
    }
    let data = null;
    try { data = await res.json(); } catch { /* 빈 응답 */ }
    if (!res.ok) {
      const err = new Error(data?.error || `요청에 실패했습니다 (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  let toastTimer;
  function toast(message, kind = '') {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
  }

  // ---------- state ----------
  const state = { me: null, boards: [], stats: {}, dirty: false, lastList: '' };
  const boardById = (id) => state.boards.find((b) => b.id === Number(id));
  const defaultBoardId = () => (state.boards.find((b) => !b.isNotice) || state.boards[0] || {}).id;
  const isMember = () => state.me?.status === 'approved';
  const isAdmin = () => Boolean(state.me?.isAdmin);
  // 공지사항 게시판은 관리자만 쓰고 고칠 수 있음
  const canWriteBoard = (id) => isAdmin() || !boardById(id)?.isNotice;
  const writeHref = (boardId) => (boardId && canWriteBoard(boardId) ? `#/new?board=${boardId}` : '#/new');

  async function loadBoards() {
    const data = await api('/boards');
    state.boards = data.boards;
    state.stats = data.stats;
  }

  // ---------- layout ----------
  function setView(title, html) {
    document.title = title ? `${title} : AI 스터디` : 'AI 스터디';
    $('#page').innerHTML = html;
    window.scrollTo(0, 0);
  }

  const loginHash = () => `#/login?next=${enc(location.hash.startsWith('#/login') ? '#/' : location.hash || '#/')}`;

  function renderUser() {
    const name = state.me ? `${avatar(state.me.displayName, true)}<span>${esc(state.me.displayName)}</span>` : '';
    $('#userArea').innerHTML = state.me
      ? `${isMember() ? `<a class="user-name" href="#/me" title="${esc(state.me.email)} · 내 정보">${name}</a>` : `<span class="user-name">${name}</span>`}
         <button class="link-btn" id="logoutBtn" type="button">로그아웃</button>`
      : `<a class="login-btn" href="${loginHash()}">로그인</a>`;
    // 회원이 아니면 게시판 메뉴·검색·글쓰기를 숨김
    document.body.classList.toggle('guest', !isMember());
  }

  // 왼쪽 사이드바: 소개 + 게시판 메뉴. current 는 'all' | 'activity' | 게시판 id
  function renderSide(current) {
    const s = state.stats;
    $('#cafeInfo').innerHTML = `
      <div class="ci-head">
        <span class="ci-logo" aria-hidden="true">AI</span>
        <div><div class="ci-name">AI 스터디</div><div class="ci-sub">AI를 함께 공부하는 모임</div></div>
      </div>
      <dl>
        <dt>멤버</dt><dd>${s.members ?? 0}명</dd>
        <dt>전체글</dt><dd>${s.posts ?? 0}</dd>
        <dt>새 글 (24시간)</dt><dd>${s.newPosts ?? 0}</dd>
      </dl>
      ${state.me
        ? `<div class="ci-me"><b>${esc(state.me.displayName)}</b><a href="#/me">내 정보</a></div>`
        : `<div class="ci-me"><span class="muted">로그인하고 함께해요</span><a href="${loginHash()}">로그인</a></div>`}`;

    let lastGroup = null;
    const items = state.boards.map((b) => {
      let head = '';
      if (b.groupName !== lastGroup) {
        lastGroup = b.groupName;
        // 그룹이 없는 게시판(예: 공지사항)은 제목 없이 맨 위에 표시
        head = b.groupName ? `<div class="bm-group">${esc(b.groupName)}</div>` : '';
      }
      return `${head}<a href="#/board/${b.id}" class="${current === b.id ? 'current' : ''}">${esc(b.name)}${b.newCount ? '<span class="new-badge" title="새 글">N</span>' : ''}</a>`;
    }).join('');
    $('#boardMenu').innerHTML = `
      <a class="top ${current === 'all' ? 'current' : ''}" href="#/board/all">전체글보기 <span class="cnt">${s.posts ?? 0}</span></a>
      <a class="top ${current === 'activity' ? 'current' : ''}" href="#/activity">최근 활동</a>
      ${isAdmin() ? `<a class="top admin-link ${current === 'admin' ? 'current' : ''}" href="#/admin/members">회원 관리${s.pendingMembers ? `<span class="count-badge" title="승인 대기">${s.pendingMembers}</span>` : ''}</a>` : ''}
      <div class="bm-sep"></div>
      ${items}`;
    $('.write-btn').setAttribute('href', writeHref(typeof current === 'number' ? current : null));
  }

  // 회원이 아닐 때 사이드바: 소개만
  function renderSideGuest() {
    $('#cafeInfo').innerHTML = `
      <div class="ci-head">
        <span class="ci-logo" aria-hidden="true">AI</span>
        <div><div class="ci-name">AI 스터디</div><div class="ci-sub">AI를 함께 공부하는 모임</div></div>
      </div>
      <p class="ci-guest">관리자가 가입을 승인한 회원만 글을 볼 수 있습니다.</p>`;
    $('#boardMenu').innerHTML = '';
  }

  const requireLogin = () => {
    if (state.me) return true;
    toast('로그인이 필요합니다.');
    go(loginHash(), true);
    return false;
  };

  function go(hash, replace = false) {
    if (replace) {
      history.replaceState(null, '', hash);
      lastHash = location.hash;
      router();
    } else {
      location.hash = hash;
    }
  }

  // ---------- 게시판 목록 ----------
  function postRow(p, { notice = false, showBoard = false, q = '' } = {}) {
    return `<tr class="${notice ? 'notice' : ''}">
      <td class="no">${notice ? '<span class="tag-notice">공지</span>' : p.id}</td>
      <td class="title">
        ${showBoard && !notice ? `<a class="board-tag" href="#/board/${p.boardId}">[${esc(p.boardName)}]</a>` : ''}<a href="#/post/${p.id}">${highlight(p.title, q)}</a>${p.commentCount ? `<span class="cmt">[${p.commentCount}]</span>` : ''}${isNew(p.createdAt) ? '<span class="new-badge" title="새 글">N</span>' : ''}
      </td>
      <td class="writer">${esc(p.author)}</td>
      <td class="date">${listDate(p.createdAt)}</td>
      <td class="views">${p.viewCount}</td>
    </tr>`;
  }

  function pager(page, total, pageSize, hrefFor) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (pages <= 1) return '';
    const start = Math.floor((page - 1) / 10) * 10 + 1;
    const end = Math.min(pages, start + 9);
    let html = start > 1 ? `<a href="${hrefFor(start - 1)}">‹ 이전</a>` : '';
    for (let n = start; n <= end; n++) {
      html += n === page ? `<span class="cur" aria-current="page">${n}</span>` : `<a href="${hrefFor(n)}">${n}</a>`;
    }
    if (end < pages) html += `<a href="${hrefFor(end + 1)}">다음 ›</a>`;
    return `<nav class="pager" aria-label="페이지">${html}</nav>`;
  }

  async function viewBoard(key, query) {
    const board = key === 'all' ? null : boardById(key);
    if (key !== 'all' && !board) throw Object.assign(new Error('없는 게시판입니다.'), { status: 404 });
    const page = Math.max(1, Number(query.get('page')) || 1);
    const q = (query.get('q') || '').trim();
    const params = new URLSearchParams({ page });
    if (board) params.set('board', board.id);
    if (q) params.set('q', q);
    const data = await api(`/posts?${params}`);
    state.lastList = location.hash || '#/';
    renderSide(board ? board.id : 'all');
    $('#searchInput').value = board ? '' : q;

    const base = `#/board/${board ? board.id : 'all'}`;
    const hrefFor = (n) => `${base}?page=${n}${q ? `&q=${enc(q)}` : ''}`;
    const title = board ? board.name : q ? `'${q}' 검색 결과` : '전체글보기';
    const desc = board ? board.description : q ? '전체 게시판에서 찾은 글입니다' : '모든 게시판 글을 최신순으로 보여 줍니다';
    const rows = [
      ...data.notices.map((p) => postRow(p, { notice: true })),
      ...data.posts.map((p) => postRow(p, { showBoard: !board, q })),
    ].join('');

    setView(board ? board.name : title, `
      <div class="board-head">
        <div><h2>${esc(title)}</h2><p>${esc(desc)}${board && q ? ` · '${esc(q)}' 검색 결과` : ''}</p></div>
        <span class="total">${q ? '검색 ' : ''}${data.total}개의 글</span>
      </div>
      <table class="post-table">
        <thead><tr><th class="no">번호</th><th>제목</th><th class="writer">작성자</th><th class="date">작성일</th><th class="views">조회</th></tr></thead>
        <tbody>${rows || `<tr class="empty-row"><td colspan="5">${q ? '검색 결과가 없습니다.' : '등록된 게시글이 없습니다.'}</td></tr>`}</tbody>
      </table>
      ${pager(page, data.total, data.pageSize, hrefFor)}
      <div class="board-foot">
        <form class="board-search" id="boardSearch" role="search">
          <input type="search" name="q" value="${esc(q)}" placeholder="${board ? `${esc(board.name)}에서 검색` : '제목 + 내용 검색'}" aria-label="게시판 검색">
          <button class="btn" type="submit">검색</button>
        </form>
        ${!board || canWriteBoard(board.id) ? `<a class="btn btn-primary" href="${writeHref(board?.id)}">${icon('pen')} 글쓰기</a>` : ''}
      </div>`);

    $('#boardSearch').addEventListener('submit', (e) => {
      e.preventDefault();
      const value = e.currentTarget.q.value.trim();
      go(`${base}${value ? `?q=${enc(value)}` : ''}`);
    });
  }

  // ---------- 게시글 보기 ----------
  const commentHtml = (c, postAuthorId) => `
    <div class="comment" data-id="${c.id}">
      ${avatar(c.author, true)}
      <div class="c-main">
        <div class="c-head"><b>${esc(c.author)}</b>${c.authorId === postAuthorId ? '<span class="writer-tag">작성자</span>' : ''}</div>
        <div class="c-body">${esc(c.body)}</div>
        <div class="c-foot"><span>${fullDate(c.createdAt)}</span>${state.me && (state.me.id === c.authorId || isAdmin()) ? '<button type="button" data-act="del-comment">삭제</button>' : ''}</div>
      </div>
    </div>`;

  async function viewPost(id) {
    const { post } = await api(`/posts/${id}`);
    renderSide(post.boardId);
    const canDelete = state.me && (state.me.id === post.authorId || isAdmin());
    const canEdit = canWriteBoard(post.boardId);
    const listHref = state.lastList.startsWith('#/board/') || state.lastList === '#/' ? state.lastList : `#/board/${post.boardId}`;
    const emptyComments = '<p class="comment-empty">아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.</p>';

    setView(post.title, `
      <article>
        <a class="article-board" href="#/board/${post.boardId}">${esc(post.boardName)} ›</a>
        <h2 class="article-title">${esc(post.title)}</h2>
        <div class="writer-row">
          ${avatar(post.author)}
          <div class="who">
            <b>${esc(post.author)}</b>
            <div class="sub"><span>${fullDate(post.createdAt)}</span><span>조회 ${post.viewCount}</span></div>
          </div>
          <div class="tools">
            <span>댓글 <b id="commentCountTop">${post.comments.length}</b></span>
            <a href="#/post/${id}/history">변경 이력 v${post.version}</a>
          </div>
        </div>
        <div class="md article-body">${renderMd(post.content)}</div>
        ${post.version > 1 ? `<p class="edited-note">${esc(post.editor)}님이 ${ago(post.updatedAt)} 마지막으로 수정했습니다 · <a href="#/post/${id}/history">수정 내역 보기</a></p>` : ''}
        <div class="article-actions">
          ${canEdit ? `<a class="btn" href="#/post/${id}/edit">${icon('edit')} 수정</a>` : ''}
          <a class="btn" href="#/post/${id}/history">${icon('history')} 변경 이력</a>
          ${canDelete ? `<button class="btn btn-danger" type="button" id="deletePost">${icon('trash')} 삭제</button>` : ''}
        </div>
      </article>

      <section class="comment-area" aria-label="댓글">
        <h3>댓글 <span id="commentCount">${post.comments.length}</span></h3>
        <div id="commentList">${post.comments.map((c) => commentHtml(c, post.authorId)).join('') || emptyComments}</div>
        ${state.me
          ? `<form class="comment-write" id="commentForm">
              <div class="cw-name">${esc(state.me.displayName)}</div>
              <textarea name="body" maxlength="2000" placeholder="댓글을 남겨보세요" required aria-label="댓글 내용"></textarea>
              <div class="cw-foot"><button type="submit">등록</button></div>
            </form>`
          : `<div class="comment-login"><a href="${loginHash()}">로그인</a>하고 댓글을 남겨보세요.</div>`}
      </section>

      <div class="article-bottom">
        <a class="btn btn-primary" href="${writeHref(post.boardId)}">${icon('pen')} 글쓰기</a>
        <a class="btn" href="${listHref}">${icon('list')} 목록</a>
      </div>
      ${post.next || post.prev ? `<div class="prevnext">
        ${post.next ? `<a href="#/post/${post.next.id}"><span>다음글</span><b>${esc(post.next.title)}</b></a>` : ''}
        ${post.prev ? `<a href="#/post/${post.prev.id}"><span>이전글</span><b>${esc(post.prev.title)}</b></a>` : ''}
      </div>` : ''}`);

    const list = $('#commentList');
    const count = () => {
      const n = String($$('.comment', list).length);
      $('#commentCount').textContent = n;
      $('#commentCountTop').textContent = n;
    };

    $('#commentForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const body = form.elements.body.value.trim();
      if (!body) return;
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const { comment } = await api(`/posts/${id}/comments`, { method: 'POST', body: { body } });
        if (!$('.comment', list)) list.innerHTML = '';
        list.insertAdjacentHTML('beforeend', commentHtml(comment, post.authorId));
        form.reset();
        count();
        toast('댓글을 등록했습니다.');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act="del-comment"]');
      if (!btn || !confirm('이 댓글을 삭제할까요?')) return;
      const el = btn.closest('.comment');
      try {
        await api(`/comments/${el.dataset.id}`, { method: 'DELETE' });
        el.remove();
        if (!$('.comment', list)) list.innerHTML = emptyComments;
        count();
        toast('댓글을 삭제했습니다.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    $('#deletePost')?.addEventListener('click', async () => {
      if (!confirm(`"${post.title}" 글을 삭제할까요?\n변경 이력과 댓글도 모두 삭제되며 되돌릴 수 없습니다.`)) return;
      try {
        await api(`/posts/${id}`, { method: 'DELETE' });
        toast('게시글을 삭제했습니다.');
        go(`#/board/${post.boardId}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // ---------- 편집기 (TOAST UI Editor, 글쓰기 화면에서만 불러옴) ----------
  const EDITOR_BASE = 'vendor/toastui-editor-3.2.2/';
  let editorLib = null;
  const isDark = () => document.documentElement.dataset.theme === 'dark'
    || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = reject;
      document.head.append(el);
    });
  }
  function loadEditorLib() {
    editorLib ??= (async () => {
      for (const css of ['toastui-editor.min.css', 'toastui-editor-dark.min.css']) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = EDITOR_BASE + css;
        document.head.append(link);
      }
      await loadScript(EDITOR_BASE + 'toastui-editor-all.min.js');
      await loadScript(EDITOR_BASE + 'ko-kr.min.js').catch(() => {}); // 한국어 메뉴 (실패해도 영어로 동작)
      return window.toastui.Editor;
    })().catch((err) => {
      editorLib = null;
      throw err;
    });
    return editorLib;
  }

  // 이미지를 긴 변 1600px, 1MB 이하로 줄여서 업로드
  const IMAGE_MAX_SIDE = 1600;
  const IMAGE_MAX_BYTES = 1024 * 1024;
  const canvasBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  async function shrinkImage(file) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error('PNG, JPG, GIF, WEBP 이미지만 올릴 수 있습니다.');
    if (file.size > 20 * 1024 * 1024) throw new Error('20MB 이하 이미지만 올릴 수 있습니다.');
    if (file.type === 'image/gif' && file.size <= IMAGE_MAX_BYTES) return file; // 움직이는 GIF 는 그대로
    const bitmap = await createImageBitmap(file);
    const fits = Math.max(bitmap.width, bitmap.height) <= IMAGE_MAX_SIDE;
    if (fits && file.size <= 300 * 1024 && file.type !== 'image/gif') return file;

    for (const [side, quality] of [[IMAGE_MAX_SIDE, 0.85], [1280, 0.75], [960, 0.7]]) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let out = await canvasBlob(canvas, 'image/webp', quality);
      if (!out || out.type !== 'image/webp') {
        // webp 를 못 만드는 브라우저: 흰 배경 위에 그려 jpeg 로
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        out = await canvasBlob(canvas, 'image/jpeg', quality);
      }
      if (out && out.size <= IMAGE_MAX_BYTES) return out;
    }
    throw new Error('이미지가 너무 큽니다. 더 작은 이미지를 올려 주세요.');
  }

  async function uploadImage(file) {
    const blob = await shrinkImage(file);
    let res;
    try {
      res = await fetch('/api/images', { method: 'POST', headers: { 'content-type': blob.type }, body: blob, credentials: 'same-origin' });
    } catch {
      throw new Error('이미지를 올리지 못했습니다. 네트워크를 확인해 주세요.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `이미지를 올리지 못했습니다 (${res.status})`);
    return data.url;
  }

  // ---------- 글쓰기 / 수정 ----------
  function boardOptions(selectedId) {
    let html = '';
    let group = null;
    for (const b of state.boards.filter((x) => canWriteBoard(x.id) || x.id === Number(selectedId))) {
      if (b.groupName !== group) {
        if (group !== null) html += '</optgroup>';
        group = b.groupName;
        html += `<optgroup label="${esc(group || '게시판')}">`;
      }
      html += `<option value="${b.id}" ${b.id === Number(selectedId) ? 'selected' : ''}>${esc(b.name)}</option>`;
    }
    return html + (group !== null ? '</optgroup>' : '');
  }

  async function viewEditor(id, query) {
    if (!requireLogin()) return;
    const askedBoard = Number(query.get('board'));
    let post = { title: '', boardId: askedBoard && canWriteBoard(askedBoard) ? askedBoard : defaultBoardId(), content: '', version: 0 };
    if (id) post = (await api(`/posts/${id}?noview=1`)).post;
    if (id && !canWriteBoard(post.boardId)) throw Object.assign(new Error('공지사항은 관리자만 수정할 수 있습니다.'), { status: 403 });
    renderSide(post.boardId);
    let baseVersion = post.version;

    setView(id ? `수정: ${post.title}` : '글쓰기', `
      <div class="page-head">
        <h2>${id ? '글 수정' : '글쓰기'}</h2>
        <p id="baseInfo">${id ? `v${post.version}을 기준으로 수정합니다. 저장하면 v${post.version + 1}이 되고, 이전 내용은 변경 이력에 남습니다.` : '게시판을 고르고 제목과 내용을 입력하세요. 위쪽 버튼으로 글을 꾸밀 수 있습니다.'}</p>
      </div>
      <div id="conflict"></div>
      <form class="form" id="editForm" novalidate>
        <div class="row2">
          <select class="field" name="boardId" aria-label="게시판 선택">${boardOptions(post.boardId)}</select>
          <input class="field" name="title" maxlength="100" required value="${esc(post.title)}" placeholder="제목을 입력해 주세요" aria-label="제목">
        </div>
        <div class="editor-box">
          <div id="editor" aria-label="본문"><p class="muted editor-loading">편집기를 불러오는 중…</p></div>
          <!-- 편집기를 못 불러오면 이 입력창으로 대신 씀 (마크다운) -->
          <textarea class="field editor-fallback" name="content" maxlength="50000" spellcheck="false" hidden aria-label="본문">${esc(post.content)}</textarea>
        </div>
        <p class="hint editor-hint">스크린샷은 복사해서 본문에 붙여넣기(Ctrl+V)하면 바로 올라갑니다 · Ctrl/⌘+S 저장</p>
        ${id ? '<label>수정 메모 <span class="hint">무엇을 바꿨는지 짧게 적어 주세요 (변경 이력에 표시)</span><input class="field" name="message" maxlength="100" placeholder="예: 예시 코드 추가"></label>' : ''}
        <p class="error" id="formError"></p>
        <div class="actions">
          <a class="btn" href="${id ? `#/post/${id}` : state.lastList || '#/'}">취소</a>
          <span class="spacer"></span>
          <button class="btn btn-primary" type="submit">${id ? '수정 완료' : '등록'}</button>
        </div>
      </form>`);

    const form = $('#editForm');
    const f = form.elements;
    const textarea = f.content;
    let editor = null;
    // 편집기는 불러온 마크다운을 자기 형식으로 정리함(- → * 등). 바뀐 내용 비교는 정리된 원본과 해야 함
    let originalContent = post.content;
    const getContent = () => (editor ? editor.getMarkdown() : textarea.value);
    const setContent = (text) => (editor ? editor.setMarkdown(text, false) : (textarea.value = text));
    const values = () => ({
      boardId: Number(f.boardId.value),
      title: f.title.value.trim(),
      content: getContent(),
      message: f.message?.value.trim() || '',
    });
    if (!id) f.title.focus();

    form.addEventListener('input', () => (state.dirty = true));
    // 편집기 안에서도 동작하도록 캡처 단계에서 Ctrl/⌘+S 처리
    form.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        form.requestSubmit();
      }
    }, true);

    try {
      const Editor = await loadEditorLib();
      if (!form.isConnected) return; // 불러오는 동안 다른 화면으로 이동함
      $('#editor').innerHTML = '';
      editor = new Editor({
        el: $('#editor'),
        initialValue: post.content,
        initialEditType: 'wysiwyg',
        hideModeSwitch: true, // 비전공자 기준: '마크다운/위지윅' 전환 탭은 숨김 (저장은 마크다운)
        previewStyle: 'tab',
        height: matchMedia('(max-width: 640px)').matches ? '420px' : '520px',
        language: 'ko-KR',
        theme: isDark() ? 'dark' : 'light',
        usageStatistics: false, // 기본값은 구글 애널리틱스로 사용 통계를 보냄
        placeholder: '내용을 입력하세요. 위쪽 버튼으로 굵게, 목록, 표, 이미지를 넣을 수 있습니다.',
        toolbarItems: [
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task'],
          ['table', 'image', 'link'],
          ['code', 'codeblock'],
        ],
        hooks: {
          // 이미지 버튼/붙여넣기/끌어놓기 → 서버에 올리고 주소를 넣음 (기본 동작인 본문 안 base64 저장 대신)
          addImageBlobHook: async (blob, callback) => {
            toast('이미지를 올리는 중…');
            try {
              callback(await uploadImage(blob), '이미지');
              toast('이미지를 넣었습니다.');
            } catch (err) {
              toast(err.message, 'error');
            }
          },
        },
        events: { change: () => (state.dirty = true) },
      });
      originalContent = editor.getMarkdown();
      state.dirty = false;
    } catch {
      $('#editor').hidden = true;
      textarea.hidden = false;
      $('.editor-hint').textContent = '편집기를 불러오지 못해 기본 입력창을 보여 줍니다. 마크다운(## 제목, **굵게**, - 목록)으로 쓸 수 있습니다.';
    }

    async function save() {
      const data = values();
      const error = $('#formError');
      error.textContent = '';
      if (!data.title) return (error.textContent = '제목을 입력해 주세요.');
      if (!data.content.trim()) return (error.textContent = '본문을 입력해 주세요.');
      if (id && data.title === post.title && data.boardId === post.boardId && data.content === originalContent) {
        return toast('바뀐 내용이 없습니다.');
      }
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const res = id
          ? await api(`/posts/${id}`, { method: 'PUT', body: { ...data, version: baseVersion } })
          : await api('/posts', { method: 'POST', body: data });
        state.dirty = false;
        toast(id ? `v${res.version}으로 저장했습니다.` : '게시글을 등록했습니다.');
        go(`#/post/${res.id}`);
      } catch (err) {
        if (err.status === 409 && err.data?.current) showConflict(err.data.current);
        else if (err.status === 401) {
          state.me = null;
          renderUser();
          toast('로그인이 만료되었습니다. 작성한 내용을 복사해 두고 다시 로그인해 주세요.', 'error');
        } else if (err.status === 0) toast(err.message, 'error');
        else error.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });

    // 동시 편집 충돌: 다른 사람이 먼저 저장한 경우
    function showConflict(current) {
      const box = $('#conflict');
      box.innerHTML = `
        <div class="note conflict">
          <p><b>저장하지 못했습니다.</b> 편집하는 동안 <b>${esc(current.editor)}</b>님이 이 글을 v${current.version}으로 수정했습니다.</p>
          <details open><summary>상대방 버전(v${current.version}) → 내 내용 비교</summary>${diffBlock(current.content, getContent())}</details>
          <div class="actions">
            <button type="button" class="btn btn-primary" data-act="mine">내 내용으로 저장 (v${current.version + 1})</button>
            <button type="button" class="btn" data-act="theirs">최신 버전 불러오기 (내 수정은 버림)</button>
          </div>
        </div>`;
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      box.onclick = (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        post = current;
        baseVersion = current.version;
        $('#baseInfo').textContent = `v${current.version}을 기준으로 수정합니다. 저장하면 v${current.version + 1}이 됩니다.`;
        box.innerHTML = '';
        if (act === 'mine') {
          save();
        } else {
          f.title.value = current.title;
          f.boardId.value = String(current.boardId);
          setContent(current.content);
          originalContent = getContent();
          state.dirty = false;
          toast(`v${current.version} 최신 내용을 불러왔습니다.`);
        }
      };
    }
  }

  // ---------- 변경 이력 ----------
  async function viewHistory(id) {
    const { post, revisions } = await api(`/posts/${id}/revisions`);
    renderSide(post.boardId);
    setView(`변경 이력: ${post.title}`, `
      <div class="page-head">
        <h2>변경 이력</h2>
        <p><a href="#/post/${id}">${esc(post.title)}</a> · 총 ${revisions.length}개 버전. 버전을 누르면 이전 버전과 무엇이 달라졌는지 볼 수 있습니다.</p>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>버전</th><th>편집자</th><th>수정 메모</th><th class="num">크기</th><th>일시</th></tr></thead>
        <tbody>${revisions.map((r) => `
          <tr>
            <td class="nowrap"><a href="#/post/${id}/rev/${r.id}">v${r.version}</a>${r.version === post.version ? '<span class="current-tag">현재</span>' : ''}</td>
            <td class="nowrap">${esc(r.editor)}</td>
            <td>${esc(r.message) || '<span class="muted">-</span>'}${r.title !== post.title ? `<br><span class="muted">제목: ${esc(r.title)}</span>` : ''}</td>
            <td class="num">${fmtSize(r.size)}</td>
            <td class="nowrap">${fullDate(r.createdAt)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      <div class="article-bottom"><span></span><a class="btn" href="#/post/${id}">글로 돌아가기</a></div>`);
  }

  async function viewRevision(id, rid) {
    const { revision: r, previous: prev } = await api(`/revisions/${rid}`);
    if (r.postId !== id) return go(`#/post/${r.postId}/rev/${rid}`, true);
    renderSide(r.currentBoardId);
    const isCurrent = r.version === r.currentVersion;

    setView(`v${r.version}: ${r.title}`, `
      <div class="page-head">
        <h2>${esc(r.title)} <span class="muted">v${r.version}</span></h2>
        <p>편집 <b>${esc(r.editor)}</b> · ${fullDate(r.createdAt)}${r.message ? ` · 메모: ${esc(r.message)}` : ''}</p>
      </div>
      ${isCurrent
        ? '<div class="tip"><p>현재 버전입니다.</p></div>'
        : `<div class="note"><p>과거 버전입니다. 현재 버전은 <a href="#/post/${id}">v${r.currentVersion}</a>입니다.</p></div>`}
      <div class="actions">
        <a class="btn" href="#/post/${id}">현재 글 보기</a>
        <a class="btn" href="#/post/${id}/history">${icon('history')} 변경 이력</a>
        ${isCurrent ? '' : `<button class="btn btn-primary" type="button" id="restoreBtn">${icon('undo')} 이 버전으로 되돌리기</button>`}
      </div>
      <div class="tabs view" role="tablist">
        <button type="button" class="tab active" data-tab="diff">${prev ? `v${prev.version} → v${r.version} 변경 내용` : '처음 작성한 내용'}</button>
        <button type="button" class="tab" data-tab="full">이 버전 전체 보기</button>
      </div>
      <div data-pane="diff">
        ${prev && prev.title !== r.title ? `<p class="title-change">제목: <del>${esc(prev.title)}</del> → <ins>${esc(r.title)}</ins></p>` : ''}
        ${prev && prev.category !== r.category ? `<p class="title-change">게시판: <del>${esc(prev.category)}</del> → <ins>${esc(r.category)}</ins></p>` : ''}
        ${diffBlock(prev ? prev.content : '', r.content)}
      </div>
      <div data-pane="full" class="md" hidden>${renderMd(r.content)}</div>`);

    $$('.tabs.view .tab').forEach((tab) => tab.addEventListener('click', () => {
      $$('.tabs.view .tab').forEach((t) => t.classList.toggle('active', t === tab));
      $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== tab.dataset.tab));
    }));

    $('#restoreBtn')?.addEventListener('click', async () => {
      if (!requireLogin()) return;
      if (!confirm(`v${r.version}의 내용으로 되돌릴까요?\n기존 이력은 그대로 남고, v${r.currentVersion + 1}로 새로 저장됩니다.`)) return;
      // 그 버전의 게시판이 아직 있으면 그 게시판으로, 없으면 현재 게시판 유지
      const boardId = state.boards.find((b) => b.name === r.category)?.id ?? r.currentBoardId;
      try {
        await api(`/posts/${id}`, {
          method: 'PUT',
          body: { title: r.title, boardId, content: r.content, version: r.currentVersion, message: `v${r.version}으로 되돌림` },
        });
        toast(`v${r.version}으로 되돌렸습니다.`);
        go(`#/post/${id}`);
      } catch (err) {
        toast(err.status === 409 ? '그 사이 글이 수정되었습니다. 다시 시도해 주세요.' : err.message, 'error');
        if (err.status === 409) router();
      }
    });
  }

  // ---------- 최근 활동 ----------
  function activityItem(a) {
    const isEdit = a.type === 'edit';
    const what = isEdit
      ? `${a.version === 1 ? '작성' : `수정 (<a href="#/post/${a.postId}/rev/${a.refId}">v${a.version}</a>)`}했습니다.`
      : '에 댓글을 남겼습니다.';
    return `<li>
      ${avatar(a.who, true)}
      <div class="body">
        <b>${esc(a.who)}</b>님이 <a href="#/post/${a.postId}">${esc(a.title)}</a>${isEdit ? ' 글을 ' : ''}${what}
        ${a.detail ? `<span class="detail">${esc(a.detail)}</span>` : ''}
      </div>
      <time title="${fullDate(a.createdAt)}">${ago(a.createdAt)}</time>
    </li>`;
  }

  async function viewActivity() {
    const { items } = await api('/activity');
    renderSide('activity');
    setView('최근 활동', `
      <div class="page-head"><h2>최근 활동</h2><p>글 작성·수정과 댓글을 시간순으로 보여 줍니다.</p></div>
      <ul class="activity">${items.map(activityItem).join('') || '<li class="muted">활동이 없습니다.</li>'}</ul>`);
  }

  // ---------- 로그인 / 내 정보 ----------
  // 로그인 전: 회원 전용 안내
  function viewGate(query, isLoginRoute) {
    renderSideGuest();
    const next = isLoginRoute ? query.get('next') || '#/' : location.hash || '#/';
    const error = isLoginRoute ? query.get('error') : null;
    setView('회원 전용', `
      <div class="gate">
        <div class="gate-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
        <h2>회원만 볼 수 있습니다</h2>
        <p>AI 스터디는 관리자가 가입을 승인한 회원만 글을 볼 수 있어요.<br>구글 계정으로 로그인한 뒤 가입 신청을 해 주세요.</p>
        ${error ? `<div class="note conflict"><p>${esc(error)}</p></div>` : ''}
        <a class="btn btn-primary google-btn" href="/auth/login?next=${enc(next)}">${GOOGLE_LOGO} Google 계정으로 로그인</a>
        <p class="muted">처음이라면 로그인 후 간단한 가입 신청서를 작성하게 됩니다.</p>
      </div>`);
  }

  // 로그인 후 아직 회원이 아닐 때: 가입 신청서 / 승인 대기 / 거절·강퇴
  function viewMembership(query) {
    renderSideGuest();
    const me = state.me;
    const editing = query.get('edit') === '1';

    if (me.status === 'rejected' || me.status === 'banned') {
      const banned = me.status === 'banned';
      return setView('가입 승인 안 됨', `
        <div class="gate">
          <h2>${banned ? '이용이 제한되었습니다' : '가입이 승인되지 않았습니다'}</h2>
          <p>${banned ? '관리자에 의해 이용이 제한된 계정입니다.' : '관리자가 가입 신청을 승인하지 않았습니다.'}<br>문의가 있으면 관리자에게 직접 연락해 주세요.</p>
          <p class="muted">${esc(me.email)}</p>
        </div>`);
    }

    if (me.appliedAt && !editing) {
      setView('가입 승인 대기', `
        <div class="gate">
          <div class="gate-mark wait" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
          <h2>가입 승인을 기다리고 있어요</h2>
          <p>관리자가 신청서를 확인한 뒤 승인하면 글을 볼 수 있습니다.<br>승인되면 이 페이지를 새로고침해 주세요.</p>
          <dl class="apply-summary">
            <dt>이메일</dt><dd>${esc(me.email)}</dd>
            <dt>닉네임</dt><dd>${esc(me.displayName)}</dd>
            <dt>한 줄 소개</dt><dd>${esc(me.intro)}</dd>
            <dt>신청일</dt><dd>${fullDate(me.appliedAt)}</dd>
          </dl>
          <div class="actions center">
            <a class="btn" href="#/join?edit=1">신청 내용 수정</a>
            <button class="btn btn-primary" type="button" id="reloadBtn">새로고침</button>
          </div>
        </div>`);
      $('#reloadBtn').addEventListener('click', () => location.reload());
      return;
    }

    setView('가입 신청', `
      <div class="page-head"><h2>가입 신청</h2><p>관리자가 확인한 뒤 승인하면 글을 볼 수 있습니다.</p></div>
      <form class="form narrow" id="joinForm">
        <label>이메일 <span class="hint">로그인한 구글 계정</span><input class="field" value="${esc(me.email)}" disabled></label>
        <label>닉네임 <span class="hint">글과 댓글에 표시되는 이름 (20자 이하)</span><input class="field" name="displayName" required maxlength="20" value="${esc(me.displayName)}"></label>
        <label>한 줄 소개 <span class="hint">관리자가 누구인지 알아볼 수 있게 적어 주세요 (200자 이하)</span>
          <textarea class="field" name="intro" required maxlength="200" rows="3" placeholder="예: 스터디 2기 김철수입니다. AI 에이전트를 공부하고 있어요.">${esc(me.intro || '')}</textarea></label>
        <p class="error" id="formError"></p>
        <div class="actions">
          ${me.appliedAt ? '<a class="btn" href="#/">취소</a><span class="spacer"></span>' : ''}
          <button class="btn btn-primary" type="submit">${me.appliedAt ? '신청 내용 저장' : '가입 신청'}</button>
        </div>
      </form>`);
    const form = $('#joinForm');
    form.elements.intro.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const { user } = await api('/join', {
          method: 'POST',
          body: { displayName: form.elements.displayName.value, intro: form.elements.intro.value },
        });
        state.me = user;
        toast('가입 신청을 보냈습니다.');
        go('#/', true);
      } catch (err) {
        $('#formError').textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------- 회원 관리 (관리자) ----------
  const MEMBER_TABS = [
    ['pending', '승인 대기'],
    ['approved', '회원'],
    ['blocked', '거절·강퇴'],
  ];
  const memberTab = (m) => (m.status === 'approved' ? 'approved' : m.status === 'pending' ? 'pending' : 'blocked');

  async function viewAdminMembers(query) {
    if (!isAdmin()) throw Object.assign(new Error('관리자만 볼 수 있는 페이지입니다.'), { status: 403 });
    const tab = MEMBER_TABS.some(([k]) => k === query.get('tab')) ? query.get('tab') : 'pending';
    const { members } = await api('/admin/members');
    renderSide('admin');
    // 로그인만 하고 신청서를 안 낸 사람은 승인 대기 목록에서 제외
    const applied = members.filter((m) => m.status !== 'pending' || m.appliedAt);
    const notApplied = members.length - applied.length;
    const list = applied.filter((m) => memberTab(m) === tab);
    const count = (k) => applied.filter((m) => memberTab(m) === k).length;
    const STATUS = { approved: '회원', pending: '승인 대기', rejected: '거절됨', banned: '강퇴됨' };

    const item = (m) => `
      <li class="member" data-id="${m.id}">
        ${avatar(m.displayName)}
        <div class="m-main">
          <div class="m-name"><b>${esc(m.displayName)}</b>${m.isAdmin ? '<span class="status-tag admin">관리자</span>' : `<span class="status-tag ${m.status}">${STATUS[m.status]}</span>`}</div>
          <div class="m-email">${esc(m.email)}</div>
          ${m.intro ? `<p class="m-intro">${esc(m.intro)}</p>` : ''}
          <div class="m-meta">
            ${m.appliedAt ? `<span>신청 ${fullDate(m.appliedAt)}</span>` : `<span>가입 ${fullDate(m.createdAt)}</span>`}
            ${m.status === 'approved' ? `<span>글 ${m.postCount} · 댓글 ${m.commentCount}</span>` : ''}
          </div>
        </div>
        <div class="m-actions">
          ${m.isAdmin ? ''
            : m.status === 'pending' ? '<button class="btn btn-primary" data-act="approve">승인</button><button class="btn" data-act="reject">거절</button>'
            : m.status === 'approved' ? '<button class="btn btn-danger" data-act="ban">강퇴</button>'
            : '<button class="btn" data-act="approve">승인</button>'}
        </div>
      </li>`;

    setView('회원 관리', `
      <div class="page-head"><h2>회원 관리</h2><p>가입 신청을 승인하거나 거절하고, 회원을 강퇴할 수 있습니다. 이 메뉴는 관리자에게만 보입니다.</p></div>
      <div class="tabs view member-tabs" role="tablist">
        ${MEMBER_TABS.map(([k, label]) => `<a class="tab ${k === tab ? 'active' : ''}" role="tab" href="#/admin/members?tab=${k}">${label} <b>${count(k)}</b></a>`).join('')}
      </div>
      <ul class="member-list">${list.map(item).join('') || `<li class="member-empty">${tab === 'pending' ? '승인을 기다리는 신청이 없습니다.' : '해당하는 사람이 없습니다.'}</li>`}</ul>
      ${tab === 'pending' && notApplied ? `<p class="muted small">로그인만 하고 가입 신청서를 아직 내지 않은 사람 ${notApplied}명은 목록에 보이지 않습니다.</p>` : ''}`);

    const CONFIRM = { reject: '가입 신청을 거절할까요?', ban: '이 회원을 강퇴할까요?\n글을 더 이상 볼 수 없고 로그인도 끊깁니다. 쓴 글은 남습니다.' };
    const DONE = { approve: '승인했습니다.', reject: '거절했습니다.', ban: '강퇴했습니다.' };
    $('.member-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const action = btn.dataset.act;
      const id = btn.closest('.member').dataset.id;
      if (CONFIRM[action] && !confirm(CONFIRM[action])) return;
      btn.disabled = true;
      try {
        await api(`/admin/members/${id}`, { method: 'POST', body: { action } });
        toast(DONE[action]);
        router();
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  function viewProfile(query) {
    renderSide(null);
    const me = state.me;
    const welcome = query.get('welcome');
    setView('내 정보', `
      <div class="page-head"><h2>${welcome ? '가입을 환영합니다!' : '내 정보'}</h2>
        <p>${welcome ? '게시글과 댓글에 표시될 닉네임을 정해 주세요.' : '닉네임을 바꿀 수 있습니다.'}</p></div>
      <form class="form narrow" id="profileForm">
        <label>이메일 <span class="hint">로그인한 구글 계정</span><input class="field" value="${esc(me.email)}" disabled></label>
        <label>닉네임 <span class="hint">게시글과 댓글에 표시되는 이름 (20자 이하)</span><input class="field" name="displayName" required maxlength="20" value="${esc(me.displayName)}"></label>
        <p class="error" id="formError"></p>
        <div class="actions"><button class="btn btn-primary" type="submit">저장</button><a class="btn" href="#/">홈으로</a></div>
      </form>`);
    const form = $('#profileForm');
    const input = form.elements.displayName;
    input.focus();
    input.select();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const { user } = await api('/me', { method: 'PUT', body: { displayName: input.value } });
        state.me = user;
        renderUser();
        renderSide(null);
        toast('닉네임을 저장했습니다.');
        if (welcome) go('#/');
      } catch (err) {
        $('#formError').textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function viewError(err) {
    renderSide(null);
    const notFound = err.status === 404;
    setView(notFound ? '찾을 수 없음' : '오류', `
      <div class="page-head"><h2>${notFound ? '페이지를 찾을 수 없습니다' : '문제가 발생했습니다'}</h2><p>${esc(err.message)}</p></div>
      <a class="btn" href="#/">홈으로</a>`);
  }

  // ---------- 줄 단위 비교 (LCS) ----------
  function lineDiff(a, b) {
    const A = a.split('\n');
    const B = b.split('\n');
    let start = 0;
    while (start < A.length && start < B.length && A[start] === B[start]) start++;
    let endA = A.length;
    let endB = B.length;
    while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) { endA--; endB--; }
    const a2 = A.slice(start, endA);
    const b2 = B.slice(start, endB);
    const n = a2.length;
    const m = b2.length;
    const mid = [];
    if (n * m > 4e6) {
      a2.forEach((l) => mid.push(['-', l]));
      b2.forEach((l) => mid.push(['+', l]));
    } else {
      const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (a2[i] === b2[j]) { mid.push(['=', a2[i]]); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) mid.push(['-', a2[i++]]);
        else mid.push(['+', b2[j++]]);
      }
      while (i < n) mid.push(['-', a2[i++]]);
      while (j < m) mid.push(['+', b2[j++]]);
    }
    return [...A.slice(0, start).map((l) => ['=', l]), ...mid, ...A.slice(endA).map((l) => ['=', l])];
  }

  function diffBlock(before, after) {
    const ops = lineDiff(before, after);
    const added = ops.filter((o) => o[0] === '+').length;
    const removed = ops.filter((o) => o[0] === '-').length;
    if (!added && !removed) return '<p class="muted">본문은 바뀐 내용이 없습니다.</p>';
    // 바뀐 줄 주변 3줄만 보여 주고 나머지는 접기
    const CONTEXT = 3;
    const show = ops.map(() => false);
    ops.forEach((o, i) => {
      if (o[0] === '=') return;
      for (let k = Math.max(0, i - CONTEXT); k <= Math.min(ops.length - 1, i + CONTEXT); k++) show[k] = true;
    });
    let html = '';
    let skipped = 0;
    const flush = () => {
      if (skipped) html += `<div class="dl skip">… 같은 내용 ${skipped}줄 …</div>`;
      skipped = 0;
    };
    ops.forEach(([op, line], i) => {
      if (!show[i]) return skipped++;
      flush();
      const cls = op === '+' ? 'add' : op === '-' ? 'del' : '';
      html += `<div class="dl ${cls}"><span class="sign">${op === '=' ? ' ' : op}</span><span>${esc(line) || ' '}</span></div>`;
    });
    flush();
    return `<p class="diff-stat"><span class="add">+${added}줄 추가</span> · <span class="del">−${removed}줄 삭제</span></p><div class="diff">${html}</div>`;
  }

  // ---------- router ----------
  let lastHash = location.hash;
  let routeSeq = 0;

  async function router() {
    const seq = ++routeSeq;
    const hash = location.hash.slice(1) || '/';
    const [pathPart, queryPart = ''] = hash.split('?');
    const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    const query = new URLSearchParams(queryPart);
    document.body.classList.remove('nav-open');
    $('#content').classList.add('loading');
    try {
      renderUser();
      const [a, b, c, d] = parts;
      const id = Number(b);
      // 로그인 전에는 회원 전용 안내, 승인 전에는 가입 신청/대기 화면만
      if (!state.me) return viewGate(query, a === 'login');
      if (!isMember()) return viewMembership(query);

      await loadBoards();
      if (seq !== routeSeq) return;
      if (!a) await viewBoard('all', query);
      else if (a === 'board' && b) await viewBoard(b, query);
      else if (a === 'search') go(`#/board/all?q=${enc(query.get('q') || '')}`, true);
      else if (a === 'new') await viewEditor(null, query);
      else if (a === 'post' && id && !c) await viewPost(id);
      else if (a === 'post' && id && c === 'edit') await viewEditor(id, query);
      else if (a === 'post' && id && c === 'history') await viewHistory(id);
      else if (a === 'post' && id && c === 'rev' && Number(d)) await viewRevision(id, Number(d));
      else if (a === 'activity') await viewActivity();
      else if (a === 'login' || a === 'join') go(query.get('next') || '#/', true);
      else if (a === 'me') viewProfile(query);
      else if (a === 'admin' && b === 'members') await viewAdminMembers(query);
      else throw Object.assign(new Error('주소를 다시 확인해 주세요.'), { status: 404 });
    } catch (err) {
      if (seq !== routeSeq) return;
      // 보는 도중 로그인이 끊기거나 강퇴된 경우: 내 상태를 다시 확인하고 알맞은 화면으로
      if ((err.status === 401 || err.data?.code === 'not_member') && !router.retried) {
        router.retried = true;
        state.me = (await api('/me').catch(() => ({ user: null }))).user;
        return router();
      }
      viewError(err);
    } finally {
      router.retried = false;
      if (seq === routeSeq) $('#content').classList.remove('loading');
    }
  }

  // 저장하지 않은 편집 내용이 있으면 페이지 이동 전에 확인
  let skipNext = false;
  window.addEventListener('hashchange', () => {
    if (skipNext) { skipNext = false; return; }
    if (state.dirty && !confirm('저장하지 않은 내용이 있습니다. 이 페이지를 떠날까요?')) {
      skipNext = true;
      location.hash = lastHash;
      return;
    }
    state.dirty = false;
    lastHash = location.hash;
    router();
  });
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) e.preventDefault();
  });

  // ---------- global events ----------
  $('#userArea').addEventListener('click', async (e) => {
    if (!e.target.closest('#logoutBtn')) return;
    try {
      await api('/logout', { method: 'POST' });
    } finally {
      state.me = null;
      toast('로그아웃했습니다.');
      router();
    }
  });

  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#searchInput').value.trim();
    if (q) go(`#/board/all?q=${enc(q)}`);
  });

  $('#navToggle').addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    $('#navToggle').setAttribute('aria-expanded', String(open));
  });
  $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

  // ---------- start ----------
  api('/me')
    .then(({ user }) => {
      state.me = user;
    })
    .catch(() => {})
    .finally(() => {
      lastHash = location.hash;
      router();
    });
})();
