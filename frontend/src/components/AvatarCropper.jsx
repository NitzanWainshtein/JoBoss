// Lets the user position and scale a photo inside the circular avatar mask
// before it is uploaded, so faces stop getting cropped off by a blind
// centre-crop.
//
// The output is a square canvas at a fixed size rather than the original file:
// the crop has to be baked in, otherwise every surface that renders the avatar
// would need to know the offset. It also keeps uploads small.

import { useState, useRef, useEffect, useCallback } from 'react';
import useTranslation from '../i18n/useTranslation';

const BOX = 260;      // on-screen editor size
const OUTPUT = 512;   // exported image size

export default function AvatarCropper({ file, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const [img, setImg] = useState(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const dragRef = useRef(null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Smallest scale that still covers the circle, so the mask can never show
  // empty space no matter how the user drags.
  const baseScale = img ? Math.max(BOX / img.width, BOX / img.height) : 1;
  const drawScale = baseScale * scale;

  const clamp = useCallback((next) => {
    if (!img) return next;
    const w = img.width * drawScale;
    const h = img.height * drawScale;
    const maxX = Math.max(0, (w - BOX) / 2);
    const maxY = Math.max(0, (h - BOX) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, [img, drawScale]);

  useEffect(() => { setPos(p => clamp(p)); }, [clamp]);

  const startDrag = (clientX, clientY) => {
    dragRef.current = { startX: clientX, startY: clientY, origin: { ...pos } };
  };
  const moveDrag = (clientX, clientY) => {
    const d = dragRef.current;
    if (!d) return;
    setPos(clamp({
      x: d.origin.x + (clientX - d.startX),
      y: d.origin.y + (clientY - d.startY),
    }));
  };
  const endDrag = () => { dragRef.current = null; };

  // Keyboard nudging, so positioning is not pointer-only.
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 20 : 5;
    const map = {
      ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step },
    };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    setPos(p => clamp({ x: p.x + d.x, y: p.y + d.y }));
  };

  const confirm = () => {
    if (!img || busy) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);

    const ratio = OUTPUT / BOX;
    const w = img.width * drawScale * ratio;
    const h = img.height * drawScale * ratio;
    ctx.drawImage(img, (OUTPUT - w) / 2 + pos.x * ratio, (OUTPUT - h) / 2 + pos.y * ratio, w, h);

    canvas.toBlob((blob) => {
      if (!blob) { setBusy(false); return; }
      // Name it .jpg to match the type — the upload path and any server-side
      // extension check should agree with the actual bytes.
      onConfirm(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  return (
    <div style={S.overlay} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label={t('crop.title')}
        style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <p style={S.title}>{t('crop.title')}</p>
        <p style={S.hint}>{t('crop.hint')}</p>

        <div
          style={S.stage}
          tabIndex={0}
          role="application"
          aria-label={t('crop.hint')}
          onKeyDown={onKeyDown}
          onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
          onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={endDrag}
        >
          {img && (
            <img
              src={objectUrlRef.current}
              alt=""
              draggable="false"
              style={{
                position: 'absolute', left: '50%', top: '50%',
                width: img.width * drawScale, height: img.height * drawScale,
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                userSelect: 'none', pointerEvents: 'none',
              }}
            />
          )}
          <div style={S.mask} />
        </div>

        <div style={S.zoomRow}>
          <span style={S.zoomLabel}>{t('crop.zoom')}</span>
          <input
            type="range" min="1" max="3" step="0.01" value={scale}
            aria-label={t('crop.zoom')}
            onChange={(e) => setScale(Number(e.target.value))}
            style={S.range}
          />
        </div>

        <div style={S.actions}>
          <button type="button" style={S.cancel} onClick={onCancel}>{t('crop.cancel')}</button>
          <button type="button" style={S.save} onClick={confirm} disabled={!img || busy}>
            {busy ? t('crop.saving') : t('crop.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(24,16,56,0.72)',
    backdropFilter: 'blur(12px)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px',
  },
  sheet: {
    background: '#FFFFFF', borderRadius: '24px', padding: '20px',
    width: 'min(340px, 96vw)', display: 'flex', flexDirection: 'column', gap: '10px',
    boxShadow: '0 26px 70px rgba(15,8,50,0.5)',
  },
  title: { margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E2A4A', textAlign: 'center' },
  hint: { margin: 0, fontSize: '12px', color: '#5A5478', textAlign: 'center' },
  stage: {
    position: 'relative', width: BOX, height: BOX, alignSelf: 'center',
    overflow: 'hidden', borderRadius: '14px', background: '#F5F3FC',
    cursor: 'grab', touchAction: 'none',
  },
  // Ring showing exactly what survives the crop.
  mask: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    boxShadow: `0 0 0 ${BOX}px rgba(255,255,255,0.72) inset`,
    borderRadius: '50%', border: '2px solid rgba(124,92,255,0.7)',
  },
  zoomRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  zoomLabel: { fontSize: '12px', fontWeight: 700, color: '#3F3A52', flexShrink: 0 },
  range: { flex: 1, accentColor: '#7C5CFF', cursor: 'pointer' },
  actions: { display: 'flex', gap: '8px', marginTop: '4px' },
  cancel: {
    flex: 1, padding: '11px', borderRadius: '999px', border: '1.5px solid #E9E4FB',
    background: 'white', color: '#5A5478', fontSize: '14px', fontWeight: 800, cursor: 'pointer',
  },
  save: {
    flex: 1, padding: '11px', borderRadius: '999px', border: 'none',
    background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)', color: 'white',
    fontSize: '14px', fontWeight: 800, cursor: 'pointer',
    boxShadow: '0 10px 24px rgba(91,61,245,0.32)',
  },
};
