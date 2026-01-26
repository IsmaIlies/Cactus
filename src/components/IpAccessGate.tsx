import React from 'react';
import { firebaseConfig } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

function buildCheckUrls(): string[] {
  const pid = firebaseConfig.projectId || 'cactus-mm';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  // Local emulator endpoints
  if (/^(localhost|127\.0\.0\.1)$/i.test(host)) {
    return [
      `http://127.0.0.1:5001/${pid}/us-central1/authIpCheck`,
      `http://127.0.0.1:5001/${pid}/us-central1/authIpCheckV1`,
    ];
  }
  // Prefer Hosting rewrite in production to avoid cross-domain/CORS issues
  const urls: string[] = [
    '/ip-check',
    `https://us-central1-${pid}.cloudfunctions.net/authIpCheck`,
    `https://us-central1-${pid}.cloudfunctions.net/authIpCheckV1`,
  ];
  return urls;
}

const IpAccessGate: React.FC = () => {
  const { logout } = useAuth();
  const [blocked, setBlocked] = React.useState<{ip?: string; message?: string} | null>(null);

  React.useEffect(() => {
    const WANT = (import.meta as any)?.env?.VITE_IP_ENFORCE_FRONT === 'true';
    if (!WANT) return;
    let cancelled = false;
    (async () => {
      const urls = buildCheckUrls();
      for (const url of urls) {
        try {
          const res = await fetch(url, { credentials: 'omit', headers: { 'Accept': 'application/json' } });
          const data = await res.json().catch(() => ({}));
          if (!cancelled && data) {
            // Strict front enforcement: if VITE_IP_ENFORCE_FRONT=true, block whenever allowed===false
            const allowed = data.allowed === true;
            const enforce = data.enforce === true;
            const shouldBlock = !allowed && (WANT ? true : enforce);
            if (shouldBlock) {
              setBlocked({ ip: data.ip, message: 'Accès réseau non autorisé (liste blanche IP).' });
              try { await logout(); } catch {}
            }
            break;
          }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [logout]);

  if (!blocked) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/90 backdrop-blur">
      <div className="mx-4 max-w-md rounded-2xl border border-red-400/40 bg-red-500/10 p-6 text-red-100 shadow-xl">
        <h2 className="text-lg font-semibold">Connexion bloquée</h2>
        <p className="mt-2 text-sm">
          {blocked.message} Votre IP: <span className="font-mono">{blocked.ip || 'inconnue'}</span>
        </p>
        <p className="mt-2 text-xs text-red-200/80">
          Contactez l’administrateur pour ajouter votre IP à <span className="underline decoration-dotted">AUTH_IP_ALLOWLIST</span>.
        </p>
      </div>
    </div>
  );
};

export default IpAccessGate;
