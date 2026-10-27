// "Adjuster paperwork" card on a customer file: upload landlord forms, open them, download them.
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Chip, QueryState, type ChipTone } from "@/components/quotes/ui";
import {
  PaperworkError,
  paperworkCall,
  saveBase64File,
  uploadPaperwork,
  useInvalidatePaperwork,
  usePaperworkList,
  type PaperworkItem,
} from "@/lib/quotes/paperwork";
import { formatDate } from "@/lib/quotes/format";
import "./paperwork.css";

function statusChip(i: PaperworkItem): { tone: ChipTone; label: string } {
  if (i.status === "reading") return { tone: "info", label: "Reading the form" };
  if (i.status === "unreadable") return { tone: "bad", label: "Cannot be filled" };
  if (i.signed) return { tone: "ok", label: "Signed" };
  if (i.status === "manual") return { tone: "acttint", label: "Fill by hand" };
  return { tone: "acttint", label: "Ready to check" };
}

export function PaperworkCard({ customerId }: { customerId: string }) {
  const list = usePaperworkList(customerId);
  const invalidate = useInvalidatePaperwork();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ name: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const items = list.data ?? [];
  const downloadable = items.filter((i) => i.status === "ready" || i.status === "manual");

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setMessages([]);
    setErr("");
    const notes: { name: string; text: string }[] = [];
    for (const f of Array.from(files)) {
      setUploading(f.name);
      try {
        if (f.type && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
          throw new PaperworkError(`"${f.name}" is not a PDF. Upload the form as a PDF file.`);
        }
        await uploadPaperwork(customerId, f);
      } catch (e) {
        notes.push({ name: f.name, text: e instanceof PaperworkError ? e.message : "Could not upload this file. Try again." });
      }
      void invalidate();
    }
    setUploading(null);
    setMessages(notes);
    if (input.current) input.current.value = "";
  };

  const downloadAll = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await paperworkCall<{ fileName: string; type: string; data: string }>({ action: "paperwork.downloadAll", customerId });
      saveBase64File(r.data, r.type, r.fileName);
      void invalidate();
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not download. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (i: PaperworkItem) => {
    if (!window.confirm(`Delete "${i.title}" from this customer file? This cannot be undone.`)) return;
    try {
      await paperworkCall({ action: "paperwork.delete", id: i.id });
      void invalidate();
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not delete. Try again.");
    }
  };

  return (
    <Card
      title="Adjuster paperwork"
      id="paperwork-card"
      actions={
        <>
          <button type="button" className="q-btn" onClick={() => input.current?.click()} disabled={!!uploading}>
            {uploading ? "Uploading" : "Upload paperwork"}
          </button>
          {downloadable.length > 0 && (
            <button type="button" className="q-btn q-btn-ghost" onClick={() => void downloadAll()} disabled={busy}>
              {busy ? "Preparing" : "Download all"}
            </button>
          )}
        </>
      }
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        data-testid="paperwork-file"
        onChange={(e) => void pick(e.target.files)}
      />
      {uploading && (
        <p className="q-muted" role="status">
          Uploading {uploading}
        </p>
      )}
      {messages.map((m) => (
        <div key={m.name} className="q-banner q-att-alert" role="alert" style={{ marginBottom: 8 }}>
          <span>
            <strong>{m.name}:</strong> {m.text}
          </span>
        </div>
      ))}
      {err && (
        <p className="q-error" role="alert">
          {err}
        </p>
      )}
      <QueryState isLoading={list.isLoading} isError={list.isError} onRetry={() => void list.refetch()}>
        {items.length === 0 ? (
          <p className="q-muted">
            Upload the W-9, ACH form, landlord contact form or lease addendum the adjuster sent. Each one is filled from your business profile, this customer file, the quote and the rental agreement.
          </p>
        ) : (
          <div>
            {items.map((i) => {
              const chip = statusChip(i);
              const open = i.status === "ready" || i.status === "manual";
              return (
                <div key={i.id} className="q-stack-row" data-testid="paperwork-row">
                  <div className="pw-row" style={{ justifyContent: "space-between" }}>
                    {open ? (
                      <Link to={`/quotes/paperwork/${i.id}`} className="q-row-link pw-rowtitle">
                        {i.title}
                      </Link>
                    ) : (
                      <span className="pw-rowtitle">{i.title}</span>
                    )}
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                  </div>
                  <div className="q-muted q-small">
                    {i.fileName}
                    {i.pageCount ? `, ${i.pageCount} ${i.pageCount === 1 ? "page" : "pages"}` : ""}. Uploaded {formatDate(i.createdAt)}
                    {i.lastDownloadAt ? `. Downloaded ${formatDate(i.lastDownloadAt)}` : ""}
                  </div>
                  {i.status === "reading" && <div className="q-muted q-small">This usually takes under a minute. You can leave this page.</div>}
                  {i.status === "unreadable" && (
                    <div className="pw-row">
                      <span className="q-small">{i.statusMessage}</span>
                      <button type="button" className="q-textbtn" onClick={() => void remove(i)}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </QueryState>
    </Card>
  );
}
