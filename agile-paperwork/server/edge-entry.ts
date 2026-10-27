// Entry point for the qa-paperwork Supabase Edge Function (Deno).
// Secrets, set in Lovable Cloud: PAPERWORK_ENCRYPTION_KEY (32 random bytes, base64) and ANTHROPIC_API_KEY.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { createHandler } from "./handler.ts";
import { SupabaseStore, SupabaseFiles, authenticateAdmin } from "./store-supabase.ts";
import { importKey } from "../core/crypto.ts";
import { mapForm } from "../core/claude.ts";

declare const Deno: { env: { get(name: string): string | undefined }; serve(h: (req: Request) => Response | Promise<Response>): void };
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
let keyPromise: Promise<CryptoKey> | null = null;
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const anthropic = apiKey ? new Anthropic({ apiKey, timeout: 240_000, maxRetries: 2 }) : null;

const handle = createHandler({
  authenticate: (req) => authenticateAdmin(db, req),
  store: new SupabaseStore(db),
  files: new SupabaseFiles(db),
  encryptionKey: () => (keyPromise ??= importKey(Deno.env.get("PAPERWORK_ENCRYPTION_KEY"))),
  mapper: anthropic ? (structure, pdf, sensitive) => mapForm(anthropic, structure, pdf, sensitive) : null,
  background: (task) => {
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
    else void task;
  },
  newId: () => crypto.randomUUID(),
  now: () => new Date(),
  // Event names and ids only, never request bodies or values.
  log: (event, meta) => console.log(JSON.stringify({ fn: "qa-paperwork", event, ...(meta ?? {}) })),
});

// Only the dashboard's own sites may call this from a browser. The admin check still applies to every call.
const ALLOWED_ORIGIN = /^https:\/\/((www\.)?agilervhousing\.com|[a-z0-9-]+\.lovable\.app|[a-z0-9-]+\.lovableproject\.com)$/;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGIN.test(origin) ? origin : "https://agilervhousing.com",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "origin",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const res = await handle(req);
  for (const [k, v] of Object.entries(cors(req))) res.headers.set(k, v);
  return res;
});
