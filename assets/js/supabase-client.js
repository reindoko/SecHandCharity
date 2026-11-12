import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = `https://gkjttkwigwavyjxscvev.supabase.co`;
const SUPABASE_KEY = `sb_publishable_V0v-vlMtGFOg9NInbBlldg_O7D-EHWU`;

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);