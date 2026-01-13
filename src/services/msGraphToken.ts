import { OAuthProvider, reauthenticateWithPopup, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';

/**
 * Acquire a fresh Microsoft Graph access token using Firebase's Microsoft provider.
 * Falls back to popup if silent reauthentication is not available.
 */
export async function getFreshMicrosoftAccessToken(options?: {
  scopes?: string[];
  emailHint?: string;
  tenant?: string;
  interactive?: boolean; // default: true. When false, never open a popup; return cached token or null.
  forceRefresh?: boolean; // default: false. When true, ignore cached token.
}): Promise<string | null> {
  // Ensure standard OIDC scopes for richer ID token claims
  const baseScopes = ['openid', 'profile', 'email'];
  const scopes = options?.scopes || ['User.Read'];
  const tenant = options?.tenant || (import.meta as any)?.env?.VITE_MICROSOFT_TENANT_ID;
  const p = new OAuthProvider('microsoft.com');
  try {
    for (const s of baseScopes) {
      try { p.addScope(s); } catch {}
    }
    for (const s of scopes) {
      try { p.addScope(s); } catch {}
    }
  } catch {}
  try {
    const params: Record<string,string> = {};
    if (tenant) params.tenant = String(tenant);
    if (options?.emailHint) params.login_hint = options.emailHint;
    if (Object.keys(params).length) {
      try { p.setCustomParameters(params); } catch {}
    }
  } catch {}

  const interactive = options?.interactive !== false;
  const forceRefresh = options?.forceRefresh === true;
  // Use cached token when available and not forced to refresh
  try {
    const cached = sessionStorage.getItem('ms_access_token');
    if (cached && !forceRefresh) return cached;
  } catch {}

  // Non-interactive mode: never open a popup
  if (!interactive) {
    return null;
  }

  try {
    if (auth.currentUser) {
      const res = await reauthenticateWithPopup(auth.currentUser, p);
      const cred: any = OAuthProvider.credentialFromResult?.(res);
      const token: string | undefined = cred?.accessToken;
      const idToken: string | undefined = cred?.idToken;
      if (token) {
        try { sessionStorage.setItem('ms_access_token', token); } catch {}
      }
      if (idToken) {
        try { sessionStorage.setItem('ms_id_token', idToken); } catch {}
      }
      if (token) return token;
    } else {
      const res = await signInWithPopup(auth, p);
      const cred: any = OAuthProvider.credentialFromResult?.(res);
      const token: string | undefined = cred?.accessToken;
      const idToken: string | undefined = cred?.idToken;
      if (token) {
        try { sessionStorage.setItem('ms_access_token', token); } catch {}
      }
      if (idToken) {
        try { sessionStorage.setItem('ms_id_token', idToken); } catch {}
      }
      if (token) return token;
    }
  } catch (e) {
    console.warn('[msGraphToken] acquire failed', e);
  }
  return null;
}
