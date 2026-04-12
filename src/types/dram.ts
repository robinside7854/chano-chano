export interface DramPrice {
  id?: number;
  date: string; // 'YYYY-MM-DD'
  item_name: string;
  item_category: 'chip' | 'module' | 'server' | 'gddr' | 'wafer';
  daily_high: number | null;
  daily_low: number | null;
  session_high: number | null;
  session_low: number | null;
  session_avg: number | null;
  session_change: number | null;
  change_direction: 'rise' | 'fall' | 'flat' | null;
  created_at?: string;
}

export interface DramAnalysis {
  id?: number;
  date: string;
  item_name: string | null;
  analysis_type: 'trend' | 'alert' | 'prediction';
  content: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}
