// Store and file storage backed by Supabase, used only inside the qa-paperwork edge function
// with the service role key. The new tables have row level security on and no policies,
// so the browser cannot read them directly at all; every read goes through the admin check.
import { PLAIN_PROFILE_FIELDS } from "../core/profile.ts";
import { buildSources, renterName, type CustomerRow, type DocumentRow } from "./sources.ts";
import type { DraftRow, DraftState, FileStore, PaperworkRow, ProfileRow, Store, VersionRow } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export const BUCKET = "qa-paperwork";
const PROFILE_SECRET_COLS = [
  "ein_enc",
  "routing_number_enc",
  "account_number_enc",
  "ein_last4",
  "routing_number_last4",
  "account_number_last4",
  "signature_enc",
  "signature_updated_at",
  "updated_at",
] as const;

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`database: ${res.error.message}`);
  return res.data;
}

const DRAFT_COLS = "paperwork_id, values, sensitive_enc, positions, extra_targets, preview_hash, signed_at, signed_date, signed_hash, updated_at";
const VERSION_COLS = "id, paperwork_id, version_no, values, sensitive_enc, positions, extra_targets, preview_hash, signed_at, signed_date, signed_hash, created_at";

function draftColumns(d: DraftState) {
  return {
    values: d.values,
    sensitive_enc: d.sensitive_enc,
    positions: d.positions,
    extra_targets: d.extra_targets,
    preview_hash: d.preview_hash,
    signed_at: d.signed_at,
    signed_date: d.signed_date,
    signed_hash: d.signed_hash,
  };
}

export class SupabaseStore implements Store {
  constructor(private db: Db) {}

  async getProfile(): Promise<ProfileRow | null> {
    const row = check(await this.db.from("qa_business_profile").select("*").eq("id", 1).maybeSingle()) as Record<string, string | null> | null;
    if (!row) return null;
    const plain: Record<string, string> = {};
    for (const f of PLAIN_PROFILE_FIELDS) plain[f] = row[f] ?? "";
    const out: Record<string, unknown> = { plain };
    for (const c of PROFILE_SECRET_COLS) out[c] = row[c] ?? null;
    return out as unknown as ProfileRow;
  }

  async saveProfile(patch: Partial<Omit<ProfileRow, "plain">> & { plain?: Record<string, string> }) {
    const row: Record<string, unknown> = { id: 1 };
    if (patch.plain) for (const f of PLAIN_PROFILE_FIELDS) if (f in patch.plain) row[f] = patch.plain[f] ?? "";
    for (const c of PROFILE_SECRET_COLS) if (c in patch) row[c] = (patch as Record<string, unknown>)[c];
    check(await this.db.from("qa_business_profile").upsert(row, { onConflict: "id" }));
  }

  async customerExists(customerId: string) {
    return !!check(await this.db.from("qa_customers").select("id").eq("id", customerId).maybeSingle());
  }

  async customerName(customerId: string) {
    const c = check(await this.db.from("qa_customers").select("display_name, first_name, last_name").eq("id", customerId).maybeSingle());
    return c ? renterName(c as CustomerRow) || "Customer" : "Customer";
  }

  async loadSources(customerId: string) {
    const c = check(await this.db.from("qa_customers").select("*").eq("id", customerId).maybeSingle());
    if (!c) return {};
    const docs = check(
      await this.db
        .from("qa_documents")
        .select("id, kind, stage, archived, term_start, term_end, minimum_term_days, units, updated_at, content")
        .eq("customer_id", customerId)
        .in("kind", ["quote", "agreement"]),
    );
    return buildSources(c as CustomerRow, (docs ?? []) as DocumentRow[]);
  }

  async listPaperwork(customerId: string): Promise<PaperworkRow[]> {
    return check(await this.db.from("qa_paperwork").select("*").eq("customer_id", customerId).order("created_at", { ascending: false })) ?? [];
  }

  async getPaperwork(id: string): Promise<PaperworkRow | null> {
    return check(await this.db.from("qa_paperwork").select("*").eq("id", id).maybeSingle());
  }

  async insertPaperwork(row: Omit<PaperworkRow, "created_at" | "updated_at">): Promise<PaperworkRow> {
    return check(await this.db.from("qa_paperwork").insert(row).select("*").single());
  }

  async updatePaperwork(id: string, patch: Partial<PaperworkRow>) {
    check(await this.db.from("qa_paperwork").update(patch).eq("id", id));
  }

  async deletePaperwork(id: string) {
    check(await this.db.from("qa_paperwork").delete().eq("id", id));
  }

  async getDraft(paperworkId: string): Promise<DraftRow | null> {
    return check(await this.db.from("qa_paperwork_drafts").select(DRAFT_COLS).eq("paperwork_id", paperworkId).maybeSingle());
  }

  async saveDraft(paperworkId: string, draft: DraftState): Promise<DraftRow> {
    return check(
      await this.db
        .from("qa_paperwork_drafts")
        .upsert({ paperwork_id: paperworkId, ...draftColumns(draft) }, { onConflict: "paperwork_id" })
        .select(DRAFT_COLS)
        .single(),
    );
  }

  async insertVersion(paperworkId: string, draft: DraftState): Promise<VersionRow> {
    // Version numbers come from the database function so two downloads never collide.
    return check(await this.db.rpc("qa_paperwork_add_version", { p_paperwork_id: paperworkId, p_state: draftColumns(draft) }).single());
  }

  async listVersions(paperworkId: string): Promise<VersionRow[]> {
    return check(await this.db.from("qa_paperwork_versions").select(VERSION_COLS).eq("paperwork_id", paperworkId).order("version_no", { ascending: false })) ?? [];
  }

  async getVersion(id: string): Promise<VersionRow | null> {
    return check(await this.db.from("qa_paperwork_versions").select(VERSION_COLS).eq("id", id).maybeSingle());
  }
}

export class SupabaseFiles implements FileStore {
  constructor(private db: Db) {}
  async put(path: string, bytes: Uint8Array) {
    check(await this.db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false }));
  }
  async get(path: string) {
    const blob = check(await this.db.storage.from(BUCKET).download(path)) as Blob;
    return new Uint8Array(await blob.arrayBuffer());
  }
  async remove(path: string) {
    check(await this.db.storage.from(BUCKET).remove([path]));
  }
}

// The same admin check the dashboard's qa-service uses: a real Supabase session whose user
// has the 'admin' row in user_roles. No new login, password or code.
export async function authenticateAdmin(db: Db, req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data: u, error } = await db.auth.getUser(token);
  if (error || !u?.user) return null;
  const { data: role } = await db.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  return role ? { userId: u.user.id as string } : null;
}
