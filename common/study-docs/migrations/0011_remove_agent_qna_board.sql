-- '에이전트 AI 2기' 그룹의 '질문답변' 게시판 삭제 (글이 없을 때만 삭제해 실수로 글이 사라지지 않게 함)
DELETE FROM boards
WHERE name = '질문답변' AND group_name = '에이전트 AI 2기'
  AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.board_id = boards.id);
