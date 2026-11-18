/**
 * <OnScreenKeyboard> - custom keyboard used for BOTH spelling (Stage 1) and sentence writing (Stage 3),
 * so the phone's native keyboard (autocorrect / predictive text) never appears.
 * OWNER: Lane C (student UI). API frozen by docs/UI_SPEC.md section 5 - implement, don't change props.
 *
 * The keyboard is CONTROLLED: it never holds the text. It emits key events; the parent owns `value`
 * and renders it in a non-editable display (<KeyboardDisplay>) - never an <input>/<textarea>, which
 * would summon the native keyboard.
 */
export type KeyboardMode = 'spelling' | 'sentence';

export interface OnScreenKeyboardProps {
  /** 'spelling': lowercase a-z + backspace only (QWERTY rows).
   *  'sentence': a-z + Shift (one-shot capital) + space + . , ? ! ' + backspace. */
  mode: KeyboardMode;
  /** current text (controlled). Used for maxLength and auto-capitalise logic. */
  value: string;
  /** called with the next full value after every key press */
  onChange: (next: string) => void;
  /** renders a big primary "Check"/"Submit" key on the bottom row; omitted = no submit key */
  onSubmit?: () => void;
  /** label of the submit key; default 'Check ✔' (spelling) / 'Submit ✔' (sentence) */
  submitLabel?: string;
  /** disables the submit key (e.g. empty value) */
  submitDisabled?: boolean;
  /** max characters; default 20 (spelling) / 160 (sentence). Extra presses are ignored with a soft wobble. */
  maxLength?: number;
  /**
   * 'Letter tiles' hint (Stage 1): when set, ONLY these letters are shown as keys (scrambled order
   * given by the caller, duplicates kept), plus backspace. Each tile key disables after use and
   * re-enables when its letter is deleted.
   */
  restrictToLetters?: string[];
  /** sentence mode: capitalise the first letter automatically (default true) */
  autoCapitalize?: boolean;
  /** disables every key (e.g. while checking / submitting) */
  disabled?: boolean;
  /** optional haptic tick via navigator.vibrate(10) on key press (default true) */
  haptics?: boolean;
  className?: string;
}

/**
 * Layout contract (UI_SPEC 5): 3 letter rows (qwertyuiop / asdfghjkl / zxcvbnm) + bottom row.
 * Keys >= 44px tall at 320px width, >= 52px at >= 400px; 6px gaps; full width; fixed to the
 * bottom of the screen (safe-area aware). Keys use onPointerDown (not click) for speed, and
 * call e.preventDefault() so focus never moves to a native input.
 */
export function OnScreenKeyboard(props: OnScreenKeyboardProps) {
  void props;
  return <div className="osk osk-stub" aria-label="keyboard (stub)" />;
}

export interface KeyboardDisplayProps {
  value: string;
  /** spelling: render one box per letter when `slots` is given (after wrong attempt 1) */
  slots?: number;
  /** spelling: per-slot correctness after wrong attempt 2 (green + ✓ underline) */
  correctMask?: boolean[];
  placeholder?: string;
  /** blinking caret at end */
  showCaret?: boolean;
  mode: KeyboardMode;
}

/** Non-editable text display that pairs with the keyboard (role="textbox" aria-readonly). */
export function KeyboardDisplay(props: KeyboardDisplayProps) {
  return <div className="osk-display" role="textbox" aria-readonly="true">{props.value || props.placeholder}</div>;
}
