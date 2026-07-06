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
3. Add Supabase environment variables (see above)
4. Deploy

### Connect Custom Domain

1. Vercel → **Domains** → add `skltrucks.com` and `www.skltrucks.com`
2. Update DNS at your registrar with the records Vercel provides

## Legacy: Sync from WordPress

If you still update the old WordPress site temporarily:

```bash
npm run sync-inventory
```

This updates the static fallback file. Once Supabase is connected, the live site reads from the database instead.

## Form Submissions

All forms (contact, financing, sell my truck) email **skltrucksllc@gmail.com**.

1. Sign up at [resend.com](https://resend.com) (free tier)
2. Add `RESEND_API_KEY` to `.env.local` and Vercel environment variables
3. `CONTACT_EMAIL_TO` defaults to `skltrucksllc@gmail.com` — no change needed

Until `RESEND_API_KEY` is set, forms still submit successfully but are only logged server-side.

## Tech Stack

- Next.js 15 (App Router)
- Supabase (PostgreSQL + Auth + Image Storage)
- TypeScript + Tailwind CSS 4
