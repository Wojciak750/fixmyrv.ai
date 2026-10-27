// /quotes/paperwork/:id: check and fix a filled landlord form, sign it, download it.
// The preview is the real filled PDF, rebuilt on our own server after every change.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import QuotesLayout from "@/components/quotes/QuotesLayout";
import { Card, Chip, LoadError, Skeleton } from "@/components/quotes/ui";
import { PdfPreview } from "@/components/quotes/PdfPreview";
import {
  PaperworkError,
  STATUS_TEXT,
  base64ToBytes,
  paperworkCall,
  saveBase64File,
  todayForForms,
  useInvalidatePaperwork,
  type PaperworkItem,
  type PreviewResult,
  type Rect,
  type ReviewTarget,
  type ReviewView,
} from "@/lib/quotes/paperwork";
import { formatDate } from "@/lib/quotes/format";
import "@/components/quotes/paperwork.css";

type Edit = { value: string } | { reset: true } | { accept: true };
type Target = ReviewTarget & { suggestion?: string };

const DEBOUNCE_MS = 450;

const STATUS_CHIP: Record<ReviewTarget["status"], "ok" | "info" | "acttint" | "bad"> = {
  auto: "ok",
  edited: "info",
  blank: "acttint",
  signature: "info",
  none: "info",
};

function whyBlank(t: Target, signed: boolean): string {
  if (t.state === "signature") return signed ? "Added with your signature." : "Added only when you tap Add my signature.";
  if (t.state === "property") return "A question about the property. This is never filled in for you. Please answer it.";
  if (t.state === "none") return "Left blank on purpose. This part is not for the landlord.";
  if (t.state === "suggest") return t.keyLabel ? `Not sure this is your ${t.keyLabel.toLowerCase()}, so it was left blank.` : "Not sure what goes here, so it was left blank.";
  if (t.state === "manual") return t.reason === "Added by hand" ? "Text you added." : "Not in your records. Please fill this in.";
  if (!t.hasValue && t.keyLabel) return `Your ${t.keyLabel.toLowerCase()} is empty in your records.`;
  return "";
}

function sourceText(t: Target): string {
  if (!t.keyLabel || t.state !== "auto") return "";
  const where = t.key.startsWith("profile.") ? "business profile" : t.key.startsWith("customer.") ? "customer file" : t.key.startsWith("quote.") ? "quote" : t.key.startsWith("agreement.") ? "rental agreement" : "";
  return where ? `From your ${where}: ${t.keyLabel}` : "";
}

export default function QuotesPaperwork() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidatePaperwork();

  const [item, setItem] = useState<PaperworkItem | null>(null);
  const [review, setReview] = useState<ReviewView | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [previewHash, setPreviewHash] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [changing, setChanging] = useState<Record<string, boolean>>({});
  const [positions, setPositions] = useState<Record<string, Rect>>({});
  const [extras, setExtras] = useState<Target[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"fields" | "preview">("fields");
  const [highlights, setHighlights] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [busy, setBusy] = useState<"" | "sign" | "download" | "retry">("");
  const [savedToProfile, setSavedToProfile] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<{ id: string; versionNo: number; createdAt: string; signed: boolean }[] | null>(null);

  const pending = useRef<Record<string, Edit>>({});
  const layoutDirty = useRef(false);
  const inflight = useRef(false);
  const timer = useRef<number>();
  const [pendingCount, setPendingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const extrasRef = useRef(extras);
  extrasRef.current = extras;
  const changingRef = useRef(changing);
  changingRef.current = changing;

  const applyReview = useCallback((r: ReviewView) => {
    setReview(r);
    setItem(r.paperwork);
    setPositions(r.positions ?? {});
    setExtras(r.targets.filter((t) => t.id.startsWith("x")));
  }, []);

  const runPreview = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setRefreshing(true);
    const edits = pending.current;
    pending.current = {};
    const sendLayout = layoutDirty.current;
    layoutDirty.current = false;
    setPendingCount(0);
    try {
      const r = await paperworkCall<PreviewResult>({
        action: "paperwork.preview",
        id,
        edits,
        ...(sendLayout ? { positions: positionsRef.current, extraTargets: extrasRef.current.map(({ id: tid, page, rect, inputType, label }) => ({ id: tid, page, rect, inputType, label })) } : {}),
      });
      setPdf(base64ToBytes(r.pdf));
      setPreviewHash(r.previewHash);
      setProblems(Object.fromEntries(r.problems.map((p) => [p.targetId, p.message])));
      if (r.signatureRemoved) setNotice("You changed the form after signing, so your signature was taken off. Check the preview, then add it again.");
      // Keep what Mike is typing; take everything else from the server.
      setReview(r.review);
      setItem(r.review.paperwork);
      setLocal((cur) => {
        const next: Record<string, string> = {};
        // Keep a protected number while Mike is still typing it; it is masked again when he leaves the box.
        for (const k of Object.keys(cur)) if (k in pending.current || changingRef.current[k]) next[k] = cur[k];
        return next;
      });
      setErr("");
    } catch (e) {
      // Put the edits back so nothing typed is lost, and try again on the next change.
      pending.current = { ...edits, ...pending.current };
      if (sendLayout) layoutDirty.current = true;
      setPendingCount(Object.keys(pending.current).length);
      setErr(e instanceof PaperworkError ? e.message : "Could not update the preview. Your changes are kept. Try again.");
    } finally {
      inflight.current = false;
      setRefreshing(false);
      if (Object.keys(pending.current).length || layoutDirty.current) schedule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void runPreview(), DEBOUNCE_MS);
  }, [runPreview]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    while (inflight.current) await new Promise((r) => setTimeout(r, 100));
    if (Object.keys(pending.current).length || layoutDirty.current || !previewHash) await runPreview();
  }, [runPreview, previewHash]);

  // First load, and polling while the form is still being read.
  useEffect(() => {
    let live = true;
    let poll: number | undefined;
    const load = async () => {
      try {
        const r = await paperworkCall<ReviewView | { paperwork: PaperworkItem }>({ action: "paperwork.get", id });
        if (!live) return;
        if ("targets" in r) {
          applyReview(r);
          void runPreview();
        } else {
          setItem(r.paperwork);
          if (r.paperwork.status === "reading") poll = window.setTimeout(load, 3000);
        }
      } catch (e) {
        if (live) setLoadErr(e instanceof PaperworkError ? e.message : "Could not load this form.");
      }
    };
    void load();
    return () => {
      live = false;
      window.clearTimeout(poll);
      window.clearTimeout(timer.current);
    };
  }, [id, applyReview, runPreview]);

  const targets: Target[] = useMemo(() => (review?.targets ?? []) as Target[], [review]);
  const byStatus = useMemo(() => {
    const c = { auto: 0, edited: 0, blank: 0, signature: 0, none: 0 };
    for (const t of targets) c[t.status]++;
    return c;
  }, [targets]);

  const edit = (tid: string, e: Edit) => {
    pending.current[tid] = e;
    setPendingCount(Object.keys(pending.current).length);
    if ("value" in e) setLocal((cur) => ({ ...cur, [tid]: e.value }));
    else setLocal((cur) => {
      const next = { ...cur };
      delete next[tid];
      return next;
    });
    setSavedToProfile((cur) => {
      const next = { ...cur };
      delete next[tid];
      return next;
    });
    schedule();
  };

  const valueOf = (t: Target) => (t.id in local ? local[t.id] : t.value);

  const reveal = async (t: Target) => {
    if (t.id in revealed) {
      setRevealed(({ [t.id]: _, ...rest }) => rest);
      return;
    }
    try {
      await flush();
      const r = await paperworkCall<{ value: string }>({ action: "paperwork.reveal", id, targetId: t.id });
      setRevealed((cur) => ({ ...cur, [t.id]: r.value }));
      window.setTimeout(() => setRevealed(({ [t.id]: _, ...rest }) => rest), 30_000);
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not show it. Try again.");
    }
  };

  const saveToProfile = async (t: Target) => {
    if (!t.profileField) return;
    const value = valueOf(t);
    try {
      await flush();
      await paperworkCall({ action: "profile.save", values: { [t.profileField]: value } });
      setSavedToProfile((cur) => ({ ...cur, [t.id]: "Saved to your profile." }));
      void invalidate();
    } catch (e) {
      const msg = e instanceof PaperworkError ? Object.values(e.fieldErrors)[0] ?? e.message : "Could not save to your profile.";
      setSavedToProfile((cur) => ({ ...cur, [t.id]: msg }));
    }
  };

  const sign = async () => {
    setBusy("sign");
    setErr("");
    try {
      await flush();
      await paperworkCall({ action: "paperwork.sign", id, previewHash, date: todayForForms() });
      setNotice("");
      await runPreview();
      void invalidate();
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not add your signature. Try again.");
      await runPreview();
    } finally {
      setBusy("");
    }
  };

  const unsign = async () => {
    try {
      await paperworkCall({ action: "paperwork.unsign", id });
      await runPreview();
      void invalidate();
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not remove the signature. Try again.");
    }
  };

  const download = async () => {
    setBusy("download");
    setErr("");
    try {
      await flush();
      const blanks = targets.filter((t) => t.status === "blank").length;
      const warnings = [blanks ? `${blanks} ${blanks === 1 ? "field is" : "fields are"} still blank.` : "", review?.signed ? "" : "The form is not signed yet."].filter(Boolean);
      if (warnings.length && !window.confirm(`Before you download: ${warnings.join(" ")} Download anyway?`)) return;
      const r = await paperworkCall<{ fileName: string; type: string; data: string }>({ action: "paperwork.download", id });
      saveBase64File(r.data, r.type, r.fileName);
      setVersions(null);
      void invalidate();
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not download. Try again.");
    } finally {
      setBusy("");
    }
  };

  const retry = async () => {
    setBusy("retry");
    try {
      await paperworkCall({ action: "paperwork.retry", id });
      setReview(null);
      setPdf(null);
      setItem((i) => (i ? { ...i, status: "reading" } : i));
      void invalidate();
      window.location.reload();
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not start reading again.");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!item || !window.confirm(`Delete "${item.title}" and every saved version of it? This cannot be undone.`)) return;
    try {
      await paperworkCall({ action: "paperwork.delete", id });
      void invalidate();
      navigate(`/quotes/customers/${item.customerId}`);
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not delete. Try again.");
    }
  };

  const loadVersions = async () => {
    try {
      const r = await paperworkCall<{ versions: { id: string; versionNo: number; createdAt: string; signed: boolean }[] }>({ action: "paperwork.versions", id });
      setVersions(r.versions);
    } catch {
      setVersions([]);
    }
  };

  const reopen = async (versionId: string) => {
    if (!window.confirm("Reopen this earlier version? Your current changes on this form are replaced by that version's. Your signature comes off until you add it again.")) return;
    try {
      await flush();
      const r = await paperworkCall<ReviewView>({ action: "paperwork.restore", id, versionId });
      setLocal({});
      applyReview(r);
      await runPreview();
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not reopen that version.");
    }
  };

  const place = (page: number, x: number, y: number) => {
    const n = Math.max(0, ...extras.map((t) => Number(t.id.slice(1)) || 0)) + 1;
    const t: Target = {
      id: `x${n}`,
      origin: "overlay",
      page,
      rect: [Math.max(0, x - 2), Math.max(0, y - 7), 170, 14],
      label: `Added text ${n}`,
      inputType: "text",
      key: "manual",
      state: "manual",
      reason: "Added by hand",
      sensitive: false,
      value: "",
      masked: "",
      hasValue: false,
      edited: false,
      status: "blank",
      keyLabel: null,
      profileField: null,
    };
    setExtras((cur) => [...cur, t]);
    extrasRef.current = [...extrasRef.current, t];
    setReview((r) => (r ? { ...r, targets: [...r.targets, t] } : r));
    setPlacing(false);
    setSelected(t.id);
    setTab("fields");
    layoutDirty.current = true;
    schedule();
    setTimeout(() => document.getElementById(`pf-${t.id}`)?.focus(), 50);
  };

  const removeExtra = (tid: string) => {
    const next = extrasRef.current.filter((t) => t.id !== tid);
    setExtras(next);
    extrasRef.current = next;
    setReview((r) => (r ? { ...r, targets: r.targets.filter((t) => t.id !== tid) } : r));
    delete pending.current[tid];
    layoutDirty.current = true;
    schedule();
  };

  const move = (tid: string, rect: Rect) => {
    const next = { ...positionsRef.current };
    if (tid.startsWith("x")) {
      const ex = extrasRef.current.map((t) => (t.id === tid ? { ...t, rect } : t));
      setExtras(ex);
      extrasRef.current = ex;
      setReview((r) => (r ? { ...r, targets: r.targets.map((t) => (t.id === tid ? { ...t, rect } : t)) } : r));
    } else next[tid] = rect;
    setPositions(next);
    positionsRef.current = next;
    layoutDirty.current = true;
    schedule();
  };

  // ----- render -----

  const title = `${item?.title ?? "Paperwork"} | Agile`;
  const backTo = item ? `/quotes/customers/${item.customerId}` : "/quotes/customers";
  const back = (
    <Link to={backTo} className="pw-back">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Customer file
    </Link>
  );

  if (loadErr) return <QuotesLayout title={title}>{back}<Card><p className="q-error">{loadErr}</p></Card></QuotesLayout>;
  if (!item) return <QuotesLayout title={title}><Card><Skeleton rows={6} /></Card></QuotesLayout>;
  if (item.status === "reading")
    return (
      <QuotesLayout title={title}>
        {back}
        <Card title={item.title}>
          <p role="status">Reading the form. This usually takes under a minute. This page updates on its own.</p>
          <Skeleton rows={3} />
        </Card>
      </QuotesLayout>
    );
  if (item.status === "unreadable")
    return (
      <QuotesLayout title={title}>
        {back}
        <Card title={item.title}>
          <p>{item.statusMessage}</p>
          <button type="button" className="q-textbtn" onClick={() => void remove()}>Delete this file</button>
        </Card>
      </QuotesLayout>
    );
  if (!review) return <QuotesLayout title={title}>{back}<Card><Skeleton rows={6} /></Card></QuotesLayout>;

  const current = pendingCount === 0 && !refreshing && !!previewHash;
  const needs = targets.filter((t) => t.status === "blank");
  const rest = targets.filter((t) => t.status !== "blank" && t.status !== "none");
  const leftBlank = targets.filter((t) => t.status === "none");

  const fieldRow = (t: Target) => {
    const val = valueOf(t);
    const why = whyBlank(t, review.signed);
    const src = sourceText(t);
    const inputId = `pf-${t.id}`;
    const isSelected = selected === t.id;
    const editable = t.state !== "signature";
    return (
      <div
        key={t.id}
        className={`pw-field pw-field-${t.status}${isSelected ? " pw-field-selected" : ""}`}
        data-testid={`field-${t.id}`}
        onFocusCapture={() => setSelected(t.id)}
        onMouseEnter={() => setSelected(t.id)}
      >
        <div className="pw-field-head">
          <label htmlFor={inputId} className="pw-field-label">
            {t.sensitive && <Lock className="pw-lock" aria-hidden="true" />} {t.label}
          </label>
          <Chip tone={STATUS_CHIP[t.status]}>{STATUS_TEXT[t.status]}</Chip>
        </div>
        {editable && t.inputType === "checkbox" ? (
          <label className="q-radio pw-check">
            <input
              id={inputId}
              type="checkbox"
              checked={val === "Yes" || (!!val && val !== "Off" && t.options?.includes(val))}
              onChange={(e) => edit(t.id, { value: e.target.checked ? "Yes" : "Off" })}
            />
            Checked
          </label>
        ) : editable && (t.inputType === "radio" || t.inputType === "dropdown") ? (
          <select id={inputId} className="q-input" value={val} onChange={(e) => edit(t.id, { value: e.target.value })}>
            <option value="">Nothing picked</option>
            {(t.options ?? []).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ) : editable && t.sensitive && !changing[t.id] ? (
          <div className="pw-row">
            <span className="pw-masked pw-mono" id={inputId}>{revealed[t.id] ?? (t.masked || "Empty")}</span>
            {t.hasValue && (
              <button type="button" className="q-btn q-btn-ghost" onClick={() => void reveal(t)}>{t.id in revealed ? "Hide" : "Show"}</button>
            )}
            <button type="button" className="q-btn q-btn-ghost" onClick={() => setChanging((c) => ({ ...c, [t.id]: true }))}>Change</button>
          </div>
        ) : editable ? (
          t.multiline || (t.rect[3] > 30 && t.origin === "field") ? (
            <textarea id={inputId} className="q-input" rows={3} value={val} maxLength={t.maxLength} onChange={(e) => edit(t.id, { value: e.target.value })} />
          ) : (
            <input
              id={inputId}
              className={`q-input${t.sensitive ? " pw-mono" : ""}`}
              value={t.sensitive && !(t.id in local) ? "" : val}
              placeholder={t.sensitive ? "Type the new number" : ""}
              onBlur={
                t.sensitive
                  ? () => {
                      setChanging((c) => ({ ...c, [t.id]: false }));
                      if (!(t.id in pending.current)) setLocal(({ [t.id]: _, ...r }) => r);
                    }
                  : undefined
              }
              autoComplete="off"
              inputMode={t.sensitive ? "numeric" : undefined}
              maxLength={t.maxLength}
              onChange={(e) => edit(t.id, { value: e.target.value })}
              aria-invalid={!!problems[t.id]}
            />
          )
        ) : null}
        {problems[t.id] && <p className="q-error q-small" role="alert">{problems[t.id]}</p>}
        {src && <p className="q-muted q-small">{src}</p>}
        {why && <p className={`q-small ${t.state === "property" ? "pw-warn" : "q-muted"}`}>{why}</p>}
        <div className="pw-row pw-field-actions">
          {t.state === "suggest" && t.suggestion && !t.edited && !(t.id in local) && (
            <button type="button" className="q-btn q-btn-ghost" onClick={() => edit(t.id, { accept: true })}>
              {t.suggestion === "hidden" ? `Use my ${t.keyLabel?.toLowerCase()}` : `Use "${t.suggestion}"`}
            </button>
          )}
          {(t.edited || t.id in local) && !t.id.startsWith("x") && t.state !== "manual" && t.state !== "property" && (
            <button type="button" className="q-textbtn" onClick={() => { edit(t.id, { reset: true }); setChanging((c) => ({ ...c, [t.id]: false })); }}>
              Undo my change
            </button>
          )}
          {(t.edited || t.id in local) && t.profileField && val !== "" && (
            <button type="button" className="q-textbtn" onClick={() => void saveToProfile(t)}>
              Save to my profile too
            </button>
          )}
          {t.id.startsWith("x") && (
            <button type="button" className="q-textbtn" onClick={() => removeExtra(t.id)}>Remove this text</button>
          )}
          <button type="button" className="q-textbtn pw-phone-only" onClick={() => { setSelected(t.id); setTab("preview"); }}>
            Show on form
          </button>
        </div>
        {savedToProfile[t.id] && <p className="q-small" role="status">{savedToProfile[t.id]}</p>}
      </div>
    );
  };

  const signArea = (
    <div className="pw-signbar" data-testid="sign-area">
      {review.signed ? (
        <>
          <Chip tone="ok">Signed {review.signedDate}</Chip>
          <button type="button" className="q-textbtn" onClick={() => void unsign()}>Remove my signature</button>
        </>
      ) : review.hasSignature ? (
        <>
          <button type="button" className="q-btn q-btn-act" disabled={!current || busy === "sign"} onClick={() => void sign()} data-testid="add-signature">
            {busy === "sign" ? "Adding" : "Add my signature"}
          </button>
          <span className="q-muted q-small">{current ? "Adds your signature and today's date where this form asks for them." : "Updating the preview first."}</span>
        </>
      ) : (
        <span className="q-small">
          No saved signature yet. <Link to="/quotes/settings/business">Draw it on your Business profile</Link>, then come back.
        </span>
      )}
    </div>
  );

  return (
    <QuotesLayout title={title}>
      {back}
      <div className="pw-head">
        <h1 className="q-cond pw-title">{review.title}</h1>
        <div className="q-stack-line3">
          <Chip tone="acttint">{byStatus.blank} need you</Chip>
          <Chip tone="ok">{byStatus.auto} filled</Chip>
          {byStatus.edited > 0 && <Chip tone="info">{byStatus.edited} changed by you</Chip>}
          {review.signed && <Chip tone="ok">Signed</Chip>}
        </div>
        <p className="q-muted q-small">{item.fileName}. Uploaded {formatDate(item.createdAt)}.</p>
      </div>

      {item.status === "manual" && (
        <div className="q-banner q-att-act" role="status">
          <span>{item.statusMessage}</span>
          <button type="button" className="q-btn q-btn-ghost" onClick={() => void retry()} disabled={busy === "retry"}>Try reading again</button>
        </div>
      )}
      {notice && <div className="q-banner q-att-info" role="status"><span>{notice}</span></div>}
      {err && <p className="q-error" role="alert">{err}</p>}

      <div className="pw-tabs" role="tablist" aria-label="Show">
        <button type="button" role="tab" aria-selected={tab === "fields"} className={tab === "fields" ? "active" : ""} onClick={() => setTab("fields")}>
          Fields{byStatus.blank ? ` (${byStatus.blank} need you)` : ""}
        </button>
        <button type="button" role="tab" aria-selected={tab === "preview"} className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}>
          Preview
        </button>
      </div>

      <div className="pw-review" data-tab={tab}>
        <section className="pw-panel pw-panel-preview" aria-label="Filled form preview">
          <div className="pw-preview-tools">
            <label className="q-radio">
              <input type="checkbox" checked={highlights} onChange={(e) => setHighlights(e.target.checked)} /> Outline fields
            </label>
            <button type="button" className={`q-btn ${placing ? "q-btn-act" : "q-btn-ghost"}`} onClick={() => setPlacing((p) => !p)} aria-pressed={placing}>
              {placing ? "Tap the form where the text goes" : "Add text on the form"}
            </button>
          </div>
          <PdfPreview
            pdf={pdf}
            pages={review.pages}
            targets={targets}
            positions={positions}
            selectedId={selected}
            onSelect={(tid) => setSelected(tid)}
            showHighlights={highlights}
            placing={placing}
            onPlace={place}
            onMove={move}
            busy={refreshing}
          />
          <div className="pw-legend q-small">
            <span><i className="pw-key pw-key-blank" /> Needs you</span>
            <span><i className="pw-key pw-key-auto" /> Filled</span>
            <span><i className="pw-key pw-key-edited" /> Changed by you</span>
            <span><i className="pw-key pw-key-signature" /> Signature</span>
          </div>
          {signArea}
        </section>

        <section className="pw-panel pw-panel-fields" aria-label="Fields">
          {needs.length > 0 && (
            <Card title={`Needs you (${needs.length})`}>
              <div className="pw-fieldlist">{needs.map(fieldRow)}</div>
            </Card>
          )}
          <Card title="All other fields">
            <div className="pw-fieldlist">{rest.map(fieldRow)}</div>
            {leftBlank.length > 0 && (
              <details className="pw-details">
                <summary>Left blank on purpose ({leftBlank.length})</summary>
                <div className="pw-fieldlist">{leftBlank.map(fieldRow)}</div>
              </details>
            )}
          </Card>
          <Card title="Earlier downloads">
            {versions === null ? (
              <button type="button" className="q-textbtn" onClick={() => void loadVersions()}>Show earlier downloads</button>
            ) : versions.length === 0 ? (
              <p className="q-muted">Not downloaded yet. Each download is saved here so you can reopen and edit it later.</p>
            ) : (
              <div>
                {versions.map((v) => (
                  <div key={v.id} className="q-stack-row pw-row" style={{ justifyContent: "space-between" }}>
                    <span>Version {v.versionNo}, {formatDate(v.createdAt)}{v.signed ? ", signed" : ""}</span>
                    <button type="button" className="q-textbtn" onClick={() => void reopen(v.id)}>Reopen</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <button type="button" className="q-textbtn" onClick={() => void remove()}>Delete this form</button>
            </div>
          </Card>
        </section>
      </div>

      <div className="pw-actionbar">
        <span className="q-muted q-small pw-sync" role="status">{refreshing || pendingCount ? "Updating the preview" : "Preview up to date"}</span>
        <button type="button" className="q-btn" onClick={() => void download()} disabled={busy === "download"} data-testid="download">
          {busy === "download" ? "Preparing" : "Download"}
        </button>
        {!review.signed && tab === "fields" && (
          <button type="button" className="q-btn q-btn-ghost pw-phone-only" onClick={() => setTab("preview")}>
            Preview and sign
          </button>
        )}
      </div>
    </QuotesLayout>
  );
}
