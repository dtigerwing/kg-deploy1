-- 가입 승인제: 관리자가 승인한 회원만 카페 내용을 볼 수 있습니다.
-- status: pending(승인 대기) / approved(회원) / rejected(거절) / banned(강퇴)
-- 관리자는 wrangler.jsonc 의 ADMIN_EMAILS 로 지정하며 항상 회원으로 취급합니다.
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN intro TEXT NOT NULL DEFAULT '';   -- 가입 신청서의 한 줄 소개
ALTER TABLE users ADD COLUMN applied_at TEXT;                  -- 가입 신청서 제출 시각 (NULL 이면 아직 미제출)
ALTER TABLE users ADD COLUMN reviewed_at TEXT;                 -- 관리자가 승인/거절/강퇴한 시각

-- 예전 글쓴이 기록용 계정(로그인 불가)은 회원 수에서 빠지도록 그대로 둡니다.
CREATE INDEX idx_users_status ON users(status);
