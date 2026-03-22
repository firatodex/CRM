# OpsCraft CRM

Kanban-based client pipeline. Built on React + Vite + Supabase.

---

## Setup (one time)

### 1. Install dependencies
```bash
npm install
```

### 2. Add your Supabase credentials
```bash
cp .env.example .env.local
```
Open `.env.local` and fill in:
- `VITE_SUPABASE_URL` → Supabase Dashboard → Project Settings → API → Project URL
- `VITE_SUPABASE_ANON_KEY` → Supabase Dashboard → Project Settings → API → anon public key

### 3. Run the database schema
Go to Supabase → SQL Editor → paste the schema from `schema.sql` → Run.

### 4. Start the app
```bash
npm run dev
```
Open http://localhost:5173

---

## Deploy to Vercel
```bash
npm run build
```
Then connect the repo to Vercel. Add the two env vars in Vercel → Project Settings → Environment Variables.

---

## File structure
```
src/
  App.jsx              # Main app, data fetching, state
  supabase.js          # Supabase client
  stages.js            # Stage config (labels, colors)
  utils.js             # Date helpers
  index.css            # OpsCraft brand system styles
  components/
    KanbanColumn.jsx   # One pipeline column
    ClientCard.jsx     # Individual client card
    AddClientModal.jsx # Quick-add form
    DetailModal.jsx    # Full edit form
```
