-- 게시판 구성 변경
-- 1) 커뮤니티의 '질문답변' → '질문게시판' (기존 글은 그대로 유지)
-- 2) '에이전트 AI 2기' 그룹 추가: 강의목록, 오늘숙제, 질문답변 (커뮤니티 바로 위)
UPDATE boards SET name = '질문게시판' WHERE name = '질문답변' AND group_name = '커뮤니티';
UPDATE posts SET category = '질문게시판' WHERE board_id = (SELECT id FROM boards WHERE name = '질문게시판');

INSERT INTO boards (name, description, group_name, sort_order) VALUES
  ('강의목록', '에이전트 AI 2기 강의 자료와 정리', '에이전트 AI 2기', 65),
  ('오늘숙제', '그날의 숙제 안내와 제출', '에이전트 AI 2기', 66),
  ('질문답변', '강의·숙제 관련 질문과 답변', '에이전트 AI 2기', 67);
