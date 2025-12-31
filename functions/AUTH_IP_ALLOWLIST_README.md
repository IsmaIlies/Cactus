# Auth IP allowlist (Blocking Functions)

This project can block Firebase Auth **sign-in** and **user creation** based on the client IP address using **Identity Platform Auth Blocking Functions**.

## Prerequisites

- Your Firebase project must be upgraded to **Firebase Authentication with Identity Platform**.
- Blocking functions must be enabled in Firebase Console (Authentication → Blocking functions) and deployed.

### If deployment fails with OPERATION_NOT_ALLOWED

If you see an error like:

`OPERATION_NOT_ALLOWED : Blocking Functions may only be configured for GCIP projects.`

it means the project is **not** currently a GCIP / Identity Platform project.

Fix:

1. Google Cloud Console → **Identity Platform** → Enable for the project.
2. Firebase Console → Authentication → ensure Identity Platform is active.
3. Re-run: `firebase deploy --only functions`

Until this is enabled, the `beforeUserSignedIn` / `beforeUserCreated` IP enforcement cannot work.

## What’s implemented

- `authBeforeUserSignedIn`: runs on every sign-in, blocks if IP not allowed.
- `authBeforeUserCreated`: runs on every new account creation, blocks if IP not allowed.

Both read `event.ipAddress` (provided by Identity Platform).

## Configuration

Set environment variables for Cloud Functions:

- `AUTH_IP_ENFORCE`:
  - `true` → **enforce** allowlist (block if not allowed)
  - `false`/unset → log-only (does not block)

- `AUTH_IP_ALLOWLIST`: comma/space-separated list of IPs and CIDRs.
  - Example:
    - `203.0.113.4, 198.51.100.0/24, 2001:db8::/32`

### Using .env (local/dev)

You can manage the settings via a `.env` file in `functions/` (loaded automatically):

```
# functions/.env
AUTH_IP_ENFORCE=false
AUTH_IP_ALLOWLIST="77.72.95.93/32,77.72.95.94/32,95.143.79.26/32,185.17.240.132/32"
AUTH_IP_BYPASS_EMAILS="admin@mars-marketing.fr admin@orange.mars-marketing.fr"
```

Copy `functions/.env.example` to `functions/.env` and edit as needed. In production, prefer Firebase environment variables or Secret Manager.

### No hardcoded allowlist

For security, no IPs are embedded in code. You must provide `AUTH_IP_ALLOWLIST`
via environment (local `.env` or Firebase/Secret Manager). The functions read
from `process.env.*`.

- `AUTH_IP_BYPASS_EMAILS` (optional): comma/space-separated emails that are always allowed.
  - Example:
    - `admin@yourcompany.com, owner@yourcompany.com`

### Safety behavior

- If `AUTH_IP_ENFORCE` is **true**, the allowlist is enforced.
- If `AUTH_IP_ALLOWLIST` is not set, it is treated as empty; sign-in/creation will be blocked (safety first).
- If `AUTH_IP_ENFORCE` is **false/unset**, nothing is blocked; disallowed IPs are only logged.

## Deploy

From the repository root:

```powershell
Set-Location "C:\Users\ilies\OneDrive\Documents\MarsMarketing\CactusAgent\functions"
npm install
Set-Location "C:\Users\ilies\OneDrive\Documents\MarsMarketing\CactusAgent"
firebase deploy --only functions
```

## Where to put the IP allowlist (production)

Cloud Functions (Gen2) environment variables are configured **per function**.

You must set the same variables on both:

- `authBeforeUserSignedIn`
- `authBeforeUserCreated`

Recommended path:

1. Google Cloud Console → Cloud Functions
2. Open the function → **Edit**
3. Runtime settings → **Runtime environment variables**
4. Add/update:
  - `AUTH_IP_ENFORCE`
  - `AUTH_IP_ALLOWLIST`
  - `AUTH_IP_BYPASS_EMAILS` (optional)
5. Deploy

## Local testing (Windows PowerShell)

Set env vars in the shell session before starting the emulator:

```powershell
$env:AUTH_IP_ENFORCE = "false"
$env:AUTH_IP_ALLOWLIST = "203.0.113.4/32,198.51.100.0/24"
$env:AUTH_IP_BYPASS_EMAILS = "admin@yourcompany.com"

Set-Location "C:\Users\ilies\OneDrive\Documents\MarsMarketing\CactusAgent"
firebase emulators:start --only functions
```

## Notes / caveats

- Mobile networks / CGNAT can change public IP frequently.
- For strict corporate access, using a fixed-egress VPN/proxy is recommended.
- Blocking functions time out at ~7 seconds; keep logic minimal (this implementation is in-memory only).
