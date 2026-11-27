# Climate Health Risk Engine (v1.0.0)

Code: `backend/app/services/risk/` (all numbers in `risk_config.py`).
Deterministic Python only: **no LLM is involved in calculating any score.**

> **Disclaimer.** EcoHealth is a **risk-awareness prototype**, not a diagnostic
> or medical tool. It does not replace advice from a qualified healthcare
> professional. All thresholds, weights and modifiers below **will be reviewed by
> a doctor before the user study.** Values marked *design choice* are not taken
> from a published source and are the most likely to change.

## 1. What the engine does (plain language)

For one family member and one place, the engine answers: *"How much should this
person watch out for the weather and air right now, and when is it safer?"*

1. It reads the **environment** (an `EnvironmentSnapshot`: weather, air quality,
   elevation, with data sources and staleness).
2. It turns each environmental **factor** into a **sub-score from 0 (no concern)
   to 1 (maximum concern)** using published guidance (AQI breakpoints, heat
   index, cold wave criteria, UV index, altitude bands).
3. It **personalises** the result with the member's health conditions, age and
   sensitivity.
4. It returns a **score from 0 to 100**, a **level**, and **why**: each factor's
   share of the score.

The same inputs always give the same output (pure functions, no randomness, no
network calls). Every assessment carries `engine_version`.

## 2. Inputs

| Input | Source | Used for |
|---|---|---|
| Member profile: `age`, `conditions`, `sensitivity` (0.5–2.0) | `FamilyMember` | personalisation |
| `EnvironmentSnapshot` | `CachedEnvironmentService` | factor sub-scores, data sources, staleness |
| `at_time` (UTC) | caller | which hour of the forecast to use |
| `context` | caller (`home` default, `travel`) | altitude is applied only in `travel` |
| User time zone (IANA) | `User.timezone` | safe windows and routines in local time |

Point-in-time values: if `at_time` is within the hour of the snapshot's current
observation, the **current** conditions are used; otherwise the **hourly forecast
point** for the hour containing `at_time`.

## 3. Factors and sub-scores

Every sub-score is a **piecewise-linear interpolation** between the breakpoints
below (values below the first breakpoint get its sub-score, values above the last
get its sub-score). A factor whose input is missing is **excluded and reported**,
never treated as 0.

### 3.1 Air quality: CPCB National AQI (India)

Source: Central Pollution Control Board, *National Air Quality Index* (2014),
Ministry of Environment, Forest and Climate Change, India.

Sub-index for each pollutant by linear interpolation; **AQI = the higher of the
PM2.5 and PM10 sub-indices** (CPCB reports the worst sub-index; we use only the
two particulate pollutants in v1).

| AQI category | AQI | PM2.5 (µg/m³) | PM10 (µg/m³) |
|---|---|---|---|
| Good | 0–50 | 0–30 | 0–50 |
| Satisfactory | 51–100 | 31–60 | 51–100 |
| Moderately polluted | 101–200 | 61–90 | 101–250 |
| Poor | 201–300 | 91–120 | 251–350 |
| Very poor | 301–400 | 121–250 | 351–430 |
| Severe | 401–500 | 251–380* | 431–510* |

\*CPCB publishes "250+" / "430+" for Severe; the upper bounds 380 and 510 used
for interpolation are those of the CPCB AQI calculator. Above them the AQI is
capped at 500. Integer gaps in the official table (30 → 31) are closed by using
each band's upper bound as the next band's lower bound.

**24-hour average vs hourly values.** The official CPCB AQI for PM uses the
**24-hour average** (and needs at least 16 hourly values).
- `assess()` (the "current" score) follows this: it averages the hourly model
  values (Open-Meteo/CAMS) of the **24 hours ending at `at_time`** if at least 16
  are available (basis `24h_mean`). Otherwise it uses the single hourly value,
  labelled `hourly_indicative`.
- `hourly_assessment()` (forecast and safe windows) converts **each hour's**
  concentration with the same breakpoints. This is an **indicative hourly AQI**,
  not the official AQI: it reacts faster and is more variable, which suits short
  activities like a walk.
- Ground-station readings (OpenAQ) are reported for transparency but are not
  used in the v1 score, so current and forecast scores come from one consistent
  source.

AQI → sub-score (*design choice*, aligned to CPCB's health statements per category:
"minimal impact" … "affects healthy people and seriously impacts those with
existing diseases"):

| AQI | 0 | 50 | 100 | 200 | 300 | 400 | 500 |
|---|---|---|---|---|---|---|---|
| sub-score | 0 | 0.05 | 0.15 | 0.40 | 0.60 | 0.80 | 1.00 |

### 3.2 Heat: heat index

Heat index (HI) from air temperature and relative humidity with the **NOAA
Rothfusz regression**, including NOAA's adjustments.
Source: NOAA National Weather Service, *The Heat Index Equation*
(Weather Prediction Center).

1. Simple formula first: `HI = 0.5 × (T + 61 + (T − 68) × 1.2 + RH × 0.094)` (°F).
   This is the **low-temperature version**: if the average of this HI and T is
   **below 80 °F**, it is the result.
2. Otherwise the full Rothfusz regression, with the low-humidity adjustment
   (RH < 13 %, 80–112 °F) and high-humidity adjustment (RH > 85 %, 80–87 °F).

The heat metric is **max(HI, air temperature)**: in very dry heat the regression
can give an HI below the air temperature, and IMD heat-wave criteria are defined
on air temperature, so we take the more conservative value.

Bands combine NOAA heat-index categories with IMD/NDMA heat-wave thresholds.
Sources: NOAA NWS heat index categories (Caution 80–90 °F, Extreme caution
90–103 °F, Danger 103–124 °F, Extreme danger ≥ 125 °F); India Meteorological
Department heat-wave criteria (plains: max ≥ 40 °C; heat wave ≥ 45 °C and severe
heat wave ≥ 47 °C regardless of normal); NDMA *Guidelines for Preparation of
Action Plan: Prevention and Management of Heat Wave* (2019).

| Heat metric (°C) | 27 | 32 | 39 | 45 | 52 |
|---|---|---|---|---|---|
| meaning | NOAA Caution starts | Extreme caution | Danger (≈ IMD 40 °C plains criterion) | IMD heat wave (actual ≥ 45 °C) | NOAA Extreme danger |
| sub-score | 0 | 0.20 | 0.50 | 0.80 | 1.00 |

### 3.3 Cold: temperature bands

Air temperature at the assessed hour (the night minimum appears in the hourly
forecast and safe windows). IMD defines its criteria on the daily **minimum**;
because we apply the anchor temperatures to every hour's air temperature, the
sub-scores are kept moderate (a 5 °C afternoon is not a cold wave).
Source: India Meteorological Department cold-wave criteria (plains: cold wave
considered when the minimum is ≤ 10 °C; cold wave when actual minimum ≤ 4 °C;
severe cold wave ≤ 2 °C; hill stations: cold wave when minimum ≤ 0 °C);
NDMA *National Guidelines for Preparation of Action Plan: Prevention and
Management of Cold Wave* (2021).

| Air temperature (°C) | 15 | 10 | 4 | 2 | 0 | −10 | −20 |
|---|---|---|---|---|---|---|---|
| meaning | no cold concern (*design choice*) | IMD: cold wave may be considered | IMD cold wave | IMD severe cold wave | IMD hills cold wave | *design choice* | *design choice* (frostbite/hypothermia risk) |
| sub-score | 0 | 0.15 | 0.40 | 0.50 | 0.60 | 0.85 | 1.00 |

### 3.4 Temperature swing (24 h)

Difference between the highest and lowest hourly air temperature in the **24 hours
starting at the assessed hour**. Large day–night swings stress the heart and lungs.
Source: Cheng J. et al., *Impacts of diurnal temperature range on human health:
a systematic review*, Int J Biometeorol (2014); Lim Y.-H. et al., *Diurnal
temperature range and short-term mortality*, Environ Health Perspect (2012).
The band values are a *design choice* informed by these studies.

| Swing (°C) | 8 | 10 | 15 | 20 |
|---|---|---|---|---|
| sub-score | 0 | 0.20 | 0.50 | 1.00 |

### 3.5 UV: WHO UV index

Source: WHO, WMO, UNEP, ICNIRP, *Global Solar UV Index: A Practical Guide* (2002):
Low 0–2, Moderate 3–5, High 6–7, Very high 8–10, Extreme 11+.

| UV index | 3 | 6 | 8 | 11 |
|---|---|---|---|---|
| meaning | Moderate starts | High | Very high | Extreme |
| sub-score | 0.20 | 0.50 | 0.75 | 1.00 |
(UV below 3 → 0.)

### 3.6 Altitude (Travel Mode)

Applied only when `context="travel"` (people living at altitude are acclimatised;
Travel Mode itself is built later). Sources: Luks A.M. et al., *Wilderness Medical
Society Clinical Practice Guidelines for the Prevention and Treatment of Acute
Altitude Illness: 2019 Update*; CDC Yellow Book, *High-Altitude Travel and
Altitude Illness* (risk starts above ~2,500 m; very high altitude 3,500–5,500 m;
extreme above 5,500 m).

| Elevation (m) | 2500 | 3500 | 5500 |
|---|---|---|---|
| sub-score | 0 (risk starts above) | 0.60 | 1.00 |

## 4. Personalisation and the score

```
score = 100 × min(1, k × a × Σ_f (w_f × s_f))
```

- `s_f`: factor sub-score (0–1), only for factors with data.
- `w_f = base_weight_f × condition_multiplier_f`.
- `a`: age modifier. `k`: the member's sensitivity (0.5–2.0, default 1.0).

### Base weights (healthy adult, *design choice*)

| Factor | air | heat | cold | swing | uv | altitude |
|---|---|---|---|---|---|---|
| base weight | 0.65 | 0.75 | 0.55 | 0.15 | 0.25 | 0.50 |

**Calibration.** A single factor at its maximum gives a healthy adult between 15
(swing) and 75 (heat), e.g. CPCB "Severe" air alone → 65 (Very High). This leaves
headroom so that condition and age modifiers still change the result: in the v1.0.0
demo a healthy adult in severe smog scores ~70, a 6-year-old ~80 and a 68-year-old
heart patient 100. Several factors add up (capped at 100). A first calibration with
larger weights (0.8 for air/heat/altitude) saturated almost every scenario at 100
for everyone and was rejected.

### Condition multipliers (*design choice*, pathways from the cited guidelines)

| Condition | air | heat | cold | swing | uv | altitude | Source of the pathway |
|---|---|---|---|---|---|---|---|
| none | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | |
| asthma | 1.5 | 1.1 | 1.3 | 1.2 | 1.0 | 1.2 | GINA 2024 (air pollution and cold air as triggers) |
| copd | 1.6 | 1.2 | 1.4 | 1.2 | 1.0 | 1.5 | GOLD 2024 (pollution, temperature extremes, hypoxia) |
| heart_disease | 1.4 | 1.4 | 1.4 | 1.2 | 1.0 | 1.4 | AHA scientific statement on PM (Brook et al., 2010); WHO heat and health |
| diabetes | 1.1 | 1.3 | 1.1 | 1.0 | 1.0 | 1.0 | CDC / WHO heat and health (impaired thermoregulation) |
| pregnancy | 1.2 | 1.3 | 1.0 | 1.0 | 1.0 | 1.3 | WHO heat and health; NDMA heat-wave guidelines (vulnerable groups) |

**Multiple conditions**: for each factor the **largest** multiplier among the
member's conditions is used (no stacking). Asthma + diabetes → air 1.5, heat 1.3.
This keeps the effect of one pathway from being double-counted, and adding a
condition can never lower a score. Unknown condition codes are ignored and
reported in the assessment.

### Age modifier `a` (*design choice*; children and older adults are vulnerable
groups in WHO heat-health guidance, NDMA heat-wave guidelines and CPCB AQI health
statements)

| Age | 0–4 | 5–11 | 12–64 | 65–74 | 75+ |
|---|---|---|---|---|---|
| `a` | 1.30 | 1.15 | 1.00 | 1.20 | 1.35 |

## 5. Levels

| Level | Score |
|---|---|
| Low | 0–19 |
| Moderate | 20–39 |
| High | 40–59 |
| Very High | 60–79 |
| Dangerous | 80–100 |

## 6. "Why this score?": factor contributions

Each factor's **share** = `w_f × s_f / Σ (w × s)` × 100 %. Shares of the factors
used always sum to **100 %** (when the score is above 0; all shares are 0 when no
factor is of concern). `top_factors` lists up to three factors with the largest
shares. `a` and `k` scale all factors equally, so they do not change the shares.

The assessment also returns the **input values used** (e.g. 24-h PM2.5, AQI and
its basis, heat index, temperature, UV, elevation), **missing factors** with the
reason, the **data sources** per provider (`live` / `cache` / `stale` and
`fetched_at`), any **stale providers**, and `engine_version`.

## 7. Forecast, safe windows and routines

- `hourly_assessment(member, snapshot, hours=48)`: a score per forecast hour,
  starting with the next full hour (indicative hourly AQI, see 3.1).
- `safe_windows(hourly, timezone, below="High", hours=24)`: contiguous time ranges
  whose level is **below** the threshold (default: Low or Moderate), with start and
  end in the user's time zone.
- `check_routines(member, routines, snapshot, user_timezone)`: for each routine
  (`start_time` is local clock time, `days_of_week`), the **next occurrence** within
  the forecast is converted from the user's time zone to UTC, scored with the
  forecast hour containing its start, and flagged **unsafe** if its level is at or
  above the threshold (default High). Routines beyond the forecast are reported as
  `no_forecast`. Routines have no duration yet, so only the start hour is scored.

## 8. Versioning

`ENGINE_VERSION` in `risk_config.py` follows semantic versioning: any change to a
threshold, weight or formula changes the version, and every assessment records the
version that produced it.

## 9. Testing and demo

- Unit tests (`backend/tests/unit/risk/`, no network):
  - `test_factors.py`: values at **every** AQI, heat, cold, swing, UV, altitude and
    level breakpoint; NOAA heat-index reference values (NWS chart, within 0.6 °F);
    modifiers and the score formula.
  - `test_engine.py`: inputs used, 24-h vs hourly AQI basis, missing data (excluded
    and reported), travel vs home context, sources/staleness, determinism.
  - `test_windows_routines.py`: hourly forecast, safe windows and routines in
    `Asia/Kolkata` (and a UK daylight-saving change).
  - `test_scenarios.py`: Priya (34, asthma), Aarav (6), Papa (68, heart disease) and
    a healthy adult × four scenarios (recorded Delhi and Leh data, synthetic winter
    smog and summer heatwave in `backend/tests/fixtures/risk/`).
  - `test_properties.py` (hypothesis): worse air never lowers the score; adding a
    condition never lowers it; contributions sum to 100 %; score always 0–100.
- Synthetic scenarios are rebuilt with `scripts/build_risk_scenarios.py`
  (deterministic).
- Demo: `backend\.venv\Scripts\python.exe scripts\assess_risk.py`

## 10. Known limitations (v1.0.0)

- Every weight, multiplier, age modifier and sub-score curve marked *design choice*
  needs medical review; the calibration was checked only against the demo scenarios.
- AQI uses PM2.5 and PM10 only (CPCB also covers NO2, O3, SO2, CO, NH3, Pb).
- The CPCB "Severe" upper bounds (380 / 510 µg/m³) come from the CPCB calculator,
  not the published table (which says "250+" / "430+").
- Routines have no duration: only the start hour is scored.
- Altitude does not consider ascent rate or time at altitude (the main AMS risk
  factors); it is a coarse awareness signal for Travel Mode.
- Ground-station (OpenAQ) readings are not used in the score yet.
