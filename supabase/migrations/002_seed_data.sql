-- ============================================================
-- 국무노션 Seed Data
-- mock-data.ts → Supabase 마이그레이션
-- 이 파일은 scripts/generate_seed.ts로 자동 생성 가능
-- ============================================================

-- 현재 mock-data.ts의 데이터를 DB에 삽입하는 시드 파일.
-- 실제로는 generate_seed.ts 스크립트로 자동 생성해야 하지만
-- 참고용으로 구조를 보여주는 예시:

-- INSERT INTO ministers (id, name, ministry, position, total_statements, fulfillment_rate, recent_activity, trend, tracked_agendas)
-- VALUES
--   ('gu-yuncheol', '구윤철', '기획재정부', '부총리 겸 기획재정부장관', 47, 82, '2026년 민생체감정책 전면 시행', 'up', 8),
--   ...
-- ON CONFLICT (id) DO UPDATE SET
--   name = EXCLUDED.name,
--   fulfillment_rate = EXCLUDED.fulfillment_rate,
--   recent_activity = EXCLUDED.recent_activity,
--   updated_at = now();

-- Note: 실제 시드 데이터는 scripts/seed_supabase.ts에서 프로그래밍 방식으로 삽입
