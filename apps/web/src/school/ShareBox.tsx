/** Link + code + QR + WhatsApp / Share / Copy. Used by the school admin and super admin screens. */
import { useState } from 'react';
import { QrSvg } from '../shared/qr.tsx';
import { copyText, whatsappUrl } from './util.ts';

export function ShareBox({ url, text, code, qr = true, onShared, label = 'link' }: {
  url: string; text: string; code?: string; qr?: boolean; onShared?: () => void; label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shared = () => onShared?.();
  return (
    <div className="s-share stack">
      <a className="btn btn-learn btn-block s-wa" href={whatsappUrl(text)} target="_blank" rel="noreferrer" onClick={shared}>
        WhatsApp
      </a>
      <div className="s-linkbox">
        <div className="s-link" data-testid="share-url">{url}</div>
        {code && <div className="s-code">Code: <strong>{code}</strong></div>}
      </div>
      <div className="row s-actions">
        <button type="button" className="btn" onClick={async () => { if (await copyText(text)) { setCopied(true); shared(); } }}>
          {copied ? 'Copied ✅' : 'Copy'}
        </button>
        {canShare && (
          <button type="button" className="btn" onClick={async () => { try { await navigator.share({ text }); shared(); } catch { /* cancelled */ } }}>
            Share
          </button>
        )}
      </div>
      <p className="muted s-text">{text}</p>
      {qr && <div className="s-qr"><QrSvg text={url} size={200} label={`QR code for the ${label}`} /></div>}
    </div>
  );
}
