import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadPhonebook, phoneLines } from "./phonebook.ts";
import { telegramToken } from "./tg.ts";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const TELEGRAM_TOKEN = await telegramToken(supabase);
  const CHAT_ID = "933636460";

  const now = new Date();
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const today = istNow.toISOString().slice(0, 10);

  const reminderTime = new Date(istNow.getTime() + 15 * 60 * 1000);
  const reminderHH = reminderTime.getUTCHours();
  const reminderMM = reminderTime.getUTCMinutes();
  const roundedMM = Math.round(reminderMM / 15) * 15;
  const finalHH = roundedMM === 60 ? (reminderHH + 1) % 24 : reminderHH;
  const finalMM = roundedMM % 60;
  const slotTime = `${String(finalHH).padStart(2,'0')}:${String(finalMM).padStart(2,'0')}`;

  const { data: upcoming } = await supabase
    .from("clients")
    .select("id, name, company, next_action_time, next_action, temperature, phone, stage")
    .in("stage", ["lead", "contacted", "proposal"])
    .eq("next_action_due", today)
    .eq("next_action_time", slotTime);

  if (!upcoming || upcoming.length === 0) {
    return new Response(`no reminders for ${today} ${slotTime}`);
  }

  const book = await loadPhonebook(supabase, upcoming.map((c) => c.id));

  const lines = upcoming.map(c => {
    const temp = c.temperature === 'hot' ? ' (hot)' : c.temperature === 'warm' ? ' (warm)' : '';
    const time = c.next_action_time?.slice(0, 5) || '';
    const company = c.company && c.company !== c.name ? `\n${c.company}` : '';
    const phones = phoneLines(c.phone, book[c.id]).join('\n');
    const action = c.next_action ? `\n${c.next_action}` : '';
    return `*${c.name}*${temp}  —  ${time}${company}\n${phones}${action}`;
  }).join('\n\n');

  const callWord = upcoming.length === 1 ? 'call' : 'calls';
  const message = [
    `*Coming up — ${upcoming.length} ${callWord} in 15 min*`,
    ``,
    lines,
  ].join('\n');

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: "Markdown" }),
  });

  return new Response("ok");
});
