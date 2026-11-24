# FlowSense API

All routes are same-origin under `/api`. Operational requests accept `?city=<city-id>`, defaulting to `bengaluru`; unknown cities are rejected. Road-bound reads/writes, histories, and exports are scoped to that city. Settings and roles remain workspace-wide. JSON responses use `Cache-Control: no-store`. Errors return `{ "error": "message" }` with HTTP 400, 401, 403, 404, 413, 415 or 500. Requests that mutate state require `Content-Type: application/json`. The UI uses credentials from its same-origin session.

## Authentication

- `GET /health`: public liveness response `{ok:true}`.
- `GET /auth-mode`: reports whether local-demo sign-in is enabled.
- `GET /auth`: current authenticated user `{id,email,role}` and local-mode flag. Hosted identity comes from Sites, not user JSON.
- `POST /login`: local server only. Body `{role:"admin"|"operator"|"viewer",password:string}`. Returns a signed HttpOnly cookie. Disabled on hosted deployments.
- `POST /logout`: clears the local session. Hosted UI uses the platform `/signout-with-chatgpt` navigation.

## Read and export

- `GET /cities?search=<name-or-alias>`: authenticated city catalogue search, including case-insensitive partial names and older names.
- `GET /state?city=mysuru&since=<ISO timestamp>`: authenticated operational state: roads, observations (up to 25,000 per city), incidents, latest 100 alerts, plans, recent uploads and audit history, settings, forecasts, model metrics, server timestamp. Defaults to the last seven days. Only administrators receive the user list.
- `GET /export?type=observations|predictions&start=<ISO>&end=<ISO>&road=<road ID|all>&roads=<comma-separated IDs>`: filtered CSV. `road=all` honors the `roads` subset, otherwise the one requested road is exported. Predictions include horizon, speed, issue time, and model version. Observation exports use the import-compatible columns plus source.

## Simulator and initialization

- `POST /seed {}`: administrator only. Insert seven days of deterministic synthetic observations for newly added road segments and one demonstration incident per newly seeded city. Existing records and monitoring exclusions are preserved. Initialize/upgrade settings to the current catalogue. Idempotent when all road segments already have observations.
- `POST /tick {}`: administrator/operator. Insert current 15-minute synthetic interval when missing, persist forecasts for 15/30/60 minutes, and create enabled 30-minute heavy-congestion alerts. Existing unresolved road alerts are not duplicated. Returns generated counts.

## Incidents and alerts

- `POST /incidents`: administrator/operator. Body `{road_segment_id,type,severity,description}`. Types: Collision, Roadworks, Breakdown, Event, Other. Severities: Low, Moderate, High. Description length 5–1,000. Returns `{id}` and HTTP 201.
- `PATCH /incidents/:id`: administrator/operator. Body `{status,description?}`. Status: Open, Acknowledged, Resolved. Appends audit history.
- `PATCH /alerts/:id`: administrator/operator. Body `{status}` with the same status values. Appends audit history.

## Settings and access

- `PUT /settings`: administrator. Complete body `{heavy,moderate,refresh,timezone,notifications,monitored}`. `5 <= heavy < moderate <= 95`; refresh 15/30/60/120 seconds; valid IANA timezone; boolean notifications; nonempty list of road IDs.
- `PATCH /users`: administrator. Body `{id,role}`. Role admin/operator/viewer. Administrators cannot change their own role. Users must already exist through hosted sign-in.

## Signal simulation

- `POST /signals`: administrator/operator. Body `{road_segment_id,cycle,green}`. Integer cycle 60–180 seconds; green at least 10 and no greater than cycle minus 20. Returns and persists `{road_segment_id,cycle,green,before:{capacity,delay,queue,saturation},after:{...}}`. It never sends commands to a physical signal controller.

## CSV imports

- `POST /uploads`: administrator/operator. Body `{filename,csv}`. Maximum 1.5 MB CSV text, 5,000 records; JSON request maximum 2 MB. Returns `{added,duplicates}`.

Required fields:

| Field | Validation |
| --- | --- |
| timestamp | ISO timestamp with `Z` or explicit offset; no more than one minute into the future |
| road_segment_id | Known ID from `shared/traffic.ts` |
| vehicle_count | Integer 0–100,000 |
| average_speed_kmh | Number 0–160 |
| occupancy_percent | Number 0–100 |
| interval_minutes | Integer 1–60 |

Example:

```csv
timestamp,road_segment_id,vehicle_count,average_speed_kmh,occupancy_percent,interval_minutes
2026-11-23T10:00:00Z,mg-road,185,32.4,46.0,15
```

Imports are marked `uploaded`; the client cannot forge the source field. Duplicate timestamps/road IDs are skipped. All CSV rows are validated before any insert. Existing data can be exported and reimported without creating duplicates.


## City parameters and CSV scope

Supported IDs: `bengaluru`, `mysuru`, `mangaluru`, `hubballi-dharwad`, `belagavi`, `kalaburagi`, `davanagere`, `shivamogga`, `tumakuru`, `ballari`, `vijayapura`.

Example reads: `/api/state?city=mysuru` and `/api/export?city=mysuru&type=observations`. New roads have city-prefixed IDs such as `mysuru-central` and `mangaluru-north`. Bengaluru's original IDs such as `mg-road` are preserved.

Pass the selected city on `tick`, incident creation/update, alert updates, signal simulation, uploads, and exports. A road outside the selected city is rejected. CSV files must contain observations for one selected city only; validation rejects mixed-city files before insertion. Exports include `city_id` and `city_name`, and their download filenames include the city ID. `/api/state` also returns the selected `city` and the full `cities` catalogue. Model metrics are for the selected city's synthetic test subset.


## Public browser access

With PUBLIC_ACCESS=true, missing platform identity resolves to an anonymous viewer. PUBLIC_ORIGIN enables credential-free CORS for the GitHub Pages origin. OPTIONS supports Content-Type preflight. Anonymous state responses omit users, uploads and audit records. Management mutations remain forbidden; POST /api/tick allows a bounded deterministic simulator refresh. Public Pages requests are always anonymous, even if identity headers are present. Local-demo authentication is unchanged.
