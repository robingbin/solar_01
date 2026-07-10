"""
Solar Credit Tracker - FastAPI backend.

Manages TNEB solar import/export meter readings and computes:
- daily export/import usage
- running totals
- current solar credit balance

All persisted data lives in MongoDB. IDs are UUID strings so the API is
safe to serialize to JSON without ObjectId acrobatics.
"""

from __future__ import annotations

import io
import json
import logging
import os
import random
import uuid
from datetime import date as date_cls
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

READINGS = db["readings"]
SETTINGS = db["settings"]
BILLING = db["billing_cycles"]

app = FastAPI(title="Solar Credit Tracker API", version="1.0.0")
api = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ReadingIn(BaseModel):
    """Payload the client sends when creating/updating a reading."""

    model_config = ConfigDict(extra="ignore")

    date: str  # YYYY-MM-DD
    current_export: float
    current_import: float
    notes: Optional[str] = ""
    # Optional solar inverter reading (cumulative kWh from inverter display)
    current_solar: Optional[float] = None
    # Optional bootstrap values used only when there is no prior reading.
    initial_export: Optional[float] = None
    initial_import: Optional[float] = None
    initial_solar: Optional[float] = None


class Reading(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    previous_export: float = 0.0
    current_export: float = 0.0
    export_unit: float = 0.0
    previous_import: float = 0.0
    current_import: float = 0.0
    import_unit: float = 0.0
    running_export: float = 0.0
    running_import: float = 0.0
    credit_unit: float = 0.0
    net_today: float = 0.0
    # Solar inverter tracking (all optional; 0.0 if user hasn't started logging solar)
    previous_solar: float = 0.0
    current_solar: float = 0.0
    solar_unit: float = 0.0
    running_solar: float = 0.0
    self_consumption: float = 0.0  # solar generated but consumed at home
    house_consumption: float = 0.0  # total home usage = self_consumption + import_unit
    has_solar: bool = False
    notes: str = ""
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class SettingsModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: "singleton")
    owner_name: str = "GeeBin A R"
    consumer_number: str = "1234567890"
    service_number: str = ""
    solar_capacity: str = "3.72 kW"
    meter_number: str = ""
    installation_date: str = "2024-03-15"
    address: str = ""
    phone: str = ""
    email: str = ""
    theme: str = "light"
    currency: str = "INR"
    measurement_unit: str = "kWh"
    tariff_rate: float = 8.0  # used for estimated savings
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _round(n: float) -> float:
    return round(float(n), 2)


def _strip(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc.pop("_id", None)
    return doc


async def _all_readings_sorted() -> List[Dict[str, Any]]:
    cursor = READINGS.find({}, {"_id": 0}).sort("date", 1)
    return await cursor.to_list(length=100000)


async def _recalculate_chain(
    initial_export: Optional[float] = None,
    initial_import: Optional[float] = None,
    initial_solar: Optional[float] = None,
) -> None:
    """Recompute every reading's derived fields based on date order.

    When ``initial_*`` are given they seed the very first reading (used for the
    first-ever entry). Otherwise the first row's stored ``previous_*`` values
    are trusted.

    Solar is opt-in: only rows where ``current_solar`` > 0 count toward
    generation. Once solar tracking starts, ``running_solar`` accumulates from
    that point onward.
    """

    readings = await _all_readings_sorted()
    if not readings:
        return

    running_export = 0.0
    running_import = 0.0
    running_solar = 0.0
    prev_export_meter: Optional[float] = None
    prev_import_meter: Optional[float] = None
    prev_solar_meter: Optional[float] = None

    now_iso = datetime.now(timezone.utc).isoformat()

    for idx, r in enumerate(readings):
        # ---- meter chain (export/import) ----
        if idx == 0:
            if initial_export is not None:
                r["previous_export"] = float(initial_export)
            if initial_import is not None:
                r["previous_import"] = float(initial_import)
        else:
            r["previous_export"] = prev_export_meter or 0.0
            r["previous_import"] = prev_import_meter or 0.0

        r["export_unit"] = _round(r["current_export"] - r["previous_export"])
        r["import_unit"] = _round(r["current_import"] - r["previous_import"])
        r["net_today"] = _round(r["export_unit"] - r["import_unit"])
        running_export += r["export_unit"]
        running_import += r["import_unit"]
        r["running_export"] = _round(running_export)
        r["running_import"] = _round(running_import)
        r["credit_unit"] = _round(running_export - running_import)

        # ---- solar chain (optional; per-row) ----
        current_solar = float(r.get("current_solar") or 0.0)
        has_solar_now = current_solar > 0.0

        if has_solar_now:
            if prev_solar_meter is None:
                # First solar reading in the chain - use provided initial or
                # stored previous_solar, else default to current so solar_unit=0.
                if idx == 0 and initial_solar is not None:
                    r["previous_solar"] = float(initial_solar)
                elif not r.get("previous_solar"):
                    r["previous_solar"] = current_solar
            else:
                r["previous_solar"] = prev_solar_meter

            r["current_solar"] = current_solar
            r["solar_unit"] = _round(current_solar - r["previous_solar"])
            if r["solar_unit"] < 0:
                r["solar_unit"] = 0.0  # guard against bad data
            running_solar += r["solar_unit"]
            r["running_solar"] = _round(running_solar)
            # Self consumption = generated but not exported (kWh used directly at home)
            self_c = max(0.0, r["solar_unit"] - r["export_unit"])
            r["self_consumption"] = _round(self_c)
            r["house_consumption"] = _round(self_c + r["import_unit"])
            r["has_solar"] = True
            prev_solar_meter = current_solar
        else:
            # No solar reading recorded for this row - keep continuity of totals
            r["previous_solar"] = _round(prev_solar_meter or 0.0)
            r["current_solar"] = _round(prev_solar_meter or 0.0)
            r["solar_unit"] = 0.0
            r["running_solar"] = _round(running_solar)
            r["self_consumption"] = 0.0
            # If no solar reading, house_consumption falls back to grid import only
            r["house_consumption"] = _round(r["import_unit"])
            r["has_solar"] = False

        r["previous_export"] = _round(r["previous_export"])
        r["previous_import"] = _round(r["previous_import"])
        r["current_export"] = _round(r["current_export"])
        r["current_import"] = _round(r["current_import"])
        r["updated_at"] = now_iso

        await READINGS.update_one({"id": r["id"]}, {"$set": r})

        prev_export_meter = r["current_export"]
        prev_import_meter = r["current_import"]


async def _get_settings_doc() -> Dict[str, Any]:
    doc = await SETTINGS.find_one({"id": "singleton"}, {"_id": 0})
    if not doc:
        defaults = SettingsModel().model_dump()
        await SETTINGS.insert_one(dict(defaults))
        return defaults
    return doc


# ---------------------------------------------------------------------------
# Settings endpoints
# ---------------------------------------------------------------------------


@api.get("/settings")
async def get_settings():
    return await _get_settings_doc()


@api.put("/settings")
async def update_settings(payload: Dict[str, Any]):
    current = await _get_settings_doc()
    payload.pop("_id", None)
    payload.pop("id", None)
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged = {**current, **payload}
    await SETTINGS.update_one({"id": "singleton"}, {"$set": merged}, upsert=True)
    return await _get_settings_doc()


# ---------------------------------------------------------------------------
# Readings CRUD
# ---------------------------------------------------------------------------


@api.get("/readings/latest")
async def latest_reading():
    doc = await READINGS.find_one({}, {"_id": 0}, sort=[("date", -1)])
    latest_solar = await READINGS.find_one(
        {"current_solar": {"$gt": 0}}, {"_id": 0}, sort=[("date", -1)]
    )
    return {"reading": doc, "latest_solar_reading": latest_solar}


@api.get("/readings")
async def list_readings(
    search: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    page: int = 1,
    limit: int = 20,
    sort: str = "date",
    order: str = "desc",
):
    query: Dict[str, Any] = {}
    if year and month:
        m = f"{month:02d}"
        query["date"] = {"$regex": f"^{year}-{m}-"}
    elif year:
        query["date"] = {"$regex": f"^{year}-"}
    elif month:
        m = f"{month:02d}"
        query["date"] = {"$regex": f"^\\d{{4}}-{m}-"}

    if search:
        s = search.strip()
        query["$or"] = [
            {"date": {"$regex": s, "$options": "i"}},
            {"notes": {"$regex": s, "$options": "i"}},
        ]

    total = await READINGS.count_documents(query)
    direction = -1 if order.lower() == "desc" else 1
    skip = max(0, (page - 1) * limit)
    cursor = READINGS.find(query, {"_id": 0}).sort(sort, direction).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"items": items, "total": total, "page": page, "limit": limit}


@api.post("/readings")
async def create_reading(payload: ReadingIn):
    # Validate date
    try:
        date_cls.fromisoformat(payload.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date. Use YYYY-MM-DD.")

    if payload.current_export < 0 or payload.current_import < 0:
        raise HTTPException(status_code=400, detail="Readings cannot be negative.")

    # Prevent duplicates on the same date
    if await READINGS.find_one({"date": payload.date}):
        raise HTTPException(
            status_code=400,
            detail=f"A reading for {payload.date} already exists.",
        )

    # Find the reading immediately before this date (chronologically)
    prev = await READINGS.find_one(
        {"date": {"$lt": payload.date}}, {"_id": 0}, sort=[("date", -1)]
    )

    if prev:
        prev_export = float(prev["current_export"])
        prev_import = float(prev["current_import"])
    else:
        # First entry ever - use initial values (defaults to the new reading itself if not provided)
        prev_export = (
            float(payload.initial_export)
            if payload.initial_export is not None
            else float(payload.current_export)
        )
        prev_import = (
            float(payload.initial_import)
            if payload.initial_import is not None
            else float(payload.current_import)
        )

    if payload.current_export < prev_export:
        raise HTTPException(
            status_code=400,
            detail=f"Current export ({payload.current_export}) is less than previous ({prev_export}).",
        )
    if payload.current_import < prev_import:
        raise HTTPException(
            status_code=400,
            detail=f"Current import ({payload.current_import}) is less than previous ({prev_import}).",
        )

    # Solar validation (optional field)
    prev_solar: Optional[float] = None
    if payload.current_solar is not None and payload.current_solar > 0:
        # Look up latest reading that had solar tracking on
        last_solar = await READINGS.find_one(
            {"date": {"$lt": payload.date}, "current_solar": {"$gt": 0}},
            {"_id": 0},
            sort=[("date", -1)],
        )
        if last_solar:
            prev_solar = float(last_solar["current_solar"])
        else:
            prev_solar = (
                float(payload.initial_solar)
                if payload.initial_solar is not None
                else float(payload.current_solar)
            )
        if payload.current_solar < prev_solar:
            raise HTTPException(
                status_code=400,
                detail=f"Current solar ({payload.current_solar}) is less than previous ({prev_solar}).",
            )

    reading = Reading(
        date=payload.date,
        previous_export=prev_export,
        current_export=float(payload.current_export),
        previous_import=prev_import,
        current_import=float(payload.current_import),
        current_solar=float(payload.current_solar) if payload.current_solar else 0.0,
        previous_solar=prev_solar if prev_solar is not None else 0.0,
        has_solar=bool(payload.current_solar and payload.current_solar > 0),
        notes=payload.notes or "",
    )
    doc = reading.model_dump()
    await READINGS.insert_one(doc)

    # Recompute the full chain to keep running totals consistent even if
    # entries are added out of chronological order.
    await _recalculate_chain(initial_solar=payload.initial_solar)

    saved = await READINGS.find_one({"id": reading.id}, {"_id": 0})
    return saved


@api.put("/readings/{reading_id}")
async def update_reading(reading_id: str, payload: ReadingIn):
    existing = await READINGS.find_one({"id": reading_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reading not found")

    try:
        date_cls.fromisoformat(payload.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date. Use YYYY-MM-DD.")

    # Prevent duplicate dates against other rows
    duplicate = await READINGS.find_one({"date": payload.date, "id": {"$ne": reading_id}})
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail=f"A different reading already exists for {payload.date}.",
        )

    update = {
        "date": payload.date,
        "current_export": float(payload.current_export),
        "current_import": float(payload.current_import),
        "notes": payload.notes or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.current_solar is not None:
        update["current_solar"] = float(payload.current_solar)
        update["has_solar"] = payload.current_solar > 0
    await READINGS.update_one({"id": reading_id}, {"$set": update})

    await _recalculate_chain()

    # After recalc, validate no negative deltas
    fixed = await READINGS.find_one({"id": reading_id}, {"_id": 0})
    if fixed and (fixed["export_unit"] < 0 or fixed["import_unit"] < 0):
        raise HTTPException(
            status_code=400,
            detail="Updated values produce a negative unit. Please revise.",
        )
    return fixed


@api.delete("/readings/{reading_id}")
async def delete_reading(reading_id: str):
    result = await READINGS.delete_one({"id": reading_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reading not found")
    await _recalculate_chain()
    return {"success": True}


# ---------------------------------------------------------------------------
# Dashboard, analytics, reports
# ---------------------------------------------------------------------------


@api.get("/dashboard")
async def dashboard():
    readings = await _all_readings_sorted()
    settings_doc = await _get_settings_doc()

    if not readings:
        return {
            "current_credit": 0,
            "todays_export": 0,
            "todays_import": 0,
            "net_today": 0,
            "total_export": 0,
            "total_import": 0,
            "monthly_export": 0,
            "monthly_import": 0,
            "estimated_monthly_savings": 0,
            "lifetime_credit": 0,
            "current_billing_credit": 0,
            "previous_billing_credit": 0,
            "latest": None,
            "trend": [],
            "avg_daily_export": 0,
            "avg_daily_import": 0,
            "avg_daily_net": 0,
            "recent": [],
            "settings": settings_doc,
            "solar": {
                "has_solar": False,
                "todays_solar": 0,
                "todays_self_consumption": 0,
                "todays_house_consumption": 0,
                "total_solar": 0,
                "monthly_solar": 0,
                "total_self_consumption": 0,
                "total_house_consumption": 0,
                "avg_daily_solar": 0,
                "tracked_days": 0,
            },
            "billing": None,
        }

    latest = readings[-1]
    total_export = latest["running_export"]
    total_import = latest["running_import"]
    current_credit = latest["credit_unit"]

    today_dt = date_cls.fromisoformat(latest["date"])
    month_key = today_dt.strftime("%Y-%m")
    prev_month_dt = (today_dt.replace(day=1) - timedelta(days=1))
    prev_month_key = prev_month_dt.strftime("%Y-%m")

    monthly_export = sum(
        r["export_unit"] for r in readings if r["date"].startswith(month_key)
    )
    monthly_import = sum(
        r["import_unit"] for r in readings if r["date"].startswith(month_key)
    )
    current_billing_credit = monthly_export - monthly_import
    prev_month_export = sum(
        r["export_unit"] for r in readings if r["date"].startswith(prev_month_key)
    )
    prev_month_import = sum(
        r["import_unit"] for r in readings if r["date"].startswith(prev_month_key)
    )
    previous_billing_credit = prev_month_export - prev_month_import

    tariff = float(settings_doc.get("tariff_rate", 8.0))

    avg_daily_export = total_export / max(1, len(readings))
    avg_daily_import = total_import / max(1, len(readings))

    # Solar aggregates (only meaningful if user has started tracking solar)
    solar_rows = [r for r in readings if r.get("has_solar")]
    total_solar = sum(r.get("solar_unit", 0.0) for r in solar_rows)
    total_self_consumption = sum(r.get("self_consumption", 0.0) for r in solar_rows)
    total_house_consumption = sum(r.get("house_consumption", 0.0) for r in solar_rows)
    monthly_solar = sum(
        r.get("solar_unit", 0.0)
        for r in solar_rows
        if r["date"].startswith(month_key)
    )
    todays_solar = latest.get("solar_unit", 0.0)
    todays_self = latest.get("self_consumption", 0.0)
    todays_house = latest.get("house_consumption", 0.0)
    avg_daily_solar = total_solar / max(1, len(solar_rows)) if solar_rows else 0.0

    trend = readings[-30:]
    recent = list(reversed(readings))[:5]

    # Current billing cycle snapshot
    current_cycle = await _ensure_open_cycle()
    cycle_stats = await _cycle_totals(current_cycle["start_date"], None)
    start_dt = date_cls.fromisoformat(current_cycle["start_date"])
    days_elapsed = max(0, (date_cls.today() - start_dt).days)
    cycle_target_days = 60
    last_closed = await BILLING.find_one(
        {"closed": True}, {"_id": 0}, sort=[("end_date", -1)]
    )

    return {
        "current_credit": _round(current_credit),
        "todays_export": _round(latest["export_unit"]),
        "todays_import": _round(latest["import_unit"]),
        "net_today": _round(latest["net_today"]),
        "total_export": _round(total_export),
        "total_import": _round(total_import),
        "monthly_export": _round(monthly_export),
        "monthly_import": _round(monthly_import),
        "estimated_monthly_savings": _round(monthly_export * tariff),
        "lifetime_credit": _round(current_credit),
        "current_billing_credit": _round(current_billing_credit),
        "previous_billing_credit": _round(previous_billing_credit),
        "latest": latest,
        "trend": trend,
        "avg_daily_export": _round(avg_daily_export),
        "avg_daily_import": _round(avg_daily_import),
        "avg_daily_net": _round(avg_daily_export - avg_daily_import),
        "recent": recent,
        "settings": settings_doc,
        "solar": {
            "has_solar": len(solar_rows) > 0,
            "todays_solar": _round(todays_solar),
            "todays_self_consumption": _round(todays_self),
            "todays_house_consumption": _round(todays_house),
            "total_solar": _round(total_solar),
            "monthly_solar": _round(monthly_solar),
            "total_self_consumption": _round(total_self_consumption),
            "total_house_consumption": _round(total_house_consumption),
            "avg_daily_solar": _round(avg_daily_solar),
            "tracked_days": len(solar_rows),
        },
        "billing": {
            "current": {
                **current_cycle,
                **cycle_stats,
                "days_elapsed": days_elapsed,
                "days_remaining": max(0, cycle_target_days - days_elapsed),
                "cycle_target_days": cycle_target_days,
            },
            "last_closed": last_closed,
        },
    }


@api.get("/analytics")
async def analytics():
    readings = await _all_readings_sorted()
    daily = [
        {
            "date": r["date"],
            "export": r["export_unit"],
            "import": r["import_unit"],
            "net": r["net_today"],
            "credit": r["credit_unit"],
            "solar": r.get("solar_unit", 0.0),
            "self_consumption": r.get("self_consumption", 0.0),
            "house_consumption": r.get("house_consumption", 0.0),
            "has_solar": bool(r.get("has_solar")),
        }
        for r in readings
    ]

    monthly_map: Dict[str, Dict[str, float]] = {}
    for r in readings:
        key = r["date"][:7]
        m = monthly_map.setdefault(
            key,
            {
                "month": key,
                "export": 0.0,
                "import": 0.0,
                "net": 0.0,
                "solar": 0.0,
                "self_consumption": 0.0,
                "house_consumption": 0.0,
            },
        )
        m["export"] += r["export_unit"]
        m["import"] += r["import_unit"]
        m["net"] += r["net_today"]
        m["solar"] += r.get("solar_unit", 0.0)
        m["self_consumption"] += r.get("self_consumption", 0.0)
        m["house_consumption"] += r.get("house_consumption", 0.0)

    monthly = sorted(monthly_map.values(), key=lambda x: x["month"])
    for m in monthly:
        for k in ("export", "import", "net", "solar", "self_consumption", "house_consumption"):
            m[k] = _round(m[k])

    return {"daily": daily, "monthly": monthly}


@api.get("/solar")
async def solar_analytics():
    readings = await _all_readings_sorted()
    solar_rows = [r for r in readings if r.get("has_solar")]

    total_solar = sum(r.get("solar_unit", 0.0) for r in solar_rows)
    total_export = sum(r.get("export_unit", 0.0) for r in solar_rows)
    total_self = sum(r.get("self_consumption", 0.0) for r in solar_rows)
    total_import = sum(r.get("import_unit", 0.0) for r in solar_rows)
    total_house = sum(r.get("house_consumption", 0.0) for r in solar_rows)

    grid_pct = (total_export / total_solar * 100) if total_solar > 0 else 0
    self_pct = (total_self / total_solar * 100) if total_solar > 0 else 0

    daily = [
        {
            "date": r["date"],
            "solar": r.get("solar_unit", 0.0),
            "grid_export": r.get("export_unit", 0.0),
            "self_consumption": r.get("self_consumption", 0.0),
            "grid_import": r.get("import_unit", 0.0),
            "house_consumption": r.get("house_consumption", 0.0),
        }
        for r in solar_rows
    ]

    return {
        "has_solar": len(solar_rows) > 0,
        "tracked_days": len(solar_rows),
        "total_solar": _round(total_solar),
        "total_grid_export": _round(total_export),
        "total_self_consumption": _round(total_self),
        "total_grid_import": _round(total_import),
        "total_house_consumption": _round(total_house),
        "grid_export_pct": _round(grid_pct),
        "self_consumption_pct": _round(self_pct),
        "avg_daily_solar": _round(total_solar / max(1, len(solar_rows))),
        "daily": daily,
    }


@api.get("/reports/monthly")
async def monthly_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
):
    month_key = f"{year:04d}-{month:02d}"
    readings = [
        r
        for r in await _all_readings_sorted()
        if r["date"].startswith(month_key)
    ]

    if not readings:
        return {
            "month": month,
            "year": year,
            "total_export": 0,
            "total_import": 0,
            "net_credit": 0,
            "avg_daily_export": 0,
            "avg_daily_import": 0,
            "highest_export_day": None,
            "highest_import_day": None,
            "entries": [],
            "count": 0,
        }

    total_export = sum(r["export_unit"] for r in readings)
    total_import = sum(r["import_unit"] for r in readings)
    net_credit = total_export - total_import
    count = len(readings)
    highest_export = max(readings, key=lambda r: r["export_unit"])
    highest_import = max(readings, key=lambda r: r["import_unit"])

    return {
        "month": month,
        "year": year,
        "total_export": _round(total_export),
        "total_import": _round(total_import),
        "net_credit": _round(net_credit),
        "avg_daily_export": _round(total_export / count),
        "avg_daily_import": _round(total_import / count),
        "highest_export_day": {
            "date": highest_export["date"],
            "value": highest_export["export_unit"],
        },
        "highest_import_day": {
            "date": highest_import["date"],
            "value": highest_import["import_unit"],
        },
        "entries": readings,
        "count": count,
    }


# ---------------------------------------------------------------------------
# Billing cycles (bimonthly TNEB bill support)
# ---------------------------------------------------------------------------


async def _cycle_totals(start_date: str, end_date: Optional[str]) -> Dict[str, float]:
    """Sum export/import units within a cycle date range (inclusive)."""
    query: Dict[str, Any] = {"date": {"$gte": start_date}}
    if end_date:
        query["date"]["$lte"] = end_date
    cursor = READINGS.find(query, {"_id": 0}).sort("date", 1)
    rows = await cursor.to_list(length=100000)
    total_export = sum(r["export_unit"] for r in rows)
    total_import = sum(r["import_unit"] for r in rows)
    return {
        "total_export": _round(total_export),
        "total_import": _round(total_import),
        "net_credit": _round(total_export - total_import),
        "entries": len(rows),
        "latest_reading_date": rows[-1]["date"] if rows else None,
    }


async def _ensure_open_cycle() -> Dict[str, Any]:
    """Ensure there is always exactly one open cycle. Returns it."""
    current = await BILLING.find_one({"closed": False}, {"_id": 0})
    if current:
        return current

    # Start from the earliest reading date, or today.
    first_reading = await READINGS.find_one({}, {"_id": 0}, sort=[("date", 1)])
    start = first_reading["date"] if first_reading else date_cls.today().isoformat()

    cycle = {
        "id": str(uuid.uuid4()),
        "start_date": start,
        "end_date": None,
        "closed": False,
        "closing_export": 0.0,
        "closing_import": 0.0,
        "closing_credit": 0.0,
        "closed_at": None,
        "notes": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await BILLING.insert_one(dict(cycle))
    return cycle


@api.get("/billing")
async def billing_overview():
    current = await _ensure_open_cycle()
    stats = await _cycle_totals(current["start_date"], None)
    today = date_cls.today()
    start_dt = date_cls.fromisoformat(current["start_date"])
    days_elapsed = max(0, (today - start_dt).days)
    # TNEB bimonthly ~ 60 days; expose as a soft target so UI can render progress.
    cycle_target_days = 60
    days_remaining = max(0, cycle_target_days - days_elapsed)

    past_cursor = BILLING.find({"closed": True}, {"_id": 0}).sort("end_date", -1)
    past = await past_cursor.to_list(length=200)

    return {
        "current": {
            **current,
            **stats,
            "days_elapsed": days_elapsed,
            "days_remaining": days_remaining,
            "cycle_target_days": cycle_target_days,
        },
        "past": past,
    }


class CloseBillIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    end_date: Optional[str] = None  # defaults to today
    notes: Optional[str] = ""


@api.post("/billing/close")
async def close_current_bill(payload: CloseBillIn):
    current = await _ensure_open_cycle()

    end_date = payload.end_date or date_cls.today().isoformat()
    try:
        end_dt = date_cls.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid end_date. Use YYYY-MM-DD.")

    start_dt = date_cls.fromisoformat(current["start_date"])
    if end_dt < start_dt:
        raise HTTPException(
            status_code=400,
            detail=f"End date ({end_date}) is before cycle start ({current['start_date']}).",
        )

    stats = await _cycle_totals(current["start_date"], end_date)

    update = {
        "closed": True,
        "end_date": end_date,
        "closing_export": stats["total_export"],
        "closing_import": stats["total_import"],
        "closing_credit": stats["net_credit"],
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "notes": payload.notes or "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "entries": stats["entries"],
    }
    await BILLING.update_one({"id": current["id"]}, {"$set": update})

    # Open next cycle starting the day after end_date.
    next_start = (end_dt + timedelta(days=1)).isoformat()
    new_cycle = {
        "id": str(uuid.uuid4()),
        "start_date": next_start,
        "end_date": None,
        "closed": False,
        "closing_export": 0.0,
        "closing_import": 0.0,
        "closing_credit": 0.0,
        "closed_at": None,
        "notes": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await BILLING.insert_one(dict(new_cycle))

    closed = await BILLING.find_one({"id": current["id"]}, {"_id": 0})
    return {"closed": closed, "next": new_cycle}


class CycleUpdateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None


@api.put("/billing/cycles/{cycle_id}")
async def update_cycle(cycle_id: str, payload: CycleUpdateIn):
    cycle = await BILLING.find_one({"id": cycle_id}, {"_id": 0})
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle not found")

    update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if payload.start_date:
        update["start_date"] = payload.start_date
    if payload.end_date and cycle.get("closed"):
        update["end_date"] = payload.end_date
        stats = await _cycle_totals(
            update.get("start_date", cycle["start_date"]), payload.end_date
        )
        update["closing_export"] = stats["total_export"]
        update["closing_import"] = stats["total_import"]
        update["closing_credit"] = stats["net_credit"]
    if payload.notes is not None:
        update["notes"] = payload.notes

    await BILLING.update_one({"id": cycle_id}, {"$set": update})
    return await BILLING.find_one({"id": cycle_id}, {"_id": 0})


@api.delete("/billing/cycles/{cycle_id}")
async def delete_cycle(cycle_id: str):
    result = await BILLING.delete_one({"id": cycle_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cycle not found")
    # Ensure at least one open cycle remains.
    await _ensure_open_cycle()
    return {"success": True}


# ---------------------------------------------------------------------------
# Backup / restore / seed / wipe
# ---------------------------------------------------------------------------


@api.get("/backup")
async def backup():
    readings = await _all_readings_sorted()
    settings_doc = await _get_settings_doc()
    cycles = await BILLING.find({}, {"_id": 0}).sort("start_date", 1).to_list(length=1000)
    return {
        "version": 2,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "readings": readings,
        "settings": settings_doc,
        "billing_cycles": cycles,
    }


@api.post("/restore")
async def restore(payload: Dict[str, Any]):
    readings = payload.get("readings") or []
    settings_payload = payload.get("settings")
    cycles_payload = payload.get("billing_cycles")

    if not isinstance(readings, list):
        raise HTTPException(status_code=400, detail="`readings` must be a list.")

    await READINGS.delete_many({})
    if readings:
        cleaned: List[Dict[str, Any]] = []
        for r in readings:
            r = dict(r)
            r.pop("_id", None)
            r.setdefault("id", str(uuid.uuid4()))
            r.setdefault("notes", "")
            cleaned.append(r)
        await READINGS.insert_many(cleaned)
        await _recalculate_chain()

    if isinstance(settings_payload, dict):
        settings_payload.pop("_id", None)
        settings_payload["id"] = "singleton"
        settings_payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        await SETTINGS.update_one(
            {"id": "singleton"}, {"$set": settings_payload}, upsert=True
        )

    if isinstance(cycles_payload, list):
        await BILLING.delete_many({})
        cleaned_cycles: List[Dict[str, Any]] = []
        for c in cycles_payload:
            c = dict(c)
            c.pop("_id", None)
            c.setdefault("id", str(uuid.uuid4()))
            cleaned_cycles.append(c)
        if cleaned_cycles:
            await BILLING.insert_many(cleaned_cycles)
    await _ensure_open_cycle()

    return {"success": True, "restored": len(readings)}


@api.post("/seed")
async def seed_data(days: int = 30):
    """Generate a plausible ~30 days of readings and replace existing data."""

    await READINGS.delete_many({})

    today = date_cls.today()
    start_export = 8000.00
    start_import = 12300.00
    start_solar = 12500.00  # inverter cumulative kWh baseline

    random.seed(42)
    docs: List[Dict[str, Any]] = []
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        # Daily solar export to grid usually higher during sunny days
        daily_export = round(random.uniform(10.0, 26.0), 2)
        daily_import = round(random.uniform(1.5, 10.0), 2)
        # Solar generation must be >= export (can't export more than you generate)
        daily_solar = round(daily_export + random.uniform(4.0, 12.0), 2)

        start_export += daily_export
        start_import += daily_import
        start_solar += daily_solar

        docs.append(
            {
                "id": str(uuid.uuid4()),
                "date": d.isoformat(),
                "previous_export": 0.0,
                "current_export": round(start_export, 2),
                "export_unit": 0.0,
                "previous_import": 0.0,
                "current_import": round(start_import, 2),
                "import_unit": 0.0,
                "running_export": 0.0,
                "running_import": 0.0,
                "credit_unit": 0.0,
                "net_today": 0.0,
                "previous_solar": 0.0,
                "current_solar": round(start_solar, 2),
                "solar_unit": 0.0,
                "running_solar": 0.0,
                "self_consumption": 0.0,
                "house_consumption": 0.0,
                "has_solar": True,
                "notes": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    if docs:
        await READINGS.insert_many(docs)
        # Seed previous_* values for the first row from an initial baseline.
        await _recalculate_chain(
            initial_export=8000.00,
            initial_import=12300.00,
            initial_solar=12500.00,
        )
    # Reset billing cycles on seed and open a fresh cycle spanning the sample data.
    await BILLING.delete_many({})
    await _ensure_open_cycle()
    return {"success": True, "count": len(docs)}


@api.delete("/wipe")
async def wipe_all(keep_settings: bool = True):
    await READINGS.delete_many({})
    await BILLING.delete_many({})
    if not keep_settings:
        await SETTINGS.delete_many({})
    return {"success": True}


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------


@api.get("/")
async def root():
    return {"message": "Solar Credit Tracker API"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("solar-credit-tracker")


@app.on_event("shutdown")
async def _shutdown() -> None:
    client.close()
