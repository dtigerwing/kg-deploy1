-- 글에 넣는 이미지 저장 (무료 플랜에서 R2 없이 D1 에 보관)
-- 브라우저에서 긴 변 1600px, 1MB 이하로 줄여서 올립니다.
CREATE TABLE images (
  id TEXT PRIMARY KEY,                 -- 추측할 수 없는 무작위 값
  mime TEXT NOT NULL,                  -- image/png, image/jpeg, image/gif, image/webp 만 허용
  data BLOB NOT NULL,
  size INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_images_uploader ON images(uploader_id, created_at);
