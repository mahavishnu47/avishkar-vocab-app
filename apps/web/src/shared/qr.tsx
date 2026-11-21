/**
 * QR code as inline SVG. CONTRACT FILE (frozen by O1). Import ONLY from teacher and school code:
 * the student bundle must never reach `qrcode-generator` (docs/ONBOARDING_SPEC.md 5.1).
 */
import qrcode from 'qrcode-generator';

export function QrSvg({ text, size = 240, label }: { text: string; size?: number; label: string }) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  return (
    <div role="img" aria-label={label} style={{ width: size, height: size, maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
