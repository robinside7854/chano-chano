-- D-RAM 시세 알리미 — Supabase 테이블 생성 SQL
-- Supabase Dashboard → SQL Editor에 붙여넣고 실행

-- 메인 시세 테이블
CREATE TABLE IF NOT EXISTS dram_prices (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  item_name TEXT NOT NULL,
  item_category TEXT NOT NULL DEFAULT 'chip',
  daily_high DECIMAL(10,3),
  daily_low DECIMAL(10,3),
  session_high DECIMAL(10,3),
  session_low DECIMAL(10,3),
  session_avg DECIMAL(10,3),
  session_change DECIMAL(8,4),
  change_direction TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(date, item_name)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_dram_prices_date ON dram_prices(date DESC);
CREATE INDEX IF NOT EXISTS idx_dram_prices_item ON dram_prices(item_name, date DESC);

-- RLS (Row Level Security) — 읽기는 공개, 쓰기는 service_role만
ALTER TABLE dram_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON dram_prices
  FOR SELECT USING (true);

CREATE POLICY "service role write" ON dram_prices
  FOR ALL USING (auth.role() = 'service_role');
