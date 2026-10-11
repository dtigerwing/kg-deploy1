-- 사이트 이름에서 '카페' 제거: 게시판 설명과 사용법 글 수정 (사용법은 변경 이력 새 버전으로 기록)
UPDATE boards SET description = '운영 안내와 공지' WHERE description = '카페 운영 안내와 공지';

UPDATE posts
SET content = replace(
      replace(content, '왼쪽 메뉴의 **카페 글쓰기** 또는', '왼쪽 메뉴 또는'),
      '> 이 카페는 **관리자가', '> 이곳은 **관리자가'),
    version = version + 1,
    updated_at = datetime('now')
WHERE id = 1 AND (content LIKE '%**카페 글쓰기**%' OR content LIKE '%> 이 카페는%');

INSERT INTO revisions (post_id, version, title, category, content, editor_id, message, created_at)
SELECT p.id, p.version, p.title, p.category, p.content, 1, '사이트 이름에서 카페 제거', p.updated_at
FROM posts p
WHERE p.id = 1 AND NOT EXISTS (SELECT 1 FROM revisions r WHERE r.post_id = p.id AND r.version = p.version);
