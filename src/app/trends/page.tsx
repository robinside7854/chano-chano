import { supabase } from '@/lib/supabase';
import { DramPrice } from '@/types/dram';
import TrendsClient from '@/components/TrendsClient';

async function getRecentPrices(days: number = 90): Promise<DramPrice[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const { data } = await supabase
    .from('dram_prices')
    .select('*')
    .gte('date', sinceStr)
    .order('date', { ascending: true });

  return (data ?? []) as DramPrice[];
}

async function getItemNames(): Promise<string[]> {
  const { data } = await supabase
    .from('dram_prices')
    .select('item_name')
    .order('item_name', { ascending: true });

  const unique = [...new Set((data ?? []).map((r: { item_name: string }) => r.item_name))];
  return unique;
}

export default async function TrendsPage() {
  const [prices, items] = await Promise.all([getRecentPrices(90), getItemNames()]);
  return <TrendsClient prices={prices} items={items} />;
}
