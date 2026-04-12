import { supabase } from '@/lib/supabase';
import { DramPrice } from '@/types/dram';
import DashboardClient from '@/components/DashboardClient';

async function getTodayPrices(): Promise<DramPrice[]> {
  const { data: latest } = await supabase
    .from('dram_prices')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single();

  if (!latest) return [];

  const { data } = await supabase
    .from('dram_prices')
    .select('*')
    .eq('date', (latest as { date: string }).date)
    .order('item_category', { ascending: true })
    .order('item_name', { ascending: true });

  return (data ?? []) as DramPrice[];
}

export default async function HomePage() {
  const prices = await getTodayPrices();
  const latestDate = prices[0]?.date ?? null;

  return <DashboardClient prices={prices} latestDate={latestDate} />;
}
