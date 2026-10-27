// Harness copy of src/components/quotes/ui.tsx from the Lovable project (read on 2026-10-27).
import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

export type ChipTone = "act" | "acttint" | "info" | "ok" | "bad";

export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return <span className={`q-chip q-chip-${tone}`}>{children}</span>;
}

export function Card({ title, actions, children, id }: { title?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="q-card" aria-labelledby={id && title ? id : undefined}>
      {(title || actions) && (
        <div className="q-card-head">
          {title && <h2 className="q-section" id={id}>{title}</h2>}
          {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="q-skel" />
      ))}
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span className="q-error">Could not load. Try again.</span>
      <button type="button" className="q-btn q-btn-ghost" onClick={onRetry}>Retry</button>
    </div>
  );
}

export function QueryState({ isLoading, isError, onRetry, children }: { isLoading: boolean; isError: boolean; onRetry: () => void; children: ReactNode }) {
  if (isLoading) return <Skeleton />;
  if (isError) return <LoadError onRetry={onRetry} />;
  return <>{children}</>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="q-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="q-dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 className="q-section">{title}</h2>
          <button type="button" className="q-iconbtn" style={{ color: "inherit" }} onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
