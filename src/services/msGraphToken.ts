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
}): Promise<string | null> {
  const scopes = options?.scopes || ['User.Read'];
  const tenant = options?.tenant || (import.meta as any)?.env?.VITE_MICROSOFT_TENANT_ID;
  const p = new OAuthProvider('microsoft.com');
  try {
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

  try {
    if (auth.currentUser) {
      const res = await reauthenticateWithPopup(auth.currentUser, p);
      const cred: any = OAuthProvider.credentialFromResult?.(res);
      const token: string | undefined = cred?.accessToken;
      if (token) {
        try { sessionStorage.setItem('ms_access_token', token); } catch {}
        return token;
      }
    } else {
      const res = await signInWithPopup(auth, p);
      const cred: any = OAuthProvider.credentialFromResult?.(res);
      const token: string | undefined = cred?.accessToken;
      if (token) {
        try { sessionStorage.setItem('ms_access_token', token); } catch {}
        return token;
      }
    }
  } catch (e) {
    console.warn('[msGraphToken] acquire failed', e);
  }
  return null;
}
