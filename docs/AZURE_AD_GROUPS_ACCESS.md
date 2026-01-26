# Schéma d'accès par groupes Azure AD

## Règles d'accès (ProtectedRoute)

---

### 1. Aucun groupe Azure AD détecté
- **Accès complet** à toutes les zones protégées (aucun blocage).
- Log console : `[ProtectedRoute] Aucun groupe Azure AD détecté : accès complet à toutes les routes protégées.`

---

### 2. Groupes reconnus

#### [MO] Sup LEADS
- **GUID** : `54ef3c7c-1ec1-4c1c-aece-7db95d00737d`
- **Accès** :
  - `/dashboard/superviseur/leads/*`
  - `/dashboard/superviseur/leads`
  - `/dashboard/superviseur/leads/dashboard2`
  - `/leads/dashboard` (agent LEADS)

#### [MO] Sup Canal (FR)
- **GUID** : `c38dce07-743e-40c6-aab9-f46dc0ea9adb`
- **Accès** :
  - `/dashboard/superviseur/fr/*`
  - `/dashboard/superviseur/fr`
  - `/dashboard/fr/*`
  - `/dashboard/fr`

#### Superviseur CANAL+ CIV
- **Détection** : nom de groupe contenant `SUP` + (`CIV` ou `CÔTE D’IVOIRE` ou `COTE D'IVOIRE`)
- **Accès** :
  - `/dashboard/superviseur/civ/*`
  - `/dashboard/civ/*`

#### [MO] Agent Canal
- **GUID strict** : `6a2b7859-58d6-430f-a23a-e856956b333d`
- **Accès** :
  - Si pays Azure = Côte d’Ivoire → `/dashboard/civ`
  - Sinon → `/dashboard/fr`
  - `/dashboard/fr/*` (agents FR)

#### [MO] Agent LEADS
- **GUID strict** : `2fc9a8c8-f140-49fc-9ca8-8501b1b954d6`
- **Accès** :
  - Strict GUID : uniquement `/leads/dashboard` (+ sous-routes)
  - Sinon : `/leads/*`

---

### 3. Fallback par "espaces" ou rôle local
- Si aucun groupe mais un espace détecté (ex: `CANAL_FR`, `CANAL_CIV`, `LEADS`)
  - CANAL_FR → `/dashboard/fr/*`
  - CANAL_CIV → `/dashboard/civ/*`
  - LEADS → `/leads/dashboard`

---

### 4. Blocage
- Toute tentative d'accès à une URL protégée non autorisée par le groupe → **page 403**

---

## Notes
- Les GUID sont ceux des groupes Azure AD configurés côté IT.
- Les accès sont dynamiques : si le groupe change, les droits changent instantanément.
- Si aucun groupe n'est détecté, accès total (utile pour dev/test).

---

**Pour toute question ou ajout de groupe, voir le code `ProtectedRoute.tsx`.**
