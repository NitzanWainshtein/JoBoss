import { Component } from 'react';
import he from '../i18n/he';
import en from '../i18n/en';
import { readStoredLanguage } from '../i18n/context';

/**
 * Last line of defence for render-time crashes.
 *
 * Without this, one exception in a page component unmounts the whole tree and
 * the user is left staring at a blank white screen with no way forward — on a
 * PWA that is indistinguishable from the app being broken for good.
 *
 * Must be a class: there is still no hook equivalent of componentDidCatch.
 *
 * Deliberately does NOT use useTranslation/LanguageContext. This boundary sits
 * above LanguageProvider so it can also catch a crash inside it — depending on
 * that provider is exactly how an error screen ends up throwing on its own.
 * Resolving the language straight from storage has no such dependency.
 */
function translate(key) {
  const dict = readStoredLanguage() === 'en' ? en : he;
  return dict[key] ?? he[key] ?? key;
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the component stack — the minified message alone is rarely enough to
    // identify which screen threw.
    console.error('Render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={S.wrap}>
        <img src="/app_logo.png" alt="JoBoss" style={S.logo} />
        <h2 style={S.title}>{translate('error.title')}</h2>
        <p style={S.text}>{translate('error.body')}</p>
        <button type="button" style={S.btn} onClick={() => window.location.reload()}>
          {translate('error.reload')}
        </button>
        {/* A user who is stuck on a crashing screen needs a route out of it,
            not just a reload that lands them right back on the same screen. */}
        <button
          type="button"
          style={S.link}
          onClick={() => { window.location.href = '/swipe'; }}
        >
          {translate('error.backToJobs')}
        </button>
        {import.meta.env.DEV && (
          <pre style={S.pre}>{String(this.state.error?.stack || this.state.error)}</pre>
        )}
      </div>
    );
  }
}

const S = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', padding: 32,
    textAlign: 'center', background: 'var(--background, #F7F6FB)',
  },
  logo: { width: 90, marginBottom: 24 },
  title: { color: '#1E2A4A', fontSize: 22, fontWeight: 800, margin: '0 0 12px' },
  text: { color: '#555', fontSize: 15, maxWidth: 320, lineHeight: 1.6, margin: '0 0 24px' },
  btn: {
    background: 'linear-gradient(135deg, #7C5CFF, #5B3DF5)', color: 'white',
    border: 'none', borderRadius: 12, padding: '12px 32px',
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
  link: {
    background: 'none', border: 'none', color: '#6C4FD4',
    fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 14,
    textDecoration: 'underline',
  },
  pre: {
    marginTop: 28, maxWidth: '100%', overflow: 'auto', textAlign: 'left',
    fontSize: 11, color: '#B00020', background: '#FFF3F4',
    padding: 12, borderRadius: 8, direction: 'ltr',
  },
};

export default ErrorBoundary;
