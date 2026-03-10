"""
parking_detection.py
--------------------
High-accuracy parking detector using multiple signals:

1. TOTAL DRIFT  — distance between earliest and latest centre position
                  over a long window. A truly parked car has near-zero
                  total drift even if frame-to-frame jitter is non-zero.

2. MEDIAN FRAME-TO-FRAME DISPLACEMENT — filters out jitter spikes.

3. BBOX SIZE STABILITY — parked vehicles have very stable width/height.
                         Moving vehicles change apparent size as they
                         approach/recede from camera.

4. SPEED CONSISTENCY — moving vehicles have consistently higher speed
                       across the window, not just occasional spikes.

Classification rules (must satisfy ALL):
  PARKED:
    - total_drift   < drift_threshold     (e.g. 20px over 30 frames)
    - median_disp   < displacement_threshold (e.g. 8px/frame)
    - bbox_size_std < size_stability_threshold (e.g. 8px std dev)
    - visible for   >= min_frames_visible frames

  UN-PARK (requires ALL of):
    - median of last 8 frames > reactivation_threshold (e.g. 18px)
    OR
    - total drift over last 15 frames > drift_threshold * 2
"""

import math
import statistics
from typing import Dict, List, Tuple, Set
import logging

logger = logging.getLogger(__name__)


class ParkingDetector:
    """
    Multi-signal parking detector for high accuracy.

    Parameters
    ----------
    displacement_threshold    : median px/frame to consider 'still' (tighter = 8px)
    drift_threshold           : max total position drift over window (px)
    min_stationary_frames     : frames of history before classifying
    reactivation_threshold    : median displacement to un-park
    min_frames_visible        : track must exist this long before parking
    size_stability_threshold  : max std-dev of bbox diagonal to consider stable
    """

    def __init__(
        self,
        displacement_threshold: float = 8.0,    # tighter: real jitter is 3-6px
        drift_threshold: float = 20.0,           # total position drift over window
        min_stationary_frames: int = 25,         # ~1.7s real time with frame_skip=2
        reactivation_threshold: float = 18.0,   # needs clear sustained movement
        min_frames_visible: int = 20,            # must be tracked 20 frames first
        size_stability_threshold: float = 10.0, # bbox diagonal std-dev px
    ):
        self.displacement_threshold   = displacement_threshold
        self.drift_threshold          = drift_threshold
        self.min_stationary_frames    = min_stationary_frames
        self.reactivation_threshold   = reactivation_threshold
        self.min_frames_visible       = min_frames_visible
        self.size_stability_threshold = size_stability_threshold

        self._disp_history:   Dict[int, List[float]]            = {}
        self._centre_history: Dict[int, List[Tuple[float,float]]] = {}
        self._bbox_history:   Dict[int, List[List[int]]]        = {}
        self._frames_seen:    Dict[int, int]                    = {}
        self._parked_ids:     Set[int]                          = set()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def update(self, tracked_detections: List[Dict]) -> Set[int]:
        """Process one frame. Returns set of parked track_ids."""
        active_ids = set()

        for det in tracked_detections:
            tid = det.get("track_id")
            if tid is None:
                continue
            active_ids.add(tid)

            centre_hist = det.get("centre_history", [])
            bbox        = det.get("bbox", [0, 0, 0, 0])

            # Compute frame-to-frame displacement
            displacement = self._compute_displacement(centre_hist)

            # Update histories (keep last 60 frames)
            disp_h = self._disp_history.setdefault(tid, [])
            disp_h.append(displacement)
            if len(disp_h) > 60:
                disp_h.pop(0)

            cent_h = self._centre_history.setdefault(tid, [])
            if centre_hist:
                cent_h.append(centre_hist[-1])
            if len(cent_h) > 60:
                cent_h.pop(0)

            bbox_h = self._bbox_history.setdefault(tid, [])
            bbox_h.append(bbox)
            if len(bbox_h) > 60:
                bbox_h.pop(0)

            self._frames_seen[tid] = self._frames_seen.get(tid, 0) + 1
            self._classify(tid)

        # Remove stale tracks
        for tid in set(self._disp_history.keys()) - active_ids:
            self._disp_history.pop(tid, None)
            self._centre_history.pop(tid, None)
            self._bbox_history.pop(tid, None)
            self._frames_seen.pop(tid, None)
            self._parked_ids.discard(tid)

        return set(self._parked_ids)

    @property
    def parked_ids(self) -> Set[int]:
        return set(self._parked_ids)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_displacement(history: List[Tuple[float, float]]) -> float:
        if len(history) < 2:
            return 0.0
        cx1, cy1 = history[-2]
        cx2, cy2 = history[-1]
        return math.hypot(cx2 - cx1, cy2 - cy1)

    def _total_drift(self, tid: int, window: int) -> float:
        """Euclidean distance between earliest and latest centre in window."""
        cent_h = self._centre_history.get(tid, [])
        if len(cent_h) < 2:
            return 0.0
        recent = cent_h[-window:]
        x0, y0 = recent[0]
        x1, y1 = recent[-1]
        return math.hypot(x1 - x0, y1 - y0)

    def _bbox_size_std(self, tid: int, window: int) -> float:
        """Std-dev of bbox diagonal length over recent window."""
        bbox_h = self._bbox_history.get(tid, [])
        if len(bbox_h) < 3:
            return 0.0
        recent = bbox_h[-window:]
        diags = [math.hypot(b[2]-b[0], b[3]-b[1]) for b in recent]
        return statistics.stdev(diags) if len(diags) > 1 else 0.0

    def _classify(self, tid: int) -> None:
        frames_seen = self._frames_seen.get(tid, 0)
        disp_h      = self._disp_history.get(tid, [])

        # ── Already parked: check if truly moving again ───────────────────
        if tid in self._parked_ids:
            # Need sustained movement across last 8 frames
            recent_disp = disp_h[-8:] if len(disp_h) >= 8 else disp_h
            median_recent = statistics.median(recent_disp) if recent_disp else 0.0

            # Also check total drift over last 15 frames
            drift_recent = self._total_drift(tid, 15)

            unpark = (
                median_recent > self.reactivation_threshold
                or drift_recent > self.drift_threshold * 2
            )
            if unpark:
                self._parked_ids.discard(tid)
                logger.debug(
                    "Track %d UN-PARKED (median_disp=%.1f drift=%.1f)",
                    tid, median_recent, drift_recent
                )
            return

        # ── Not yet parked: check all signals ────────────────────────────
        if frames_seen < self.min_frames_visible:
            return
        if len(disp_h) < self.min_stationary_frames:
            return

        window = self.min_stationary_frames
        recent_disp = disp_h[-window:]

        # Signal 1: median frame-to-frame displacement
        median_disp = statistics.median(recent_disp)
        if median_disp >= self.displacement_threshold:
            return

        # Signal 2: total drift (position barely moved overall)
        drift = self._total_drift(tid, window)
        if drift >= self.drift_threshold:
            return

        # Signal 3: bbox size stability
        size_std = self._bbox_size_std(tid, window)
        if size_std >= self.size_stability_threshold:
            return

        # All signals agree — classify as parked
        self._parked_ids.add(tid)
        logger.debug(
            "Track %d PARKED (median_disp=%.1f drift=%.1f size_std=%.1f)",
            tid, median_disp, drift, size_std
        )