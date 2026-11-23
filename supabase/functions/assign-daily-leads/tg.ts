// Telegram bot token: read from Supabase Vault (secret "telegram_token") via the
// service-role-only RPC get_telegram_token(). Falls back to the TELEGRAM_TOKEN env secret.
// Never hardcode the token in code — this repo was public once.
// deno-lint-ignore no-explicit-any
export async function telegramToken(supabase: any): Promise<string> {
  const { data } = await supabase.rpc("get_telegram_token");
  const token = (data as string | null) || Deno.env.get("TELEGRAM_TOKEN");
  if (!token) throw new Error("Telegram token missing (vault secret telegram_token)");
  return token;
}
