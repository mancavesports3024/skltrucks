# SKL Trucks LLC Website

Modern rebuild of [skltrucks.com](https://skltrucks.com/) built with **Next.js** and optimized for **Vercel** deployment.

## Features

- Homepage matching the original design (hero, marquee, about, inventory, services)
- Full inventory shop with category and manufacturer filters
- Individual product detail pages with photos and specs
- Contact, financing, and sell-my-truck forms
- **Admin panel** at `/admin` for your client to add, edit, and delete inventory

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

   Copy `.env.local.example` to `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```

   Add the same variables in **Vercel → Project Settings → Environment Variables**.

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
