// Local harness only. Serves the new screens and runs the real qa-paperwork handler in memory,
// with fake data and a canned form reader (no API key, no database, nothing leaves this machine).
import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PKG = path.resolve(HERE, "../..");
const DASH = path.resolve(HERE, "../dashboard/src");

function api() {
  let handle: ((req: Request) => Promise<Response>) | null = null;
  async function build(server: ViteDevServer) {
    const load = (p: string) => server.ssrLoadModule(path.join(PKG, p));
    const { createHandler } = await load("server/handler.ts");
    const { importKey, b64encode } = await load("core/crypto.ts");
    const { MemoryStore, MemoryFiles } = await load("test/memory-store.ts");
    const { SAMPLE_PACKET_MAPPING, FLAT_FORM_MAPPING } = await load("test/mock-mapping.ts");
    const { buildSources } = await load("server/sources.ts");
    const store = new MemoryStore();
    // Fake customer, quote and agreement only.
    store.customers.set("cust-0001-test", {
      name: "Jordan Testcase",
      sources: buildSources(
        { first_name: "Jordan", last_name: "Testcase", placement_street: "200 Sample Road", placement_city: "Testville", placement_state: "FL", placement_zip: "00000", claim_number: "CLM-0000-TEST", adjuster_name: "Sam Adjuster" },
        [
          { id: "q1", kind: "quote", stage: "approved", content: { fields: { start_date: "2026-11-04", end_date: "2026-12-03", units: 1 }, charges: [{ key: "recurring", lines: [{ id: "rent", per_unit: true, qty: 1, unit_price: 3850 }] }, { key: "one_time", lines: [{ id: "deposit", per_unit: true, qty: 1, unit_price: 1000.5 }] }] } },
          { id: "a1", kind: "agreement", stage: "signed", content: { fields: { start_date: "2026-11-04", end_date: "2026-12-03" } } },
        ],
      ),
    });
    let n = 0;
    const fail = process.env.HARNESS_MAPPER === "fail";
    handle = createHandler({
      authenticate: async (req: Request) => (req.headers.get("authorization") === "Bearer harness-admin" ? { userId: "harness" } : null),
      store,
      files: new MemoryFiles(),
      encryptionKey: () => importKey(b64encode(new Uint8Array(32).map((_, i) => (i * 13 + 5) & 255))),
      mapper: async (structure: { fields: unknown[] }) => {
        await new Promise((r) => setTimeout(r, 1500));
        if (fail) throw new Error("harness: reader offline");
        return structure.fields.length ? SAMPLE_PACKET_MAPPING : FLAT_FORM_MAPPING;
      },
      background: (p: Promise<unknown>) => void p,
      newId: () => `paper-${++n}-harness`,
      now: () => new Date(),
      log: (event: string, meta?: object) => console.log("[harness]", event, JSON.stringify(meta ?? {})),
    });
  }
  return {
    name: "paperwork-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith("/functions/v1/qa-paperwork")) return next();
        if (!handle) await build(server);
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        const out = await handle!(new Request(`http://localhost${req.url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }));
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await out.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), api()],
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.join(HERE, "stubs/supabase-client.ts") },
      { find: "@/components/quotes/QuotesLayout", replacement: path.join(HERE, "stubs/QuotesLayout.tsx") },
      { find: "@/components/quotes/ui", replacement: path.join(HERE, "stubs/ui.tsx") },
      { find: "@/lib/quotes/format", replacement: path.join(HERE, "stubs/format.ts") },
      { find: /^@\//, replacement: DASH + "/" },
    ],
    dedupe: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "pdfjs-dist"],
  },
  server: { fs: { allow: [PKG] } },
});
