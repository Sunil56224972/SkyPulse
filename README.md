# ✈️ SkyPulse — Real-Time 3D Flight Tracker

<div align="center">

![SkyPulse](https://img.shields.io/badge/SkyPulse-Real--Time%20Flight%20Tracker-0ea5e9?style=for-the-badge&logo=airplane&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**A stunning 3D globe visualization of real-time global flight data, powered by Three.js and the AviationStack API.**

Watch live aircraft traverse photorealistic curved flight paths across a dynamic day/night Earth — all rendered at 60 FPS in your browser.

[🚀 Live Demo](https://sky-pulse-chi.vercel.app/) · [📖 How It Works](#-how-it-works) · [⚙️ Setup](#-getting-started) · [🤝 Contributing](#-contributing)

</div>

---

## 🌍 What is SkyPulse?

SkyPulse fetches **real-time active flight data** from the [AviationStack API](https://aviationstack.com/), resolves airport coordinates using a built-in database of **6,000+ airports worldwide**, and renders each flight as a 3D curved arc on an interactive WebGL globe. The result is a live, always-updating map of global aviation.

---

## ✨ Features

### 🛰️ Real-Time Flight Data
- Fetches **live active flights** from the AviationStack API on every page load
- Resolves IATA airport codes to GPS coordinates using a **6,072-airport database**
- Auto-refreshes every 30 minutes to keep the data current
- Smart **localStorage caching** to minimize API calls across visits

### 🌐 3D Globe Visualization
- **Photorealistic Earth** with high-resolution textures and atmosphere glow
- **Curved flight arcs** with realistic climb, cruise, and descent phases
- **Dynamic day/night cycle** with real-time sun positioning
- **Animated starfield** background for an immersive space experience
- Smooth **60 FPS** rendering with instanced geometry optimizations

### 🎮 Interactive Controls
| Control | Description |
|---------|-------------|
| **Flight Count** | Adjust visible flights (slider) |
| **Animation Speed** | Control playback speed (0.1x – 3.0x) |
| **Plane Size** | Scale aircraft models (1x – 10x) |
| **Render Type** | Switch between instanced 3D planes and particles |
| **Colorize** | Toggle color-coded aircraft by route |
| **Show Paths / Planes** | Toggle flight trajectories and aircraft visibility |
| **Day/Night Effect** | Realistic lighting simulation with manual time control |
| **Atmosphere Effect** | Earth's atmospheric glow toggle |
| **Real-time Sun** | Automatic sun positioning based on UTC time |
| **Brightness** | Adjustable day and night brightness levels |

### 🖱️ Navigation
- **Click + Drag** — Orbit around the Earth
- **Scroll** — Zoom in/out
- **Cinematic Intro** — Animated camera flyover on page load

---

## 🧠 How It Works

SkyPulse has a clean 4-step pipeline that turns raw API data into the 3D visualization you see:

### Step 1: Fetch Live Flights
```
Browser → /api/flights → AviationStack API
                         (returns active flights with airport IATA codes)
```
On page load, `LiveFlightFetcher.js` calls the AviationStack API for currently **active flights**. Each flight has a departure airport (e.g., `JFK`) and arrival airport (e.g., `LHR`), but **no GPS coordinates** — just IATA codes.

### Step 2: Resolve Airport Coordinates
```
API Response:  JFK → LHR
                ↓
AirportDB.js:  JFK = {lat: 40.6413, lng: -73.7781}
               LHR = {lat: 51.4700, lng: -0.4543}
```
The `AirportDB.js` file contains a database of **6,072 airports** with their GPS coordinates. Each flight's IATA codes are looked up and converted to `{lat, lng}` pairs — the same format the 3D engine expects.

### Step 3: Generate 3D Flight Paths
```
{lat, lng} coordinates → CatmullRom 3D curve on globe surface
                          (takeoff → climb → cruise → descent → landing)
```
`Flight.js` converts each pair of coordinates to 3D points on the globe surface. It then generates a realistic **CatmullRom spline curve** with:
- **Takeoff phase** — gradually lifts off the surface
- **Climb phase** — rises to cruise altitude (proportional to flight distance)
- **Cruise peak** — maximum altitude at the midpoint
- **Descent phase** — gradually returns to surface
- **Landing** — arrives at destination coordinates

### Step 4: Render & Animate
```
Flight curves → InstancedMesh (planes) + LineSegments (paths)
                → Three.js WebGL renderer → Your screen at 60 FPS
```
- **Instanced rendering** draws all aircraft in a single GPU draw call
- **Merged geometry** combines all flight paths into one mesh
- Planes animate along their curves, then **swap direction** and fly back
- The globe rotates with realistic day/night lighting based on real UTC time

### Architecture Diagram
```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│                                                  │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ LiveFlight   │───▶│  AirportDB.js        │   │
│  │ Fetcher.js   │    │  (6,072 airports)    │   │
│  │              │    │  IATA → {lat, lng}   │   │
│  │ Polls API    │    └──────────┬───────────┘   │
│  │ every 30 min │               │               │
│  └──────┬───────┘               │               │
│         │                       ▼               │
│         │            ┌──────────────────┐       │
│         └───────────▶│  main.js         │       │
│                      │  Orchestrator    │       │
│                      └────────┬─────────┘       │
│                               │                 │
│              ┌────────────────┼────────────┐    │
│              ▼                ▼             ▼    │
│  ┌───────────────┐ ┌──────────────┐ ┌────────┐ │
│  │  Flight.js    │ │InstancedPlanes│ │MergedFP│ │
│  │  Curve logic  │ │ 3D planes    │ │ Paths  │ │
│  └───────────────┘ └──────────────┘ └────────┘ │
│              │                │            │    │
│              └────────────────┼────────────┘    │
│                               ▼                 │
│                    ┌───────────────────┐         │
│                    │   Three.js WebGL  │         │
│                    │   60 FPS Render   │         │
│                    └───────────────────┘         │
└─────────────────────────────────────────────────┘
                        │
                        ▼
              ┌───────────────────┐
              │  AviationStack    │
              │  REST API         │
              │  (live flights)   │
              └───────────────────┘
```

### Fallback System
If the API is unavailable (quota exceeded, network error, etc.), SkyPulse seamlessly falls back to **50 pre-defined global routes** covering every continent. Users always see a populated, working globe.

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| **Frame Rate** | 60 FPS on modern hardware |
| **Draw Calls** | ~10 per frame (instanced rendering) |
| **Bundle Size** | ~225 KB gzipped |
| **API Calls** | 1 per page load (cached 30 min) |
| **Airport DB** | 6,072 airports worldwide |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ and npm
- A modern browser with WebGL support
- An [AviationStack API key](https://aviationstack.com/signup/free) (free tier works)

### Installation

```bash
# Clone the repository
git clone https://github.com/Sunil56224972/SkyPulse.git
cd SkyPulse

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173/flights-tracker/` in your browser.

### Configuration

**API Key** — Update your AviationStack API key in `src/LiveFlightFetcher.js`:
```js
const API_KEY = "your_api_key_here";
```

**Flight Count** — Adjust how many flights to fetch per load:
```js
const TARGET_FLIGHTS = 100; // 1 API call per load
```

### Production Build

```bash
npm run build
```
Deploy the `dist/` folder to any static hosting (GitHub Pages, Netlify, Vercel, etc.)

---

## 🗂️ Project Structure

```
SkyPulse/
├── index.html              # Entry point
├── vite.config.js          # Vite config with API proxy
├── package.json
├── public/                 # Static assets (textures, icons)
└── src/
    ├── main.js             # App orchestrator & Three.js scene
    ├── LiveFlightFetcher.js # Real-time API integration & caching
    ├── AirportDB.js        # 6,072 airport coordinate database
    ├── Flight.js           # Flight path curve generation
    ├── Earth.js            # Globe mesh with textures
    ├── InstancedPlanes.js  # GPU-instanced aircraft renderer
    ├── ParticlePlanes.js   # Particle-based aircraft renderer
    ├── MergedFlightPaths.js # Merged flight path line renderer
    ├── Stars.js            # Animated starfield background
    ├── Controls.js         # dat.GUI control panel
    ├── Utils.js            # Math & coordinate utilities
    └── Data.js             # Legacy static flight dataset
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|-----------|---------|
| [Three.js](https://threejs.org/) | 3D WebGL rendering engine |
| [Vite](https://vitejs.dev/) | Lightning-fast build tool & dev server |
| [AviationStack](https://aviationstack.com/) | Real-time flight data API |
| [dat.GUI](https://github.com/dataarts/dat.gui) | Interactive control panel |
| [Stats.js](https://github.com/mrdoob/stats.js/) | FPS performance monitor |
| Vanilla JS (ES6) | Zero-framework, clean module architecture |

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** your changes: `git commit -m 'Add amazing feature'`
4. **Push** to the branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ by [Sunil56224972](https://github.com/Sunil56224972)**

⭐ Star this repo if you find it useful!

</div>
