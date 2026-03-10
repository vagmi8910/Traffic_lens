"""
vehicle_detection.py
--------------------
YOLOv8-based vehicle detection module.
Detects vehicles in each video frame and returns bounding boxes,
class labels, and confidence scores.
"""

import numpy as np
import cv2
from typing import List, Dict, Tuple, Optional
import logging
import os

logger = logging.getLogger(__name__)

# COCO class IDs for vehicles
VEHICLE_CLASS_IDS = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
    1: "bicycle",
}

# Color map per vehicle class (BGR)
CLASS_COLORS = {
    "car":        (0, 255, 0),      # green
    "motorcycle": (255, 165, 0),    # orange
    "bus":        (255, 0, 255),    # magenta
    "truck":      (0, 255, 255),    # cyan
    "bicycle":    (255, 255, 0),    # yellow
    "parked":     (0, 0, 255),      # red for parked
}


class VehicleDetector:
    """
    Wraps YOLOv8 for vehicle-only detection.
    Always attempts to load real YOLOv8 weights (auto-downloaded).
    Mock detector is only used as absolute last resort.
    """

    def __init__(self, model_path: str = "yolov8n.pt", conf_threshold: float = 0.4):
        self.conf_threshold = conf_threshold
        self.model = None
        self._load_model(model_path)

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------

    def _load_model(self, model_path: str) -> None:
        """
        Load YOLOv8 model.
        Tries the given path first, then falls back to 'yolov8n.pt'
        which Ultralytics auto-downloads from the internet on first use.
        """
        try:
            from ultralytics import YOLO

            # If a custom path was given but doesn't exist, fall back to nano
            if not os.path.exists(model_path) and model_path != "yolov8n.pt":
                logger.warning(
                    "Model not found at '%s', falling back to yolov8n.pt (auto-download)",
                    model_path,
                )
                model_path = "yolov8n.pt"

            self.model = YOLO(model_path)
            # Warm-up with a blank frame so the first real frame isn't slow
            dummy = np.zeros((640, 640, 3), dtype=np.uint8)
            self.model(dummy, verbose=False)
            logger.info("✅ YOLOv8 model ready: %s", model_path)

        except Exception as exc:
            logger.error(
                "❌ Could not load YOLOv8: %s\n"
                "   Install with:  pip install ultralytics\n"
                "   Falling back to MOCK detector — results will be random!",
                exc,
            )
            self.model = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(self, frame: np.ndarray) -> List[Dict]:
        """
        Run detection on a single BGR frame.

        Returns a list of dicts:
          {
            "bbox": [x1, y1, x2, y2],   # pixel coords
            "class_id": int,
            "class_name": str,
            "confidence": float,
          }
        """
        if self.model is not None:
            return self._yolo_detect(frame)
        return self._mock_detect(frame)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _yolo_detect(self, frame: np.ndarray) -> List[Dict]:
        results = self.model(frame, verbose=False)[0]
        detections = []
        for box in results.boxes:
            cls_id = int(box.cls[0])
            if cls_id not in VEHICLE_CLASS_IDS:
                continue
            conf = float(box.conf[0])
            if conf < self.conf_threshold:
                continue
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            detections.append(
                {
                    "bbox": [x1, y1, x2, y2],
                    "class_id": cls_id,
                    "class_name": VEHICLE_CLASS_IDS[cls_id],
                    "confidence": round(conf, 3),
                }
            )
        return detections

    def _mock_detect(self, frame: np.ndarray) -> List[Dict]:
        """
        Deterministic mock — generates synthetic detections for demos
        when real model weights are absent.
        """
        h, w = frame.shape[:2]
        rng = np.random.default_rng(seed=int(frame[0, 0, 0]))
        n = rng.integers(3, 9)
        detections = []
        class_ids = list(VEHICLE_CLASS_IDS.keys())
        for _ in range(n):
            x1 = int(rng.integers(0, w - 100))
            y1 = int(rng.integers(0, h - 60))
            x2 = x1 + int(rng.integers(60, 160))
            y2 = y1 + int(rng.integers(40, 100))
            cls_id = int(rng.choice(class_ids))
            detections.append(
                {
                    "bbox": [x1, y1, min(x2, w), min(y2, h)],
                    "class_id": cls_id,
                    "class_name": VEHICLE_CLASS_IDS[cls_id],
                    "confidence": round(float(rng.uniform(0.45, 0.95)), 3),
                }
            )
        return detections

    # ------------------------------------------------------------------
    # Drawing helpers
    # ------------------------------------------------------------------

    @staticmethod
    def draw_detections(
        frame: np.ndarray,
        detections: List[Dict],
        parked_ids: Optional[set] = None,
    ) -> np.ndarray:
        """
        Overlay detection bounding boxes on *frame* (in-place copy).
        Parked vehicles are drawn in red; moving ones in their class colour.
        """
        out = frame.copy()
        parked_ids = parked_ids or set()
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            track_id = det.get("track_id", -1)
            is_parked = track_id in parked_ids
            color = CLASS_COLORS["parked"] if is_parked else CLASS_COLORS.get(
                det["class_name"], (0, 255, 0)
            )
            cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
            label = f"{det['class_name']}"
            if track_id >= 0:
                label += f" #{track_id}"
            if is_parked:
                label += " [PARKED]"
            cv2.putText(
                out, label, (x1, max(y1 - 6, 12)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2
            )
        return out
