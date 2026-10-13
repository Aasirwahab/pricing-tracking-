# DealDrop - Smart Product Price Tracker
### Watch here - https://youtu.be/HakXg-hFZ_c

Track product prices across e-commerce sites and get alerts on price drops. Built with Next.js, Firecrawl, Neon, and Clerk.

## 🎯 Features

- 🔍 **Track Any Product** - Works with Amazon, Zara, Walmart, and more
- 📊 **Price History Charts** - Interactive graphs showing price trends over time
- 🔐 **Google Authentication** - Secure sign-in powered by Clerk
- 🔄 **Automated Daily Checks** - Vercel Cron checks prices automatically
- 📧 **Email Alerts** - Get notified when prices drop via Resend

## 🛠️ Tech Stack

- **Next.js 16** - React framework with App Router
- **Firecrawl** - Web data extraction API
  - Handles JavaScript rendering
  - Rotating proxies & anti-bot bypass
  - Structured data extraction with AI
  - Works across different e-commerce sites
- **Neon** - Serverless PostgreSQL
  - Free tier is not paused after a week of inactivity
  - Scales to zero when idle, wakes on the next query
  - Accessed with `@neondatabase/serverless`
- **Clerk** - Authentication (Google sign-in, sessions, user management)
- **Vercel Cron** - Scheduled daily price checks
- **Resend** - Transactional emails
- **shadcn/ui** - UI component library
- **Recharts** - Interactive charts
- **Tailwind CSS** - Styling
- **pnpm** - Package manager

## 📋 Prerequisites

Before you begin, ensure you have:

- Node.js 20+ installed
- [pnpm](https://pnpm.io/installation) installed (`npm install -g pnpm`)
- A [Neon](https://neon.tech) account
- A [Clerk](https://clerk.com) account
- A [Firecrawl](https://firecrawl.dev) account
- A [Resend](https://resend.com) account
- A [Vercel](https://vercel.com) account (for deployment and cron)

## 🚀 Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/Aasirwahab/pricing-tracking-.git
cd pricing-tracking-
pnpm install
```

### 2. Neon Setup

1. Create a new project at [console.neon.tech](https://console.neon.tech)
2. Open the **SQL Editor** and run [`neon/schema.sql`](neon/schema.sql)
3. Click **Connect** and copy the **pooled** connection string. This is your `DATABASE_URL`

The schema creates two tables:

- `products` - one row per tracked URL per user (`user_id` is the Clerk user ID)
- `price_history` - one row each time a product's price changes

> There is no Row Level Security. Every query in `app/actions.js` filters by the signed-in Clerk `userId`, so users only ever see their own products.

### 3. Clerk Setup

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com)
2. Under **User & Authentication** → **Social connections**, enable **Google**
3. Go to **API Keys** and copy the **Publishable key** and **Secret key**

### 4. Firecrawl Setup

1. Sign up at [firecrawl.dev](https://firecrawl.dev)
2. Go to dashboard and get your API key

### 5. Resend Setup

1. Sign up at [resend.com](https://resend.com)
2. Get your API key from the dashboard
3. (Optional) Add and verify your domain for custom email addresses

### 6. Environment Variables

Create `.env.local` in the root directory:

```env
# Neon
DATABASE_URL=postgresql://user:password@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Firecrawl
FIRECRAWL_API_KEY=your_firecrawl_api_key

# Resend
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=onboarding@resend.dev

# Cron Job Security (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
CRON_SECRET=your_generated_cron_secret

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Generate CRON_SECRET:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 7. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## 📦 Deployment

### Deploy to Vercel

1. **Import the repository**

   Connect your GitHub repository to Vercel, or deploy with the CLI:

   ```bash
   pnpm dlx vercel --prod
   ```

   Vercel detects `pnpm-lock.yaml` and uses pnpm automatically.

2. **Add Environment Variables in Vercel**

   Go to your project settings and add all variables from `.env.local`:

   - `DATABASE_URL`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `FIRECRAWL_API_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `CRON_SECRET`
   - `NEXT_PUBLIC_APP_URL` (set to your Vercel URL)

3. **Cron is automatic**

   [`vercel.json`](vercel.json) registers the daily job. Vercel calls
   `GET /api/cron/check-prices` and automatically sends
   `Authorization: Bearer $CRON_SECRET`, so no database function or extra setup is needed.

4. **Clerk production instance**

   When you go live, create a Clerk production instance and swap the Clerk keys in Vercel.
   Google sign-in in production needs your own Google OAuth credentials (see the Clerk dashboard).

## 🔍 How It Works

### User Flow

1. **User adds product** - Paste any e-commerce URL on the homepage
2. **Firecrawl scrapes** - Instantly extracts product name, price, currency, and image
3. **Data stored** - Product saved to Neon, scoped to the Clerk user
4. **View tracking** - See current price and interactive price history chart

### Automated Price Checking

1. **Vercel Cron** - Runs daily at 9 AM UTC (`vercel.json`)
2. **Hits the API endpoint** - `GET /api/cron/check-prices`, authenticated with `CRON_SECRET`
3. **Firecrawl scrapes all products** - Updates prices for all tracked products
4. **Updates database** - Saves new prices and adds to history if changed
5. **Sends email alerts** - Looks up the user's email in Clerk and notifies them via Resend when the price drops

### Why Firecrawl?

Firecrawl solves the hard problems of web scraping:

- ✅ **JavaScript Rendering** - Handles dynamic content loaded via JS
- ✅ **Anti-bot Bypass** - Built-in mechanisms to avoid detection
- ✅ **Rotating Proxies** - Prevents IP blocking
- ✅ **AI-Powered Extraction** - Uses prompts to extract structured data
- ✅ **Multi-site Support** - Same code works across different e-commerce platforms
- ✅ **Fast & Reliable** - Built for production use

No need to maintain brittle, site-specific scrapers!

## 📁 Project Structure

```
dealdrop/
├── app/
│   ├── page.js                         # Landing page with product input
│   ├── layout.js                       # Root layout + ClerkProvider
│   ├── actions.js                      # Server actions for DB operations
│   └── api/
│       └── cron/
│           └── check-prices/
│               └── route.js            # Cron endpoint for price checks
├── components/
│   ├── ui/                             # shadcn/ui components
│   ├── AddProductForm.js               # Product URL input (opens Clerk sign-in)
│   ├── ProductCard.js                  # Product display with chart toggle
│   ├── PriceChart.js                   # Recharts price history
│   └── AuthButton.js                   # Clerk sign in / sign out button
├── lib/
│   ├── db.js                           # Neon serverless client
│   ├── firecrawl.js                    # Firecrawl API integration
│   ├── email.js                        # Resend email templates
│   └── utils.js                        # Utility functions
├── neon/
│   └── schema.sql                      # Database tables & indexes
├── proxy.js                            # Clerk middleware (Next.js 16 proxy)
├── vercel.json                         # Vercel Cron schedule
└── .env.local                          # Environment variables
```

## 🧪 Testing

### Test the cron endpoint with cURL

```bash
curl https://your-app.vercel.app/api/cron/check-prices \
  -H "Authorization: Bearer your_cron_secret"
```

### Inspect data in Neon

```sql
SELECT * FROM products ORDER BY updated_at DESC LIMIT 10;
SELECT * FROM price_history ORDER BY checked_at DESC LIMIT 10;
```

## 🎨 Customization

### Change Cron Schedule

Edit the cron expression in `vercel.json`:

```
0 9 * * *       Daily at 9 AM UTC
0 9,21 * * *    Daily at 9 AM and 9 PM (needs a Vercel Pro plan)
0 9 * * 1       Every Monday at 9 AM
```

> Vercel Hobby only allows cron jobs that run once per day.

### Email Template

Customize the email template in `lib/email.js` - modify HTML, styling, or content.

### Add More Product Data

Update the Firecrawl prompt in `lib/firecrawl.js` to extract additional fields:

```javascript
prompt: "Extract product name, price, currency, image URL, brand, rating, and availability";
```

## 🐛 Troubleshooting

### Products not found in cron job

- Make sure `DATABASE_URL` is set in Vercel
- The cron job reads every user's products (it is not scoped to a signed-in user)

### Sign-in does not work

- Check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
- Make sure Google is enabled under Social connections in the Clerk dashboard

### Firecrawl extraction fails

- Some sites may be difficult to scrape
- Check Firecrawl dashboard for error logs
- Try adjusting the extraction prompt

### Email alerts not sending

- Verify `RESEND_API_KEY` is correct
- Check Resend dashboard for delivery logs
- Ensure sender email is verified (for custom domains)

### Cron job not running

- Check **Settings → Cron Jobs** in your Vercel project
- Make sure `CRON_SECRET` is set (Vercel only sends the Authorization header when it exists)
- Cron jobs only run on production deployments

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

Originally built with ❤️ by RoadsideCoder using Next.js, Firecrawl, and Supabase. Migrated to Neon, Clerk, and pnpm.
