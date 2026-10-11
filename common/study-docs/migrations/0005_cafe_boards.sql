-- 카페 형식으로 변경: 게시판(boards)을 만들고, 글마다 게시판과 조회수를 연결합니다.
CREATE TABLE boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL DEFAULT '',   -- 사이드바에서 묶어 보여줄 그룹 이름
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_notice INTEGER NOT NULL DEFAULT 0   -- 1 이면 다른 게시판 목록 맨 위에 공지로 고정
);

INSERT INTO boards (id, name, description, group_name, sort_order, is_notice) VALUES
  (1, '공지사항', '카페 운영 안내와 공지', '카페 소식', 10, 1),
  (2, '가입인사', '처음 오셨다면 인사를 남겨 주세요', '카페 소식', 20, 0),
  (3, 'AI 기초', 'LLM, 토큰, 컨텍스트 같은 기본 개념', 'AI 스터디', 30, 0),
  (4, '프롬프트', '프롬프트 작성 요령과 예시', 'AI 스터디', 40, 0),
  (5, '에이전트', '도구 사용, 에이전트 설계와 구현', 'AI 스터디', 50, 0),
  (6, '배포·인프라', 'Cloudflare, 서버, 배포 경험 공유', 'AI 스터디', 60, 0),
  (7, '자유게시판', '자유롭게 이야기해요', '커뮤니티', 70, 0),
  (8, '질문답변', '막히는 부분을 함께 해결해요', '커뮤니티', 80, 0);

ALTER TABLE posts ADD COLUMN board_id INTEGER REFERENCES boards(id);
ALTER TABLE posts ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

-- 기존 카테고리를 게시판으로 옮기기 (모르는 카테고리는 자유게시판)
UPDATE posts SET board_id = CASE
  WHEN category = '공지' THEN 1
  WHEN category = '기초' AND title LIKE '%프롬프트%' THEN 4
  WHEN category = '기초' THEN 3
  WHEN category = '에이전트' THEN 5
  WHEN category = '배포' THEN 6
  ELSE 7
END;
UPDATE posts SET category = (SELECT name FROM boards WHERE boards.id = posts.board_id);

CREATE INDEX idx_posts_board ON posts(board_id, id);
