# Deployment Guide — Netlify (Frontend) + Render (Backend)

This app is split into two services:

| Service  | Platform | What it does |
|----------|----------|--------------|
| Frontend | Netlify  | React/Vite SPA — static files |
| Backend  | Render   | Express + tRPC + Socket.io API |

---

## Prerequisites

- A **MySQL database** (PlanetScale, Aiven, Railway, or any MySQL 8+ host)
- An **AWS S3 bucket** (for storing uploaded PSD/Excel files and generated images)
- A **Manus OAuth app** (App ID from the Manus developer portal)
- A **GitHub / GitLab repo** with this code pushed to it

---

## Step 1 — Deploy the Backend on Render

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Configure the service:

   | Setting | Value |
   |---------|-------|
   | **Name** | `psd-image-generator-api` (or anything you like) |
   | **Region** | Oregon (or nearest to your users) |
   | **Branch** | `main` |
   | **Build Command** | `npm install -g pnpm && pnpm install --no-frozen-lockfile && pnpm run build:server` |
   | **Start Command** | `node dist/index.js` |
   | **Plan** | Starter ($7/mo) — needed for persistent processes (WebSockets) |

4. Add **Environment Variables** (use `.env.example` as reference):

   ```
   NODE_ENV=production
   PORT=10000
   DATABASE_URL=mysql://...
   JWT_SECRET=<random 64-char string>
   VITE_APP_ID=<your manus app id>
   OAUTH_SERVER_URL=https://oauth.manus.im
   OWNER_OPEN_ID=<your open id>
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=<your bucket>
   FRONTEND_URL=                   ← leave blank for now, fill in after Step 2
   ```

5. Click **Create Web Service** and wait for the first deploy to finish.
6. Copy your Render URL: `https://psdimagegenerator.onrender.com`

> **Database migration**: After the first deploy, run  
> `pnpm db:push` locally (with `DATABASE_URL` set) or connect via Render Shell.

---

## Step 2 — Deploy the Frontend on Netlify

1. Go to [netlify.com](https://netlify.com) → **Add new site → Import from Git**
2. Connect your GitHub repo
3. Configure the build:

   | Setting | Value |
   |---------|-------|
   | **Build command** | `pnpm run build:client` |
   | **Publish directory** | `dist/public` |
   | **Node version** | 20 |

4. Add **Environment Variables** in Netlify → Site Settings → Environment Variables:

   ```
   VITE_API_URL=https://psdimagegenerator.onrender.com
   VITE_APP_ID=<your manus app id>
   VITE_OAUTH_PORTAL_URL=https://oauth.manus.im
   ```

5. Click **Deploy site** and wait for the build.
6. Copy your Netlify URL: `https://your-app.netlify.app`

---

## Step 3 — Connect Frontend ↔ Backend

### 3a. Update the `netlify.toml` redirect target

Open `netlify.toml` and replace `YOUR_RENDER_APP_NAME` with your actual Render service name:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://psdimagegenerator.onrender.com/api/:splat"

[[redirects]]
  from = "/socket.io/*"
  to = "https://psdimagegenerator.onrender.com/socket.io/:splat"
```

Commit and push — Netlify will redeploy automatically.

### 3b. Set `FRONTEND_URL` on Render

In Render → your service → **Environment** → add:

```
FRONTEND_URL=https://your-app.netlify.app
```

This enables CORS so the backend accepts requests from your Netlify domain.  
Click **Save** — Render will restart the service.

### 3c. Update your Manus OAuth app

In the Manus developer portal, add your Netlify URL as an allowed redirect URI:

```
https://your-app.netlify.app/api/oauth/callback
```

---

## Step 4 — Verify

1. Open `https://your-app.netlify.app`
2. Click **Sign In** — OAuth should redirect back to Netlify
3. Upload a PSD template and an Excel file
4. Go to **Batch** tab → Create job → Start processing
5. Watch the real-time WebSocket progress bar fill up

---

## Architecture Overview

```
Browser (Netlify CDN)
      │
      ├── /api/*  ──proxy──►  Render (Express + tRPC)
      │                             │
      ├── /socket.io/*  ──ws──►     │  Socket.io (WebSocket)
      │                             │
      └── Static assets (HTML/JS/CSS served by Netlify)
                                    │
                              MySQL Database
                              AWS S3 (files)
```

---

## Local Development (unchanged)

```bash
cp .env.example .env   # fill in your local values
pnpm install
pnpm dev               # starts Vite + Express together on :3000
```

---

## Environment Variables Reference

See `.env.example` for the full list with descriptions.

| Variable | Where | Required |
|----------|-------|----------|
| `DATABASE_URL` | Render | ✅ |
| `JWT_SECRET` | Render | ✅ |
| `VITE_APP_ID` | Both | ✅ |
| `OAUTH_SERVER_URL` | Render | ✅ |
| `AWS_*` / `S3_BUCKET_NAME` | Render | ✅ |
| `FRONTEND_URL` | Render | ✅ (after Netlify deploy) |
| `VITE_API_URL` | Netlify | ✅ |
| `VITE_OAUTH_PORTAL_URL` | Netlify | ✅ |
| `PORT` | Render | optional (default 10000) |
| `OWNER_OPEN_ID` | Render | optional |
