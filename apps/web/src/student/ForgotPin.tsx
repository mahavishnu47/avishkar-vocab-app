import { ScreenHead } from './common.tsx';

export function ForgotPin({ onBack }: { onBack: () => void }) {
  const say = 'Ask your teacher for your PIN card.';
  return (
    <main className="screen center student-screen">
      <ScreenHead onBack={onBack} say={say} />
      <div style={{ fontSize: 72 }} aria-hidden="true">🙋</div>
      <h1 className="title" style={{ textAlign: 'center' }}>Ask your teacher for your PIN card 🙂</h1>
      <button className="btn btn-primary btn-block btn-tall" onClick={onBack}>Back</button>
    </main>
  );
}
