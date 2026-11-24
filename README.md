# FlowSense AI

A complete traffic operations demonstration: interactive maps for eleven Karnataka cities, congestion forecasts, signal timing simulation, incident and alert workflows, historical reports, CSV imports/exports, settings, and role-based access.

## Start locally

Requires Node.js 22.13+ (Node.js 24 recommended) and npm. Python 3.10+ is needed only to retrain the included model.

```powershell
cd 'C:\Users\offic\Desktop\AI Proj\flowsense-ai'
npm ci
npm run build
npm run seed
npm start
```

Open http://127.0.0.1:8787. Choose Administrator, Operator, or Viewer. The local demonstration password is `FlowSense-demo-2026`. To change it, copy `.env.example` to `.env` and set `DEMO_PASSWORD` before starting. This default is deliberately restricted to the loopback-only local demo server. Hosted deployments disable this password login entirely.

For live frontend editing:

```powershell
npm run dev
```

Open http://127.0.0.1:5173. The API runs on port 8787. Run only one local server at a time. Ctrl+C stops the servers. Local data persists in `.local/flowsense.sqlite`, which is ignored by Git. Restarting the server invalidates local login sessions but preserves records.

The first administrator visit seeds seven days of synthetic observations for 72 demonstration road segments across eleven cities (12 in Bengaluru and 6 in each added city). Existing Bengaluru records and monitoring exclusions are preserved when the new cities are seeded. Each subsequent refresh adds the current 15-minute observation interval when missing, saves forecasts, and generates configured alerts. Browser polling runs while the application is open; this is not an unattended sensor ingestion service. Historical gaps after a long offline period are not backfilled automatically.

## Stack and deployment adaptations

The UI uses React, TypeScript, Tailwind CSS, Recharts, Leaflet, and attributed OpenStreetMap tiles. The model is trained using Python and scikit-learn.

The Sites hosting environment runs Cloudflare Workers rather than Python processes. Therefore, the deployed API uses a TypeScript Worker in place of FastAPI, and durable D1 SQL storage in place of PostgreSQL. Local execution uses Node's SQLite API through a small D1-compatible adapter. These are explicit stack substitutions; this repository does not contain a FastAPI or PostgreSQL deployment.

Model trees are exported from scikit-learn to JSON and evaluated by the Worker. The deployed application is a full server-backed application; operational records are not stored in localStorage. Client assets are embedded in the Worker bundle to keep the deployment self-contained.

`.openai/hosting.json` preserves the private Site identity and declares the `DB` binding. The Sites workflow applies tracked Drizzle migrations before deploying. Hosted login uses platform-provided ChatGPT identity headers; the first visitor becomes administrator atomically, subsequent visitors default to viewer. Existing administrators can change other users' roles. Keep the Site private unless a deliberate sharing change is wanted. The application trusts identity headers only behind the Sites authentication boundary; do not expose its API as an unprotected public origin.

## Model training and verification

```powershell
python -m pip install -r ml/requirements.txt
npm run train
npm run test:ml
npm test
npm run build
```

`npm run train` exports the shared road catalogue to `ml/roads.json`, then `ml/train.py` generates 28 days of deterministic synthetic traffic for all eleven cities. It creates current, lagged, rolling, time-of-day, day-of-week, road, volume, and occupancy features. There is one random forest per 15-, 30-, and 60-minute forecast horizon. Whole timestamps are split chronologically into approximately 70% training, 15% validation, and 15% test sets. A 60-minute purge prevents training/validation targets from overlapping the next partition. Validation MAE selects the random forest or persistence baseline. Test MAE and RMSE for both are calculated separately for each city and appear in the UI for the selected city. A fixed random seed makes training reproducible.

The included artifact is `server/model.json` (`synthetic-karnataka-rf-v2`). The runtime uses persistence when fewer than four consecutive 15-minute observations are present. Forecast timestamps are anchored to the last observation, so old observations produce old forecasts and a stale-data notice. Predictions do not include invented confidence intervals. Feature importance describes association, not causation. The Python and JavaScript generators share the same formulas, units, timezone, and feature order.

The very predictable synthetic dataset makes this an implementation demonstration, not evidence of real-world forecast accuracy. A real deployment requires representative sensor data, data quality monitoring, retraining, out-of-sample real-world validation, and a scheduled provider ingestion adapter. Uploaded observations are used for predictions but do not automatically retrain the included synthetic model.

## Database and records

`db/schema.ts` defines users, observations, predictions, incidents, alerts, signal plans, settings, uploads, and audit records. Road-segment geometry and intersection identity are versioned in `shared/traffic.ts`. An intersection is represented by its road segment's demonstration junction and associated signal plan.

Schema changes:

```powershell
npm run db:generate
```

Inspect and commit the new migration plus Drizzle metadata. The local server applies unapplied migrations at startup. Never edit an applied migration. Seeding happens through the authenticated `/api/seed` endpoint, not through a schema migration. The operation is idempotent for existing observations.

Observation uniqueness is `(timestamp, road_segment_id)`. Upload validation is completed before insertion; duplicates are skipped, never silently replaced. Invalid files are rejected with row-specific errors. Large imports are committed in batches of 80, so an infrastructure failure partway through can leave earlier valid batches saved; retrying is safe because of duplicate handling. No external file storage is required: validated records and upload metadata are persisted, while original CSV files are not retained.

## Access

| Role | Permissions |
| --- | --- |
| Viewer | Read dashboard, predictions, incidents, reports, settings; export CSV |
| Operator | Viewer access plus advance simulator, import observations, report/update incidents, acknowledge/resolve alerts, save signal simulations |
| Administrator | All operator actions plus settings, monitored roads, initial seeding, and user-role changes |

Permissions are enforced on every API mutation. Local sessions use signed HttpOnly, SameSite cookies with an eight-hour expiry. Writes reject foreign origins and non-JSON request bodies. Database statements bind all user-supplied values. CSV exports escape spreadsheet formula prefixes. Incident changes, imports, settings, role changes, and simulations create audit records.

## API

See [API.md](API.md) for request and response details. Sources for the platform conventions: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/) and [chronological model validation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html).

## Data, map, and simulation limits

- All seeded traffic and the example roadworks incident are demonstrations. Approximate road polylines are schematic; road lengths and speed limits are illustrative rather than surveyed values.
- Seven days of seed data are available initially. Dashboard comparisons require the full previous window; the seven-day view may have no previous seven-day data.
- Vehicle count is a sum of segment observations, not a deduplicated citywide count of unique vehicles. Average speed is an unweighted mean; travel time is the mean length/speed estimate for selected segments.
- Map tiles require network access to `tile.openstreetmap.org`. Failed tiles show a notice while interactive traffic overlays and the road list remain available. OpenStreetMap attribution remains visible. No paid API keys are needed. Application fonts are local system fonts.
- Signal simulation estimates a single approach with one lane, 1,800 veh/h saturation flow and uniform arrivals. It reports an approximate queue, delay, and volume/capacity ratio relative to a 35-second green in a 90-second cycle. It does not model opposing delay, pedestrian clearance, spillback, turning movements or coordinated junctions. No physical traffic control connection exists.
- Congestion labels compare predicted/observed speed to the configured percentage of the illustrative road limit. Default heavy: below 40%; moderate: below 65%.
- Timestamps are stored in UTC, displayed in the chosen timezone. Custom report date boundaries are explicitly UTC. Data exports honor date and road filters.
- The simulator advances on an operator/admin's refresh. Viewer sessions never mutate observations or alerts. Alerts are in-app only. There is no SMS/email delivery or background job scheduler.
- Current state retrieval is bounded to 25,000 observations per selected city from the preceding seven days. The scaffold is suitable for a small demonstration network; larger sensor networks need pagination, retention jobs and query/index tuning.

## Source layout

```text
src/                React views, charts, map and responsive styles
server/             authenticated API, model inference, trained artifact
shared/             road catalogue, observation generator, congestion rules
db/                 relational schema
drizzle/            generated migrations and metadata
ml/                 reproducible scikit-learn training and integrity tests
scripts/            local SQL adapter/server and Worker build
tests/              API and end-to-end data workflow tests
```


## Karnataka city search

The searchable selector supports Bengaluru, Mysuru, Mangaluru, Hubballi–Dharwad, Belagavi, Kalaburagi, Davanagere, Shivamogga, Tumakuru, Ballari, and Vijayapura. It accepts partial names, case-insensitive older names (Bangalore, Mysore, Mangalore, Hubli, Belgaum, Gulbarga, Davangere, Shimoga, Tumkur, Bellary, Bijapur), and included Kannada aliases. Arrow keys and Enter select results; Escape closes the list. The last selected city is remembered on the current device.

Switching cities updates the sidebar, map position, road list, metrics, forecasts, incident/alert lists, signal plans, upload history, monitored locations, and CSV exports. Area, road, and form selections reset to prevent records from a previous city being reused. The API enforces city membership for records, imports, simulations, and exports. Thresholds, timezone, refresh preferences, and user permissions remain workspace-wide.

The ten added cities use six clearly labelled schematic demonstration corridors each; these are not named, surveyed real-world road geometries. City centers are approximate map view anchors. Traffic scale and rush timing are synthetic scenario parameters, not measured comparisons between cities. The retrained model and per-city evaluation cover synthetic data only.

The additive migration adds city metadata to uploads and audit records; existing nullable records are treated as Bengaluru records. Original Bengaluru road IDs are unchanged. Existing observations, incidents, plans, and monitoring exclusions are preserved. Seeding only fills road segments that have no observations and never overwrites imported data.

Naming references: [Karnataka Tourism destinations](https://karnatakatourism.org/en/destinations/) and [district administration, Kalaburagi](https://kalaburagi.nic.in/en/about-district/). Base maps and attribution remain OpenStreetMap.
