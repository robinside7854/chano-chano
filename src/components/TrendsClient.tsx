'use client';

import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { DramPrice } from '@/types/dram';
import Link from 'next/link';

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];

const PERIOD_OPTIONS = [
  { label: '1주', days: 7 },
  { label: '1개월', days: 30 },
  { label: '3개월', days: 90 },
];

function calcMA(data: { date: string; value: number | null }[], window: number) {
  return data.map((d, i) => {
    if (i < window - 1) return { ...d, ma: null };
    const slice = data.slice(i - window + 1, i + 1).map(x => x.value).filter(v => v !== null) as number[];
    const ma = slice.length === window ? slice.reduce((a, b) => a + b, 0) / window : null;
    return { ...d, ma };
  });
}

export default function TrendsClient({
  prices,
  items,
}: {
  prices: DramPrice[];
  items: string[];
}) {
  const [selectedItems, setSelectedItems] = useState<string[]>(
    items.slice(0, 3) // 기본 상위 3개
  );
  const [periodDays, setPeriodDays] = useState(30);
  const [showMA7, setShowMA7] = useState(false);

  // 기간 필터
  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - periodDays);
    return d.toISOString().split('T')[0];
  }, [periodDays]);

  const filtered = prices.filter(p => p.date >= cutoff);

  // 날짜별 데이터 그룹핑 → recharts 포맷
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | null | string>>();

    filtered.forEach(p => {
      if (!selectedItems.includes(p.item_name)) return;
      if (!dateMap.has(p.date)) dateMap.set(p.date, { date: p.date });
      const row = dateMap.get(p.date)!;
      row[p.item_name] = p.session_avg;
    });

    return Array.from(dateMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
  }, [filtered, selectedItems]);

  // 7일 이동평균 (첫 번째 선택 품목에만 오버레이)
  const maData = useMemo(() => {
    if (!showMA7 || selectedItems.length === 0) return [];
    const first = selectedItems[0];
    const series = chartData.map(d => ({
      date: String(d.date ?? ''),
      value: (d[first] as number | null) ?? null,
    }));
    return calcMA(series, 7);
  }, [chartData, selectedItems, showMA7]);

  const maMap = useMemo(() => {
    const m: Record<string, number | null> = {};
    maData.forEach(d => { m[String(d.date)] = d.ma; });
    return m;
  }, [maData]);

  const chartDataWithMA = useMemo(() =>
    chartData.map(d => ({
      ...d,
      __ma7: showMA7 ? (maMap[String(d.date)] ?? null) : null,
    })),
    [chartData, maMap, showMA7]
  );

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  const toggleItem = (item: string) => {
    setSelectedItems(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  const isAllSelected = selectedItems.length === items.length;

  const toggleAll = () => {
    setSelectedItems(isAllSelected ? [] : [...items]);
  };

  // AI 인사이트 (규칙 기반)
  const insights = useMemo(() => {
    const result: string[] = [];
    selectedItems.forEach(item => {
      const series = filtered
        .filter(p => p.item_name === item && p.session_avg !== null)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (series.length < 3) return;

      // 연속 방향 감지
      let streak = 1;
      let lastDir = series[series.length - 1].change_direction;
      for (let i = series.length - 2; i >= 0; i--) {
        if (series[i].change_direction === lastDir) streak++;
        else break;
      }

      if (streak >= 3 && lastDir === 'rise') {
        result.push(`${item}: ${streak}일 연속 상승 중`);
      } else if (streak >= 3 && lastDir === 'fall') {
        result.push(`${item}: ${streak}일 연속 하락 중`);
      }

      // 최근 변동폭이 평균 대비 큰 경우
      const changes = series.map(p => Math.abs(p.session_change ?? 0));
      const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
      const last = changes[changes.length - 1];
      if (last > avg * 2.5 && last > 0.5) {
        result.push(`${item}: 오늘 변동폭(${last.toFixed(2)}%)이 평소 대비 ${(last / avg).toFixed(1)}배`);
      }
    });
    return result;
  }, [filtered, selectedItems]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <h1 className="text-lg font-bold text-gray-900">D-RAM 시세 알리미</h1>
          <nav className="flex gap-2 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-800 pb-1">오늘 시세</Link>
            <span className="text-blue-600 font-medium border-b-2 border-blue-600 pb-1">트렌드 차트</span>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* AI 인사이트 카드 */}
        {insights.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
            <h3 className="text-sm font-semibold text-amber-800 mb-2">트렌드 인사이트</h3>
            <ul className="space-y-1">
              {insights.map((ins, i) => (
                <li key={i} className="text-sm text-amber-700 flex items-center gap-2">
                  <span className="text-amber-500">•</span> {ins}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-5">
          {/* 사이드바: 품목 선택 */}
          <aside className="w-56 shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 p-3 sticky top-20">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">품목 선택</p>
                <button
                  onClick={toggleAll}
                  className="text-xs text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  {isAllSelected ? '전체 해제' : '모두 선택'}
                </button>
              </div>
              <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                {items.map((item, i) => (
                  <label key={item} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item)}
                      onChange={() => toggleItem(item)}
                      className="rounded"
                    />
                    <span
                      className="text-xs text-gray-700 group-hover:text-gray-900 leading-tight"
                      style={{ color: selectedItems.includes(item) ? COLORS[selectedItems.indexOf(item) % COLORS.length] : undefined }}
                    >
                      {item}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </aside>

          {/* 메인 차트 영역 */}
          <div className="flex-1">
            {/* 컨트롤 바 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1">
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.days}
                    onClick={() => setPeriodDays(opt.days)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      periodDays === opt.days
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMA7}
                  onChange={e => setShowMA7(e.target.checked)}
                  className="rounded"
                />
                7일 이동평균선
              </label>
            </div>

            {/* 차트 */}
            {chartData.length === 0 || selectedItems.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
                <p className="text-gray-400">품목을 선택하거나 데이터를 수집해 주세요</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartDataWithMA} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickFormatter={v => `$${v}`}
                      width={55}
                    />
                    <Tooltip
                      formatter={(value, name) => {
                        const v = typeof value === 'number' ? value.toFixed(3) : value;
                        if (name === '__ma7') return [`$${v}`, '7일 MA'];
                        return [`$${v}`, name];
                      }}
                      labelFormatter={l => `날짜: ${l}`}
                    />
                    <Legend
                      formatter={(value) => value === '__ma7' ? '7일 MA' : value}
                    />
                    {selectedItems.map((item, i) => (
                      <Line
                        key={item}
                        type="monotone"
                        dataKey={item}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                    {showMA7 && selectedItems.length > 0 && (
                      <Line
                        type="monotone"
                        dataKey="__ma7"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
