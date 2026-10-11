-- 사용법 글을 가입 승인제에 맞게 수정 (변경 이력 새 버전으로 기록)
UPDATE posts
SET content = replace(
      replace(content,
        '| 편집 | 로그인한 사람은 누구나 모든 문서를 고칠 수 있습니다 (위키 방식) |',
        '| 편집 | 회원은 누구나 다른 사람의 글도 고칠 수 있습니다 (위키 방식, 공지사항은 관리자만) |'),
      '> 글은 누구나 읽을 수 있고, 글쓰기·편집·댓글은 **구글 계정으로 로그인**한 뒤 할 수 있습니다. 처음 로그인하면 자동으로 가입되며, 오른쪽 위 이름을 눌러 닉네임을 바꿀 수 있습니다.',
      '> 이 카페는 **관리자가 가입을 승인한 회원만** 볼 수 있습니다. 구글 계정으로 로그인해 가입 신청서를 내고, 승인되면 모든 기능을 쓸 수 있습니다. 닉네임은 오른쪽 위 이름을 눌러 바꿀 수 있습니다.'),
    version = version + 1,
    updated_at = datetime('now')
WHERE id = 1 AND content LIKE '%글은 누구나 읽을 수 있고%';

INSERT INTO revisions (post_id, version, title, category, content, editor_id, message, created_at)
SELECT p.id, p.version, p.title, p.category, p.content, 1, '가입 승인제 안내로 변경', p.updated_at
FROM posts p
WHERE p.id = 1 AND NOT EXISTS (SELECT 1 FROM revisions r WHERE r.post_id = p.id AND r.version = p.version);
