# OpsCraft CRM v2

Kanban pipeline + dashboard + contact history. Built on React + Vite + Supabase.

---

## What's new in v2

- **Drag & drop** between pipeline stages
- **Contact history** — log every call/WhatsApp/meeting with timestamps
- **Dashboard** — pipeline value, conversion rate, temperature breakdown, source analysis, alerts
- **Search** — press `/` to search leads by name, company, phone
- **Today's reminders** — overdue and due-today actions shown at top
- **Lead temperature** — hot / warm / cold tags
- **Potential revenue** — track deal value, see pipeline totals
- **Source tracking** — where each lead came from
- **Pain point** field — what problem they need solved
- **Website** field
- **Active & Dead** — separate views, off the main board
- **CSV export** — download all leads
- **Keyboard shortcuts** — `/` to search, `Esc` to close

---

## Setup

### 1. Install
```bash
npm install
```

### 2. Supabase credentials
```bash
cp .env.example .env.local
```
Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### 3. Database

**Fresh install:** Run `schema.sql` in Supabase → SQL Editor.

**Migrating from v1:** Uncomment the ALTER TABLE statements at the bottom of `schema.sql` and run those instead. This adds new columns without losing your existing data.

### 4. Run
```bash
npm run dev
```

---

## File structure
```
src/
  App.jsx                    # Main app, state, data fetching
  supabase.js                # Supabase client
  stages.js                  # Stage, temperature, source configs
  utils.js                   # Date formatting, CSV export, helpers
  index.css                  # Full design system
  components/
    KanbanColumn.jsx         # Pipeline column with drag-drop
    ClientCard.jsx            # Lead card with temp badge, revenue
    AddClientModal.jsx        # Quick-add (name + phone minimum)
    DetailModal.jsx           # Full edit + contact history log
    SearchBar.jsx             # Spotlight-style search
    RemindersPanel.jsx        # Today's due/overdue bar
    Dashboard.jsx             # Metrics, charts, alerts
    ActiveDeadPanel.jsx       # Table view for active/archived
schema.sql                   # Supabase table definitions
```
