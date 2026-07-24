# Security Documentation — Phase 1 (Platform Foundation)

**Status:** Living document. Establishes the security controls implemented in the MakeReady platform and the evidence an auditor (SOC 2 Type 2 / PCI DSS) will request.
**Compliance posture:** MakeReady is built to be **auditable**. G54 owns the audit engagement and attestation; the provider builds and documents the controls (see [SOW §3](../../SOW.md)).

---

## 1. Architecture & Data Flow

```
Browser (TLS 1.2+)
  │  HTTP-only session cookie (JWT)
  ▼
Vercel Edge (proxy.ts) ── verifies JWT signature + expiry (coarse gate)
  ▼
Next.js Server (Node runtime, US region iad1)
  ├─ guards.ts   → loads session row, checks user active, enforces RBAC
  ├─ server actions / RSC → business logic
  ├─ audit.ts    → append-only audit entry (atomic with each write)
  ▼
Neon PostgreSQL (US region, TLS, encryption at rest)
```

All application data resides in a single US-region PostgreSQL instance. There is no third-party
data processor in the Phase 1 foundation except the hosting platform (Vercel) and the database
(Neon) — both configured to US regions for data residency.

---

## 2. Control Matrix

| # | Control | Requirement | Implementation | Evidence / Location |
|---|---|---|---|---|
| C-1 | Password storage | Hash with bcrypt | bcrypt, cost 12 | `src/lib/auth/password.ts` |
| C-2 | Password policy | Min 10, upper/lower/number | `validatePassword()` | `src/lib/auth/password.ts` |
| C-3 | Brute-force protection | Lock after 5 failed attempts, 15 min | `login()` lockout + admin alert | `src/lib/auth/service.ts` |
| C-4 | Session security | HTTP-only, Secure, SameSite cookies | `sessionCookieOptions()` | `src/lib/auth/session.ts` |
| C-5 | Single active session | New login invalidates prior sessions | `createSession()` deletes prior rows | `src/lib/auth/service.ts` |
| C-6 | Immediate revocation | Deactivation kills active sessions | `setUserStatusAction()` deletes sessions | `src/lib/admin/actions.ts` |
| C-7 | Server-side authZ | Never trust client role claims | `guards.ts` + `rbac.ts` on every route/action | `src/lib/auth/guards.ts` |
| C-8 | Audit logging | Every write logged, append-only | `audit()`, no update/delete paths | `src/lib/audit.ts`, `audit_log` table |
| C-9 | Reset tokens | Single-use, 1-hour expiry, hashed at rest | SHA-256 token hash, `usedAt` | `src/lib/auth/service.ts` |
| C-10 | Generic auth errors | Do not reveal account existence | Uniform "invalid" responses | `src/lib/auth/actions.ts` |
| C-11 | Secrets management | No secrets in code | Env vars (`AUTH_SECRET`, `DATABASE_URL`) | Vercel encrypted env |
| C-12 | Transport security | TLS everywhere, HTTPS redirect | Vercel-managed TLS | Platform default |
| C-13 | Input validation | Validate/sanitize server-side | Zod schemas on all actions | `src/lib/**/actions.ts` |
| C-14 | Least privilege | Role-scoped nav + data | Permission matrix | `src/lib/rbac.ts` |

---

## 3. Roles & Access

Six roles (Admin, Sales Manager, Sales Rep, Finance, Production, Art) with an explicit per-module
permission matrix in `src/lib/rbac.ts`, mirroring [requirements/rbac.md](../requirements/rbac.md).
Access is additive across a user's roles and enforced server-side on every request; the client nav
is filtered but is never the security boundary.

---

## 4. Secure SDLC

- **Source control:** GitHub (`cwallg54/MakeReady`), single `main` branch, changes via commits/PRs.
- **Type safety:** TypeScript strict; build fails on type errors.
- **Dependency management:** pnpm lockfile committed; dependencies pinned.
- **Secrets:** never committed; `.env*` gitignored; runtime secrets in Vercel encrypted env.
- **Migrations:** schema changes are versioned SQL under `platform/drizzle/`, reviewed before apply.
- **Least-privilege data model:** posted financial records will be immutable (reversal entries) — enforced from Phase 5.

### Recommended before production go-live (tracked for later phases)
- Automated dependency scanning (Dependabot / `pnpm audit` in CI).
- MFA/TOTP enrollment (foundation present; enrollment UI is a fast-follow).
- Rate limiting at the edge on auth endpoints.
- Formal access-review cadence and offboarding runbook (organizational control — G54).
- Malware scanning on Content Library uploads (Phase 6).

---

## 5. Auditor Evidence Index

An auditor can be pointed to: this document, the control matrix source files listed above, the
`audit_log` table (append-only activity trail), the Vercel env configuration (secrets management),
and the migration history (`platform/drizzle/`). Organizational controls (HR, physical security,
vendor management, the audit engagement itself) remain G54's responsibility.
