# FinAlly frontend

Next.js + TypeScript + Tailwind, built as a static export and served by FastAPI.

```bash
npm install          # set NODE_USE_SYSTEM_CA=1 if npm hits TLS unknown-issuer errors
npm run build        # writes out/ ; copy to backend/static (STATIC_DIR)
npm test             # Vitest + React Testing Library
npm run lint
```

All API calls are same-origin (`/api/*`), so run it through the backend on port 8000.
The required `data-testid`s are listed in `planning/CONTRACT.md` section 8.
