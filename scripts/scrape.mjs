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
 * HTML에서 사이트 업데이트 날짜 추출 ("Last Update 2026-04-10 18:10 (GMT+8)" → "2026-04-10")
 * 첫 번째 Last Update = DRAM Spot 날짜 사용
 */
function extractSiteDate($) {
  let siteDate = null;
  $('*').each((_, el) => {
    if (siteDate) return false; // break
    const text = $(el).children().length === 0 ? $(el).text() : null;
    if (!text) return;
    const match = text.match(/Last Update\s+(\d{4}-\d{2}-\d{2})/);
    if (match) siteDate = match[1];
  });
  return siteDate;
}

/**
 * TrendForce HTML 파싱
 * - 8셀 행만 파싱: item|daily_h|daily_l|sess_h|sess_l|sess_avg|change%|icon
 * - 7셀(Contract)·3셀(LPDDR) 등 다른 구조는 자동 제외
 */
function parsePriceTable($, table, date) {
  const results = [];

  $(table).find('tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    // 8셀(spot/module/gddr 형식)만 처리, 7셀(contract)·3셀(lpddr) 제외
    if (cells.length !== 8) return;

    const itemName = $(cells[0]).text().trim();
    if (!itemName || itemName.length < 3) return;

    const dailyHigh = parsePrice($(cells[1]).text());
    const dailyLow = parsePrice($(cells[2]).text());
    const sessionHigh = parsePrice($(cells[3]).text());
    const sessionLow = parsePrice($(cells[4]).text());
    const sessionAvg = parsePrice($(cells[5]).text());
    const sessionChange = parsePrice($(cells[6]).text());

    results.push({
      date,
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
  const systemDate = new Date().toISOString().split('T')[0];
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

  // 사이트 날짜 추출 (시스템 날짜 대신 사이트 기준 날짜 사용)
  const siteDate = extractSiteDate($);
  const date = siteDate || systemDate;
  console.log(`📅 사이트 날짜: ${siteDate ?? '추출 실패'} → 저장 날짜: ${date}`);

  const allPrices = [];

  // 8셀 형식 테이블만 파싱 (spot/module/gddr) — contract/lpddr 자동 제외
  $('table').each((_, table) => {
    const prices = parsePriceTable($, table, date);
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
