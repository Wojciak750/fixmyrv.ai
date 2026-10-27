// Runs the generated edge code under Deno against the sample fixtures. deno run -A scripts/deno-smoke.ts
import { createHandler } from "../supabase/functions/qa-paperwork/server/handler.ts";
import { importKey, b64encode, b64decode } from "../supabase/functions/qa-paperwork/core/crypto.ts";
import { MemoryStore, MemoryFiles } from "../test/memory-store.ts";
import { SAMPLE_PACKET_MAPPING } from "../test/mock-mapping.ts";

const packet = await Deno.readFile(new URL("../test/fixtures/sample-packet.pdf", import.meta.url));
const sig = await Deno.readFile(new URL("../test/fixtures/fake-signature.png", import.meta.url));
const store = new MemoryStore();
store.customers.set("cust-0001-test", { name: "Jordan Testcase", sources: { "quote.monthly_rent": "$3,850.00" } });
const pending: Promise<unknown>[] = [];
let n = 0;
const handle = createHandler({
  authenticate: async () => ({ userId: "a" }),
  store,
  files: new MemoryFiles(),
  encryptionKey: () => importKey(b64encode(new Uint8Array(32).fill(7))),
  mapper: async () => SAMPLE_PACKET_MAPPING,
  background: (p) => void pending.push(p),
  newId: () => `paper-${++n}-0000`,
  now: () => new Date(),
  log: () => {},
});
const call = async (b: unknown) => (await handle(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }))).json();
await call({ action: "profile.save", values: { legal_name: "Sample Holdings LLC", ein: "00-0000001", account_number: "000123456789" } });
await call({ action: "signature.save", png: "data:image/png;base64," + b64encode(sig) });
const fd = new FormData();
fd.set("customerId", "cust-0001-test");
fd.set("file", new File([packet], "packet.pdf"));
const up = await (await handle(new Request("http://x", { method: "POST", body: fd }))).json();
await Promise.all(pending);
const prev = await call({ action: "paperwork.preview", id: up.paperwork.id });
const signed = await call({ action: "paperwork.sign", id: up.paperwork.id, previewHash: prev.previewHash, date: "10/27/2026" });
const dl = await call({ action: "paperwork.download", id: up.paperwork.id });
const all = await call({ action: "paperwork.downloadAll", customerId: "cust-0001-test" });
console.log(JSON.stringify({ status: up.paperwork.status, previewBytes: b64decode(prev.pdf).length, signed: signed.ok, dl: dl.fileName, dlBytes: b64decode(dl.data).length, zip: all.fileName }));
