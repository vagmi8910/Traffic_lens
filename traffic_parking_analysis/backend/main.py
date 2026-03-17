"""
main.py  –  FastAPI Backend
"""

import os, sys, uuid, json, logging, re
from pathlib import Path
from typing import Dict, Optional

import aiofiles
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))
from video_processor import VideoProcessor
from analytics_explainer import explainer as graph_explainer

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
logger = logging.getLogger(__name__)

# ── Directories ───────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent.parent
UPLOAD_DIR = BASE_DIR / "dataset" / "traffic_videos"
OUTPUT_DIR   = BASE_DIR / "outputs" / "processed_videos"
HEATMAPS_DIR = BASE_DIR / "outputs" / "heatmaps"
JOBS_FILE    = BASE_DIR / "outputs" / "jobs.json"
for d in (UPLOAD_DIR, OUTPUT_DIR, HEATMAPS_DIR, JOBS_FILE.parent):
    d.mkdir(parents=True, exist_ok=True)

# ── Job store (persisted to disk) ─────────────────────────────────────────────
def _load_jobs() -> Dict:
    try:
        if JOBS_FILE.exists():
            data = json.loads(JOBS_FILE.read_text())
            valid = {}
            for jid, job in data.items():
                vid = job.get("output_video_path", "")
                # Keep completed jobs only if their video file still exists
                if job.get("status") != "completed" or (vid and Path(vid).exists()):
                    valid[jid] = job
            logger.info("Loaded %d jobs from disk", len(valid))
            return valid
    except Exception as e:
        logger.warning("Could not load jobs.json: %s", e)
    return {}

def _save_jobs():
    try:
        # Save everything except large in-memory heatmap arrays
        slim = {}
        for jid, job in jobs.items():
            slim[jid] = {k: v for k, v in job.items()
                         if k not in ("heatmap_traffic", "heatmap_parking", "trajectories")}
        JOBS_FILE.write_text(json.dumps(slim, indent=2, default=str))
    except Exception as e:
        logger.warning("Could not save jobs.json: %s", e)

def _save_heatmap(job_id: str, key: str, data: dict):
    """Persist heatmap data to a per-job JSON file."""
    try:
        path = HEATMAPS_DIR / f"{job_id}_{key}.json"
        path.write_text(json.dumps(data, default=str))
    except Exception as e:
        logger.warning("Could not save heatmap %s/%s: %s", job_id, key, e)

def _load_heatmap(job_id: str, key: str) -> dict:
    """Load heatmap data from disk, return {} if missing."""
    try:
        path = HEATMAPS_DIR / f"{job_id}_{key}.json"
        if path.exists():
            return json.loads(path.read_text())
    except Exception as e:
        logger.warning("Could not load heatmap %s/%s: %s", job_id, key, e)
    return {}

jobs: Dict[str, Dict] = _load_jobs()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="TrafficLens API", version="1.0.0")

@app.on_event("startup")
def preload_model():
    """Eagerly load YOLOv8 at startup so the first job processes instantly."""
    import sys, builtins
    # Ensure backend/ is on path so vehicle_detection can be imported
    backend_dir = str(Path(__file__).parent)
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    try:
        from vehicle_detection import VehicleDetector
        print("", flush=True)
        print("=" * 55, flush=True)
        print("  Loading YOLOv8 model — please wait...", flush=True)
        print("=" * 55, flush=True)
        VehicleDetector(model_path="yolov8s.pt", conf_threshold=0.4)
        print("=" * 55, flush=True)
        print("  ✅ YOLOv8 ready!  Backend fully started.", flush=True)
        print("=" * 55, flush=True)
        print("", flush=True)
        logger.info("YOLOv8 preloaded successfully")
    except Exception as e:
        print(f"  ⚠️  YOLOv8 preload failed: {e}", flush=True)
        print("     Model will load on first video process.", flush=True)
        logger.warning("Model preload skipped: %s", e)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"],
)

# ── Pydantic models ───────────────────────────────────────────────────────────
class ProcessRequest(BaseModel):
    job_id: str
    conf_threshold: float = 0.4
    n_lanes: int = 3
    min_stationary_frames: int = 20

class ExplainRequest(BaseModel):
    graph_type: str
    data: dict
    job_id: Optional[str] = None

# ── Helpers ───────────────────────────────────────────────────────────────────
def _get_job(job_id: str) -> Dict:
    if job_id not in jobs:
        raise HTTPException(404, detail=f"Job '{job_id}' not found")
    return jobs[job_id]

def _get_completed_job(job_id: str) -> Dict:
    job = _get_job(job_id)
    if job["status"] != "completed":
        raise HTTPException(400, detail=f"Job not completed yet (status: {job['status']})")
    return job

# ── Pipeline (runs in background thread) ─────────────────────────────────────
def _run_pipeline(job_id: str, video_path: str, conf: float, n_lanes: int, min_stationary: int):
    try:
        jobs[job_id]["status"] = "processing"
        _save_jobs()
        proc = VideoProcessor(
            model_path="yolov8s.pt",
            conf_threshold=conf,
            n_lanes=n_lanes,
            displacement_threshold=8.0,
            drift_threshold=20.0,
            min_stationary_frames=10,
        )
        result = proc.process(video_path=video_path, output_dir=str(OUTPUT_DIR))
        heatmap_traffic = result.get("heatmap_traffic", {})
        heatmap_parking = result.get("heatmap_parking", {})
        trajectories    = result.get("trajectories", {})

        # Persist heatmaps to disk so they survive backend restarts
        _save_heatmap(job_id, "traffic", heatmap_traffic)
        _save_heatmap(job_id, "parking", heatmap_parking)

        jobs[job_id].update({
            "status":             "completed",
            "output_video_path":  result["output_video_path"],
            "summary":            result["summary"],
            "processing_time_s":  result["processing_time_s"],
            "frames_processed":   result["frames_processed"],
            "heatmap_traffic":    heatmap_traffic,
            "heatmap_parking":    heatmap_parking,
            "trajectories":       trajectories,
        })
        _save_jobs()
        logger.info("Job %s completed in %.1fs", job_id, result["processing_time_s"])
    except Exception as exc:
        logger.exception("Job %s failed: %s", job_id, exc)
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"]  = str(exc)
        _save_jobs()

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "jobs_in_store": len(jobs)}


@app.get("/jobs")
def list_jobs():
    """Return summary list of all jobs, newest first."""
    result = []
    for jid, job in jobs.items():
        summary = job.get("summary", {})
        result.append({
            "job_id":            jid,
            "status":            job.get("status", "unknown"),
            "filename":          job.get("filename", "unknown"),
            "processing_time_s": job.get("processing_time_s", 0),
            "total_vehicles":    summary.get("total_vehicles_seen", 0),
            "congestion":        summary.get("overall_congestion", "N/A"),
        })
    result.reverse()
    return {"jobs": result}


@app.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    allowed = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, detail=f"Unsupported format: {ext}")

    job_id    = str(uuid.uuid4())[:8]
    save_path = UPLOAD_DIR / f"{job_id}{ext}"

    async with aiofiles.open(save_path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            await out.write(chunk)

    jobs[job_id] = {
        "job_id":     job_id,
        "status":     "uploaded",
        "video_path": str(save_path),
        "filename":   file.filename,
    }
    _save_jobs()
    logger.info("Uploaded %s -> %s", file.filename, save_path)
    return {"job_id": job_id, "filename": file.filename, "status": "uploaded"}


@app.post("/process-video")
def process_video(req: ProcessRequest, background_tasks: BackgroundTasks):
    job = _get_job(req.job_id)
    if job["status"] == "processing":
        raise HTTPException(409, detail="Job is already processing")
    if job["status"] == "completed":
        raise HTTPException(409, detail="Job already completed")
    background_tasks.add_task(
        _run_pipeline,
        req.job_id, job["video_path"],
        req.conf_threshold, req.n_lanes, req.min_stationary_frames,
    )
    jobs[req.job_id]["status"] = "queued"
    _save_jobs()
    return {"job_id": req.job_id, "status": "queued"}


@app.get("/job-status/{job_id}")
def job_status(job_id: str):
    job = _get_job(job_id)
    return {
        "job_id":  job_id,
        "status":  job["status"],
        "error":   job.get("error"),
        "frames":  job.get("frames_processed"),
        "time_s":  job.get("processing_time_s"),
    }


@app.get("/traffic-metrics")
def traffic_metrics(job_id: str):
    job     = _get_completed_job(job_id)
    summary = job["summary"]
    return {
        "job_id":                   job_id,
        "total_frames_processed":   summary.get("total_frames_processed", 0),
        "total_vehicles_seen":      summary.get("total_vehicles_seen", 0),
        "avg_moving_vehicles":      summary.get("avg_moving_vehicles", 0),
        "avg_parked_vehicles":      summary.get("avg_parked_vehicles", 0),
        "avg_vehicle_density":      summary.get("avg_vehicle_density", 0),
        "avg_speed_px":             summary.get("avg_speed_px", 0),
        "overall_congestion":       summary.get("overall_congestion", "N/A"),
        "processing_time_s":        job.get("processing_time_s", 0),
        "peak_vehicle_count":       summary.get("peak_vehicle_count", 0),
    }


@app.get("/congestion-level")
def congestion_level(job_id: str):
    job     = _get_completed_job(job_id)
    summary = job["summary"]
    level   = summary.get("overall_congestion", "LOW")
    color_map = {"LOW": "green", "MEDIUM": "yellow", "HIGH": "red"}
    return {
        "job_id":           job_id,
        "congestion_level": level,
        "color":            color_map.get(level, "grey"),
        "description": {
            "LOW":    "Traffic is flowing freely",
            "MEDIUM": "Moderate congestion – some delay expected",
            "HIGH":   "Severe congestion – significant delay",
        }.get(level, "Unknown"),
    }


@app.get("/lane-blockage")
def lane_blockage(job_id: str):
    job      = _get_completed_job(job_id)
    timeline = job["summary"].get("frame_timeline", [])
    if not timeline:
        return {"job_id": job_id, "lanes": {}}

    lane_totals: Dict[str, list] = {}
    for frame in timeline:
        for lane_id, pct in frame.get("lane_blockage", {}).items():
            lane_totals.setdefault(str(lane_id), []).append(pct)

    lanes = {
        lid: {
            "avg_blockage_pct": round(sum(v) / len(v), 1),
            "max_blockage_pct": round(max(v), 1),
            "status": "Blocked" if sum(v)/len(v) > 40 else
                      "Partially Blocked" if sum(v)/len(v) > 5 else "Clear",
        }
        for lid, v in lane_totals.items()
    }
    return {"job_id": job_id, "lanes": lanes}


@app.get("/parking-violations")
def parking_violations(job_id: str):
    job        = _get_completed_job(job_id)
    violations = job["summary"].get("parking_violations", [])
    return {"job_id": job_id, "total_violations": len(violations), "violations": violations}


@app.get("/timeline/{job_id}")
def timeline(job_id: str):
    job = _get_completed_job(job_id)
    return {"job_id": job_id, "timeline": job["summary"].get("frame_timeline", [])}


def _synthesise_heatmaps_from_timeline(job: dict) -> tuple:
    """
    When exact heatmap files are missing (jobs processed before persistence was added),
    synthesise approximate traffic + parking heatmaps from the stored frame_timeline.

    Strategy:
    - Divide the video frame (1280×720 default) into a 16×9 grid of zones.
    - For each timeline frame, use the density value to scatter points across the
      central road region, weighted by congestion level.
    - For parking, use parked vehicle count to place hotspot blobs near lane edges.
    """
    import math, random
    random.seed(42)  # deterministic so repeated calls give same result

    summary  = job.get("summary", {})
    timeline = summary.get("frame_timeline", [])
    W, H     = 1280, 720

    if not timeline:
        return {}, {}

    traffic_grid: dict = {}
    parking_grid: dict = {}
    CELL = 80  # px per grid cell

    def cell_key(x, y):
        return (int(x // CELL), int(y // CELL))

    for frame in timeline:
        density   = frame.get("density", 0) or 0
        total     = frame.get("total",   0) or 0
        parked    = frame.get("parked",  0) or 0
        moving    = frame.get("moving",  0) or 0
        cong      = frame.get("congestion", "LOW")

        # ── Traffic density points (scatter across road area) ──
        n_points = max(1, int(total * 2 + density * 30))
        for _ in range(min(n_points, 12)):
            # Road area: centre 60% of frame horizontally, middle 70% vertically
            x = random.gauss(W * 0.5, W * 0.22)
            y = random.gauss(H * 0.55, H * 0.18)
            x = max(40, min(W - 40, x))
            y = max(40, min(H - 40, y))
            weight = 3 if cong == "HIGH" else 2 if cong == "MEDIUM" else 1
            k = cell_key(x, y)
            traffic_grid[k] = traffic_grid.get(k, 0) + weight

        # ── Parking hotspots (bias toward road shoulders) ──
        if parked > 0:
            for _ in range(parked):
                # Left or right shoulder
                side = random.choice(["left", "right"])
                x = random.gauss(W * 0.12, W * 0.06) if side == "left" else random.gauss(W * 0.88, W * 0.06)
                y = random.gauss(H * 0.55, H * 0.20)
                x = max(20, min(W - 20, x))
                y = max(20, min(H - 20, y))
                k = cell_key(x, y)
                parking_grid[k] = parking_grid.get(k, 0) + 2

    def grid_to_points(grid, label):
        if not grid:
            return []
        max_v = max(grid.values(), default=1)
        pts = []
        for (col, row), count in grid.items():
            cx = (col + 0.5) * CELL
            cy = (row + 0.5) * CELL
            intensity = round((count / max_v) * 10.0, 2)
            pts.append({"x": round(cx, 1), "y": round(cy, 1), "intensity": intensity})
        pts.sort(key=lambda p: p["intensity"], reverse=True)
        return pts[:2000]

    t_pts = grid_to_points(traffic_grid, "traffic")
    p_pts = grid_to_points(parking_grid, "parking")
    n     = len(timeline)

    traffic_data = {
        "points":          t_pts,
        "total_points":    len(t_pts),
        "frames_analysed": n,
        "peak_density":    round(max((p["intensity"] for p in t_pts), default=0), 2),
        "frame_width":     W,
        "frame_height":    H,
        "estimated":       True,   # flag so frontend can show a notice
    }
    parking_data = {
        "points":          p_pts,
        "total_hotspots":  len(p_pts),
        "high_risk_zones": sum(1 for p in p_pts if p["intensity"] >= 5),
        "frame_width":     W,
        "frame_height":    H,
        "estimated":       True,
    }
    return traffic_data, parking_data


@app.get("/heatmap/traffic-density")
def heatmap_traffic_density(job_id: str):
    job  = _get_completed_job(job_id)
    data = job.get("heatmap_traffic", {})

    # Try disk cache first
    if not data:
        data = _load_heatmap(job_id, "traffic")
        if data:
            job["heatmap_traffic"] = data

    # Fall back: synthesise from timeline so old jobs always show something
    if not data:
        logger.info("Synthesising traffic heatmap for job %s from timeline", job_id)
        traffic_data, parking_data = _synthesise_heatmaps_from_timeline(job)
        # Cache synthesised data so parking endpoint can reuse it
        job["_synth_traffic"] = traffic_data
        job["_synth_parking"] = parking_data
        data = traffic_data

    if not data or not data.get("points"):
        raise HTTPException(404, detail="No heatmap data — try re-processing the video.")
    return {"job_id": job_id, **data}


@app.get("/heatmap/parking-hotspots")
def heatmap_parking_hotspots(job_id: str):
    job  = _get_completed_job(job_id)
    data = job.get("heatmap_parking", {})

    # Try disk cache first
    if not data:
        data = _load_heatmap(job_id, "parking")
        if data:
            job["heatmap_parking"] = data

    # Fall back: reuse synthesised data cached by traffic endpoint, or generate now
    if not data:
        if "_synth_parking" in job:
            data = job["_synth_parking"]
        else:
            logger.info("Synthesising parking heatmap for job %s from timeline", job_id)
            _, parking_data = _synthesise_heatmaps_from_timeline(job)
            data = parking_data

    if not data or not data.get("points"):
        raise HTTPException(404, detail="No parking heatmap data — try re-processing the video.")
    return {"job_id": job_id, **data}


@app.get("/analytics/vehicle-trajectories")
def vehicle_trajectories(job_id: str):
    job  = _get_completed_job(job_id)
    data = job.get("trajectories", {})
    return {"job_id": job_id, **data}


@app.post("/analytics/explain")
def explain_graph(req: ExplainRequest):
    data = dict(req.data)
    if req.job_id and req.job_id in jobs:
        job     = jobs[req.job_id]
        summary = job.get("summary", {})
        if summary:
            data.setdefault("congestion_level", summary.get("overall_congestion", "N/A"))
            data.setdefault("avg_moving",        summary.get("avg_moving_vehicles", "N/A"))
            data.setdefault("avg_parked",        summary.get("avg_parked_vehicles", "N/A"))
            data.setdefault("avg_speed",         summary.get("avg_speed_px", "N/A"))
            data.setdefault("avg_density",       summary.get("avg_vehicle_density", "N/A"))
            data.setdefault("frames_analysed",   summary.get("total_frames_processed", "N/A"))
            data.setdefault("avg_vehicles",      summary.get("avg_moving_vehicles", "N/A"))
        violations = summary.get("parking_violations", [])
        data.setdefault("violations", len(violations))
    insight = graph_explainer.explain(req.graph_type, data)
    return {"insight": insight, "graph_type": req.graph_type}


@app.get("/download-video/{job_id}")
def download_video(job_id: str, request: Request):
    """Stream video with HTTP Range support so browsers can seek."""
    job  = _get_completed_job(job_id)
    path = job.get("output_video_path")
    if not path or not Path(path).exists():
        raise HTTPException(404, detail="Processed video file not found on disk. "
                            "The file may have been deleted. Please re-process the video.")

    file_size    = Path(path).stat().st_size
    range_header = request.headers.get("range")

    def iter_file(start: int, end: int, chunk: int = 256 * 1024):
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = f.read(min(chunk, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    if range_header:
        m = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not m:
            raise HTTPException(416, detail="Invalid Range header")
        start  = int(m.group(1))
        end    = int(m.group(2)) if m.group(2) else file_size - 1
        end    = min(end, file_size - 1)
        length = end - start + 1
        return StreamingResponse(
            iter_file(start, end),
            status_code=206,
            headers={
                "Content-Range":  f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges":  "bytes",
                "Content-Length": str(length),
                "Cache-Control":  "no-cache",
            },
            media_type="video/mp4",
        )
    else:
        return StreamingResponse(
            iter_file(0, file_size - 1),
            status_code=200,
            headers={
                "Accept-Ranges":       "bytes",
                "Content-Length":      str(file_size),
                "Cache-Control":       "no-cache",
                "Content-Disposition": f'inline; filename="{Path(path).name}"',
            },
            media_type="video/mp4",
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)