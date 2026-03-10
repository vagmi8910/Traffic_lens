"""
video_processor.py
------------------
Orchestrates the full analysis pipeline for a single video file:

  1. Frame extraction (OpenCV)
  2. Vehicle detection (YOLOv8)
  3. Vehicle tracking (SORT)
  4. Parked vehicle detection
  5. Lane blockage analysis
  6. Traffic metrics aggregation
  7. Annotated output video generation
"""

import os
import time
import logging
from pathlib import Path
from typing import Dict, Optional, Callable

import cv2
import numpy as np

from vehicle_detection import VehicleDetector, CLASS_COLORS
from vehicle_tracking import SORTTracker
from parking_detection import ParkingDetector
from lane_analysis import LaneAnalyser
from traffic_metrics import TrafficMetricsCalculator, SummaryMetrics
from heatmap_generator import HeatmapGenerator

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_OUTPUT_DIR = Path(__file__).parent.parent / "outputs" / "processed_videos"
FRAME_SKIP = 2          # process every Nth frame (speed vs accuracy trade-off)
MAX_FRAMES = 1800       # hard cap (~60 s @ 30 fps)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

class VideoProcessor:
    """
    End-to-end traffic video analysis pipeline.

    Usage
    -----
    vp = VideoProcessor()
    result = vp.process("path/to/video.mp4", output_dir="outputs/")
    """

    def __init__(
        self,
        model_path: str = "yolov8s.pt",
        conf_threshold: float = 0.4,
        displacement_threshold: float = 8.0,
        drift_threshold: float = 20.0,
        min_stationary_frames: int = 25,
        n_lanes: int = 3,
    ):
        self.detector = VehicleDetector(model_path, conf_threshold)
        self.tracker = SORTTracker(max_age=12, min_hits=2, iou_threshold=0.4)
        self.parking_detector = ParkingDetector(
            displacement_threshold=displacement_threshold,
            drift_threshold=drift_threshold,
            min_stationary_frames=min_stationary_frames,
            reactivation_threshold=18.0,
            min_frames_visible=8,
            size_stability_threshold=12.0,
        )
        self.n_lanes = n_lanes

        # These are (re)initialised per video in process()
        self.lane_analyser: Optional[LaneAnalyser] = None
        self.metrics_calc: Optional[TrafficMetricsCalculator] = None

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def process(
        self,
        video_path: str,
        output_dir: Optional[str] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None,
    ) -> Dict:
        """
        Run the full pipeline on *video_path*.

        Parameters
        ----------
        video_path        : path to input video
        output_dir        : directory for the annotated output video
        progress_callback : optional fn(current_frame, total_frames)

        Returns
        -------
        {
          "output_video_path": str,
          "summary": dict,          # SummaryMetrics.to_dict()
          "processing_time_s": float,
        }
        """
        output_dir = Path(output_dir or DEFAULT_OUTPUT_DIR)
        output_dir.mkdir(parents=True, exist_ok=True)

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Cannot open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # (Re)initialise per-video components
        self.tracker = SORTTracker(max_age=12, min_hits=2, iou_threshold=0.4)
        self.parking_detector = ParkingDetector(
            displacement_threshold=8.0,    # tight: real YOLO jitter is 3-6px
            drift_threshold=20.0,          # total position drift over window
            min_stationary_frames=10,      # reduced: classify parked faster (~0.7s real)
            reactivation_threshold=18.0,   # sustained movement to un-park
            min_frames_visible=8,          # reduced: only 8 frames before eligible
            size_stability_threshold=12.0, # slightly relaxed for faster classification
        )
        self.lane_analyser = LaneAnalyser(frame_width=w, frame_height=h,
                                          n_auto_lanes=self.n_lanes)
        self.metrics_calc = TrafficMetricsCalculator(frame_width=w, frame_height=h)
        self.heatmap_gen  = HeatmapGenerator(frame_width=w, frame_height=h)

        # Output video writer
        output_path = output_dir / (Path(video_path).stem + "_analysed.mp4")
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(output_path), fourcc, fps / FRAME_SKIP, (w, h))

        t0 = time.time()
        frame_idx = 0
        processed = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx >= MAX_FRAMES:
                break

            frame_idx += 1

            # Skip frames for speed
            if frame_idx % FRAME_SKIP != 0:
                continue

            processed += 1

            if progress_callback:
                progress_callback(frame_idx, min(total_frames, MAX_FRAMES))

            # ---- Detection ----
            raw_detections = self.detector.detect(frame)

            # ---- Tracking ----
            tracked = self.tracker.update(raw_detections)

            # ---- Parking detection ----
            parked_ids = self.parking_detector.update(tracked)

            # ---- Lane analysis ----
            parked_dets = [d for d in tracked if d.get("track_id") in parked_ids]
            lane_info = self.lane_analyser.analyse(parked_dets)

            # ---- Metrics ----
            self.metrics_calc.update(processed, tracked, parked_ids, lane_info)

            # ---- Heatmap ----
            self.heatmap_gen.update(tracked, parked_ids)

            # ---- Annotate frame ----
            annotated = self._annotate(frame, tracked, parked_ids, lane_info, processed)
            writer.write(annotated)

        cap.release()
        writer.release()

        summary = self.metrics_calc.get_summary()
        elapsed = round(time.time() - t0, 2)

        # Re-mux with ffmpeg → H.264 + faststart so browsers can stream it
        final_path = output_path
        try:
            import subprocess
            remuxed = output_dir / (Path(video_path).stem + "_analysed_web.mp4")
            ff = subprocess.run([
                "ffmpeg", "-y",
                "-i", str(output_path),
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-movflags", "+faststart",
                "-an",
                str(remuxed),
            ], capture_output=True, timeout=300)
            if ff.returncode == 0 and remuxed.exists() and remuxed.stat().st_size > 0:
                output_path.unlink(missing_ok=True)
                final_path = remuxed
                logger.info("ffmpeg re-mux OK -> %s", final_path)
            else:
                logger.warning("ffmpeg re-mux failed rc=%d: %s",
                               ff.returncode, ff.stderr.decode()[:200])
        except Exception as e:
            logger.warning("ffmpeg unavailable, serving original: %s", e)

        logger.info("Processed %d frames in %.1f s -> %s", processed, elapsed, final_path)

        return {
            "output_video_path": str(final_path),
            "summary": summary.to_dict(),
            "processing_time_s": elapsed,
            "frames_processed": processed,
            "heatmap_traffic": self.heatmap_gen.get_traffic_heatmap(),
            "heatmap_parking": self.heatmap_gen.get_parking_heatmap(),
            "trajectories":    self.heatmap_gen.get_trajectories(),
        }

    # ------------------------------------------------------------------
    # Frame annotation
    # ------------------------------------------------------------------

    def _annotate(
        self,
        frame: np.ndarray,
        tracked: list,
        parked_ids: set,
        lane_info: dict,
        frame_num: int,
    ) -> np.ndarray:
        out = self.lane_analyser.draw_lanes(frame, lane_info)

        for det in tracked:
            x1, y1, x2, y2 = det["bbox"]
            tid = det.get("track_id", -1)
            cls = det.get("class_name", "vehicle")
            is_parked = tid in parked_ids

            # GREEN = moving, RED = parked — clearly distinct
            if is_parked:
                color = (0, 0, 255)        # BGR red
                status = "PARKED"
                thickness = 3
            else:
                color = (0, 255, 0)        # BGR green
                status = "MOVING"
                thickness = 2

            cv2.rectangle(out, (x1, y1), (x2, y2), color, thickness)

            # Background pill for label readability
            label = f"{cls} #{tid} [{status}]"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            lx, ly = x1, max(y1 - 8, th + 4)
            cv2.rectangle(out, (lx, ly - th - 3), (lx + tw + 4, ly + 2),
                          color, cv2.FILLED)
            cv2.putText(out, label, (lx + 2, ly),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)

        # HUD overlay — semi-transparent dark bar at top
        fm = self.metrics_calc._frame_metrics[-1] if self.metrics_calc._frame_metrics else None
        if fm:
            bar_h = 95
            overlay = out.copy()
            cv2.rectangle(overlay, (0, 0), (out.shape[1], bar_h), (20, 20, 20), -1)
            cv2.addWeighted(overlay, 0.55, out, 0.45, 0, out)

            cong_color = {"LOW": (0,200,0), "MEDIUM": (0,200,255), "HIGH": (0,0,255)}.get(
                fm.congestion_level, (200, 200, 200)
            )
            hud_lines = [
                (f"Frame: {frame_num}   Vehicles: {fm.total_vehicles}", (255,255,255)),
                (f"Moving: {fm.moving_vehicles}   Parked: {fm.parked_vehicles}", (200,255,200)),
                (f"Density: {fm.vehicle_density:.3f}   Avg Speed: {fm.avg_speed_px:.1f} px/frame", (200,200,255)),
                (f"Congestion: {fm.congestion_level}", cong_color),
            ]
            for i, (line, col) in enumerate(hud_lines):
                cv2.putText(out, line, (10, 22 + i * 20),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.58, col, 2, cv2.LINE_AA)

        return out