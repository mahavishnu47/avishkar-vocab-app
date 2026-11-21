import { useRef, useState } from 'react';
import { QrSvg } from '../shared/qr.tsx';
import { copyText, shortLink, whatsappUrl } from './util.ts';

/**
 * Link + QR + WhatsApp / Share / Copy buttons. `onShared` fires on the first WhatsApp, Share, Copy or Print use
 * (callers use it to tell the server the link was shared).
 */
export function ShareBox({ url, text, code, qrLabel, qrSize = 240, onShared, children }: {
  url: string; text: string; code?: string; qrLabel: string; qrSize?: number; onShared?: () => void; children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);
  const [failed, setFailed] = useState(false);
  const fired = useRef(false);
  const shared = () => { if (!fired.current) { fired.current = true; onShared?.(); } };
  const copy = async (what: 'link' | 'message') => {
    const ok = await copyText(what === 'link' ? url : text);
    setFailed(!ok); setCopied(ok ? what : null);
    if (ok) { shared(); setTimeout(() => setCopied(null), 2500); }
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = async () => {
    try { await navigator.share({ text }); shared(); } catch { /* cancelled */ }
  };
  return (
    <div className="card t-sharebox">
      <QrSvg text={url} size={qrSize} label={qrLabel} />
      <div className="t-sharelink">{shortLink(url)}</div>
      {code && <div className="muted">Code <b className="t-code">{code}</b></div>}
      <div className="t-sharebtns">
        <a className="btn t-wa" href={whatsappUrl(text)} target="_blank" rel="noopener noreferrer" onClick={shared}>Send on WhatsApp</a>
        {canShare && <button className="btn" onClick={nativeShare}>Share…</button>}
        <button className="btn" onClick={() => copy('link')}>{copied === 'link' ? 'Copied ✅' : 'Copy link'}</button>
        <button className="btn" onClick={() => copy('message')}>{copied === 'message' ? 'Copied ✅' : 'Copy message'}</button>
        {children}
      </div>
      {failed && <div className="t-error" role="alert">Could not copy. Press and hold the message below to copy it.</div>}
      <p className="t-sharetext">{text}</p>
    </div>
  );
}
