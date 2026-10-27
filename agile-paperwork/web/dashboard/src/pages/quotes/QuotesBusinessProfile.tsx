// /quotes/settings/business: everything a landlord form can ask for, plus Mike's saved signature.
// EIN, routing and account numbers show only the last 4 digits until Mike taps Show.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import QuotesLayout from "@/components/quotes/QuotesLayout";
import { Card, LoadError, Skeleton } from "@/components/quotes/ui";
import { SignaturePad } from "@/components/quotes/SignaturePad";
import { PaperworkError, paperworkCall, useBusinessProfile, useInvalidatePaperwork, type ProfileFieldDef, type ProfileView } from "@/lib/quotes/paperwork";
import "@/components/quotes/paperwork.css";

const GROUPS: { key: ProfileFieldDef["group"]; title: string; note?: string }[] = [
  { key: "business", title: "Business" },
  { key: "contact", title: "Contact" },
  { key: "bank", title: "Bank account", note: "Used for ACH and direct deposit forms." },
  { key: "lease", title: "Lease defaults" },
];

const REVEAL_MS = 30_000;
// Marks a protected value Mike chose to remove; sent as an empty value on save.
const CLEAR = "\u0000clear";

function SensitiveField({ def, masked, draft, setDraft, error }: { def: ProfileFieldDef; masked: string; draft: string | undefined; setDraft: (v: string | undefined) => void; error?: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const id = `bp-${def.name}`;
  const editing = (draft !== undefined && draft !== CLEAR) || !masked;

  const reveal = async () => {
    if (shown !== null) {
      setShown(null);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await paperworkCall<{ value: string }>({ action: "profile.reveal", field: def.name });
      setShown(r.value);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setShown(null), REVEAL_MS);
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not show it. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="q-field">
      <label htmlFor={id}>
        <Lock className="pw-lock" aria-hidden="true" /> {def.label}
      </label>
      {editing ? (
        <div className="pw-row">
          <input
            id={id}
            className="q-input pw-mono"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder={def.placeholder ?? ""}
            value={draft ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={!!error}
          />
          {masked && (
            <button type="button" className="q-textbtn" onClick={() => setDraft(undefined)}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="pw-row">
          <span className="pw-masked pw-mono" id={id} data-testid={`masked-${def.name}`}>
            {shown ?? masked}
          </span>
          <button type="button" className="q-btn q-btn-ghost" onClick={() => void reveal()} disabled={busy} aria-pressed={shown !== null}>
            {shown !== null ? "Hide" : busy ? "Opening" : "Show"}
          </button>
          <button type="button" className="q-btn q-btn-ghost" onClick={() => setDraft("")}>
            Change
          </button>
          <button
            type="button"
            className="q-textbtn"
            onClick={() => {
              if (window.confirm(`Remove your ${def.label.toLowerCase()} from the profile? Forms will leave it blank.`)) setDraft(CLEAR);
            }}
          >
            Remove
          </button>
        </div>
      )}
      {draft === CLEAR && <p className="q-small q-muted">Will be removed when you save.</p>}
      {(error || err) && <p className="q-error q-small">{error || err}</p>}
      <p className="q-muted q-small">Stored locked. Only the last 4 digits show unless you tap Show.</p>
    </div>
  );
}

function SignatureCard({ profile, onChanged }: { profile: ProfileView; onChanged: () => void }) {
  const [drawing, setDrawing] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!profile.hasSignature) {
      setImg(null);
      return;
    }
    let live = true;
    paperworkCall<{ png: string | null }>({ action: "signature.get" })
      .then((r) => live && setImg(r.png))
      .catch(() => live && setImg(null));
    return () => {
      live = false;
    };
  }, [profile.hasSignature, profile.signatureUpdatedAt]);

  const save = async (png: string) => {
    setSaving(true);
    setErr("");
    try {
      await paperworkCall({ action: "signature.save", png });
      setDrawing(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not save the signature. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove your saved signature? You can draw a new one any time.")) return;
    try {
      await paperworkCall({ action: "signature.delete" });
      onChanged();
    } catch (e) {
      setErr(e instanceof PaperworkError ? e.message : "Could not remove it. Try again.");
    }
  };

  return (
    <Card title="Your signature">
      <div style={{ display: "grid", gap: 12 }}>
        <p className="q-muted">
          It goes on a form only when you are looking at the filled preview and tap <strong>Add my signature</strong>. It is never added on its own.
        </p>
        {drawing ? (
          <SignaturePad onSave={(png) => void save(png)} onCancel={() => setDrawing(false)} saving={saving} />
        ) : profile.hasSignature ? (
          <>
            <div className="pw-sig-show">{img ? <img src={img} alt="Your saved signature" /> : <span className="q-muted">Loading</span>}</div>
            <div className="pw-row">
              <button type="button" className="q-btn q-btn-ghost" onClick={() => setDrawing(true)}>
                Draw it again
              </button>
              <button type="button" className="q-textbtn" onClick={() => void remove()}>
                Remove signature
              </button>
            </div>
          </>
        ) : (
          <div>
            <button type="button" className="q-btn q-btn-act" onClick={() => setDrawing(true)}>
              Draw my signature
            </button>
          </div>
        )}
        {err && <p className="q-error" role="alert">{err}</p>}
      </div>
    </Card>
  );
}

export default function QuotesBusinessProfile() {
  const profile = useBusinessProfile();
  const invalidate = useInvalidatePaperwork();
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data && values === null) setValues(profile.data.values);
  }, [profile.data, values]);

  const title = "Business profile | Agile";
  if (profile.isError) return <QuotesLayout title={title}><Card><LoadError onRetry={() => void profile.refetch()} /></Card></QuotesLayout>;
  if (!profile.data || !values) return <QuotesLayout title={title}><Card><Skeleton rows={8} /></Card></QuotesLayout>;
  const p = profile.data;

  const set = (name: string, v: string) => {
    setValues({ ...values, [name]: v });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setErr("");
    setErrors({});
    setSaved(false);
    const body: Record<string, string> = {};
    for (const f of p.fields) {
      if (f.sensitive) {
        const d = secrets[f.name];
        if (d === CLEAR) body[f.name] = "";
        else if (d !== undefined && d.trim() !== "") body[f.name] = d;
      } else if ((values[f.name] ?? "") !== (p.values[f.name] ?? "")) body[f.name] = values[f.name] ?? "";
    }
    try {
      const next = await paperworkCall<ProfileView>({ action: "profile.save", values: body });
      setSecrets({});
      setValues(next.values);
      setSaved(true);
      void invalidate();
    } catch (e) {
      if (e instanceof PaperworkError) {
        setErrors(e.fieldErrors);
        setErr(Object.keys(e.fieldErrors).length ? "Some values need fixing. Nothing was saved." : e.message);
      } else setErr("Could not save. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  };

  const field = (f: ProfileFieldDef) => {
    if (f.sensitive)
      return (
        <SensitiveField
          key={f.name}
          def={f}
          masked={p.masked[f.name] ?? ""}
          draft={secrets[f.name]}
          setDraft={(v) => {
            setSecrets({ ...secrets, [f.name]: v });
            setSaved(false);
          }}
          error={errors[f.name]}
        />
      );
    const id = `bp-${f.name}`;
    return (
      <div className="q-field" key={f.name}>
        <label htmlFor={id}>{f.label}</label>
        {f.kind === "select" ? (
          <select id={id} className="q-input" value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} aria-invalid={!!errors[f.name]}>
            <option value="">Not set</option>
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            className="q-input"
            type={f.kind === "email" ? "email" : f.kind === "tel" ? "tel" : "text"}
            inputMode={f.kind === "tel" ? "tel" : f.kind === "email" ? "email" : undefined}
            autoComplete="off"
            placeholder={f.placeholder ?? ""}
            value={values[f.name] ?? ""}
            onChange={(e) => set(f.name, e.target.value)}
            aria-invalid={!!errors[f.name]}
          />
        )}
        {errors[f.name] && <p className="q-error q-small">{errors[f.name]}</p>}
        {f.help && <p className="q-muted q-small">{f.help}</p>}
      </div>
    );
  };

  return (
    <QuotesLayout title={title}>
      <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>
        <Link to="/quotes/settings" className="pw-back">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Settings
        </Link>
        <h1 className="q-title q-cond">Business profile</h1>
        <p className="q-muted">
          These details fill in the landlord forms adjusters send you. Change anything here any time. Forms you already downloaded keep what they had.
        </p>
        {GROUPS.map((g) => (
          <Card key={g.key} title={g.title}>
            <div style={{ display: "grid", gap: 14 }}>
              {g.note && <p className="q-muted q-small">{g.note}</p>}
              {p.fields.filter((f) => f.group === g.key).map(field)}
            </div>
          </Card>
        ))}
        <SignatureCard profile={p} onChanged={() => void invalidate()} />
        {err && <p className="q-error" role="alert">{err}</p>}
        <div className="pw-savebar">
          <button type="button" className="q-btn q-btn-act" disabled={saving} onClick={() => void save()} data-testid="save-profile">
            {saving ? "Saving" : "Save profile"}
          </button>
          {saved && (
            <span role="status">
              <strong>Saved</strong>
            </span>
          )}
        </div>
      </div>
    </QuotesLayout>
  );
}
