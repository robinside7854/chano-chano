import { createClient } from '@supabase/supabase-js';

// 서버 전용 — 절대 클라이언트에서 import 금지
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
