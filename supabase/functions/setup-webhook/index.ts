// Points the Telegram bot's webhook at the telegram-bot function.
// Run once after rotating the bot token.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { telegramToken } from "./tg.ts";

serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const TELEGRAM_TOKEN = await telegramToken(supabase);
  const WEBHOOK_URL = "https://sqmfeumltrtluchfzhku.supabase.co/functions/v1/telegram-bot";

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: WEBHOOK_URL, allowed_updates: ["message"] }),
  });
  const data = await res.json();

  const info = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getWebhookInfo`);
  const infoData = await info.json();
  // Don't echo anything that could contain the token
  return new Response(JSON.stringify({ set: data, webhook_url: infoData?.result?.url, pending: infoData?.result?.pending_update_count, last_error: infoData?.result?.last_error_message ?? null }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
});
