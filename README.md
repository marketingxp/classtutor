# Trello‑lite (No Dates)

A minimal, polished Kanban board with:
- Columns & cards
- Drag & drop (dnd-kit)
- Search, labels, checklists
- **No timestamps or activity feed** anywhere
- Preloaded with your board data (`public/board.json`).

## Local dev

```bash
npm i
npm run dev
```

## Publish (zero config)

### Option A — Netlify (drag & drop)
1. `npm run build`
2. Drag the generated `dist/` folder into https://app.netlify.com/drop

### Option B — Vercel
1. Push this folder to GitHub.
2. Import the repo on https://vercel.com and deploy.

### Option C — GitHub Pages
1. `npm run build`
2. Serve the `dist/` directory on any static host (e.g., Pages).

## Seed data

On the first load, the app tries to read `/board.json`. If found and valid, it seeds localStorage. After that, edits persist locally.
