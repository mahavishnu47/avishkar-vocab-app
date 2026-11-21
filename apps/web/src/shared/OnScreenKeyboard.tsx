/**
 * <OnScreenKeyboard> - custom keyboard used for BOTH spelling (Stage 1) and sentence writing (Stage 3),
 * so the phone's native keyboard (autocorrect / predictive text) never appears.
 * OWNER: Lane C (student UI). API frozen by docs/UI_SPEC.md section 5.
 *
 * Controlled: it never holds the text, and nothing here is focusable text input
 * (keys are <button>s activated on pointerdown with preventDefault, the display is a div).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './OnScreenKeyboard.css';

export type KeyboardMode = 'spelling' | 'sentence';

export interface OnScreenKeyboardProps {
  mode: KeyboardMode;
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  maxLength?: number;
  restrictToLetters?: string[];
  autoCapitalize?: boolean;
  disabled?: boolean;
  haptics?: boolean;
  className?: string;
}

export interface KeyboardDisplayProps {
  value: string;
  slots?: number;
  correctMask?: boolean[];
  placeholder?: string;
  showCaret?: boolean;
  mode: KeyboardMode;
}

// ------------------------------------------------------------------ pure logic (unit-tested)

export type KbKey = { t: 'char'; ch: string } | { t: 'back' } | { t: 'space' } | { t: 'shift' };
/** shift: null = automatic, true = forced on, false = forced off (one-shot). */
export interface KbState { value: string; shift: boolean | null }
export interface KbConfig {
  mode: KeyboardMode;
  maxLength: number;
  restrictToLetters?: string[];
  autoCapitalize: boolean;
}
export interface KbResult extends KbState {
  /** 'max' when the key was refused because maxLength was reached; 'ignored' for other no-ops */
  rejected: 'max' | 'ignored' | null;
}

export const PUNCT = [',', '.', '?', '!', "'"] as const;
const SPACE_EATING = new Set([',', '.', '?', '!']);

export function defaultMaxLength(mode: KeyboardMode): number {
  return mode === 'spelling' ? 20 : 160;
}

/** Shift should be on by itself at the start of a sentence (sentence mode only). */
export function autoShiftOn(value: string, cfg: Pick<KbConfig, 'mode' | 'autoCapitalize'>): boolean {
  if (cfg.mode !== 'sentence' || !cfg.autoCapitalize) return false;
  return value === '' || /[.!?] $/.test(value);
}

export function effectiveShift(state: KbState, cfg: Pick<KbConfig, 'mode' | 'autoCapitalize'>): boolean {
  if (cfg.mode !== 'sentence') return false;
  return state.shift ?? autoShiftOn(state.value, cfg);
}

/** Which tiles of a letter-tiles hint are used up by `value` (first free tile with the same letter). */
export function tileUsage(tiles: string[], value: string): boolean[] {
  const used = tiles.map(() => false);
  for (const c of value.toLowerCase()) {
    const i = tiles.findIndex((t, k) => !used[k] && t === c);
    if (i >= 0) used[i] = true;
  }
  return used;
}

export function applyKey(state: KbState, key: KbKey, cfg: KbConfig): KbResult {
  const { value } = state;
  const ignored = (): KbResult => ({ ...state, rejected: 'ignored' });
  switch (key.t) {
    case 'shift': {
      if (cfg.mode !== 'sentence') return ignored();
      return { value, shift: !effectiveShift(state, cfg), rejected: null };
    }
    case 'back':
      if (!value) return ignored();
      return { value: value.slice(0, -1), shift: null, rejected: null };
    case 'space': {
      if (cfg.mode !== 'sentence' || value === '' || value.endsWith(' ')) return ignored();
      if (value.length >= cfg.maxLength) return { ...state, rejected: 'max' };
      return { value: value + ' ', shift: state.shift, rejected: null };
    }
    case 'char': {
      const ch = key.ch;
      if (/^[a-zA-Z]$/.test(ch)) {
        const lower = ch.toLowerCase();
        if (cfg.restrictToLetters) {
          const used = tileUsage(cfg.restrictToLetters, value);
          if (!cfg.restrictToLetters.some((t, i) => t === lower && !used[i])) return ignored();
        }
        if (value.length >= cfg.maxLength) return { ...state, rejected: 'max' };
        const upper = effectiveShift(state, cfg);
        return { value: value + (upper ? lower.toUpperCase() : lower), shift: null, rejected: null };
      }
      if (cfg.mode !== 'sentence' || !(PUNCT as readonly string[]).includes(ch) || value === '') return ignored();
      if (SPACE_EATING.has(ch) && value.endsWith(' ')) {
        return { value: value.slice(0, -1) + ch, shift: null, rejected: null };
      }
      if (value.length >= cfg.maxLength) return { ...state, rejected: 'max' };
      return { value: value + ch, shift: null, rejected: null };
    }
  }
}

// ------------------------------------------------------------------ component

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

export function OnScreenKeyboard(props: OnScreenKeyboardProps) {
  const {
    mode, value, onChange, onSubmit, submitDisabled, restrictToLetters, disabled, className,
    autoCapitalize = true, haptics = true,
  } = props;
  const maxLength = props.maxLength ?? defaultMaxLength(mode);
  const submitLabel = props.submitLabel ?? (mode === 'spelling' ? 'Check ✔' : 'Submit ✔');
  const [shift, setShift] = useState<boolean | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [wob, setWob] = useState(0);

  const cfg: KbConfig = { mode, maxLength, restrictToLetters, autoCapitalize };
  const live = useRef({ value, shift, cfg, onChange, onSubmit, submitDisabled, disabled, haptics });
  live.current = { value, shift, cfg, onChange, onSubmit, submitDisabled, disabled, haptics };
  // keep ref ahead of React between very fast key presses
  const pendingValue = useRef(value);
  pendingValue.current = value;

  const press = useCallback((key: KbKey, forceShift?: boolean) => {
    const l = live.current;
    if (l.disabled) return;
    const st: KbState = { value: pendingValue.current, shift: forceShift ? true : l.shift };
    const r = applyKey(st, key, l.cfg);
    if (r.rejected === 'max') setWob((n) => n + 1);
    if (r.rejected) return;
    if (l.haptics) { try { navigator.vibrate?.(10); } catch { /* ignore */ } }
    pendingValue.current = r.value;
    setShift(r.shift);
    if (r.value !== st.value) l.onChange(r.value);
  }, []);

  const flash = useCallback((id: string) => {
    setPressed(id);
    setTimeout(() => setPressed((p) => (p === id ? null : p)), 80);
  }, []);

  const submit = useCallback(() => {
    const l = live.current;
    if (!l.disabled && !l.submitDisabled && l.onSubmit) l.onSubmit();
  }, []);

  // long-press backspace
  const rep = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const stopRepeat = useCallback(() => {
    clearTimeout(rep.current.t); clearInterval(rep.current.i);
    rep.current = {};
  }, []);
  useEffect(() => stopRepeat, [stopRepeat]);
  const startBack = () => {
    press({ t: 'back' });
    stopRepeat();
    rep.current.t = setTimeout(() => {
      rep.current.i = setInterval(() => press({ t: 'back' }), 80);
    }, 400);
  };

  // physical keyboard (desktop QA / teachers)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      const k = e.key;
      if (k === 'Backspace') { press({ t: 'back' }); e.preventDefault(); }
      else if (k === 'Enter') { if (live.current.onSubmit) { submit(); e.preventDefault(); } }
      else if (k === ' ') { press({ t: 'space' }); e.preventDefault(); }
      else if (k.length === 1) {
        press({ t: 'char', ch: k }, k >= 'A' && k <= 'Z');
        if (/^[a-zA-Z,.?!']$/.test(k)) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, submit]);

  const shiftOn = effectiveShift({ value, shift }, cfg);
  const used = useMemo(() => (restrictToLetters ? tileUsage(restrictToLetters, value) : []), [restrictToLetters, value]);

  const down = (id: string, fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); flash(id); fn(); },
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) fn(); }, // screen-reader / keyboard activation
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const cls = (id: string, extra = '') => `osk-key ${extra}${pressed === id ? ' osk-pressed' : ''}`;

  const letterKey = (ch: string, i: number | string = ch) => (
    <button key={i} type="button" tabIndex={-1} disabled={disabled} className={cls(`c${i}`)}
      aria-label={`letter ${ch}`} {...down(`c${i}`, () => press({ t: 'char', ch }))}>
      {shiftOn ? ch.toUpperCase() : ch}
    </button>
  );
  const backKey = (
    <button type="button" tabIndex={-1} disabled={disabled} className={cls('back', 'osk-wide osk-special')}
      aria-label="backspace"
      onPointerDown={(e) => { e.preventDefault(); flash('back'); startBack(); }}
      onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onPointerLeave={stopRepeat}
      onClick={(e) => { if (e.detail === 0) press({ t: 'back' }); }}
      onContextMenu={(e) => e.preventDefault()}>⌫</button>
  );
  const submitKey = onSubmit && (
    <button type="button" tabIndex={-1} disabled={disabled || submitDisabled}
      className={cls('submit', 'osk-submit')} aria-label={submitLabel.replace(/[✔✓]/g, '').trim() || 'submit'}
      {...down('submit', submit)}>{submitLabel}</button>
  );

  let rows: React.ReactNode;
  if (restrictToLetters) {
    rows = (
      <div className="osk-row osk-tiles">
        {restrictToLetters.map((ch, i) => (
          <button key={i} type="button" tabIndex={-1} disabled={disabled || used[i]}
            className={cls(`t${i}`, 'osk-tile')} aria-label={`letter ${ch}`}
            {...down(`t${i}`, () => press({ t: 'char', ch }))}>{ch}</button>
        ))}
        {backKey}
      </div>
    );
  } else {
    rows = (
      <>
        <div className="osk-row">{ROWS[0].split('').map((c) => letterKey(c))}</div>
        <div className="osk-row osk-row2">{ROWS[1].split('').map((c) => letterKey(c))}</div>
        <div className="osk-row">
          {mode === 'sentence' && (
            <button type="button" tabIndex={-1} disabled={disabled}
              className={cls('shift', `osk-wide osk-special${shiftOn ? ' osk-on' : ''}`)}
              aria-label="shift" aria-pressed={shiftOn} {...down('shift', () => press({ t: 'shift' }))}>⇧</button>
          )}
          {ROWS[2].split('').map((c) => letterKey(c))}
          {backKey}
        </div>
      </>
    );
  }

  return (
    <div role="group" aria-label="keyboard" key={wob}
      className={`osk osk-${mode}${wob ? ' wobble' : ''}${className ? ' ' + className : ''}`}
      onContextMenu={(e) => e.preventDefault()}>
      {rows}
      {mode === 'sentence' && !restrictToLetters ? (
        <div className="osk-row osk-bottom">
          {PUNCT.map((p) => (
            <button key={p} type="button" tabIndex={-1} disabled={disabled} className={cls(`p${p}`, 'osk-punct')}
              aria-label={`punctuation ${p}`} {...down(`p${p}`, () => press({ t: 'char', ch: p }))}>{p}</button>
          ))}
          <button type="button" tabIndex={-1} disabled={disabled} className={cls('space', 'osk-space')}
            aria-label="space" {...down('space', () => press({ t: 'space' }))}>␣</button>
          {submitKey}
        </div>
      ) : (
        submitKey && <div className="osk-row osk-bottom">{submitKey}</div>
      )}
    </div>
  );
}

/** Non-editable text display that pairs with the keyboard (role="textbox" aria-readonly). */
export function KeyboardDisplay({ value, slots, correctMask, placeholder, showCaret = true, mode }: KeyboardDisplayProps) {
  if (mode === 'spelling' && slots) {
    const n = Math.max(slots, value.length);
    return (
      <div className="osk-display osk-slots" role="textbox" aria-readonly="true" aria-label={value || 'your spelling'}>
        {Array.from({ length: n }, (_, i) => {
          const ch = value[i] ?? '';
          const ok = correctMask?.[i];
          return (
            <span key={i} className={`osk-slot${ch ? ' filled' : ''}${ok === true ? ' ok' : ''}${i === value.length && showCaret ? ' cur' : ''}`}>
              {ch}{ok === true && ch ? <i aria-hidden="true">✓</i> : null}
            </span>
          );
        })}
      </div>
    );
  }
  return (
    <div className={`osk-display osk-${mode}-text`} role="textbox" aria-readonly="true" aria-multiline={mode === 'sentence'}>
      {value ? <span>{value}</span> : <span className="osk-ph">{placeholder}</span>}
      {showCaret && <span className="osk-caret" aria-hidden="true" />}
    </div>
  );
}
