import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { telegramToken } from "./tg.ts";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const TELEGRAM_TOKEN = await telegramToken(supabase);
  const CHAT_ID = "933636460";
  const TARGET = 15;

  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const today = istNow.toISOString().slice(0, 10);
  const yesterday = new Date(istNow.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Count leads assigned yesterday (next_action_due = yesterday) that are
  // still uncontacted (last_contacted_at IS NULL) — these carry over.
  const { count: carryOver } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('stage', 'lead')
    .is('last_contacted_at', null)
    .eq('next_action_due', yesterday);

  // How many new ones to assign today
  const toAssign = Math.max(0, TARGET - (carryOver || 0));

  if (toAssign > 0) {
    // Fetch random uncontacted leads with no next_action_due set yet
    const { data: pool } = await supabase
      .from('clients')
      .select('id')
      .eq('stage', 'lead')
      .is('last_contacted_at', null)
      .is('next_action_due', null)
      .limit(toAssign * 5); // fetch extra pool for random selection

    if (pool && pool.length > 0) {
      // Shuffle and take toAssign
      const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, toAssign);
      const ids = shuffled.map((r: any) => r.id);

      await supabase
        .from('clients')
        .update({ next_action_due: today, next_action: 'First call' })
        .in('id', ids);
    }
  }

  // Carry over yesterday's uncontacted leads to today
  if ((carryOver || 0) > 0) {
    await supabase
      .from('clients')
      .update({ next_action_due: today })
      .eq('stage', 'lead')
      .is('last_contacted_at', null)
      .eq('next_action_due', yesterday);
  }

  // Send Telegram confirmation
  const msg = [
    `*Daily leads assigned*`,
    ``,
    `Carried over: ${carryOver || 0}`,
    `New assigned: ${toAssign}`,
    `Total in Today: ${Math.min(TARGET, (carryOver || 0) + toAssign)}`,
  ].join('\n');

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' }),
  });

  return new Response('ok');
});
