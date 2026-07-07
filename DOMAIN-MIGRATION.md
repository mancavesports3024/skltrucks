# SKL Trucks Domain Migration Guide

**skltrucks.com** — moving from WordPress (Web Design Harbour) to Vercel

Your client's domain is almost certainly managed in **Squarespace** now. Google sold Google Domains to Squarespace in 2023, so “bought with Google” usually means they log in at Squarespace with their Google account.

---

## Step 1 — Client logs into Squarespace Domains

1. Go to [domains.squarespace.com](https://domains.squarespace.com) or [squarespace.com/login](https://www.squarespace.com/login)
2. Click **Continue with Google**
3. Use the same Google account used when the domain was purchased
4. Open **skltrucks.com** in the domains list

If they don’t see it, try the email that gets Google/domain renewal notices.

---

## Step 2 — You add the domain in Vercel first

1. **Vercel** → **skltrucks** project → **Settings** → **Domains**
2. Add `skltrucks.com` and `www.skltrucks.com`
3. Vercel shows the **exact DNS records** — use those, not generic examples

Usually something like:

| Type  | Host / Name | Value                |
|-------|-------------|----------------------|
| A     | `@`         | `76.76.21.21`        |
| CNAME | `www`       | `cname.vercel-dns.com` |

**Copy what Vercel shows for your project.**

---

## Step 3 — Edit DNS in Squarespace

1. In Squarespace → **skltrucks.com** → **DNS** or **DNS Settings**
2. Under **Custom records** (or similar), add or update for the website:
   - **A record** — Host: `@` → Vercel’s IP (e.g. `76.76.21.21`)
   - **CNAME** — Host: `www` → `cname.vercel-dns.com`
3. **Remove or change old website records** pointing to Web Design Harbour / WordPress, for example:
   - Old A records for `@` (other IPs)
   - Old CNAME for `www` to the old host

   **Do not delete unless you’re sure they’re only for the old site.**

4. **Keep email records** if they use `@skltrucks.com` email:
   - **MX** records (Google Workspace, etc.)
   - **TXT** (SPF, verification)

   `skltrucksllc@gmail.com` is regular Gmail — **no MX changes needed** for that.

5. Save each record

Squarespace guide: [Edit your domain's DNS records](https://support.squarespace.com/hc/en-us/articles/205812378)

---

## Step 4 — Wait and confirm

1. **Vercel** → **Domains** → status should become **Valid** (often 15 min–24 hrs)
2. Open [https://skltrucks.com](https://skltrucks.com) — should show your new Vercel site
3. Check: [dnschecker.org](https://dnschecker.org) for `skltrucks.com`

---

## If the client can’t find the domain

- Check email for “Squarespace” or “Google Domains” renewal messages
- Old host (Web Design Harbour) may still control DNS — client may need to ask them to update records or transfer DNS access
- Client can call Squarespace support with proof they own the domain

---

## Short message you can send your client

> Hi — since you bought skltrucks.com through Google, it’s now managed at Squarespace.
>
> 1. Log in at [domains.squarespace.com](https://domains.squarespace.com) with your Google account
> 2. Open **skltrucks.com** → **DNS Settings**
> 3. We’ll add Vercel’s records so the new site shows (I’ll send the exact values from Vercel)
> 4. Remove old website records pointing to the previous host
>
> Please don’t delete **MX** or **email** records unless we confirm you don’t use email on `@skltrucks.com`.

---

## Quick links

| Resource | URL |
|----------|-----|
| Squarespace Domains login | https://domains.squarespace.com |
| Vercel project (after deploy) | https://vercel.com/dashboard |
| DNS propagation check | https://dnschecker.org |
| Live site (Vercel preview) | https://skltrucks.vercel.app |
