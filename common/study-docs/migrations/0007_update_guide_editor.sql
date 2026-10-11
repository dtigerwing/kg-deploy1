-- 사용법 글의 글쓰기 안내를 새 편집기(버튼식, 이미지 붙여넣기)에 맞게 수정 (변경 이력 새 버전으로 기록)
UPDATE posts
SET content = replace(
      replace(content,
        '| 글쓰기 | 오른쪽 위 또는 왼쪽 메뉴의 **새 글 쓰기**를 누릅니다 |',
        '| 글쓰기 | 왼쪽 메뉴의 **카페 글쓰기** 또는 게시판 아래 **글쓰기**를 누릅니다 |'),
      '1. 본문은 **마크다운**으로 씁니다. 편집 화면의 *미리보기* 탭으로 결과를 확인하세요.',
      '1. 글쓰기 화면 위쪽 버튼으로 **굵게, 제목, 목록, 표, 이미지**를 넣을 수 있습니다. 스크린샷은 복사한 뒤 본문에 **붙여넣기(Ctrl+V)**만 하면 올라갑니다.'),
    version = version + 1,
    updated_at = datetime('now')
WHERE id = 1 AND content LIKE '%편집 화면의 *미리보기* 탭으로%';

INSERT INTO revisions (post_id, version, title, category, content, editor_id, message, created_at)
SELECT p.id, p.version, p.title, p.category, p.content, 1, '새 편집기 사용법으로 변경', p.updated_at
FROM posts p
WHERE p.id = 1 AND NOT EXISTS (SELECT 1 FROM revisions r WHERE r.post_id = p.id AND r.version = p.version);
