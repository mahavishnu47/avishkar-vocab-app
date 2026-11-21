import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Everything this app saves on the phone starts with this prefix. */
const PREFIX = 'shabd.';

/** Remove this app's saved data (children will type their PIN again). Used by "Start fresh". */
export function clearAppData(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
    sessionStorage.clear();
  } catch { /* storage blocked: nothing to clear */ }
}

interface State { failed: boolean; attempts: number }

/**
 * Without this, any rendering error leaves a blank white screen (and damaged saved data made it permanent, K-2).
 * Shows a kind screen with two big buttons: try again, or start fresh.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, attempts: 0 };

  static getDerivedStateFromError(): Partial<State> { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('screen crashed', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen center student-screen" role="alert" style={{ textAlign: 'center', gap: 16 }}>
        <div style={{ fontSize: 72 }}>🦜</div>
        <h1 className="title">Oops! Something went wrong</h1>
        <p className="muted">Don't worry, nothing is lost. Tap the button.</p>
        <button className="btn btn-primary btn-block btn-tall" onClick={() => this.setState((s) => ({ failed: false, attempts: s.attempts + 1 }))}>
          Try again
        </button>
        {this.state.attempts >= 1 && (
          <button className="btn btn-block" onClick={() => { clearAppData(); location.replace('/'); }}>
            Start fresh (type your PIN again)
          </button>
        )}
      </main>
    );
  }
}
