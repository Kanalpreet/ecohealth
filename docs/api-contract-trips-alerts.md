# API contract: Trips and Alerts

Status: DRAFT – needs backend agreement. Frontend builds against this; update this file if
anything changes.

All times are ISO 8601 in UTC; the frontend converts them to the user's timezone.
All endpoints require a logged-in user and only return that user's own data.

## Trips

- `GET /trips` – list: id, name, start_date, end_date, stops (place, elevation_m), member_ids
- `POST /trips` – body:
  - name
  - trip_type: work | holiday | trek | pilgrimage | beach
  - start_date, end_date
  - member_ids[]
  - stops[]: place, lat, lon, arrive_date, leave_date
- `GET /trips/{id}` – the trip
- `PATCH /trips/{id}`, `DELETE /trips/{id}`
- `GET /trips/{id}/plan` – the Trip Health Plan:
  - per traveller: overall level and score
  - per stop: elevation_m, altitude gain, level, key risks
  - acclimatisation notes
  - packing checklist items
  - warnings (e.g. doctor clearance)
  - nearest hospitals: name, distance_km, lat, lon, phone (only if known)
  - data freshness and disclaimer

## Alerts

- `GET /alerts?type=air|weather|family|travel&cursor=` – items: id, created_at, type, level,
  title, body, member_ids; plus next_cursor
- `POST /alerts/{id}/feedback` – body: useful (true | false)
- `GET /me/alert-settings`, `PATCH /me/alert-settings`:
  - daily_brief_email (bool)
  - browser_push (bool)
  - quiet_start ("22:00"), quiet_end ("06:00")