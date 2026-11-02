import { createClient } from "@supabase/supabase-js";

// The public (anon) key is safe in the browser: row-level security decides what each signed-in person can read.
const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;

// Tell the server something happened so it can notify your partner. Failing quietly is fine: the app still updates live.
export async function notify(event, roundId) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const r = await fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ event, round_id: roundId }) });
    return await r.json();
  } catch { return null; }
}
