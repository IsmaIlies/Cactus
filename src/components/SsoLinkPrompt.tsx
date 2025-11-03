import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { ShieldCheck } from 'lucide-react';

const SsoLinkPrompt: React.FC = () => {
  const { isAuthenticated, linkMicrosoft } = useAuth();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem('ssoLinkDismissed') === '1'; } catch { return false; }
  });

  const { hasMicrosoft, hasPassword } = useMemo(() => {
    const u = auth.currentUser;
    const providers = (u?.providerData || []).map(p => p.providerId);
    return {
      hasMicrosoft: providers.includes('microsoft.com'),
      hasPassword: providers.includes('password'),
    };
  }, [auth.currentUser?.uid]);

  useEffect(() => {
    // If user changes (login/logout), reset dismissed state for new session
    // But keep localStorage for the same user choice
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;
  if (dismissed) return null;
  // Show only for accounts that still use password and haven't linked Microsoft yet
  if (hasMicrosoft || !hasPassword) return null;

  const onDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('ssoLinkDismissed', '1'); } catch {}
  };

  const onLink = async () => {
    const ok = await linkMicrosoft();
    if (!ok) return;
    // After link, hide prompt
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[1000] -translate-x-1/2">
      <div className="flex max-w-xl items-center gap-3 rounded-2xl border border-cyan-400/30 bg-slate-900/85 px-4 py-3 text-sm text-cyan-100 shadow-lg shadow-cyan-900/30 backdrop-blur">
        <ShieldCheck className="h-5 w-5 text-cyan-300" />
        <div className="flex-1">
          <p className="font-semibold">Liez votre compte Microsoft</p>
          <p className="text-xs text-cyan-200/80">Sécurité renforcée et connexion plus rapide. Recommandé.</p>
        </div>
        <button onClick={onLink} className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:border-cyan-300/70 hover:bg-cyan-500/20">Lier maintenant</button>
        <button onClick={onDismiss} title="Masquer" className="rounded-lg px-2 py-1 text-xs text-cyan-200/60 hover:text-cyan-100">Ignorer</button>
      </div>
    </div>
  );
};

export default SsoLinkPrompt;
