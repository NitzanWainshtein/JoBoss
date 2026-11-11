// JoBoss: "Contact us" — open a support ticket and follow its read-only history.
//
// The user writes only the opening message. Everything after that is the team's
// replies (admin panel → Reports), shown here as a chat the user can read but not
// answer; a follow-up is a new ticket.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMySupportTickets, createSupportTicket, markSupportRead } from '../api';
import useTranslation from '../i18n/useTranslation';
import { notifySupportChanged } from '../utils/supportEvents';

const CATEGORIES = ['bug', 'account', 'billing', 'jobs', 'suggestion', 'other'];
const STATUS_COLOR = { NEW: '#7C5CFF', IN_PROGRESS: '#F5A623', RESOLVED: '#12A96F' };

function formatWhen(iso, language) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(language === 'en' ? 'en-GB' : 'he-IL', {
      day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function StatusChip({ status, t }) {
  const color = STATUS_COLOR[status] || '#9A95AC';
  return (
    <span style={{ ...s.chip, color, background: `${color}1A`, borderColor: `${color}40` }}>
      {t(`support.status.${status || 'NEW'}`)}
    </span>
  );
}

function TicketThread({ ticket, t, language }) {
  return (
    <div style={s.thread}>
      {(ticket.messages || []).map((m, i) => {
        const mine = m.from === 'user';
        return (
          <div key={i} style={{ ...s.bubbleRow, justifyContent: mine ? 'flex-start' : 'flex-end' }}>
            <div style={{ ...s.bubble, ...(mine ? s.bubbleMine : s.bubbleTeam) }}>
              <span style={s.bubbleWho}>{mine ? t('support.you') : t('support.team')}</span>
              <span style={s.bubbleText}>{m.text}</span>
              <span style={s.bubbleWhen}>{formatWhen(m.at, language)}</span>
            </div>
          </div>
        );
      })}
      {(ticket.messages || []).length === 1 && (
        <p style={s.waiting}>{t('support.waiting')}</p>
      )}
      <p style={s.readOnly}>{t('support.readOnly')}</p>
    </div>
  );
}

export default function SupportPage() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();

  const [category, setCategory] = useState('bug');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null); // { ok, text }

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await getMySupportTickets();
      setTickets(d.tickets || []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (subject.trim().length < 2 || message.trim().length < 5) {
      setNotice({ ok: false, text: t('support.tooShort') });
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      const d = await createSupportTicket({ category, subject: subject.trim(), message: message.trim() });
      setSubject('');
      setMessage('');
      setNotice({ ok: true, text: t('support.sent') });
      if (d?.ticket) {
        setTickets(prev => [d.ticket, ...prev]);
        setOpenId(d.ticket.ticketId);
      }
    } catch (err) {
      setNotice({ ok: false, text: err?.status === 429 ? t('support.rateLimit') : t('support.error') });
    } finally {
      setSending(false);
    }
  };

  const toggle = (ticket) => {
    const next = openId === ticket.ticketId ? null : ticket.ticketId;
    setOpenId(next);
    if (next && ticket.unread) {
      setTickets(prev => prev.map(x => x.ticketId === ticket.ticketId ? { ...x, unread: false } : x));
      markSupportRead(ticket.ticketId).then(notifySupportChanged).catch(() => {});
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button type="button" style={s.backBtn} aria-label={t('settings.back')} onClick={() => navigate(-1)}>
          {language === 'en' ? '←' : '→'}
        </button>
        <h1 style={s.title}>{t('support.title')}</h1>
        <span style={{ width: 34 }} />
      </div>
      <p style={s.sub}>{t('support.sub')}</p>

      {/* New ticket */}
      <form style={s.card} onSubmit={submit}>
        <p style={s.cardTitle}>{t('support.newTicket')}</p>

        <label style={s.label}>{t('support.category')}</label>
        <div style={s.catRow}>
          {CATEGORIES.map(c => (
            <button key={c} type="button"
              style={{ ...s.catBtn, ...(category === c ? s.catBtnOn : {}) }}
              onClick={() => setCategory(c)}>
              {t(`support.cat.${c}`)}
            </button>
          ))}
        </div>

        <label style={s.label} htmlFor="support-subject">{t('support.subject')}</label>
        <input id="support-subject" style={s.input} value={subject} maxLength={120}
          placeholder={t('support.subjectPh')} onChange={e => setSubject(e.target.value)} />

        <label style={s.label} htmlFor="support-message">{t('support.message')}</label>
        <textarea id="support-message" style={s.textarea} value={message} maxLength={4000} rows={5}
          placeholder={t('support.messagePh')} onChange={e => setMessage(e.target.value)} />

        {notice && (
          <p style={{ ...s.notice, color: notice.ok ? '#12A96F' : '#FF4D67' }} role="status">{notice.text}</p>
        )}

        <button type="submit" className="pro-pill-primary" style={s.sendBtn} disabled={sending}>
          {sending ? t('support.sending') : t('support.send')}
        </button>
      </form>

      {/* History */}
      <p style={s.sectionTitle}>{t('support.history')}</p>
      {loading ? (
        <p style={s.muted}>…</p>
      ) : loadError ? (
        <p style={s.muted}>{t('support.loadError')}</p>
      ) : tickets.length === 0 ? (
        <p style={s.muted}>{t('support.empty')}</p>
      ) : (
        <div style={s.list}>
          {tickets.map(tk => (
            <div key={tk.ticketId} style={s.ticket}>
              <button type="button" style={s.ticketHead} onClick={() => toggle(tk)} aria-expanded={openId === tk.ticketId}>
                <span style={s.ticketText}>
                  <span style={s.ticketSubject}>
                    {tk.unread && <span style={s.dot} aria-label={t('support.newReply')} />}
                    {tk.subject}
                  </span>
                  <span style={s.ticketMeta}>{t(`support.cat.${tk.category || 'other'}`)} · {formatWhen(tk.createdAt, language)}</span>
                </span>
                <StatusChip status={tk.status} t={t} />
              </button>
              {openId === tk.ticketId && <TicketThread ticket={tk} t={t} language={language} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  page: { padding: '14px 16px 28px', display: 'flex', flexDirection: 'column', gap: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#fff', cursor: 'pointer',
    fontSize: 17, color: '#1E2A4A', boxShadow: '0 1px 3px rgba(30,20,70,0.08)', flexShrink: 0,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 800, color: '#1E2A4A' },
  sub: { margin: '-4px 0 2px', fontSize: 13, color: '#5F5A72', textAlign: 'center' },
  card: {
    background: '#fff', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
    boxShadow: '0 1px 3px rgba(30,20,70,0.06)', border: '1px solid #EEE9FA',
  },
  cardTitle: { margin: 0, fontSize: 15, fontWeight: 800, color: '#1E2A4A' },
  label: { fontSize: 12, fontWeight: 700, color: '#6F6A84', marginTop: 4 },
  catRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  catBtn: {
    padding: '6px 12px', borderRadius: 999, border: '1.5px solid #E7E3F0', background: '#fff',
    fontSize: 12.5, fontWeight: 600, color: '#5F5A72', cursor: 'pointer',
  },
  catBtnOn: { background: '#1E2A4A', borderColor: '#1E2A4A', color: '#fff' },
  input: {
    border: '1.5px solid #E7E3F0', borderRadius: 12, padding: '10px 12px', fontSize: 14,
    color: '#1E2A4A', background: '#FBFAFF', outline: 'none',
  },
  textarea: {
    border: '1.5px solid #E7E3F0', borderRadius: 12, padding: '10px 12px', fontSize: 14, lineHeight: 1.5,
    color: '#1E2A4A', background: '#FBFAFF', outline: 'none', resize: 'vertical', minHeight: 110,
  },
  notice: { margin: '2px 0 0', fontSize: 13, fontWeight: 600 },
  sendBtn: { marginTop: 6, padding: '11px 0', fontSize: 15 },
  sectionTitle: { margin: '8px 0 0', fontSize: 15, fontWeight: 800, color: '#1E2A4A' },
  muted: { margin: 0, fontSize: 13, color: '#9A95AC', textAlign: 'center', padding: '12px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  ticket: { background: '#fff', borderRadius: 16, border: '1px solid #EEE9FA', overflow: 'hidden' },
  ticketHead: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'start', direction: 'inherit',
  },
  ticketText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  ticketSubject: {
    fontSize: 14, fontWeight: 700, color: '#1E2A4A', display: 'flex', alignItems: 'center', gap: 6,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  ticketMeta: { fontSize: 11.5, color: '#9A95AC', fontWeight: 500 },
  dot: { width: 8, height: 8, borderRadius: '50%', background: '#FF4D67', flexShrink: 0, display: 'inline-block' },
  chip: {
    flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: '1px solid',
  },
  thread: { padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #F1EDFA' },
  bubbleRow: { display: 'flex' },
  bubble: { maxWidth: '84%', borderRadius: 14, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 },
  bubbleMine: { background: '#F1ECFF', borderStartStartRadius: 4 },
  bubbleTeam: { background: '#1E2A4A', color: '#fff', borderStartEndRadius: 4 },
  bubbleWho: { fontSize: 11, fontWeight: 700, opacity: 0.75 },
  bubbleText: { fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', unicodeBidi: 'plaintext' },
  bubbleWhen: { fontSize: 10.5, opacity: 0.6, alignSelf: 'flex-end' },
  waiting: { margin: '2px 0 0', fontSize: 12, color: '#7C5CFF', fontWeight: 600, textAlign: 'center' },
  readOnly: { margin: '2px 0 0', fontSize: 11.5, color: '#9A95AC', textAlign: 'center' },
};
