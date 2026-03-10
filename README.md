# AI-Based Roadside Parking Impact Analysis on Traffic

A complete end-to-end computer-vision system that analyses how roadside parking affects traffic
using a YOLOv8 detection model + SORT multi-object tracker and a FastAPI + Streamlit stack.

---

## System Architecture

```
traffic_parking_analysis/
├── backend/
│   ├── main.py              # FastAPI server & REST endpoints
│   ├── video_processor.py   # Pipeline orchestrator
│   ├── vehicle_detection.py # YOLOv8 wrapper
│   ├── vehicle_tracking.py  # SORT multi-object tracker
│   ├── parking_detection.py # Stationary-vehicle classifier
│   ├── lane_analysis.py     # Lane blockage calculator
│   └── traffic_metrics.py   # Aggregated traffic KPIs
├── frontend/
│   └── dashboard.py         # Streamlit interactive dashboard
├── models/
│   └── yolov8n.pt           # (auto-downloaded on first run)
├── dataset/
│   └── traffic_videos/      # Place input videos here
├── outputs/
│   ├── processed_videos/    # Annotated output videos
│   ├── graphs/
│   └── reports/
├── requirements.txt
└── README.md
```

---

## Tech Stack

| Layer            | Technology                       |
|------------------|----------------------------------|
| Backend API      | FastAPI + Uvicorn                |
| Frontend         | Streamlit                        |
| Object Detection | YOLOv8 (Ultralytics)             |
| Vehicle Tracking | SORT (IoU + Kalman, built-in)    |
| Video Processing | OpenCV                           |
| Data Processing  | NumPy, Pandas                    |
| Visualisation    | Plotly, Matplotlib               |

---

## Installation

### 1. Clone / download the project

```bash
git clone <repo-url>
cd traffic_parking_analysis
```

### 2. Create a virtual environment (recommended)

```bash
python -m venv .venv
# Linux / macOS
source .venv/bin/activate
# Windows
.venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

> **GPU acceleration** – If you have an NVIDIA GPU, install the CUDA-enabled
> version of PyTorch before running the above command:
> ```bash
> pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
> ```

---

## Running the System

### Step 1 – Start the FastAPI backend

```bash
cd traffic_parking_analysis
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at **http://localhost:8000**
Interactive docs at **http://localhost:8000/docs**

### Step 2 – Start the Streamlit dashboard

Open a **second terminal**:

```bash
streamlit run frontend/dashboard.py
```

The dashboard opens at **http://localhost:8501**

---

## Usage

1. Open the Streamlit dashboard in your browser.
2. Click **Browse files** and select an MP4 / AVI / MOV traffic video.
3. Adjust optional settings in the sidebar (confidence threshold, number of lanes, etc.).
4. Click **🚀 Analyse Video**.
5. Wait for processing to complete (a progress bar tracks the status).
6. View the results:
   - Traffic statistics panel (vehicles, speed, density, congestion)
   - Congestion indicator (green / yellow / red)
   - Interactive Plotly charts
   - Lane blockage analysis
   - Parking violation alerts
   - Download button for the annotated video

---

## API Endpoints

| Method | Path                        | Description                          |
|--------|-----------------------------|--------------------------------------|
| GET    | `/health`                   | Service health check                 |
| POST   | `/upload-video`             | Upload a traffic video               |
| POST   | `/process-video`            | Start the AI analysis pipeline       |
| GET    | `/job-status/{job_id}`      | Poll job status                      |
| GET    | `/traffic-metrics?job_id=…` | Aggregated traffic KPIs              |
| GET    | `/congestion-level?job_id=…`| Congestion classification            |
| GET    | `/lane-blockage?job_id=…`   | Per-lane blockage percentages        |
| GET    | `/parking-violations?job_id=…`| Parking violation alerts           |
| GET    | `/timeline/{job_id}`        | Per-frame data for charts            |
| GET    | `/download-video/{job_id}`  | Stream annotated output video        |

---

## Pipeline Overview

```
Input Video
    │
    ▼
Frame Extraction (OpenCV)
    │
    ▼
Vehicle Detection (YOLOv8)
  → car, bus, truck, motorcycle, bicycle
    │
    ▼
Vehicle Tracking (SORT)
  → assigns persistent Track IDs
    │
    ▼
Parking Detection
  → displacement < threshold for N frames → PARKED
    │
    ▼
Lane Analysis
  → IoU overlap of parked bbox with lane polygon
  → blockage % per lane
    │
    ▼
Traffic Metrics
  → density, avg speed, congestion level, violations
    │
    ▼
Output: annotated video + JSON metrics
```

---

## Congestion Classification

| Level  | Density threshold | Parked ratio | Avg speed   |
|--------|-------------------|--------------|-------------|
| HIGH   | ≥ 0.08            | ≥ 40 %       | ≤ 5 px/f    |
| MEDIUM | ≥ 0.04            | ≥ 20 %       | ≤ 15 px/f   |
| LOW    | < 0.04            | < 20 %       | > 15 px/f   |

---

## Real-World Applications

- **Smart traffic monitoring** – automated, 24/7 surveillance of urban roads
- **Illegal parking detection** – instant alerts when vehicles block lanes
- **Urban road planning** – data-driven decisions on lane widths, no-parking zones
- **Traffic congestion analysis** – correlate parking with congestion patterns
- **Smart city infrastructure** – feed data into adaptive signal control systems

---

## Notes

- The YOLOv8 nano model (`yolov8n.pt`) is downloaded automatically from the Ultralytics CDN on first run.
  Swap for `yolov8s.pt` / `yolov8m.pt` for higher accuracy at the cost of speed.
- When the model is unavailable (offline / CI), the system falls back to a deterministic mock
  detector so the pipeline still runs end-to-end for testing.
- `FRAME_SKIP = 2` in `video_processor.py` processes every other frame for speed.
  Set to `1` for frame-level accuracy.
- Maximum frames processed per video is capped at `1800` (~60 s at 30 fps). Adjust `MAX_FRAMES`
  in `video_processor.py` for longer videos.
