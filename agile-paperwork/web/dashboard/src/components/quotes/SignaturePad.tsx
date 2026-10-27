// Draw a signature with a mouse, pen or finger. Exports a trimmed PNG with a clear background.
import { useEffect, useRef, useState } from "react";

const INK = "#0b1f4d";

export function SignaturePad({ onSave, onCancel, saving }: { onSave: (pngDataUrl: string) => void; onCancel?: () => void; saving?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    let lastW = -1;
    let lastH = -1;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      if (Math.round(rect.width) === lastW && Math.round(rect.height) === lastH) return;
      lastW = Math.round(rect.width);
      lastH = Math.round(rect.height);
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6;
      setHasInk(false);
    };
    fit();
    // Rotating a phone resizes the pad; start over rather than stretch the ink.
    const ro = new ResizeObserver(() => fit());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      canvasRef.current!.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers refuse capture for synthetic or already-ended pointers; drawing still works.
    }
    drawing.current = true;
    last.current = point(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    setHasInk(true);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const coalesced = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
    const events = coalesced.length ? coalesced : [e.nativeEvent];
    for (const ev of events) {
      const r = canvasRef.current!.getBoundingClientRect();
      const p = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
    }
  };

  const up = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  // Crops to the ink so the signature sits neatly on the form line.
  const exportPng = (): string => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return "";
    const pad = 6;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const out = document.createElement("canvas");
    const scale = Math.min(1, 900 / (maxX - minX + 1));
    out.width = Math.round((maxX - minX + 1) * scale);
    out.height = Math.round((maxY - minY + 1) * scale);
    out.getContext("2d")!.drawImage(c, minX, minY, maxX - minX + 1, maxY - minY + 1, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };

  return (
    <div className="pw-sigpad">
      <p className="q-muted q-small" id="sigpad-help">Sign inside the box with your finger, a pen or the mouse.</p>
      <div className="pw-sigpad-box">
        <canvas
          ref={canvasRef}
          className="pw-sigpad-canvas"
          aria-label="Signature drawing area"
          aria-describedby="sigpad-help"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          data-testid="signature-canvas"
        />
        <div className="pw-sigpad-line" aria-hidden="true" />
      </div>
      <div className="pw-row">
        <button type="button" className="q-btn q-btn-act" disabled={!hasInk || saving} onClick={() => onSave(exportPng())}>
          {saving ? "Saving" : "Save signature"}
        </button>
        <button type="button" className="q-btn q-btn-ghost" disabled={!hasInk || saving} onClick={clear}>
          Clear
        </button>
        {onCancel && (
          <button type="button" className="q-textbtn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
