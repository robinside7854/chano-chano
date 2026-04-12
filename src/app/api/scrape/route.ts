import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { supabaseAdmin } from '@/lib/supabase-admin';

const TARGET_URL = 'https://www.trendforce.com/price/dram/dram_spot';

function parsePrice(str: string | undefined): number | null {
  if (!str || str.trim() === '-' || str.trim() === 'N/A') return null;
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function getDirection(change: number | null): 'rise' | 'fall' | 'flat' | null {
  if (change === null) return null;
  if (change > 0.001) return 'rise';
  if (change < -0.001) return 'fall';
  return 'flat';
}

function getCategory(itemName: string): string {
  const name = itemName.toLowerCase();
  if (name.includes('gddr')) return 'gddr';
  if (name.includes('wafer')) return 'wafer';
  if (name.includes('so-dimm') || name.includes('sodimm') ||
      name.includes('udimm') || name.includes('rdimm') ||
      name.includes('module')) return 'module';
  if (name.includes('server')) return 'server';
  return 'chip';
}

export async function POST() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const res = await fetch(TARGET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const allPrices: Record<string, unknown>[] = [];

    $('table').each((_, table) => {
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
        const sessionChange = cells.length > 6 ? parsePrice($(cells[6]).text()) : null;

        allPrices.push({
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
    });

    if (allPrices.length === 0) {
      return NextResponse.json({ error: '파싱된 데이터 없음' }, { status: 422 });
    }

    const { error } = await supabaseAdmin
      .from('dram_prices')
      .upsert(allPrices, { onConflict: 'date,item_name' });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, count: allPrices.length, date: today });
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'POST 요청으로 스크래핑 실행' });
}
