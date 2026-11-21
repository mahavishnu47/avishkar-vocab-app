import { useEffect, useState } from 'react';

/**
 * Big 4-digit PIN keypad. Custom buttons only: no <input>, so the phone's native keyboard never opens.
 * Submits automatically on the 4th digit. Bump `resetKey` to clear the dots (after a wrong PIN).
 */
export function PinPad({ onSubmit, disabled, resetKey = 0, wobble }: {
  onSubmit: (pin: string) => void;
  disabled?: boolean;
  resetKey?: number;
  wobble?: boolean;
}) {
  const [pin, setPin] = useState('');
  useEffect(() => { setPin(''); }, [resetKey]);

  const press = (d: string) => {
    if (disabled) return;
    if (d === 'back') { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) onSubmit(next);
  };

  return (
    <>
      <div key={wobble ? resetKey : 'x'} className={`dots ${wobble ? 'wobble' : ''}`} role="img" aria-label={`${pin.length} of 4 digits`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={`dot ${i < pin.length ? 'on' : ''}`} />)}
      </div>
      <div className="keypad" role="group" aria-label="PIN keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="btn key" aria-label={d} onClick={() => press(d)}>{d}</button>
        ))}
        <span aria-hidden="true" />
        <button type="button" className="btn key" aria-label="0" onClick={() => press('0')}>0</button>
        <button type="button" className="btn key" aria-label="backspace" onClick={() => press('back')}>⌫</button>
      </div>
    </>
  );
}
