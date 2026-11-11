// Admin → "דיווחים": every "Contact us" ticket, newest activity first.
// The admin can change the handling status and send replies; each reply is
// appended to the user's read-only thread and emailed to them by the backend.

import { useEffect, useState, useCallback, useRef } from 'react';
import { adminGetSupportTickets, adminUpdateSupportTicket } from '../api';
import { notifySupportChanged } from '../utils/supportEvents';

const STATUS = {
  NEW:         { label: 'חדש',    color: '#7C5CFF' },
  IN_PROGRESS: { label: 'בטיפול', color: '#F5A623' },
  RESOLVED:    { label: 'טופל',   color: '#12A96F' },
};
const CATEGORY = {
  bug: 'תקלה', account: 'חשבון', billing: 'מנוי ותשלום', jobs: 'משרות והגשות', suggestion: 'הצעה', other: 'אחר',
};
const FILTERS = [
  { key: 'open', label: 'פתוחים' },
  { key: 'NEW', label: 'חדשים' },
  { key: 'IN_PROGRESS', label: 'בטיפול' },
  { key: 'RESOLVED', label: 'טופלו' },
  { key: 'all', label: 'הכל' },
];

const when = iso => (iso ? new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export default function AdminSupportPanel({ onToast, onUnreadChange }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [openKey, setOpenKey] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);

  const keyOf = tk => `${tk.userId}/${tk.ticketId}`;
  // The parent passes fresh callback identities every render; keep them in refs
  // so `load` stays stable and does not refetch in a loop.
  const toastRef = useRef(onToast);
  const unreadRef = useRef(onUnreadChange);
  toastRef.current = onToast;
  unreadRef.current = onUnreadChange;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminGetSupportTickets();
      setTickets(d.tickets || []);
      unreadRef.current?.(d.unread || 0);
    } catch (e) {
      toastRef.current?.('שגיאה בטעינת דיווחים: ' + (e.message || e.status || ''), false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const replaceTicket = updated => {
    setTickets(prev => {
      const next = prev.map(x => (keyOf(x) === keyOf(updated) ? { ...x, ...updated } : x));
      onUnreadChange?.(next.filter(x => x.adminUnread).length);
      return next;
    });
    notifySupportChanged();
  };

  const update = async (tk, data, okMsg) => {
    setBusy(keyOf(tk));
    try {
      const d = await adminUpdateSupportTicket(tk.ticketId, { userId: tk.userId, ...data });
      if (d?.ticket) replaceTicket(d.ticket);
      if (okMsg) onToast?.(d?.emailed === false && data.reply ? `${okMsg} (המייל למשתמש לא נשלח)` : okMsg);
      return true;
    } catch (e) {
      onToast?.('העדכון נכשל: ' + (e.message || e.status || ''), false);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const toggle = tk => {
    const k = keyOf(tk);
    setOpenKey(openKey === k ? null : k);
    if (openKey !== k && tk.adminUnread) update(tk, { markRead: true });
  };

  const sendReply = async tk => {
    const text = (drafts[keyOf(tk)] || '').trim();
    if (!text) return;
    if (await update(tk, { reply: text }, 'התשובה נשלחה')) {
      setDrafts(prev => ({ ...prev, [keyOf(tk)]: '' }));
    }
  };

  const visible = tickets.filter(tk =>
    filter === 'all' ? true : filter === 'open' ? tk.status !== 'RESOLVED' : tk.status === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const count = tickets.filter(tk => (f.key === 'all' ? true : f.key === 'open' ? tk.status !== 'RESOLVED' : tk.status === f.key)).length;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                border: '1.5px solid ' + (filter === f.key ? '#1E2A4A' : '#E7E3F0'),
                background: filter === f.key ? '#1E2A4A' : 'white', color: filter === f.key ? 'white' : '#5F5A72' }}>
              {f.label} ({count})
            </button>
          );
        })}
        <button onClick={load} style={{ marginInlineStart: 'auto', padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
          fontSize: 12, fontWeight: 600, border: '1.5px solid #ddd', background: 'white', color: '#555' }}>רענן</button>
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#6C4FD4', padding: 30 }}>טוען...</p>}
      {!loading && visible.length === 0 && (
        <p style={{ textAlign: 'center', color: '#aaa', padding: 30 }}>אין דיווחים בתצוגה הזו</p>
      )}

      {!loading && visible.map(tk => {
        const k = keyOf(tk);
        const st = STATUS[tk.status] || STATUS.NEW;
        const open = openKey === k;
        return (
          <div key={k} style={{ background: 'white', borderRadius: 16, overflow: 'hidden',
            border: tk.adminUnread ? '1.5px solid #B9A6FF' : '1px solid #E7E3F0' }}>
            <button type="button" onClick={() => toggle(tk)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'right' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1E2A4A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {tk.adminUnread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF4D67', flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', unicodeBidi: 'plaintext' }}>{tk.subject}</span>
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {CATEGORY[tk.category] || tk.category} · {tk.userName || tk.userEmail || tk.userId} · {when(tk.updatedAt)}
                </p>
              </div>
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                color: st.color, background: `${st.color}1A`, border: `1px solid ${st.color}40` }}>{st.label}</span>
            </button>

            {open && (
              <div style={{ borderTop: '1px solid #F1EDFA', padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 12, color: '#6F6A84', direction: 'ltr', textAlign: 'left' }}>
                  {tk.userEmail && <a href={`mailto:${tk.userEmail}`} style={{ color: '#6C4FD4' }}>{tk.userEmail}</a>}
                  {' '}· {tk.ticketId}
                </p>

                {(tk.messages || []).map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.from === 'admin' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '86%', borderRadius: 12, padding: '8px 12px',
                      background: m.from === 'admin' ? '#1E2A4A' : '#F4F0FF', color: m.from === 'admin' ? 'white' : '#1E2A4A' }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{m.from === 'admin' ? 'צוות JoBoss' : 'המשתמש'} · {when(m.at)}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', unicodeBidi: 'plaintext' }}>{m.text}</p>
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#6F6A84' }}>סטטוס טיפול:</span>
                  {Object.entries(STATUS).map(([key, v]) => (
                    <button key={key} disabled={busy === k || tk.status === key}
                      onClick={() => update(tk, { status: key }, `הסטטוס עודכן ל"${v.label}"`)}
                      style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: tk.status === key ? 'default' : 'pointer',
                        border: `1.5px solid ${v.color}`, background: tk.status === key ? v.color : 'white', color: tk.status === key ? 'white' : v.color }}>
                      {v.label}
                    </button>
                  ))}
                </div>

                <textarea value={drafts[k] || ''} rows={3} maxLength={4000}
                  onChange={e => setDrafts(prev => ({ ...prev, [k]: e.target.value }))}
                  placeholder="תשובה למשתמש (תופיע אצלו באפליקציה ותישלח במייל)"
                  style={{ border: '1.5px solid #E7E3F0', borderRadius: 12, padding: '9px 12px', fontSize: 13.5,
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit', direction: 'rtl' }} />
                <button disabled={busy === k || !(drafts[k] || '').trim()} onClick={() => sendReply(tk)}
                  className="pro-pill-primary" style={{ padding: '9px 0', fontSize: 14, opacity: (drafts[k] || '').trim() ? 1 : 0.5 }}>
                  {busy === k ? 'שולח...' : 'שלח תשובה'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
