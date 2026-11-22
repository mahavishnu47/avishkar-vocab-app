/** Landing page for visitors with no saved profile: a short guided page (hero + role cards, class-code box, how it works, FAQ). */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './landing.css';

export const TILES = [
  { to: '/login', icon: '🎒', label: "I'm a Student", cls: 'role-student', verb: 'Play', blurb: "Play today's words. You need your class code and your PIN." },
  { to: '/teacher/login', icon: '👩‍🏫', label: "I'm a Teacher", cls: 'role-teacher', verb: 'Open my class', blurb: 'Add your class, share the link, see who is learning.' },
  { to: '/teacher/login?next=/school', icon: '🏫', label: 'My School', cls: 'role-school', verb: 'Set up school', blurb: 'Set up your school and invite teachers.' },
] as const;

const STEPS = [
  { icon: '🎧', title: 'Listen and spell', text: 'Hear the word, then spell it.' },
  { icon: '🤔', title: 'Pick the meaning', text: 'Choose what the word means.' },
  { icon: '✍️', title: 'Write a sentence', text: 'Use the word in your own sentence.' },
] as const;

const FAQ = [
  { q: 'I forgot my PIN', a: 'Ask your teacher. They can give you a new PIN from their page.' },
  { q: "I'm on a shared phone", a: 'That is fine. Open your class code, tap your name and enter your PIN. Each child uses their own name and PIN.' },
  { q: 'Is it free? Who sees my data?', a: 'We store only your first name and your word scores. Your teacher can see them. We do not ask for emails or phone numbers.' },
  { q: 'How do I install it on my phone?', a: 'Open the page in your phone browser, open the browser menu and choose "Add to Home Screen". It then opens like an app.' },
] as const;

/** Uppercase, strip spaces; returns the code if it looks like a class code (4-8 letters/digits), else null. */
export function normalizeClassCode(raw: string): string | null {
  const c = raw.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z0-9]{4,8}$/.test(c) ? c : null;
}

function contactText(): string {
  const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_CONTACT_TEXT;
  return v && v.trim() ? v.trim() : 'Contact WordWise.';
}

export function Landing() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const c = normalizeClassCode(code);
    if (!c) {
      setErr('Please type the 4 to 8 letters or numbers of your class code, like K7Q2MX.');
      return;
    }
    setErr('');
    nav(`/j/${c}`);
  }

  return (
    <main className="screen landing">
      <header className="landing-hero">
        <div className="landing-logo" aria-hidden="true">🦜</div>
        <h1 className="landing-title">WordWise</h1>
        <p className="landing-promise">5 new English words every day, a few minutes of play.</p>
      </header>

      <nav className="landing-tiles" aria-label="Who are you?">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className={`landing-tile ${t.cls}`}>
            <span className="landing-tile-icon" aria-hidden="true">{t.icon}</span>
            <span className="landing-tile-text">
              <span className="landing-tile-label">{t.label}</span>
              <span className="landing-tile-blurb">{t.blurb}</span>
              <span className="landing-tile-verb">{t.verb} &rarr;</span>
            </span>
          </Link>
        ))}
      </nav>

      <section className="landing-card" aria-labelledby="lp-code">
        <h2 id="lp-code" className="landing-h2">Have a class code?</h2>
        <form className="landing-code" onSubmit={submit} noValidate>
          <label htmlFor="lp-code-input" className="landing-sr">Class code</label>
          <input
            id="lp-code-input" className="landing-input" value={code} maxLength={12} autoComplete="off" autoCapitalize="characters"
            spellCheck={false} placeholder="e.g. K7Q2MX" aria-invalid={err ? true : undefined} aria-describedby={err ? 'lp-code-err' : undefined}
            onChange={(e) => { setCode(e.target.value); if (err) setErr(''); }}
          />
          <button type="submit" className="landing-go">Go</button>
        </form>
        {err && <p id="lp-code-err" role="alert" className="landing-err">{err}</p>}
        <p className="muted landing-small">No code? Ask your teacher.</p>
      </section>

      <section className="landing-section" aria-labelledby="lp-how">
        <h2 id="lp-how" className="landing-h2">How it works</h2>
        <ol className="landing-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="landing-step">
              <span className="landing-step-icon" aria-hidden="true">{s.icon}</span>
              <span><strong>{i + 1}. {s.title}</strong><br /><span className="muted">{s.text}</span></span>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-card" aria-labelledby="lp-teach">
        <h2 id="lp-teach" className="landing-h2">For teachers and schools</h2>
        <ul className="landing-list">
          <li>Set up in minutes</li>
          <li>See how every child is doing</li>
          <li>No student emails or phone numbers needed</li>
        </ul>
      </section>

      <section className="landing-section" aria-labelledby="lp-faq">
        <h2 id="lp-faq" className="landing-h2">Questions</h2>
        {FAQ.map((f) => (
          <details key={f.q} className="landing-faq">
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </section>

      <footer className="landing-foot muted">
        <p>New school? {contactText()}</p>
        <p>Privacy: we keep only first names and word scores.</p>
        <p><a className="landing-admin" href="/admin">Admin</a></p>
      </footer>
    </main>
  );
}
export default Landing;
