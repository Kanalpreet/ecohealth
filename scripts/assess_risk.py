"""Demo: Climate Health Risk Engine for three family members and four scenarios.

Run from the repository root:

    backend\\.venv\\Scripts\\python.exe scripts\\assess_risk.py

Scenarios: Delhi live data, saved SYNTHETIC "Delhi winter smog" and "Delhi summer
heatwave" snapshots, and Leh live data (assessed as a trip: travel context,
altitude applied). Live scenarios use the cached environment service (needs
backend/.env + Supabase). The scores are deterministic Python (no LLM).

Disclaimer: risk-awareness prototype, not a diagnostic tool.
"""

import asyncio
import sys
from datetime import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.logging import configure_logging  # noqa: E402
from app.services.environment.models import EnvironmentSnapshot  # noqa: E402
from app.services.risk import (  # noqa: E402
    ENGINE_VERSION,
    MemberProfile,
    RoutineInput,
    assess,
    check_routines,
    hourly_assessment,
    safe_windows,
)

TIMEZONE = "Asia/Kolkata"
FIXTURES = BACKEND_DIR / "tests" / "fixtures" / "risk"
EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
SCHOOL_DAYS = ["mon", "tue", "wed", "thu", "fri"]

FAMILY = [
    (MemberProfile(name="Priya", age=34, conditions=["asthma"]),
     [RoutineInput(activity="morning walk", start_time=time(6, 30), days_of_week=EVERY_DAY)]),
    (MemberProfile(name="Aarav", age=6, conditions=[]),
     [RoutineInput(activity="cycle to school", start_time=time(7, 45), days_of_week=SCHOOL_DAYS)]),
    (MemberProfile(name="Papa", age=68, conditions=["heart_disease"]),
     [RoutineInput(activity="temple visit", start_time=time(7, 0), days_of_week=EVERY_DAY)]),
]
FACTOR_LABELS = {
    "air_quality": "air quality", "heat": "heat", "cold": "cold",
    "temperature_swing": "temperature swing", "uv": "UV", "altitude": "altitude",
}


def load_fixture(name: str) -> EnvironmentSnapshot:
    return EnvironmentSnapshot.model_validate_json((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


async def live_snapshots() -> dict[str, EnvironmentSnapshot | str]:
    """Delhi and Leh via the cached service; an error message instead if unavailable."""
    try:
        from app.core.database import get_engine
        from app.services.environment import CachedEnvironmentService

        try:
            async with CachedEnvironmentService.create() as service:
                delhi, leh = await asyncio.gather(service.get_snapshot(28.61, 77.21), service.get_snapshot(34.15, 77.58))
        finally:
            get_engine().dispose()
        return {"delhi": delhi, "leh": leh}
    except Exception as exc:  # noqa: BLE001 - demo: show why live data is missing
        message = f"live data unavailable ({type(exc).__name__})"
        return {"delhi": message, "leh": message}


def describe_inputs(snapshot: EnvironmentSnapshot, context: str) -> str:
    a = assess(MemberProfile(age=30), snapshot, context=context)  # neutral profile, just to show inputs
    i = a.inputs
    parts = []
    if "aqi" in i:
        parts.append(f"AQI {i['aqi']:.0f} {i['aqi_category']} (PM2.5 {i['pm2_5']} ug/m3, {i['aqi_basis']})")
    if "temperature_c" in i:
        parts.append(f"{i['temperature_c']} C, RH {i['relative_humidity_pct']}%, heat metric {i['heat_metric_c']} C")
    if "uv_index" in i:
        parts.append(f"UV {i['uv_index']}")
    if "elevation_m" in i:
        parts.append(f"elevation {i['elevation_m']:.0f} m")
    return "; ".join(parts)


def print_member(member: MemberProfile, routines: list[RoutineInput], snapshot: EnvironmentSnapshot, context: str) -> None:
    result = assess(member, snapshot, context=context)
    tops = ", ".join(f"{FACTOR_LABELS[f]} {result.contributions[f]:.0f}%" for f in result.top_factors) or "none"
    conditions = ", ".join(member.conditions) or "no conditions"
    print(f"  {member.name} ({member.age}, {conditions}): {result.score}/100 {result.level.upper()}  <- {tops}")
    if result.missing_factors:
        print(f"      missing: {', '.join(f'{m.factor} ({m.reason})' for m in result.missing_factors)}")

    hourly = hourly_assessment(member, snapshot, hours=24, context=context)
    windows = safe_windows(hourly, TIMEZONE)
    if windows:
        text = ", ".join(f"{w.start_local:%a %H:%M}-{w.end_local:%H:%M} ({w.worst_level})" for w in windows)
        print(f"      safe windows next 24 h (IST, below High): {text}")
    else:
        print("      safe windows next 24 h (IST, below High): none")

    for check in check_routines(member, routines, snapshot, TIMEZONE, context=context):
        when = f"{check.next_occurrence_local:%a %d %b %H:%M} IST" if check.next_occurrence_local else "n/a"
        if check.status == "unsafe":
            why = ", ".join(FACTOR_LABELS[f] for f in check.top_factors)
            print(f"      UNSAFE routine: {check.activity} {when}: {check.score}/100 {check.level} ({why})")
        elif check.status == "ok":
            print(f"      routine ok: {check.activity} {when}: {check.score}/100 {check.level}")
        else:
            print(f"      routine {check.activity} {when}: no forecast")


async def main() -> None:
    live = await live_snapshots()
    scenarios = [
        ("Delhi - live data", live["delhi"], "home"),
        ("Delhi - winter smog (saved, synthetic)", load_fixture("delhi_winter_smog"), "home"),
        ("Delhi - summer heatwave (saved, synthetic)", load_fixture("delhi_summer_heatwave"), "home"),
        ("Leh - live data (trip: travel context, altitude applied)", live["leh"], "travel"),
    ]
    print(f"EcoHealth Climate Health Risk Engine v{ENGINE_VERSION} (deterministic, no LLM)")
    print("Risk-awareness prototype, not a diagnostic tool. Thresholds pending medical review.\n")
    for title, snapshot, context in scenarios:
        print("=" * 78)
        print(title)
        if isinstance(snapshot, str):
            print(f"  skipped: {snapshot}\n")
            continue
        print(f"  {snapshot.generated_at:%d %b %Y %H:%M} UTC | {describe_inputs(snapshot, context)}")
        print("-" * 78)
        for member, routines in FAMILY:
            print_member(member, routines, snapshot, context)
        print()


if __name__ == "__main__":
    sys.stdout.reconfigure(errors="replace")
    configure_logging()
    asyncio.run(main())
