# Changes: dashboard overhaul, form builder redesign, feature layers, standalone apps

## 1. Dashboard visual overhaul

- **Dark theme** (`.dashboard-dark` in styles.css) — scoped to the Dashboard app/tab, not the whole portal. When GeoCore Dashboard owns the whole page (standalone app or `/apps/dashboard`) it fills the viewport; when a dashboard is viewed inside a project's Dashboards tab (still light-themed portal around it), it renders as a self-contained dark canvas card instead.
- **KPI redesign** — icon badge in a colored ring + big number, matching the reference screenshot's "Total Building Capacity" / "Current Population" style.
- **New `gauge` widget type** — percentage-of-target arc (e.g. occupancy rate). Target can be a fixed number or computed as a sum of another field.
- **New `list` widget type** — scrollable record list with a title field and combined subtitle fields, matching the reference screenshot's facility list.
- **Live embedded map widget** — an actual Leaflet map rendering the widget's features now, not a "see the Map tab" placeholder.

**What I didn't fake:** your reference screenshot has State/LGA filter dropdowns in the header that cross-filter every widget at once. That's real interactive infrastructure (a shared filter-state layer every widget's query would need to respect) that doesn't exist yet. I left the header honest instead of adding dropdowns that do nothing.

## 2. Form builder redesign

Survey123/KoBo-style question cards: a colored icon badge per field type, the label as the primary large text (not buried in a generic input), required marked with a `*`, type/key/required tucked into a secondary toolbar row, and an "⚙ Rules" toggle instead of a plain "Rules" text button. Sections now have a numbered circular badge (page 1, 2, 3…). Drag-and-drop (from the previous round) is unchanged functionally, just sits inside the new visual hierarchy.

## 3. Feature layers across projects

This is the real fix for "select the layer, even from a different project."

- **`GET /organisations/{id}/feature-layers`** — every asset type across every project in the organisation, with project name and record count. This is what a dashboard widget's data-source picker now queries, instead of being limited to the current dashboard's own project.
- **Org-boundary validation** — `_validate_widget_asset_type()` in `routes/dashboards.py` checks that any layer a widget references belongs to a project in the *same organisation* as the dashboard. Cross-org references are rejected (403) — the tenant boundary from blueprint section 7 still holds, "feature layer" sharing is scoped to the org, not global.
- **`get_dashboard_data`** now fetches records by the actual asset_type_id(s) referenced across all of a dashboard's widgets, not by the dashboard's own `project_id` — so a widget pointed at a layer from a different project in the same org actually gets that layer's data.

I treated **every existing asset type as an immediately available feature layer** — there's no separate "publish this layer" step. If you want an explicit draft/publish state for layers (distinct from the submission-link "deploy" action), that's a real next feature, not something I quietly skipped — flagging it rather than half-building it.

## 4. Standalone applications (`vite.config.js`, `survey.html`, `dashboard.html`)

GeoCore Survey and GeoCore Dashboard are now genuinely separate Vite build entries — `npm run build` produces `dist/index.html` (portal), `dist/survey.html`, and `dist/dashboard.html`, each with its own JS/CSS bundle. Each is independently deployable.

**What's shared vs. separated:**
- Each bundle has its own, narrower route tree (`src/mainSurvey.jsx`, `src/mainDashboard.jsx`) — Survey's bundle doesn't include the dashboard builder or org settings pages; Dashboard's doesn't include the form builder.
- Both still mount the shared `ProjectDetail` component at the *same URL shape* as the portal (`/workspace/organisations/:orgId/projects/:projectId/...`) deliberately, so `SurveyApp`/`DashboardApp`'s existing "open full editor" links work unchanged in every bundle without per-app path configuration.

**The trade-off I'm being upfront about:** because all three bundles share that URL shape, the backend's catch-all SPA handler (`backend/app/main.py`) can't tell *which* bundle's `index.html`/`survey.html`/`dashboard.html` to serve on a fresh page load or hard refresh at a path like `/workspace/organisations/.../asset-types` — it always falls back to the portal's `index.html`. In practice this means:
- Navigating *within* a bundle (clicking links) works correctly — React Router handles it client-side, no round-trip to the backend.
- Landing directly on `survey.html` or `dashboard.html` (typing the URL, or a bookmark) works correctly — the backend serves that literal file.
- A hard refresh while deep inside a project page loaded via `survey.html` will re-serve the *portal's* `index.html` instead, dropping you back into the portal bundle at that same URL.

Properly solving this needs distinct URL prefixes per app (e.g. `/survey/workspace/...` vs `/dashboard/workspace/...`) or subdomain-based routing, with the backend's catch-all updated to pick the right built HTML by prefix. That's a real, scoped follow-up — I didn't attempt it this round because it changes the URL contract for every deep link and I couldn't test the result end-to-end without a running deployment.

**`VITE_PORTAL_URL`** (`src/config.js`) — set this at build time if Survey or Dashboard is deployed to a different origin than the portal, so their "back to portal" links resolve correctly (plain `<a>` tags, not client-side `<Link>`, once set — see `PortalLink` in `ProjectDetail.jsx`). The App Launcher's cross-app tiles (`components/AppHeader.jsx`) still assume same-origin deployment and weren't updated for the cross-origin case — another explicit follow-up rather than a silent gap.
