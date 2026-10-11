-- 로그인 방식 변경: 아이디/비밀번호 → 구글 계정 로그인
-- users 테이블을 이메일 기준으로 다시 만들고, 기존 로그인 세션은 모두 무효화합니다.
-- 사용자 id 는 그대로 유지하므로 기존 글/댓글/변경 이력의 작성자 기록은 바뀌지 않습니다.
PRAGMA defer_foreign_keys = true;

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 기존 계정은 로그인할 수 없는 주소(@legacy.invalid)로 옮겨 작성자 이름만 남깁니다.
INSERT INTO users_new (id, email, display_name, created_at)
SELECT id, username || '@legacy.invalid', display_name, created_at FROM users;

DROP TABLE sessions;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

PRAGMA defer_foreign_keys = false;
