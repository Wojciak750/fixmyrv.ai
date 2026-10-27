import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = readFileSync(new URL("../supabase/migration_qa_paperwork.sql", import.meta.url), "utf8");

// Minimal stand-ins for what already exists in the dashboard database.
const EXISTING = `
create role anon; create role authenticated; create role service_role;
create table public.qa_customers (id uuid primary key default gen_random_uuid());
create or replace function public.qa_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create or replace function public.qa_block_change() returns trigger language plpgsql as $$ begin raise exception '% is append-only: % is not allowed', tg_table_name, tg_op; end $$;
`;

async function db() {
  const pg = new PGlite();
  await pg.exec(EXISTING);
  await pg.exec(MIGRATION);
  return pg;
}

describe("migration", { timeout: 60_000 }, () => {
  it("applies cleanly and starts with no profile values", async () => {
    const pg = await db();
    const r = await pg.query("select count(*)::int as n from public.qa_business_profile");
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });

  it("refuses plain text in the encrypted columns", async () => {
    const pg = await db();
    await expect(pg.exec("insert into public.qa_business_profile (id, ein_enc) values (1, '12-3456789')")).rejects.toThrow();
    await pg.exec("insert into public.qa_business_profile (id, ein_enc, ein_last4) values (1, 'v1.abc.def', '6789')");
    await expect(pg.exec("insert into public.qa_business_profile (id) values (2)")).rejects.toThrow();
  });

  it("numbers versions in order and never lets one be edited", async () => {
    const pg = await db();
    const c = await pg.query<{ id: string }>("insert into public.qa_customers default values returning id");
    const p = await pg.query<{ id: string }>(
      "insert into public.qa_paperwork (customer_id, file_name, storage_path, size_bytes, status) values ($1, 'a.pdf', 'x/a.pdf', 10, 'ready') returning id",
      [c.rows[0].id],
    );
    const pid = p.rows[0].id;
    const v1 = await pg.query<{ version_no: number }>("select * from public.qa_paperwork_add_version($1, $2)", [pid, JSON.stringify({ values: { f1: { value: "A", edited: false } } })]);
    const v2 = await pg.query<{ version_no: number }>("select * from public.qa_paperwork_add_version($1, $2)", [pid, JSON.stringify({ values: {} })]);
    expect(v1.rows[0].version_no).toBe(1);
    expect(v2.rows[0].version_no).toBe(2);
    await expect(pg.exec("update public.qa_paperwork_versions set version_no = 9")).rejects.toThrow(/append-only/);
    await pg.query("delete from public.qa_paperwork where id = $1", [pid]);
    expect((await pg.query("select * from public.qa_paperwork_versions")).rows).toHaveLength(0);
  });

  it("gives the browser roles no access at all", async () => {
    const pg = await db();
    for (const role of ["anon", "authenticated"]) {
      const r = await pg.query<{ ok: boolean }>(`select has_table_privilege('${role}', 'public.qa_business_profile', 'select') as ok`);
      expect(r.rows[0].ok).toBe(false);
      const f = await pg.query<{ ok: boolean }>(`select has_function_privilege('${role}', 'public.qa_paperwork_add_version(uuid, jsonb)', 'execute') as ok`);
      expect(f.rows[0].ok).toBe(false);
    }
    const rls = await pg.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where relname like 'qa_paperwork%' or relname = 'qa_business_profile' and relkind = 'r'");
    for (const r of rls.rows.filter((x) => !x.relname.endsWith("_pkey") && !x.relname.endsWith("_idx") && !x.relname.includes("_key"))) expect(r.relrowsecurity).toBe(true);
  });
});
