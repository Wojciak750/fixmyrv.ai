// In-memory stand-ins for the database and file storage. Tests and the local preview server only.
import type { DraftRow, DraftState, FileStore, PaperworkRow, ProfileRow, SourceValues, Store, VersionRow } from "../server/types.ts";

export class MemoryStore implements Store {
  profile: ProfileRow | null = null;
  papers = new Map<string, PaperworkRow>();
  drafts = new Map<string, DraftRow>();
  versions: VersionRow[] = [];
  customers = new Map<string, { name: string; sources: SourceValues }>();
  private n = 0;
  private clock = 0;

  private stamp() {
    // Real time, always moving forward, so ordering and staleness checks behave like the database.
    this.clock = Math.max(this.clock + 1, Date.now());
    return new Date(this.clock).toISOString();
  }

  async getProfile() {
    return this.profile ? structuredClone(this.profile) : null;
  }
  async saveProfile(patch: Partial<ProfileRow>) {
    const base: ProfileRow = this.profile ?? {
      plain: {},
      ein_enc: null,
      routing_number_enc: null,
      account_number_enc: null,
      ein_last4: null,
      routing_number_last4: null,
      account_number_last4: null,
      signature_enc: null,
      signature_updated_at: null,
      updated_at: null,
    };
    this.profile = { ...base, ...structuredClone(patch) } as ProfileRow;
  }
  async customerExists(id: string) {
    return this.customers.has(id);
  }
  async customerName(id: string) {
    return this.customers.get(id)?.name ?? "Customer";
  }
  async loadSources(id: string) {
    return { ...(this.customers.get(id)?.sources ?? {}) };
  }
  async listPaperwork(customerId: string) {
    return [...this.papers.values()].filter((p) => p.customer_id === customerId).map((p) => structuredClone(p));
  }
  async getPaperwork(id: string) {
    const p = this.papers.get(id);
    return p ? structuredClone(p) : null;
  }
  async insertPaperwork(row: Omit<PaperworkRow, "created_at" | "updated_at">) {
    const t = this.stamp();
    const full = { ...structuredClone(row), created_at: t, updated_at: t } as PaperworkRow;
    this.papers.set(row.id, full);
    return structuredClone(full);
  }
  async updatePaperwork(id: string, patch: Partial<PaperworkRow>) {
    const p = this.papers.get(id);
    if (p) this.papers.set(id, { ...p, ...structuredClone(patch), updated_at: this.stamp() });
  }
  async deletePaperwork(id: string) {
    this.papers.delete(id);
    this.drafts.delete(id);
    this.versions = this.versions.filter((v) => v.paperwork_id !== id);
  }
  async getDraft(id: string) {
    const d = this.drafts.get(id);
    return d ? structuredClone(d) : null;
  }
  async saveDraft(id: string, draft: DraftState) {
    const row = { ...structuredClone(draft), paperwork_id: id, updated_at: this.stamp() } as DraftRow;
    this.drafts.set(id, row);
    return structuredClone(row);
  }
  async insertVersion(id: string, draft: DraftState) {
    const no = this.versions.filter((v) => v.paperwork_id === id).length + 1;
    const { paperwork_id: _p, updated_at: _u, ...state } = draft as DraftRow;
    const row = { ...structuredClone(state), id: `v${++this.n}x0000`, paperwork_id: id, version_no: no, created_at: this.stamp() } as VersionRow;
    this.versions.unshift(row);
    return structuredClone(row);
  }
  async listVersions(id: string) {
    return this.versions.filter((v) => v.paperwork_id === id).map((v) => structuredClone(v));
  }
  async getVersion(id: string) {
    const v = this.versions.find((x) => x.id === id);
    return v ? structuredClone(v) : null;
  }
}

export class MemoryFiles implements FileStore {
  files = new Map<string, Uint8Array>();
  async put(path: string, bytes: Uint8Array) {
    this.files.set(path, bytes.slice());
  }
  async get(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error("not found");
    return f.slice();
  }
  async remove(path: string) {
    this.files.delete(path);
  }
}
