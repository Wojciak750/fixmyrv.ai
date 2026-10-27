// Shows the filled PDF exactly as it will download, with each field outlined by its status.
// On flat forms the text boxes can be dragged into place, and new text can be added by tapping.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfJs, type PageSize, type Rect, type ReviewTarget } from "@/lib/quotes/paperwork";

interface Props {
  pdf: Uint8Array | null;
  pages: PageSize[];
  targets: ReviewTarget[];
  positions: Record<string, Rect>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  showHighlights: boolean;
  placing: boolean;
  onPlace: (page: number, x: number, y: number) => void;
  onMove: (id: string, rect: Rect) => void;
  busy: boolean;
}

function rectOf(t: ReviewTarget, positions: Record<string, Rect>): { page: number; rect: Rect }[] {
  if (positions[t.id]) return [{ page: t.page, rect: positions[t.id] }];
  return t.rects?.length ? t.rects.map((r) => ({ page: r.page, rect: r.rect })) : [{ page: t.page, rect: t.rect }];
}

function PageCanvas({ doc, index, width, version }: { doc: PDFDocumentProxy | null; index: number; width: number; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!doc || !width) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      // Draw off screen first, then copy, so the page never flashes white while it updates.
      const off = document.createElement("canvas");
      off.width = Math.floor(viewport.width);
      off.height = Math.floor(viewport.height);
      await page.render({ canvasContext: off.getContext("2d")!, viewport }).promise;
      if (cancelled || !ref.current) return;
      const c = ref.current;
      c.width = off.width;
      c.height = off.height;
      c.getContext("2d")!.drawImage(off, 0, 0);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [doc, index, width, version]);
  return <canvas ref={ref} className="pw-canvas" aria-hidden="true" />;
}

export function PdfPreview({ pdf, pages, targets, positions, selectedId, onSelect, showHighlights, placing, onPlace, onMove, busy }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [version, setVersion] = useState(0);
  const [drag, setDrag] = useState<{ id: string; rect: Rect; startX: number; startY: number; orig: Rect; scale: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf) return;
    let live = true;
    loadPdfJs()
      .then((pdfjs) => pdfjs.getDocument({ data: pdf.slice(), isEvalSupported: false }).promise)
      .then((d) => {
        if (!live) return void d.destroy();
        setDoc((old) => {
          // Free the previous copy once the new one is ready.
          if (old) setTimeout(() => void old.destroy(), 2000);
          return d;
        });
        setVersion((v) => v + 1);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pdf]);

  // Scroll the selected field into view on the preview.
  useEffect(() => {
    if (!selectedId) return;
    const el = wrap.current?.querySelector<HTMLElement>(`[data-target="${selectedId}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedId]);

  const startDrag = (e: React.PointerEvent, t: ReviewTarget, rect: Rect, scale: number) => {
    onSelect(t.id);
    if (t.origin !== "overlay") return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Dragging still works without capture.
    }
    setDrag({ id: t.id, rect, orig: rect, startX: e.clientX, startY: e.clientY, scale, moved: false });
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / drag.scale;
    const dy = (e.clientY - drag.startY) / drag.scale;
    if (Math.abs(dx) + Math.abs(dy) < 1 && !drag.moved) return;
    setDrag({ ...drag, moved: true, rect: [drag.orig[0] + dx, drag.orig[1] - dy, drag.orig[2], drag.orig[3]] });
  };

  const endDrag = () => {
    if (drag?.moved) onMove(drag.id, drag.rect.map((n) => Math.round(n * 10) / 10) as Rect);
    setDrag(null);
  };

  return (
    <div ref={wrap} className={`pw-preview${placing ? " pw-placing" : ""}`} aria-busy={busy}>
      {!pdf && <div className="pw-preview-empty">Building the preview</div>}
      {pdf &&
        pages.map((pg) => {
          const scale = width / pg.width;
          const height = pg.height * scale;
          return (
            <div
              key={pg.index}
              className="pw-page"
              style={{ width, height }}
              onClick={(e) => {
                if (!placing) return;
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                onPlace(pg.index, (e.clientX - r.left) / scale, pg.height - (e.clientY - r.top) / scale);
              }}
            >
              <PageCanvas doc={doc} index={pg.index} width={width} version={version} />
              <div className="pw-layer" aria-hidden={!showHighlights}>
                {targets.flatMap((t) =>
                  rectOf(t, positions)
                    .filter((r) => r.page === pg.index)
                    .map((r, i) => {
                      const rect = drag?.id === t.id ? drag.rect : r.rect;
                      const selected = selectedId === t.id;
                      if (!showHighlights && !selected) return null;
                      if (t.status === "none" && !selected) return null;
                      return (
                        <button
                          type="button"
                          key={`${t.id}-${i}`}
                          data-target={i === 0 ? t.id : undefined}
                          className={`pw-hl pw-hl-${t.status}${selected ? " pw-hl-selected" : ""}${t.origin === "overlay" ? " pw-hl-movable" : ""}`}
                          style={(() => {
                            // Small boxes (checkboxes) grow around their center so the outline stays on them.
                            const w = rect[2] * scale + 2;
                            const h = rect[3] * scale + 2;
                            const W = Math.max(12, w);
                            const H = Math.max(12, h);
                            return { left: rect[0] * scale - 1 - (W - w) / 2, top: (pg.height - rect[1] - rect[3]) * scale - 1 - (H - h) / 2, width: W, height: H };
                          })()}
                          title={t.label}
                          aria-label={`${t.label}. ${t.origin === "overlay" ? "Drag to move." : ""}`}
                          tabIndex={-1}
                          onPointerDown={(e) => startDrag(e, t, rect, scale)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={endDrag}
                          onClick={(e) => e.stopPropagation()}
                        />
                      );
                    }),
                )}
              </div>
              <div className="pw-pageno">Page {pg.index + 1} of {pages.length}</div>
            </div>
          );
        })}
    </div>
  );
}
