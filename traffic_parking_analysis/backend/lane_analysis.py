"""
lane_analysis.py
----------------
Defines road lanes as polygonal regions and computes what fraction of
each lane is occupied / blocked by parked vehicles.

Lane regions are either:
  • Auto-generated (horizontal thirds of the frame) – default
  • User-supplied as a list of polygon vertex lists
"""

import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def bbox_to_polygon(bbox: List[int]) -> np.ndarray:
    x1, y1, x2, y2 = bbox
    return np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype=np.float32)


def polygon_intersection_area(poly_a: np.ndarray, poly_b: np.ndarray) -> float:
    """Approximate intersection area of two convex polygons via OpenCV."""
    ret, intersect = cv2.intersectConvexConvex(poly_a, poly_b)
    if ret > 0 and intersect is not None:
        return float(cv2.contourArea(intersect))
    return 0.0


def polygon_area(poly: np.ndarray) -> float:
    return float(cv2.contourArea(poly))


# ---------------------------------------------------------------------------
# Lane analyser
# ---------------------------------------------------------------------------

class LaneAnalyser:
    """
    Tracks lane blockage caused by parked vehicles.

    Parameters
    ----------
    frame_width, frame_height : video dimensions (needed for auto-lane gen)
    lane_polygons : optional list of np.ndarray (N×2 int) defining each lane.
                   If None, lanes are auto-generated as horizontal thirds.
    """

    def __init__(
        self,
        frame_width: int = 1280,
        frame_height: int = 720,
        lane_polygons: Optional[List[np.ndarray]] = None,
        n_auto_lanes: int = 3,
    ):
        self.frame_width = frame_width
        self.frame_height = frame_height

        if lane_polygons is not None:
            self.lanes = [
                {"id": i + 1, "polygon": p.astype(np.float32), "name": f"Lane {i+1}"}
                for i, p in enumerate(lane_polygons)
            ]
        else:
            self.lanes = self._auto_generate_lanes(n_auto_lanes)

        # Rolling per-lane blockage history (last 300 frames)
        self._blockage_history: Dict[int, List[float]] = {
            lane["id"]: [] for lane in self.lanes
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyse(self, parked_detections: List[Dict]) -> Dict[int, Dict]:
        """
        Compute per-lane blockage for the current frame.

        Parameters
        ----------
        parked_detections : list of detection dicts that are parked
                            (each must have 'bbox').

        Returns
        -------
        {
          lane_id: {
            "name": str,
            "blockage_pct": float,   # 0-100
            "status": str,           # "Clear" / "Partially Blocked" / "Blocked"
            "blocking_vehicle_ids": [int, ...]
          }
        }
        """
        results: Dict[int, Dict] = {}

        for lane in self.lanes:
            lane_poly = lane["polygon"]
            lane_area = polygon_area(lane_poly)
            if lane_area <= 0:
                continue

            total_blocked = 0.0
            blocking_ids = []

            for det in parked_detections:
                veh_poly = bbox_to_polygon(det["bbox"]).astype(np.float32)
                blocked = polygon_intersection_area(lane_poly, veh_poly)
                if blocked > 0:
                    total_blocked += blocked
                    blocking_ids.append(det.get("track_id", -1))

            pct = min(100.0, (total_blocked / lane_area) * 100)
            self._blockage_history[lane["id"]].append(pct)
            if len(self._blockage_history[lane["id"]]) > 300:
                self._blockage_history[lane["id"]].pop(0)

            results[lane["id"]] = {
                "name": lane["name"],
                "blockage_pct": round(pct, 1),
                "status": self._status(pct),
                "blocking_vehicle_ids": blocking_ids,
            }

        return results

    def get_average_blockage(self) -> Dict[int, float]:
        """Rolling average lane blockage over recent frames."""
        return {
            lid: round(sum(h) / max(len(h), 1), 1)
            for lid, h in self._blockage_history.items()
        }

    def draw_lanes(self, frame: np.ndarray, lane_info: Dict[int, Dict]) -> np.ndarray:
        """Overlay lane polygons with colour-coded blockage on *frame*."""
        out = frame.copy()
        for lane in self.lanes:
            lid = lane["id"]
            info = lane_info.get(lid, {})
            pct = info.get("blockage_pct", 0.0)

            # colour: green < 20 %, yellow < 50 %, red >= 50 %
            if pct < 20:
                colour = (0, 200, 0)
            elif pct < 50:
                colour = (0, 200, 255)
            else:
                colour = (0, 0, 220)

            pts = lane["polygon"].astype(np.int32).reshape(-1, 1, 2)
            overlay = out.copy()
            cv2.fillPoly(overlay, [pts], colour)
            cv2.addWeighted(overlay, 0.2, out, 0.8, 0, out)
            cv2.polylines(out, [pts], isClosed=True, color=colour, thickness=2)

            # Label
            cx = int(lane["polygon"][:, 0].mean())
            cy = int(lane["polygon"][:, 1].mean())
            label = f"{lane['name']}: {pct:.0f}% blocked"
            cv2.putText(out, label, (cx - 60, cy),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 2)
        return out

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _auto_generate_lanes(self, n: int) -> List[Dict]:
        """Divide frame into *n* vertical strips (simple default lanes)."""
        w = self.frame_width
        h = self.frame_height
        strip_w = w // n
        lanes = []
        for i in range(n):
            x1 = i * strip_w
            x2 = x1 + strip_w if i < n - 1 else w
            poly = np.array(
                [[x1, 0], [x2, 0], [x2, h], [x1, h]], dtype=np.float32
            )
            lanes.append({"id": i + 1, "polygon": poly, "name": f"Lane {i+1}"})
        return lanes

    @staticmethod
    def _status(pct: float) -> str:
        if pct < 5:
            return "Clear"
        if pct < 40:
            return "Partially Blocked"
        return "Blocked"
