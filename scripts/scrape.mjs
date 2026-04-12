/**
 * TrendForce D-RAM Spot Price 스크래퍼
 * GitHub Actions에서 매일 KST 09:00에 실행
 * 실행: node scripts/scrape.mjs
 */

import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_URL = 'https://www.trendforce.com/price/dram/dram_spot';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * 가격 문자열 → 숫자 변환 ("$1.234" → 1.234, "-" → null)
 */
function parsePrice(str) {
  if (!str || str.trim() === '-' || str.trim() === 'N/A') return null;
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * 변동률 방향 감지
 */
function getDirection(change) {
  if (change === null) return null;
  if (change > 0.001) return 'rise';
  if (change < -0.001) return 'fall';
  return 'flat';
}

/**
 * 품목명으로 카테고리 분류
 */
function getCategory(itemName) {
  const name = itemName.toLowerCase();
  if (name.includes('gddr')) return 'gddr';
  if (name.includes('wafer')) return 'wafer';
  if (name.includes('so-dimm') || name.includes('sodimm') ||
      name.includes('udimm') || name.includes('rdimm') ||
      name.includes('module')) return 'module';
  if (name.includes('server')) return 'server';
  return 'chip';
}

/**
 * TrendForce HTML 파싱
 */
function parsePriceTable($, table, today) {
  const results = [];

  $(table).find('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 6) return;

    const itemName = $(cells[0]).text().trim();
    if (!itemName || itemName.length < 3) return;

    const dailyHigh = parsePrice($(cells[1]).text());
    const dailyLow = parsePrice($(cells[2]).text());
    const sessionHigh = parsePrice($(cells[3]).text());
    const sessionLow = parsePrice($(cells[4]).text());
    const sessionAvg = parsePrice($(cells[5]).text());
    const sessionChange = parsePrice($(cells[6])?.text());

    results.push({
      date: today,
      item_name: itemName,
      item_category: getCategory(itemName),
      daily_high: dailyHigh,
      daily_low: dailyLow,
      session_high: sessionHigh,
      session_low: sessionLow,
      session_avg: sessionAvg,
      session_change: sessionChange,
      change_direction: getDirection(sessionChange),
    });
  });

  return results;
}

async function main() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  console.log(`📅 수집 날짜: ${today}`);
  console.log(`🌐 URL: ${TARGET_URL}`);

  // 1. HTML 가져오기
  let html;
  try {
    const res = await fetch(TARGET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    html = await res.text();
    console.log(`✅ HTML 수신 완료 (${(html.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error('❌ 페이지 로딩 실패:', err.message);
    process.exit(1);
  }

  // 2. 파싱
  const $ = cheerio.load(html);
  const allPrices = [];

  // price-table 클래스를 가진 테이블 전체 파싱
  $('table').each((_, table) => {
    const prices = parsePriceTable($, table, today);
    allPrices.push(...prices);
  });

  if (allPrices.length === 0) {
    console.error('❌ 파싱된 데이터 없음 — HTML 구조가 변경되었을 수 있습니다');
    console.log('--- HTML 미리보기 (처음 2000자) ---');
    console.log(html.substring(0, 2000));
    process.exit(1);
  }

  console.log(`📊 파싱된 품목 수: ${allPrices.length}개`);
  allPrices.forEach(p => {
    console.log(`  - ${p.item_name}: avg=${p.session_avg}, change=${p.session_change}%`);
  });

  // 3. Supabase에 저장 (upsert: 같은 날짜+품목 중복 방지)
  const { error } = await supabase
    .from('dram_prices')
    .upsert(allPrices, { onConflict: 'date,item_name' });

  if (error) {
    console.error('❌ Supabase 저장 실패:', error.message);
    process.exit(1);
  }

  console.log(`✅ Supabase 저장 완료: ${allPrices.length}개 품목`);
}

main();
