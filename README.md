# 🚦 TrafficLens — AI-Based Roadside Parking Impact Analysis

A full-stack computer vision system that analyses how roadside parking affects traffic flow using **YOLOv8** object detection, **SORT** multi-object tracking, a **FastAPI** backend, and a **React** dashboard with **Groq LLM** AI-powered insights.

---

## 🖥️ Demo

| Dashboard | Charts | Heatmap |
|-----------|--------|---------|
| Live traffic stats, lane blockage cards, congestion indicator | 5 interactive Recharts graphs with AI bullet-point explanations | Traffic density + parking hotspot heatmaps |

---

## 🏗️ Project Structure

```
traffic_parking_analysis/
├── backend/
│   ├── main.py                 # FastAPI server & all REST endpoints
│   ├── video_processor.py      # Full pipeline orchestrator
│   ├── vehicle_detection.py    # YOLOv8 wrapper with smart model fallback
│   ├── vehicle_tracking.py     # SORT multi-object tracker (IoU + Kalman)
│   ├── parking_detection.py    # Multi-signal stationary vehicle classifier
│   ├── lane_analysis.py        # Per-lane blockage calculator
│   ├── traffic_metrics.py      # Aggregated traffic KPIs
│   ├── heatmap_generator.py    # Spatial density heatmap generator
│   ├── analytics_explainer.py  # Groq LLM AI insights engine
│   └── __init__.py
├── frontend-react/
│   ├── package.json
│   ├── public/index.html
│   └── src/
│       ├── App.js              # Main shell with tab routing & polling
│       ├── api.js              # Axios client for all backend endpoints
│       ├── index.css           # Dark industrial design system
│       └── components/
│           ├── VideoUpload.js          # Drag-and-drop video upload
│           ├── TrafficStats.js         # Metric cards
│           ├── TrafficGraphs.js        # 5 Recharts graphs
│           ├── HeatmapView.js          # Canvas heatmap renderer
│           ├── CongestionIndicator.js  # Animated congestion ring
│           ├── ParkingAlerts.js        # Violation table
│           ├── ProcessedVideoViewer.js # Video player + blob download
│           └── AIInsight.js            # Groq AI bullet point panel
├── frontend/
│   └── dashboard.py            # Legacy Streamlit dashboard (kept)
├── models/                     # Place .pt model weights here
├── dataset/traffic_videos/     # Input videos saved here
├── outputs/
│   ├── processed_videos/       # Annotated output videos
│   └── jobs.json               # Persisted job store
├── requirements.txt
└── README.md
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI + Uvicorn |
| Frontend | React 18 + Recharts + Canvas API |
| Object Detection | YOLOv8s (Ultralytics) |
| Vehicle Tracking | SORT — IoU + Kalman (built-in, no extra deps) |
| Parking Detection | Multi-signal: drift + displacement + bbox stability |
| Video Processing | OpenCV + ffmpeg (H.264 re-encode for browser) |
| AI Insights | Groq API — LLaMA 3 (llama3-8b-8192) |
| Data Processing | NumPy, SciPy |

---

## 🚀 Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/vagmi8910/Traffic_lens.git
cd Traffic_lens/traffic_parking_analysis
```

### 2. Create a virtual environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Linux / macOS
source venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Install Node.js dependencies (React frontend)

```bash
cd frontend-react
npm install
cd ..
```

### 5. Set your Groq API key (optional — for AI insights)

```bash
# Windows
set GROQ_API_KEY=gsk_your_key_here

# Linux / macOS
export GROQ_API_KEY=gsk_your_key_here
```

Get a free API key at: https://console.groq.com

> Without the key, the system still works fully — AI insight panels show pre-written fallback explanations instead.

### 6. Install ffmpeg (for browser-playable video output)

- **Windows**: Download from https://ffmpeg.org/download.html and add to PATH
- **Linux**: `sudo apt install ffmpeg`
- **macOS**: `brew install ffmpeg`

> Without ffmpeg, processed videos still save but may not stream in the browser. The download button always works regardless.

---

## ▶️ Running the System

### Terminal 1 — Start the backend

```bash
cd traffic_parking_analysis
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload --reload-exclude "frontend-react"
```

On first run, YOLOv8s weights (~22 MB) will auto-download. You will see:
```
✅ YOLOv8 model ready: yolov8s.pt
```

### Terminal 2 — Start the React frontend

```bash
cd traffic_parking_analysis/frontend-react
npm start
```

Opens automatically at: **http://localhost:3000**

API docs available at: **http://localhost:8000/docs**

---

## 📖 Usage

1. Open **http://localhost:3000** in your browser
2. Go to the **Upload** tab
3. Drag & drop or browse for a traffic surveillance video (MP4, AVI, MOV, MKV — up to 500MB)
4. Optionally adjust settings (confidence threshold, number of lanes)
5. Click **Analyse Video**
6. Wait for processing — watch the status badge in the top nav
7. When complete, explore the results across tabs:
   - **Dashboard** — stats, lane blockage cards, congestion indicator, violations
   - **Charts** — 5 interactive graphs each with AI bullet-point explanations
   - **Heatmap** — traffic density + parking hotspot heatmaps with AI insights
   - **Video** — play the annotated video or download it to your device

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Service health check |
| POST | `/upload-video` | Upload a traffic video file |
| POST | `/process-video` | Start the AI analysis pipeline |
| GET | `/job-status/{job_id}` | Poll job processing status |
| GET | `/traffic-metrics?job_id=` | Aggregated traffic KPIs |
| GET | `/congestion-level?job_id=` | Congestion classification |
| GET | `/lane-blockage?job_id=` | Per-lane blockage percentages |
| GET | `/parking-violations?job_id=` | Parking violation alerts |
| GET | `/timeline/{job_id}` | Per-frame data for charts |
| GET | `/download-video/{job_id}` | Stream/download annotated video |
| GET | `/heatmap/traffic-density?job_id=` | Traffic density heatmap data |
| GET | `/heatmap/parking-hotspots?job_id=` | Parking hotspot heatmap data |
| GET | `/analytics/vehicle-trajectories?job_id=` | Vehicle trajectory data |
| POST | `/analytics/explain` | Generate Groq AI explanation |

---

## 🧠 Parking Detection — How It Works

The parking classifier uses **three signals simultaneously** — a vehicle must pass all three to be classified as parked:

| Signal | Threshold | What it detects |
|---|---|---|
| **Total drift** | < 20px over 10 frames | Overall position barely moved |
| **Median displacement** | < 8px/frame | Frame-to-frame movement is minimal |
| **Bbox size stability** | std-dev < 12px | Bounding box dimensions are stable |

A vehicle is un-parked only when **median displacement > 18px** sustained over 8 frames OR total drift > 40px — preventing brief YOLO jitter from triggering false un-parks.

---

## 📊 Pipeline Overview

```
Input Video
    │
    ▼
Frame Extraction (OpenCV, frame_skip=2)
    │
    ▼
Vehicle Detection (YOLOv8s)
  → car, bus, truck, motorcycle, bicycle
    │
    ▼
Vehicle Tracking (SORT)
  → persistent Track IDs across frames
    │
    ▼
Parking Detection (multi-signal)
  → drift + displacement + bbox stability → PARKED / MOVING
    │
    ▼
Lane Analysis
  → IoU overlap of parked bbox with lane polygon → blockage % per lane
    │
    ▼
Traffic Metrics
  → density, avg speed, congestion level, violations
    │
    ▼
Heatmap Generation
  → traffic density grid + parking hotspot grid
    │
    ▼
ffmpeg re-encode → H.264 + faststart (browser-streamable)
    │
    ▼
Output: annotated video + JSON metrics + heatmaps
```

---

## 🎨 Video Annotation Legend

| Colour | Meaning |
|---|---|
| 🟢 Green box | Moving vehicle |
| 🔴 Red box | Parked / stationary vehicle |
| Yellow overlay | Lane partially blocked (20–50%) |
| Red overlay | Lane heavily blocked (≥50%) |

---

## 🌡️ Congestion Classification

| Level | Density | Parked Ratio | Avg Speed |
|---|---|---|---|
| 🔴 HIGH | ≥ 0.08 | ≥ 40% | ≤ 5 px/frame |
| 🟡 MEDIUM | ≥ 0.04 | ≥ 20% | ≤ 15 px/frame |
| 🟢 LOW | < 0.04 | < 20% | > 15 px/frame |

---

## 🌍 Real-World Applications

- **Smart city traffic monitoring** — automated 24/7 surveillance of urban roads
- **Illegal parking enforcement** — instant alerts when vehicles block traffic lanes
- **Urban road planning** — data-driven decisions on lane widths and no-parking zones
- **Congestion analysis** — correlate roadside parking patterns with traffic slowdowns
- **Adaptive signal control** — feed density data into smart traffic light systems

---

## 📝 Notes

- `yolov8s.pt` auto-downloads on first run (~22 MB). Place any `.pt` file in `models/` to use a custom model.
- `FRAME_SKIP = 2` in `video_processor.py` processes every other frame for speed. Set to `1` for maximum accuracy.
- `MAX_FRAMES = 1800` caps processing at ~60 seconds of video. Increase for longer videos.
- Job state persists in `outputs/jobs.json` and survives backend restarts.
- Both the React frontend (`frontend-react/`) and the legacy Streamlit dashboard (`frontend/dashboard.py`) are included.

---

## 📄 License

MIT License — free to use, modify, and distribute.
