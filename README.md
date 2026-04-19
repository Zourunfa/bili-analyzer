This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Production Stability (Transcribe)

To avoid server freezes when processing large videos, configure these env vars in production:

```bash
# Max simultaneous transcribe jobs on one server process
TRANSCRIBE_MAX_CONCURRENCY=1

# Reject overly large audio files early (MB)
TRANSCRIBE_MAX_AUDIO_MB=60

# Download timeout for Bilibili audio stream (ms)
AUDIO_DOWNLOAD_TIMEOUT_MS=300000

# Transcribe process timeout (ms)
TRANSCRIBE_TIMEOUT_MS=900000
```

### Why these matter

- `TRANSCRIBE_MAX_CONCURRENCY=1` prevents CPU/RAM spikes from multiple concurrent transcribe tasks.
- `TRANSCRIBE_MAX_AUDIO_MB` blocks huge files before exhausting memory/disk.
- Download and transcribe timeout split improves failure diagnosis and avoids hanging worker processes.

### Reverse proxy recommendations (Nginx)

For SSE endpoints (for example `/api/transcribe` and batch analyze stream), increase read timeout:

```nginx
location /api/transcribe {
  proxy_read_timeout 900s;
  proxy_send_timeout 900s;
  proxy_buffering off;
}
```

### PM2 recommendations

Set a memory restart threshold and keep one app instance for this workload:

```bash
pm2 start npm --name subtitle -- start --max-memory-restart 700M
```
