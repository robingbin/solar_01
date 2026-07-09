"""
Solar Credit Tracker - Backend API tests

Covers:
- Health / root
- Seed and wipe
- Readings CRUD (create, list, latest, update, delete, validations)
- Dashboard KPIs consistency
- Monthly report, analytics
- Settings GET/PUT persistence
- Backup / restore round-trip

Note: all tests share DB state. To play safe with parallel xdist workers
(pytest.ini uses -n 2 --dist loadscope which pins each class to one worker)
we keep everything in a SINGLE class so it stays sequential.
"""

import os
from datetime import date, timedelta

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

TIMEOUT = 30


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestSolarBackend:
    """Ordered end-to-end tests (single class => single xdist worker)."""

    # ---------- basic ----------
    def test_01_root(self, session):
        r = session.get(f"{API}/", timeout=TIMEOUT)
        assert r.status_code == 200
        assert "message" in r.json()

    # ---------- wipe -> dashboard zeros ----------
    def test_02_wipe_and_zero_dashboard(self, session):
        r = session.delete(f"{API}/wipe", timeout=TIMEOUT)
        assert r.status_code == 200
        r2 = session.get(f"{API}/dashboard", timeout=TIMEOUT)
        assert r2.status_code == 200
        d = r2.json()
        assert d["current_credit"] == 0
        assert d["total_export"] == 0
        assert d["total_import"] == 0
        assert d["latest"] is None
        assert d["recent"] == []

    # ---------- seed 30 days ----------
    def test_03_seed_30_days(self, session):
        r = session.post(f"{API}/seed", params={"days": 30}, timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert data["count"] == 30

        r2 = session.get(f"{API}/readings", params={"page": 1, "limit": 50}, timeout=TIMEOUT)
        assert r2.status_code == 200
        body = r2.json()
        assert body["total"] == 30
        assert len(body["items"]) == 30

    # ---------- dashboard KPIs ----------
    def test_04_dashboard_after_seed(self, session):
        r = session.get(f"{API}/dashboard", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        for k in [
            "current_credit", "total_export", "total_import",
            "todays_export", "todays_import", "net_today",
            "monthly_export", "monthly_import", "estimated_monthly_savings",
            "current_billing_credit", "previous_billing_credit",
            "trend", "recent", "avg_daily_export", "avg_daily_import",
            "avg_daily_net", "latest", "settings",
        ]:
            assert k in d
        assert round(d["total_export"] - d["total_import"], 2) == round(d["current_credit"], 2)
        assert d["total_export"] > 0
        assert d["total_import"] > 0
        assert len(d["recent"]) == 5
        assert len(d["trend"]) == 30

    # ---------- latest ----------
    def test_05_latest_reading(self, session):
        r = session.get(f"{API}/readings/latest", timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["reading"] is not None

    # ---------- duplicate date rejected ----------
    def test_06_create_duplicate_date_fails(self, session):
        latest = session.get(f"{API}/readings/latest", timeout=TIMEOUT).json()["reading"]
        payload = {
            "date": latest["date"],
            "current_export": latest["current_export"] + 10,
            "current_import": latest["current_import"] + 5,
        }
        r = session.post(f"{API}/readings", json=payload, timeout=TIMEOUT)
        assert r.status_code == 400

    # ---------- negative delta rejected ----------
    def test_07_create_negative_delta_fails(self, session):
        latest = session.get(f"{API}/readings/latest", timeout=TIMEOUT).json()["reading"]
        next_date = (date.fromisoformat(latest["date"]) + timedelta(days=1)).isoformat()
        payload = {
            "date": next_date,
            "current_export": latest["current_export"] - 5,
            "current_import": latest["current_import"] + 2,
        }
        r = session.post(f"{API}/readings", json=payload, timeout=TIMEOUT)
        assert r.status_code == 400

    # ---------- valid create + chain ----------
    def test_08_create_valid_and_chain(self, session):
        latest = session.get(f"{API}/readings/latest", timeout=TIMEOUT).json()["reading"]
        prev_running_export = latest["running_export"]
        next_date = (date.fromisoformat(latest["date"]) + timedelta(days=1)).isoformat()
        add_exp, add_imp = 15.5, 3.25
        payload = {
            "date": next_date,
            "current_export": round(latest["current_export"] + add_exp, 2),
            "current_import": round(latest["current_import"] + add_imp, 2),
            "notes": "TEST valid",
        }
        r = session.post(f"{API}/readings", json=payload, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        saved = r.json()
        assert saved["export_unit"] == round(add_exp, 2)
        assert saved["import_unit"] == round(add_imp, 2)
        assert saved["previous_export"] == round(latest["current_export"], 2)
        assert saved["running_export"] == round(prev_running_export + add_exp, 2)
        # persist
        r2 = session.get(f"{API}/readings/latest", timeout=TIMEOUT)
        assert r2.json()["reading"]["id"] == saved["id"]
        pytest.new_reading_id = saved["id"]

    # ---------- update + chain ----------
    def test_09_update_reading(self, session):
        rid = pytest.new_reading_id
        items = session.get(f"{API}/readings", params={"limit": 100}, timeout=TIMEOUT).json()["items"]
        target = next(i for i in items if i["id"] == rid)
        upd = {
            "date": target["date"],
            "current_export": target["current_export"] + 2.0,
            "current_import": target["current_import"] + 1.0,
            "notes": "TEST updated",
        }
        r = session.put(f"{API}/readings/{rid}", json=upd, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json()["notes"] == "TEST updated"
        items2 = session.get(f"{API}/readings", params={"limit": 100}, timeout=TIMEOUT).json()["items"]
        got = next(i for i in items2 if i["id"] == rid)
        assert got["notes"] == "TEST updated"

    # ---------- delete + chain ----------
    def test_10_delete_reading(self, session):
        rid = pytest.new_reading_id
        r = session.delete(f"{API}/readings/{rid}", timeout=TIMEOUT)
        assert r.status_code == 200
        items = session.get(f"{API}/readings", params={"limit": 100}, timeout=TIMEOUT).json()["items"]
        ids = [i["id"] for i in items]
        assert rid not in ids

    # ---------- monthly report ----------
    def test_11_monthly_report(self, session):
        latest = session.get(f"{API}/readings/latest", timeout=TIMEOUT).json()["reading"]
        y, m, _ = latest["date"].split("-")
        r = session.get(f"{API}/reports/monthly",
                        params={"month": int(m), "year": int(y)}, timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        for k in ["total_export", "total_import", "net_credit",
                  "avg_daily_export", "avg_daily_import",
                  "highest_export_day", "highest_import_day",
                  "entries", "count"]:
            assert k in data
        assert data["count"] >= 1

    # ---------- analytics ----------
    def test_12_analytics(self, session):
        r = session.get(f"{API}/analytics", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert "daily" in d and "monthly" in d
        assert len(d["daily"]) >= 1
        assert len(d["monthly"]) >= 1

    # ---------- settings ----------
    def test_13_settings_defaults(self, session):
        r = session.get(f"{API}/settings", timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert "owner_name" in d and "tariff_rate" in d

    def test_14_settings_update_persists(self, session):
        new_name = "TEST Owner Solar"
        r = session.put(f"{API}/settings", json={"owner_name": new_name}, timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["owner_name"] == new_name
        r2 = session.get(f"{API}/settings", timeout=TIMEOUT)
        assert r2.json()["owner_name"] == new_name

    # ---------- backup / restore ----------
    def test_15_backup_and_restore(self, session):
        r = session.get(f"{API}/backup", timeout=TIMEOUT)
        assert r.status_code == 200
        payload = r.json()
        assert "readings" in payload and "settings" in payload
        original_count = len(payload["readings"])

        r2 = session.post(f"{API}/restore", json=payload, timeout=TIMEOUT)
        assert r2.status_code == 200
        assert r2.json()["restored"] == original_count

        r3 = session.get(f"{API}/readings", params={"limit": 200}, timeout=TIMEOUT)
        assert r3.json()["total"] == original_count

    # ---------- leave DB seeded with 30 days for the demo ----------
    def test_16_final_reseed(self, session):
        r = session.post(f"{API}/seed", params={"days": 30}, timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["count"] == 30
