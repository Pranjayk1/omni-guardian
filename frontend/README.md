# Omni-Guardian — Frontend Dashboard

React + Vite dashboard for the Omni-Guardian IoT Transit Shield.

---

## Quick Start (Your Laptop)

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp .env.example .env

# 3. Run dev server
npm run dev
```

Open http://localhost:5173 in your browser.

---

## Connecting to Teammate's Backend (Same WiFi)

1. Ask your teammate to run `uvicorn main:app --host 0.0.0.0 --port 8000` on their laptop.
2. Find their laptop's LAN IP: on Windows run `ipconfig`, on Mac/Linux run `ifconfig`.
3. Open `vite.config.js` and change the proxy target:
   ```js
   target: 'http://192.168.1.42:8000',  // ← their IP
   ```
4. Save and the dev server will hot-reload. Done.

---

## Pages

| Route       | Description                                          |
|-------------|------------------------------------------------------|
| `/`         | Live Dashboard — sensor cards, CS/IS gauges, tamper  |
| `/map`      | Live Map — Leaflet route with colour-coded markers   |
| `/telemetry`| Charts — Temp, Humidity, G-Force, CS/IS over time    |
| `/chain`    | Chain Verification — hash walk + rejected packets    |
| `/session`  | Session Manager — start/end, handoff, config push    |

---

## LCD Note

The LCD display hardware shorted during construction and has not been replaced.
`LCDStatus.jsx` is included in the UI but its live-data props are commented out.
When the replacement hardware arrives:
1. Uncomment the props in `Dashboard.jsx` where `<LCDStatus />` is rendered.
2. Uncomment the display logic inside `LCDStatus.jsx`.

---

## Credentials (from config.py)

- Admin user: `admin`
- Admin pass: `omni2024`
- Device ID:  `OG-001`
- Backend:    `http://localhost:8000` (or teammate's IP)

These are in `.env`. Change if needed without touching any component code.
