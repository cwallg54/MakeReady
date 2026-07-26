# Zoey API Access — Setup Instructions

**Prepared by:** Christopher Wall (MakeReady / G54 platform)
**For:** Great Mountain West — Zoey store administrator
**Date:** July 25, 2026

---

## Why we need this

Great Mountain West is standing up **MakeReady**, its new operations platform. To keep the Zoey storefront and MakeReady in sync — customers, products/catalog, orders, and inventory — MakeReady needs authorized, read/write API access to Zoey via a dedicated OAuth 2.0 client. This is a standard, revocable integration credential; it does not change anything in your store and can be disabled at any time from the same screen.

Setup takes about 5 minutes.

---

## Step 1 — Open the API settings

1. Log into the Zoey admin. **Use (or create) an admin user that has access to Products, Customers, Orders, and Inventory** — the API client inherits *that* user's permissions.
2. Go to **Settings → APIs**.
3. Find **"Zoey REST API – oAuth 2"** and click **Manage**.

## Step 2 — Create the OAuth 2.0 client

1. Click **Create / Add new client** (create a new one — don't reuse an existing integration's client).
2. **Name:** `MakeReady Integration`
3. **Allowed Grant Types:** check **Authorization Code** and **Refresh Token**.
4. **PKCE:** select **"Authorization Code without PKCE"** (unless you specifically require PKCE).
5. **Redirect / Callback URL:** enter exactly:
   `https://makeready.g54.com/api/integrations/zoey/callback`
6. **Save.** Zoey will generate a **Client ID** and **Client Secret**.

## Step 3 — Send us these values (securely — see note below)

- [ ] **Client ID**
- [ ] **Client Secret**
- [ ] **Authorization URL** (shown on the OAuth client screen)
- [ ] **Token URL** (shown on the OAuth client screen)
- [ ] **Store / API base URL** — your Zoey storefront domain (e.g. `https://store.g54.com` or your `*.zoeysite.com` address)
- [ ] **Which admin user** the client is tied to (so we can confirm it has Product / Customer / Order / Inventory access)

## Step 4 — Helpful extras (if easy to find)

- [ ] Any **API rate limits** documented for your plan
- [ ] Whether **webhooks / event notifications** are available (vs. we poll on a schedule)
- [ ] Confirmation the client is **enabled / active**

---

**Security note:** Please don't send the Client Secret in plain email or chat. Use a password-manager share, a secure note, or a one-time-secret link (e.g. onetimesecret.com). The secret grants access to store data and should be treated like a password.

**Questions?** Reply to Christopher Wall (ck.wall@icloud.com).
