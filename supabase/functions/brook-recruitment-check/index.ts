import { createCheckHandler } from '../../../recruitment/server/check.mjs';
Deno.serve(createCheckHandler({
 SUPABASE_URL:Deno.env.get('SUPABASE_URL'),
 SUPABASE_ANON_KEY:Deno.env.get('SUPABASE_ANON_KEY'),
 BROOK_TURNSTILE_SECRET_KEY:Deno.env.get('BROOK_TURNSTILE_SECRET_KEY'),
 BROOK_CONTACT_HASH_SECRET:Deno.env.get('BROOK_CONTACT_HASH_SECRET'),
 BROOK_ALLOWED_ORIGINS:'https://hideyuki062222-cyber.github.io'
}));
