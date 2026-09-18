# SKL Trucks LLC Website

Modern rebuild of [skltrucks.com](https://skltrucks.com/) built with **Next.js** and optimized for **Vercel** deployment.

## Features

- Homepage matching the original design (hero, marquee, about, inventory, services)
- Full inventory shop with category and manufacturer filters
- Individual product detail pages with photos and specs
- Contact, financing, and sell-my-truck forms
- **Admin panel** at `/admin` for your client to add, edit, and delete inventory

## Private truck sourcing (staff)

Staff-only buying workspace at **`/admin/sourcing`**. Leads and supplier contacts are **not** published to the public shop.

Access requires:
1. A signed-in Supabase user
2. Their email in the **`sourcing_authorized_staff`** table (RLS + `is_sourcing_staff()`)
3. **`SOURCING_STAFF_EMAILS`** set explicitly (comma-separated) for app/middleware checks — an empty/missing value grants no access

Do not rely on the `/admin` URL alone: every authenticated user is **not** automatically a sourcing user.

### Setup

1. Ensure the base schema is applied (`supabase/schema.sql`)
2. Run **`supabase/sourcing-schema.sql`** in the Supabase SQL Editor (idempotent / safe to re-run)
3. Confirm staff emails in `sourcing_authorized_staff` (seeded with `skltrucksllc@gmail.com`)
4. Sign in at `/admin/login`, open **Sourcing**
5. Optionally click **Import unverified seed research**

### What it includes

- Editable **buying profile** in the database
- Truck leads + supplier contacts with call notes and follow-up dates
- Match classification: Confirmed match / Needs verification / Does not match / Out-of-range opportunity (out-of-range only when all required specs are confirmed and pass)
- Daily digest **preview** of new listings, listing-field changes, and unchanged listings **seen again** (staff notes / match recalcs excluded)
- Scoped listing-ID uniqueness per seller/source; global VIN uniqueness
- **Staff-reviewed CSV intake** at `/admin/sourcing/intake` (pilot until a dealer feed/email/API is authorized) — see `docs/sourcing-intake-sources.md`

## Admin Inventory Management

Your client can manage trucks at **`/admin`** — similar to the WordPress product admin they used before, but built into this site.

### What the admin can do

- Sign in with email and password
- View all trucks in a table
- **Add new trucks** with photos, price, VIN, specs, and category
- **Edit** existing listings
- **Delete** sold trucks
- Toggle **Published / Draft** visibility

### One-time setup (about 10 minutes)

1. **Create a free [Supabase](https://supabase.com) project**

2. **Run the database schema**
   - Open Supabase → SQL Editor
   - Paste and run the contents of `supabase/schema.sql`

3. **Create an admin user**
   - Supabase → Authentication → Users → Add user
   - Email: `skltrucksllc@gmail.com`
   - Set a secure password for your client

4. **Configure environment variables**

   Create `.env.local` (and the same keys in **Vercel → Project Settings → Environment Variables**):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   NEXT_PUBLIC_SITE_URL=https://www.skltrucks.com
   ```

   `NEXT_PUBLIC_SITE_URL` is the **canonical public origin** (no trailing slash). Production must be `https://www.skltrucks.com`. It drives sitemap, robots, `metadataBase`, and per-page canonicals. Keep the apex→www 308; do **not** set this to `https://skltrucks.com`.

5. **Import existing inventory**

   ```bash
   npm run seed
   ```

6. **Sign in** at `http://localhost:3000/admin/login`

## Getting Started

```bash
cd skl-trucks-website
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this folder to a GitHub repository
2. Import the repo at [vercel.com](https://vercel.com)
3. **Important — check these settings** (Settings → General → Build & Development):
   - **Framework Preset:** Next.js
   - **Root Directory:** leave blank
   - **Build Command:** `npm run build`
   - **Output Directory:** leave **blank** (do NOT set to `public` or `.next`)
   - **Install Command:** `npm install`
4. Add Supabase environment variables (see above)
5. Deploy

If you see a plain `404: NOT_FOUND` page, the Output Directory is almost always set wrong — clear it and redeploy.

### Connect Custom Domain

**Full step-by-step guide:** see **[DOMAIN-MIGRATION.md](./DOMAIN-MIGRATION.md)** (Squarespace DNS + Vercel setup, client email template, troubleshooting).

Quick version:

1. Vercel → **Domains** → add `skltrucks.com` and `www.skltrucks.com`
2. Client logs into [domains.squarespace.com](https://domains.squarespace.com) (Google account)
3. Update DNS in Squarespace with the records Vercel provides
4. Remove old WordPress / Web Design Harbour website records; keep MX/email records

## Legacy: Sync from WordPress

If you still update the old WordPress site temporarily:

```bash
npm run sync-inventory
```

This updates the static fallback file. Once Supabase is connected, the live site reads from the database instead.

## Form Submissions (Gmail)

All forms email **skltrucksllc@gmail.com** using Gmail + Nodemailer (same setup as Swim Worx).

### Setup in Vercel

1. In Google Account for **skltrucksllc@gmail.com** → **Security** → enable **2-Step Verification**
2. **App passwords** → create one named "SKL Trucks Website"
3. Add to Vercel → **Settings** → **Environment Variables**:

| Variable | Value |
|----------|-------|
| `EMAIL_USER` | `skltrucksllc@gmail.com` |
| `EMAIL_PASSWORD` | your 16-character Gmail app password |
| `RECIPIENT_EMAIL` | `skltrucksllc@gmail.com` |

4. **Redeploy** after saving

## Tech Stack

- Next.js 15 (App Router)
- Supabase (PostgreSQL + Auth + Image Storage)
- TypeScript + Tailwind CSS 4
