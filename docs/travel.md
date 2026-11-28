# Travel Mode: Trips (backend go T1)

Trips let a user plan a journey for some of their family members (the
**travellers**) through one or more **stops** (places with dates). This go adds the
tables and the CRUD API. The Trip Health Plan (`GET /trips/{id}/plan`) is go T2 and
returns **501 Not Implemented** for now.

Contract: [api-contract-trips-alerts.md](api-contract-trips-alerts.md). The frontend
already calls these endpoints and switches from Preview mode to real data on its own
once they answer (it treats 404/501 on `GET /trips` as "not implemented yet").

Code: `app/models/trip.py`, `app/schemas/trip.py`, `app/services/trips.py`,
`app/api/trips.py`.

## Data model

```
users 1 ──── * trips 1 ──── * trip_stops          (ON DELETE CASCADE)
                 *
                 │ trip_members (trip_id, member_id)
                 *
users 1 ──── * family_members                     (ON DELETE CASCADE)
```

- **trips**: one row per trip, owned by a user (`user_id`).
- **trip_stops**: the places, in travel order (`position` 1, 2, 3, …). Each stop has a
  place name, coordinates (rounded to 2 decimals, ~1 km), elevation, and arrive/leave
  dates.
- **trip_members**: which of the user's family members travel. A member can be on
  many trips; a trip has one or more members.

### Deletion

| Deleted | Effect |
|---|---|
| a trip | its stops and traveller links are deleted |
| a family member | they are removed from every trip (`trip_members` rows); the trip itself stays |
| a user | all their trips (and stops and links) are deleted, like their members |

A trip whose last traveller is deleted keeps existing with no travellers; the user can
add travellers again with `PATCH`. (The "at least 1 traveller" rule applies when
travellers are sent in `POST`/`PATCH`.)

## Validation rules

Checked by Pydantic (422 with the field and a message; submitted values are never
echoed) and by the database (CHECK/UNIQUE constraints as a safety net).

| Rule | Value |
|---|---|
| name | trimmed, 1–100 characters |
| trip_type | `work`, `holiday`, `trek`, `pilgrimage`, `beach` |
| dates | `start_date <= end_date`; trip length at most **60 days** (inclusive) |
| travellers | `member_ids`: 1–10, duplicates removed, **must be the current user's members** (otherwise 422) |
| stops | **1–10**, in travel order |
| stop place | trimmed, 1–120 characters |
| stop coordinates | lat −90…90, lon −180…180, rounded half-up to 2 decimals |
| stop dates | `arrive_date <= leave_date`; inside the trip dates; each stop arrives on or after the previous stop's leave date (same day allowed, e.g. a travel day) |
| trips per user | at most **20** (409 when exceeded) |

`PATCH /trips/{id}` accepts any subset of the fields. Omitted fields stay unchanged;
`stops` and `member_ids`, when sent, **replace** the existing lists. The trip and stop
date rules are checked on the merged result (e.g. shortening the trip dates without
sending stops fails if the existing stops no longer fit).

## Ownership

Same pattern as members (docs/auth.md §4): every query includes
`trips.user_id = :current_user`, so another user's trip returns **404**, exactly like a
non-existent id. `member_ids` are checked against the current user's members, so a
trip can never reference someone else's family.

## Elevation

When stops are created or replaced, `elevation_m` is filled from the existing cached
elevation provider (Open-Meteo, cached per 0.01° cell for 30 days; see
docs/caching.md): one cache read and one cache write for all stops. If the provider or
cache is unavailable (or slow: 8 s limit), `elevation_m` stays **null** and the request
still succeeds. Stops are already rounded to 2 decimals, which matches the 0.01°
elevation grid exactly.

## API

| Method | Path | Result |
|---|---|---|
| GET | `/trips` | the user's trips, newest first (by creation time): id, name, trip_type, start_date, end_date, member_ids, stops (position, place, elevation_m) |
| POST | `/trips` | 201, the full trip |
| GET | `/trips/{id}` | the full trip: id, name, trip_type, start/end dates, member_ids, stops (position, place, lat, lon, elevation_m, arrive/leave dates), created_at, updated_at |
| PATCH | `/trips/{id}` | the full trip |
| DELETE | `/trips/{id}` | 204 |
| GET | `/trips/{id}/plan` | 404 if not the user's trip, otherwise **501** (go T2) |

`member_ids` are returned in the order the members were created.
