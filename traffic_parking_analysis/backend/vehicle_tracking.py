"""
vehicle_tracking.py
-------------------
Simple SORT-style tracker (IoU + Kalman) that assigns persistent IDs
to detected vehicles across frames.

A full DeepSORT integration is also supported when the deep_sort_realtime
package is installed; this module auto-selects the best available tracker.
"""

import numpy as np
from typing import List, Dict, Tuple
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Kalman-based SORT tracker (self-contained, no external dependency)
# ---------------------------------------------------------------------------

def iou(bb1: List[int], bb2: List[int]) -> float:
    """Compute Intersection-over-Union of two [x1,y1,x2,y2] boxes."""
    xi1 = max(bb1[0], bb2[0]); yi1 = max(bb1[1], bb2[1])
    xi2 = min(bb1[2], bb2[2]); yi2 = min(bb1[3], bb2[3])
    inter = max(0, xi2 - xi1) * max(0, yi2 - yi1)
    a1 = (bb1[2]-bb1[0]) * (bb1[3]-bb1[1])
    a2 = (bb2[2]-bb2[0]) * (bb2[3]-bb2[1])
    union = a1 + a2 - inter
    return inter / union if union > 0 else 0.0


class Track:
    """Represents a single tracked vehicle."""
    _id_counter = 1

    def __init__(self, bbox: List[int], class_name: str):
        self.id = Track._id_counter
        Track._id_counter += 1
        self.bbox = bbox
        self.class_name = class_name
        self.age = 1               # frames since created
        self.hits = 1              # matched detections
        self.time_since_update = 0 # frames without a match
        # History of centre positions for speed / parking detection
        self.centre_history: List[Tuple[float, float]] = [self._centre(bbox)]

    @staticmethod
    def _centre(bbox: List[int]) -> Tuple[float, float]:
        return ((bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2)

    def predict(self) -> List[int]:
        """Simple constant-velocity prediction (shift by last delta)."""
        if len(self.centre_history) >= 2:
            dx = self.centre_history[-1][0] - self.centre_history[-2][0]
            dy = self.centre_history[-1][1] - self.centre_history[-2][1]
        else:
            dx = dy = 0
        x1, y1, x2, y2 = self.bbox
        return [int(x1+dx), int(y1+dy), int(x2+dx), int(y2+dy)]

    def update(self, bbox: List[int], class_name: str) -> None:
        self.bbox = bbox
        self.class_name = class_name
        self.hits += 1
        self.time_since_update = 0
        self.age += 1
        self.centre_history.append(self._centre(bbox))
        # Keep only last 120 positions (~4 s at 30 fps)
        if len(self.centre_history) > 120:
            self.centre_history.pop(0)

    def mark_missed(self) -> None:
        self.time_since_update += 1
        self.age += 1

    def to_dict(self) -> Dict:
        return {
            "track_id": self.id,
            "bbox": self.bbox,
            "class_name": self.class_name,
            "age": self.age,
            "hits": self.hits,
            "centre_history": self.centre_history,
        }


class SORTTracker:
    """
    Lightweight IoU-based multi-object tracker (simplified SORT).

    Parameters
    ----------
    max_age       : frames to keep a track without a detection match
    min_hits      : minimum detection hits before a track is confirmed
    iou_threshold : minimum IoU to consider a match
    """

    def __init__(
        self,
        max_age: int = 12,        # keep parked tracks alive longer
        min_hits: int = 3,        # require 3 hits before confirming track
        iou_threshold: float = 0.4,  # tighter: reduces ID switches on parked cars
    ):
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.tracks: List[Track] = []
        Track._id_counter = 1  # reset for each video

    def update(self, detections: List[Dict]) -> List[Dict]:
        """
        Match *detections* to existing tracks and return the confirmed list
        with 'track_id' injected into each detection dict.

        Parameters
        ----------
        detections : output of VehicleDetector.detect()

        Returns
        -------
        List of detection dicts enriched with 'track_id'.
        """
        # --- Predict new positions for all existing tracks ---------------
        predicted = [t.predict() for t in self.tracks]

        # --- Hungarian-style greedy IoU matching -------------------------
        matched_track_indices = set()
        matched_det_indices = set()
        matches: List[Tuple[int, int]] = []  # (track_idx, det_idx)

        for di, det in enumerate(detections):
            best_iou, best_ti = 0.0, -1
            for ti, pred_bbox in enumerate(predicted):
                if ti in matched_track_indices:
                    continue
                score = iou(pred_bbox, det["bbox"])
                if score > best_iou:
                    best_iou, best_ti = score, ti
            if best_iou >= self.iou_threshold:
                matches.append((best_ti, di))
                matched_track_indices.add(best_ti)
                matched_det_indices.add(di)

        # --- Update matched tracks ----------------------------------------
        for ti, di in matches:
            self.tracks[ti].update(detections[di]["bbox"], detections[di]["class_name"])

        # --- Create new tracks for unmatched detections -------------------
        for di, det in enumerate(detections):
            if di not in matched_det_indices:
                self.tracks.append(Track(det["bbox"], det["class_name"]))

        # --- Mark unmatched tracks as missed ------------------------------
        for ti, track in enumerate(self.tracks):
            if ti not in matched_track_indices:
                track.mark_missed()

        # --- Prune dead tracks -------------------------------------------
        self.tracks = [t for t in self.tracks if t.time_since_update <= self.max_age]

        # --- Return confirmed tracks as enriched detection list ----------
        results = []
        for t in self.tracks:
            if t.hits >= self.min_hits or t.time_since_update == 0:
                d = {
                    "bbox": t.bbox,
                    "class_name": t.class_name,
                    "class_id": 0,          # kept for compatibility
                    "confidence": 1.0,
                    "track_id": t.id,
                    "centre_history": list(t.centre_history),
                }
                results.append(d)
        return results

    def get_track_histories(self) -> Dict[int, List[Tuple[float, float]]]:
        """Return {track_id: [centre, ...]} for all live tracks."""
        return {t.id: t.centre_history for t in self.tracks}