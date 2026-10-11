-- '카페 소식' 그룹 정리: 가입인사 게시판 삭제(글이 없을 때만), 공지사항은 그룹 없이 메뉴 맨 위에 남김
DELETE FROM boards
WHERE name = '가입인사'
  AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.board_id = boards.id);
UPDATE boards SET group_name = '' WHERE name = '공지사항';
