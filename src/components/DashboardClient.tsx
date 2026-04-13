'use client';

import { useState, useMemo } from 'react';
import { DramPrice } from '@/types/dram';
import Link from 'next/link';

type SortKey = 'item_name' | 'daily_high' | 'daily_low' | 'session_avg' | 'session_high' | 'session_low' | 'session_change';
type SortDir = 'asc' | 'desc';

function sortItems(items: DramPrice[], key: SortKey, dir: SortDir): DramPrice[] {
  return [...items].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    // null은 항상 맨 뒤
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) {
    return <span className="ml-1 text-gray-300 text-xs">⇅</span>;
  }
  return <span className="ml-1 text-blue-500 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

const CATEGORY_LABELS: Record<string, string> = {
  chip: 'IC 칩',
  module: '모듈 (DIMM)',
  server: '서버 DRAM',
  gddr: 'GDDR',
  wafer: '웨이퍼',
};

const TRENDFORCE_URL = 'https://www.trendforce.com/price/dram/dram_spot';

const CATEGORY_ORDER = ['chip', 'module', 'server', 'gddr', 'wafer'];

function ChangeCell({ value, direction }: { value: number | null; direction: string | null }) {
  if (value === null) return <td className="px-3 py-2 text-center text-gray-400">-</td>;

  const color =
    direction === 'rise' ? 'text-red-600' :
    direction === 'fall' ? 'text-blue-600' :
    'text-gray-500';

  const sign = value > 0 ? '+' : '';
  return (
    <td className={`px-3 py-2 text-center font-medium ${color}`}>
      {sign}{value.toFixed(2)}%
    </td>
  );
}

function ScrapeButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const handleScrape = async () => {
    setStatus('loading');
    setMsg('');
    try {
      const res = await fetch('/api/scrape', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMsg(`${json.count}개 품목 수집 완료 (${json.date})`);
      setStatus('done');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '오류 발생');
      setStatus('error');
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleScrape}
        disabled={status === 'loading'}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {status === 'loading' ? '수집 중...' : '지금 수집'}
      </button>
      {msg && (
        <span className={`text-sm ${status === 'error' ? 'text-red-500' : 'text-green-600'}`}>
          {msg}
        </span>
      )}
    </div>
  );
}

export default function DashboardClient({
  prices,
  latestDate,
}: {
  prices: DramPrice[];
  latestDate: string | null;
}) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('item_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      // 숫자 컬럼은 내림차순(높은값 먼저), 품목명은 오름차순
      setSortDir(key === 'item_name' ? 'asc' : 'desc');
    }
  };

  const grouped = useMemo(() => CATEGORY_ORDER.reduce<Record<string, DramPrice[]>>((acc, cat) => {
    const items = prices.filter(p => p.item_category === cat);
    acc[cat] = sortItems(items, sortKey, sortDir);
    return acc;
  }, {}), [prices, sortKey, sortDir]);

  const displayCategories = activeCategory === 'all'
    ? CATEGORY_ORDER.filter(c => grouped[c].length > 0)
    : [activeCategory];

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-gray-900">D-RAM 시세 알리미</h1>
            <nav className="flex gap-2 text-sm">
              <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1">오늘 시세</span>
              <Link href="/trends" className="text-gray-500 hover:text-gray-800 pb-1">트렌드 차트</Link>
            </nav>
          </div>
          <ScrapeButton />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* 날짜 + 요약 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">
              {latestDate ? `마지막 수집: ${formatDate(latestDate)}` : '아직 데이터가 없습니다'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">매일 오전 9시·오후 6시 자동 수집 (GitHub Actions)</p>
          </div>
          <div className="flex gap-1 text-xs">
            <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded">
              상승
            </span>
            <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded">
              하락
            </span>
            <span className="inline-flex items-center gap-1 text-gray-500 bg-gray-100 px-2 py-1 rounded">
              보합
            </span>
          </div>
        </div>

        {/* 카테고리 탭 */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {['all', ...CATEGORY_ORDER.filter(c => grouped[c].length > 0)].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {cat === 'all' ? `전체 (${prices.length})` : `${CATEGORY_LABELS[cat]} (${grouped[cat].length})`}
            </button>
          ))}
        </div>

        {prices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <p className="text-gray-400 text-lg mb-2">아직 수집된 데이터가 없습니다</p>
            <p className="text-gray-400 text-sm">위의 &quot;지금 수집&quot; 버튼을 눌러 첫 데이터를 가져오세요</p>
          </div>
        ) : (
          displayCategories.map(cat => (
            <div key={cat} className="mb-6">
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">
                {CATEGORY_LABELS[cat]}
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {(
                        [
                          { key: 'item_name', label: '품목', align: 'left' },
                          { key: 'daily_high', label: '일중 고가', align: 'center' },
                          { key: 'daily_low', label: '일중 저가', align: 'center' },
                          { key: 'session_avg', label: '세션 평균', align: 'center' },
                          { key: 'session_high', label: '세션 고가', align: 'center' },
                          { key: 'session_low', label: '세션 저가', align: 'center' },
                          { key: 'session_change', label: '변동률', align: 'center' },
                        ] as { key: SortKey; label: string; align: string }[]
                      ).map(col => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className={`px-3 py-2.5 font-medium text-gray-600 cursor-pointer select-none
                            hover:bg-gray-100 transition-colors
                            ${col.align === 'left' ? 'text-left' : 'text-center'}
                            ${sortKey === col.key ? 'text-blue-600 bg-blue-50' : ''}
                          `}
                        >
                          {col.label}
                          <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[cat].map((item, idx) => (
                      <tr
                        key={item.item_name}
                        className={`border-b border-gray-100 last:border-0 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                        }`}
                      >
                        <td className="px-3 py-2.5 font-medium text-gray-800 max-w-xs">
                          <a
                            href={TRENDFORCE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 hover:underline transition-colors cursor-pointer"
                          >
                            {item.item_name}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700">
                          {item.daily_high != null ? `$${item.daily_high.toFixed(3)}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700">
                          {item.daily_low != null ? `$${item.daily_low.toFixed(3)}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-center font-semibold text-gray-900">
                          {item.session_avg != null ? `$${item.session_avg.toFixed(3)}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700">
                          {item.session_high != null ? `$${item.session_high.toFixed(3)}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700">
                          {item.session_low != null ? `$${item.session_low.toFixed(3)}` : '-'}
                        </td>
                        <ChangeCell value={item.session_change} direction={item.change_direction} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
