"""
heatmap_generator.py
--------------------
Collects vehicle centre coordinates across frames and generates
spatial density data for:
  1. Traffic Density Heatmap  — where vehicles frequently appear
  2. Parking Hotspot Heatmap  — where vehicles stay stationary
"""

import math
from collections import defaultdict
from typing import Dict, List, Set, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class HeatmapGenerator:
    """
    Accumulates spatial data frame by frame, then exports
    heatmap point clouds for the frontend canvas renderer.

    Points format returned to frontend:
      { "x": float, "y": float, "intensity": float }
    """

    def __init__(self, frame_width: int = 1280, frame_height: int = 720, grid_size: int = 20):
        self.frame_width  = frame_width
        self.frame_height = frame_height
        self.grid_size    = grid_size   # px per grid cell for density accumulation

        # Grid accumulators  (cell_key → count)
        self._traffic_grid: Dict[Tuple[int,int], int] = defaultdict(int)
        self._parking_grid: Dict[Tuple[int,int], int] = defaultdict(int)

        # Raw trajectory per track  {track_id: [(cx,cy), ...]}
        self._trajectories: Dict[int, List[Tuple[float,float]]] = defaultdict(list)

        self._frames_seen = 0

    # ------------------------------------------------------------------
    # Per-frame update
    # ------------------------------------------------------------------

    def update(
        self,
        tracked_detections: List[Dict],
        parked_ids: Set[int],
    ) -> None:
        """
        Call once per processed frame.

        Parameters
        ----------
        tracked_detections : list with 'track_id', 'bbox', 'centre_history'
        parked_ids         : set of currently-parked track IDs
        """
        self._frames_seen += 1

        for det in tracked_detections:
            bbox = det.get("bbox")
            if not bbox:
                continue
            tid = det.get("track_id", -1)

            cx = (bbox[0] + bbox[2]) / 2.0
            cy = (bbox[1] + bbox[3]) / 2.0

            # Record trajectory
            if tid >= 0:
                traj = self._trajectories[tid]
                traj.append((cx, cy))
                if len(traj) > 300:
                    traj.pop(0)

            # Accumulate traffic density for all vehicles
            cell = self._to_cell(cx, cy)
            self._traffic_grid[cell] += 1

            # Accumulate parking hotspot only for parked vehicles
            if tid in parked_ids:
                self._parking_grid[cell] += 2  # weight parked more

    # ------------------------------------------------------------------
    # Export
    # ------------------------------------------------------------------

    def get_traffic_heatmap(self) -> Dict:
        """Return traffic density heatmap data."""
        points = self._grid_to_points(self._traffic_grid)
        peak   = max((p["intensity"] for p in points), default=0.0)
        return {
            "points":         points,
            "total_points":   len(points),
            "frames_analysed":self._frames_seen,
            "peak_density":   round(peak, 2),
            "frame_width":    self.frame_width,
            "frame_height":   self.frame_height,
        }

    def get_parking_heatmap(self) -> Dict:
        """Return parking hotspot heatmap data."""
        points = self._grid_to_points(self._parking_grid)
        high_risk = sum(1 for p in points if p["intensity"] >= 5)
        return {
            "points":          points,
            "total_hotspots":  len(points),
            "high_risk_zones": high_risk,
            "frame_width":     self.frame_width,
            "frame_height":    self.frame_height,
        }

    def get_trajectories(self) -> Dict:
        """Return vehicle trajectories for visualisation."""
        return {
            "trajectories": {
                str(tid): [{"x": x, "y": y} for x, y in pts]
                for tid, pts in self._trajectories.items()
            },
            "total_tracks": len(self._trajectories),
        }

    def reset(self) -> None:
        self._traffic_grid.clear()
        self._parking_grid.clear()
        self._trajectories.clear()
        self._frames_seen = 0

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _to_cell(self, cx: float, cy: float) -> Tuple[int, int]:
        """Map a pixel coordinate to a grid cell index."""
        col = int(cx // self.grid_size)
        row = int(cy // self.grid_size)
        return (col, row)

    def _cell_to_centre(self, cell: Tuple[int,int]) -> Tuple[float, float]:
        col, row = cell
        x = (col + 0.5) * self.grid_size
        y = (row + 0.5) * self.grid_size
        return x, y

    def _grid_to_points(self, grid: Dict[Tuple[int,int], int]) -> List[Dict]:
        """Convert grid counts to normalised point list."""
        if not grid:
            return []
        max_count = max(grid.values(), default=1)
        points = []
        for cell, count in grid.items():
            x, y = self._cell_to_centre(cell)
            intensity = (count / max_count) * 10.0  # scale 0-10
            points.append({"x": round(x, 1), "y": round(y, 1), "intensity": round(intensity, 2)})
        # Sort by intensity descending
        points.sort(key=lambda p: p["intensity"], reverse=True)
        return points[:2000]  # cap to avoid huge payloads
