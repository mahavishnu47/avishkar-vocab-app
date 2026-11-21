/** Landing page for visitors with no saved profile. Three big tiles. No dependencies beyond React Router (student chunk). */
import { Link } from 'react-router-dom';
import './landing.css';

export const TILES = [
  { to: '/login', icon: '🎒', label: "I'm a Student", cls: 'student' },
  { to: '/teacher/login', icon: '👩‍🏫', label: "I'm a Teacher", cls: 'teacher' },
  { to: '/teacher/login?next=/school', icon: '🏫', label: 'My School', cls: 'school' },
] as const;

function contactText(): string {
  const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_CONTACT_TEXT;
  return v && v.trim() ? v.trim() : 'Contact Shabd Mitra.';
}

export function Landing() {
  return (
    <main className="screen landing">
      <div>
        <div className="landing-logo" aria-hidden="true">🦜</div>
        <h1 className="landing-title">Shabd Mitra</h1>
        <p className="muted">5 new English words every day</p>
      </div>
      <nav className="landing-tiles" aria-label="Who are you?">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className={`landing-tile ${t.cls}`}>
            <span className="landing-tile-icon" aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
      <p className="muted landing-foot">New school? {contactText()}</p>
    </main>
  );
}
export default Landing;
