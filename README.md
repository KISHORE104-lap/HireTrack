# HireTrack — Job Application Tracker

Track every job application from wishlist to offer: add, edit, delete, change status, search, filter, see your pipeline and upcoming interviews, export to CSV.

**Tech:** HTML, CSS, JavaScript (frontend) · Node.js serverless functions (backend REST API) · Upstash Redis (database) · Vercel (hosting) · GitHub (source code)

## Folder structure

```
hiretrack/
├── public/              FRONTEND (what the browser downloads)
│   ├── index.html       page structure
│   ├── styles.css       design
│   └── app.js           logic: calls the API, draws the page, handles clicks
├── api/                 BACKEND (runs on Vercel's servers)
│   ├── applications.js  REST API: GET, POST, PUT, DELETE  →  /api/applications
│   └── health.js        status check                      →  /api/health
├── lib/                 shared backend code
│   ├── db.js            database layer (Redis, or memory if no database)
│   └── validate.js      checks incoming data
├── dev-server.js        runs the app on your computer
├── vercel.json          tells Vercel the frontend is in public/
└── package.json         project info (no libraries needed)
```

## Run on your computer

Install Node.js 18 or newer from nodejs.org, then:

```
cd hiretrack
node dev-server.js
```

Open http://localhost:3000. Without a database, data is kept in memory until you stop the server.

## Deploy to Vercel

1. **GitHub:** create a new public repository called `hiretrack`, click *uploading an existing file*, drag in everything inside this folder, and commit.
2. **Vercel:** log in with GitHub → **Add New… → Project** → import `hiretrack` → **Deploy** (no settings to change).
3. **Database (free, 1 minute):** in your Vercel project open **Storage → Create Database → Upstash for Redis** (Marketplace) → free plan → **Connect** to the project.
4. **Redeploy:** **Deployments → ⋯ on the latest → Redeploy**. The header now says **Saved to database**.

Without step 3 the app still works online, but data is temporary and can disappear.

## API reference

| Method | URL | Body | Response |
|---|---|---|---|
| GET | `/api/applications` | — | `200 { applications: [...], storage }` |
| POST | `/api/applications` | `{ company, role, ... }` | `201 { application }` or `400 { errors }` |
| PUT | `/api/applications?id=ID` | fields to change | `200 { application }`, `404` if not found |
| DELETE | `/api/applications?id=ID` | — | `200 { deleted: ID }`, `404` if not found |
| GET | `/api/health` | — | `200 { status: "ok", storage }` |

Application fields: `company` (required), `role` (required), `location`, `status` (Wishlist / Applied / Interview / Offer / Rejected), `appliedOn`, `interviewOn` (YYYY-MM-DD), `link` (http/https), `notes`.
