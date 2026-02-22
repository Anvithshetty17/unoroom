# Deployment Guide — Render (Backend) + Vercel (Frontend)

---

## Overview

| Part | Platform | URL (example) |
|------|----------|---------------|
| Backend (Node + Socket.io) | [Render](https://render.com) | `https://uno-server.onrender.com` |
| Frontend (React) | [Vercel](https://vercel.com) | `https://uno-game.vercel.app` |

---

## Step 1 — Push to GitHub

Both Render and Vercel deploy from a Git repository.

```bash
# From the project root  (uno+final/uno)
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/uno-online.git
git push -u origin main
```

> Make sure `.env` is in `.gitignore` — never commit secrets.

---

## Step 2 — Fix the client build script for Linux

Vercel and Render run Linux. The current `package.json` in `client/` uses Windows `set` syntax.

Open **`client/package.json`** and replace the `scripts` block:

```json
"scripts": {
  "start": "react-scripts start",
  "build": "react-scripts build",
  "test":  "react-scripts test",
  "eject": "react-scripts eject"
},
```

Set the env var via a `.env` file instead. Create **`client/.env`**:

```
NODE_OPTIONS=--openssl-legacy-provider
```

---

## Step 3 — Fix CORS on the server for the Vercel domain

Open **`server.js`** and replace:

```js
app.use(cors())
```

with:

```js
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST']
}))
```

Also update Socket.io to allow the Vercel origin:

```js
const io = socketio(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
})
```

---

## Step 4 — Deploy Backend on Render

1. Go to [https://render.com](https://render.com) → **New → Web Service**
2. Connect your GitHub repo
3. Configure:

| Field | Value |
|-------|-------|
| **Name** | `uno-server` (or anything) |
| **Root Directory** | *(leave blank — root of repo)* |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Instance Type** | Free |

4. Under **Environment Variables**, add:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `CLIENT_URL` | `https://YOUR-APP.vercel.app` (fill after Vercel deploy) |
| `PORT` | *(leave blank — Render sets this automatically)* |

5. Click **Create Web Service** — wait for the build to finish.
6. Copy the Render URL, e.g. `https://uno-server.onrender.com`

> **Note:** Free Render services spin down after 15 min of inactivity. The first connection after sleep takes ~30 s. Upgrade to a paid instance to avoid this.

---

## Step 5 — Point the React client at the Render backend

Open **`client/src/components/Game.js`** and find:

```js
const ENDPOINT = ...
```

Change it to use an environment variable:

```js
const ENDPOINT = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000'
```

Then create / update **`client/.env`**:

```
NODE_OPTIONS=--openssl-legacy-provider
REACT_APP_SERVER_URL=https://uno-server.onrender.com
```

Commit and push:

```bash
git add .
git commit -m "point client at render backend"
git push
```

---

## Step 6 — Deploy Frontend on Vercel

1. Go to [https://vercel.com](https://vercel.com) → **Add New → Project**
2. Import the same GitHub repo
3. Configure:

| Field | Value |
|-------|-------|
| **Framework Preset** | `Create React App` |
| **Root Directory** | `client` |
| **Build Command** | `npm run build` |
| **Output Directory** | `build` |

4. Under **Environment Variables**, add:

| Key | Value |
|-----|-------|
| `NODE_OPTIONS` | `--openssl-legacy-provider` |
| `REACT_APP_SERVER_URL` | `https://uno-server.onrender.com` |

5. Click **Deploy** — Vercel builds and gives you a URL like `https://uno-game.vercel.app`

---

## Step 7 — Update CORS with the Vercel URL

Go back to **Render → Environment Variables** and set:

```
CLIENT_URL = https://uno-game.vercel.app
```

Click **Save** — Render will restart the service automatically.

---

## Step 8 — MongoDB Atlas Network Access

Make sure Atlas allows connections from anywhere (Render uses dynamic IPs):

1. Atlas Dashboard → **Network Access → Add IP Address**
2. Click **Allow Access from Anywhere** (`0.0.0.0/0`)
3. Confirm

---

## Final Checklist

- [ ] `client/package.json` scripts use no `set` command
- [ ] `client/.env` has `NODE_OPTIONS` + `REACT_APP_SERVER_URL`
- [ ] `server.js` CORS allows `CLIENT_URL`
- [ ] Socket.io on server also has CORS config
- [ ] Render env vars: `MONGODB_URI`, `CLIENT_URL`
- [ ] Vercel root directory set to `client`
- [ ] Atlas allows `0.0.0.0/0`
- [ ] `.env` is in `.gitignore`

---

## Redeployment

| Change | Action |
|--------|--------|
| Backend code | Push to `main` → Render auto-redeploys |
| Frontend code | Push to `main` → Vercel auto-redeploys |
| Env var change | Update in Render/Vercel dashboard → manual redeploy |
