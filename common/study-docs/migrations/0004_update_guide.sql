-- 사용법 문서의 로그인 안내를 구글 로그인 방식에 맞게 수정 (변경 이력 v2 로 기록)
UPDATE posts
SET content = replace(
      replace(content,
        '| 글쓰기 | 로그인한 뒤 오른쪽 위 **새 글 쓰기**를 누릅니다 |',
        '| 글쓰기 | 오른쪽 위 또는 왼쪽 메뉴의 **새 글 쓰기**를 누릅니다 |'),
      '> 샘플 사이트입니다. 비밀번호는 다른 서비스와 다르게 설정해 주세요.',
      '> 글은 누구나 읽을 수 있고, 글쓰기·편집·댓글은 **구글 계정으로 로그인**한 뒤 할 수 있습니다. 처음 로그인하면 자동으로 가입되며, 오른쪽 위 이름을 눌러 닉네임을 바꿀 수 있습니다.'),
    version = version + 1,
    updated_at = datetime('now')
WHERE id = 1 AND content LIKE '%비밀번호는 다른 서비스와 다르게%';

INSERT INTO revisions (post_id, version, title, category, content, editor_id, message, created_at)
SELECT p.id, p.version, p.title, p.category, p.content, 1, '구글 로그인 안내로 변경', p.updated_at
FROM posts p
WHERE p.id = 1 AND NOT EXISTS (SELECT 1 FROM revisions r WHERE r.post_id = p.id AND r.version = p.version);
