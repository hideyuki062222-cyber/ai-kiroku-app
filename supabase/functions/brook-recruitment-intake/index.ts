import { createHandler } from '../../../recruitment/server/handler.mjs';
Deno.serve(createHandler(Deno.env.toObject()));
