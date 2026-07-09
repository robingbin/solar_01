# Solar Credit Tracker - PRD

## Original Problem Statement
Build a modern, production-ready full-stack web application to manually record TNEB solar import/export meter readings and automatically calculate daily usage, running totals, and current solar credit balance. Clean, fast, mobile-responsive, optimized for Synology NAS.

## Actual Tech Stack (deviates from PS by user consent)
- Frontend: React 19 (CRA), Tailwind, shadcn/ui, Chart.js, jsPDF, xlsx, Sonner, Lucide
- Backend: FastAPI + MongoDB (motor)
- No auth (single user); JWT deferred

## Core Requirements Implemented
- Dashboard with 6 KPI cards + credit trend chart + today's summary + quick actions + recent readings
- Add Reading form with auto-fetched previous values (or one-time initial setup)
- Automatic derived calculations (running totals, credit chain recompute)
- History page with search / month+year filter / pagination / sort / view/edit/delete
- Monthly Report with PDF/Excel/CSV/Print export
- Analytics with bar/line/area/pie charts
- Settings for owner/meter info + tariff rate
- Backup, Restore, Seed (30 days), Wipe (with confirmation)
- Light / Dark theme toggle
- Toast notifications (sonner) and loading skeletons

## Endpoints
GET/PUT /api/settings
GET /api/readings?search&month&year&page&limit&sort&order
GET /api/readings/latest
POST /api/readings, PUT /api/readings/:id, DELETE /api/readings/:id
GET /api/dashboard
GET /api/analytics
GET /api/reports/monthly?month&year
GET /api/backup, POST /api/restore
POST /api/seed?days=30, DELETE /api/wipe

## User Personas
- Single homeowner tracking rooftop solar meter (TNEB India context, INR tariff)

## Backlog (P1/P2 - future)
- JWT auth + multi-user support
- ESP32 Wi-Fi meter reader / MQTT / WebSocket real-time
- WhatsApp / Telegram / Email alerts
- TNEB billing cycle management
- Cloud backup (Google Drive / OneDrive / Synology Drive)
