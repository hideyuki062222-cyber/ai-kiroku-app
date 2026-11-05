import { createHandler } from '../../../recruitment/server/handler.mjs';
Deno.serve(createHandler({
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  BROOK_TURNSTILE_SECRET_KEY: Deno.env.get('BROOK_TURNSTILE_SECRET_KEY'),
  BROOK_CONTACT_HASH_SECRET: Deno.env.get('BROOK_CONTACT_HASH_SECRET'),
  BROOK_ALLOWED_ORIGINS: Deno.env.get('BROOK_ALLOWED_ORIGINS') || 'https://hideyuki062222-cyber.github.io',
  BROOK_INTAKE_ENABLED: Deno.env.get('BROOK_INTAKE_ENABLED') || 'false'
}));
