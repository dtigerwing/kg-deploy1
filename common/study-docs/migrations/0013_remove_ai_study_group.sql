-- 'AI 스터디' 그룹 정리: AI 기초만 남기고 프롬프트·에이전트·배포·인프라 게시판 삭제
-- 삭제하는 게시판의 글(댓글·변경 이력 포함)은 AI 기초로 옮겨서 보존
UPDATE posts
SET board_id = (SELECT id FROM boards WHERE name = 'AI 기초'), category = 'AI 기초'
WHERE board_id IN (SELECT id FROM boards WHERE name IN ('프롬프트', '에이전트', '배포·인프라'));

DELETE FROM boards
WHERE name IN ('프롬프트', '에이전트', '배포·인프라')
  AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.board_id = boards.id);

-- 그룹 제목 없이 공지사항 아래에 표시
UPDATE boards SET group_name = '' WHERE name = 'AI 기초';
