# Holiday API configuration

The calendar calls the Korean Astronomy and Space Science Institute through the Cloudflare Worker. Keep the data.go.kr key server-side; never use a `VITE_` variable.

For local `wrangler dev`, create the ignored `.dev.vars` file in this directory:

```text
HOLIDAY_API_KEY=your_issued_general_key
```

For production, configure a Cloudflare Worker secret:

```bash
cd cloudflare-worker
npx wrangler secret put HOLIDAY_API_KEY
```

The root `.env.example` lists the variable name only. The browser caches each year/month for 24 hours and uses an existing cached copy if refresh fails.
