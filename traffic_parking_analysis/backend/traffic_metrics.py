"""
traffic_metrics.py
------------------
Aggregates per-frame vehicle data into summary traffic metrics:

  • Total / moving / parked vehicle counts
  • Vehicle density (vehicles per 1000 px²)
  • Estimated average speed (px/frame)
  • Congestion level  (LOW / MEDIUM / HIGH)
  • Parking violation alerts
"""

import math
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Set, Tuple
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Congestion thresholds (tunable)
# ---------------------------------------------------------------------------

CONGESTION_THRESHOLDS = {
    # (min_density, min_parked_ratio, max_avg_speed)  → label
    "HIGH":   {"density": 0.08, "parked_ratio": 0.40, "max_speed": 5.0},
    "MEDIUM": {"density": 0.04, "parked_ratio": 0.20, "max_speed": 15.0},
    "LOW":    {"density": 0.0,  "parked_ratio": 0.0,  "max_speed": 9999},
}


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class FrameMetrics:
    frame_id: int
    total_vehicles: int
    moving_vehicles: int
    parked_vehicles: int
    vehicle_density: float      # vehicles / 1000 px²
    avg_speed_px: float         # average speed in px/frame
    congestion_level: str       # LOW / MEDIUM / HIGH
    lane_blockage: Dict[int, float] = field(default_factory=dict)


@dataclass
class SummaryMetrics:
    total_frames_processed: int = 0
    total_vehicles_seen: int = 0
    peak_vehicle_count: int = 0
    avg_moving_vehicles: float = 0.0
    avg_parked_vehicles: float = 0.0
    avg_vehicle_density: float = 0.0
    avg_speed_px: float = 0.0
    overall_congestion: str = "LOW"
    parking_violations: List[Dict] = field(default_factory=list)
    frame_timeline: List[Dict] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Metrics calculator
# ---------------------------------------------------------------------------

class TrafficMetricsCalculator:
    """
    Call `update()` once per processed frame; retrieve summary via
    `get_summary()` at any point.
    """

    def __init__(self, frame_width: int = 1280, frame_height: int = 720):
        self.frame_area = frame_width * frame_height / 1000.0  # in 1000 px²
        self._frame_metrics: List[FrameMetrics] = []
        self._all_track_ids: Set[int] = set()
        self._violation_log: List[Dict] = []

    # ------------------------------------------------------------------
    # Per-frame update
    # ------------------------------------------------------------------

    def update(
        self,
        frame_id: int,
        tracked_detections: List[Dict],
        parked_ids: Set[int],
        lane_info: Dict[int, Dict],
    ) -> FrameMetrics:
        """
        Parameters
        ----------
        frame_id           : sequential frame index
        tracked_detections : output of SORTTracker.update() with track_ids
        parked_ids         : set of track_ids classified as parked
        lane_info          : output of LaneAnalyser.analyse()

        Returns
        -------
        FrameMetrics for this frame.
        """
        total = len(tracked_detections)
        parked = sum(1 for d in tracked_detections if d.get("track_id") in parked_ids)
        moving = total - parked
        density = total / self.frame_area if self.frame_area > 0 else 0.0

        speeds = [
            self._estimate_speed(d.get("centre_history", []))
            for d in tracked_detections
            if d.get("track_id") not in parked_ids
        ]
        avg_speed = sum(speeds) / len(speeds) if speeds else 0.0

        lane_blockage = {
            lid: info["blockage_pct"]
            for lid, info in lane_info.items()
        }
        congestion = self._classify_congestion(density, parked / max(total, 1), avg_speed)

        # Track unique vehicle IDs
        for d in tracked_detections:
            tid = d.get("track_id")
            if tid is not None:
                self._all_track_ids.add(tid)

        # Log parking violations (lane-blocking parked vehicles)
        for lid, info in lane_info.items():
            if info.get("blockage_pct", 0) > 30:
                for vid in info.get("blocking_vehicle_ids", []):
                    self._violation_log.append({
                        "frame_id": frame_id,
                        "track_id": vid,
                        "lane": info["name"],
                        "blockage_pct": info["blockage_pct"],
                        "severity": "HIGH" if info["blockage_pct"] > 60 else "MEDIUM",
                    })

        fm = FrameMetrics(
            frame_id=frame_id,
            total_vehicles=total,
            moving_vehicles=moving,
            parked_vehicles=parked,
            vehicle_density=round(density, 4),
            avg_speed_px=round(avg_speed, 2),
            congestion_level=congestion,
            lane_blockage=lane_blockage,
        )
        self._frame_metrics.append(fm)
        return fm

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def get_summary(self) -> SummaryMetrics:
        """Aggregate all processed frames into a SummaryMetrics object."""
        if not self._frame_metrics:
            return SummaryMetrics()

        n = len(self._frame_metrics)
        summary = SummaryMetrics(
            total_frames_processed=n,
            total_vehicles_seen=len(self._all_track_ids),
            peak_vehicle_count=max(f.total_vehicles for f in self._frame_metrics),
            avg_moving_vehicles=round(
                sum(f.moving_vehicles for f in self._frame_metrics) / n, 1
            ),
            avg_parked_vehicles=round(
                sum(f.parked_vehicles for f in self._frame_metrics) / n, 1
            ),
            avg_vehicle_density=round(
                sum(f.vehicle_density for f in self._frame_metrics) / n, 4
            ),
            avg_speed_px=round(
                sum(f.avg_speed_px for f in self._frame_metrics) / n, 2
            ),
            parking_violations=self._deduplicate_violations(),
            frame_timeline=[
                {
                    "frame_id":     f.frame_id,
                    "total":        f.total_vehicles,
                    "moving":       f.moving_vehicles,
                    "parked":       f.parked_vehicles,
                    "density":      f.vehicle_density,
                    "avg_speed":    f.avg_speed_px,
                    "congestion":   f.congestion_level,
                    "lane_blockage": {str(k): v for k, v in f.lane_blockage.items()},
                }
                for f in self._frame_metrics
            ],
        )
        # Overall congestion = most frequent level
        counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
        for f in self._frame_metrics:
            counts[f.congestion_level] += 1
        summary.overall_congestion = max(counts, key=counts.get)
        return summary

    def reset(self) -> None:
        self._frame_metrics.clear()
        self._all_track_ids.clear()
        self._violation_log.clear()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _estimate_speed(history: List[Tuple[float, float]]) -> float:
        """Average displacement over the last 5 positions (px/frame)."""
        if len(history) < 2:
            return 0.0
        window = history[-5:]
        displacements = [
            math.hypot(window[i][0]-window[i-1][0], window[i][1]-window[i-1][1])
            for i in range(1, len(window))
        ]
        return sum(displacements) / len(displacements)

    @staticmethod
    def _classify_congestion(
        density: float, parked_ratio: float, avg_speed: float
    ) -> str:
        th = CONGESTION_THRESHOLDS
        if (
            density >= th["HIGH"]["density"]
            or parked_ratio >= th["HIGH"]["parked_ratio"]
            or avg_speed <= th["HIGH"]["max_speed"]
        ):
            return "HIGH"
        if (
            density >= th["MEDIUM"]["density"]
            or parked_ratio >= th["MEDIUM"]["parked_ratio"]
            or avg_speed <= th["MEDIUM"]["max_speed"]
        ):
            return "MEDIUM"
        return "LOW"

    def _deduplicate_violations(self) -> List[Dict]:
        """Keep only the first occurrence per track_id + lane pair."""
        seen = set()
        unique = []
        for v in self._violation_log:
            key = (v["track_id"], v["lane"])
            if key not in seen:
                seen.add(key)
                unique.append(v)
        return unique