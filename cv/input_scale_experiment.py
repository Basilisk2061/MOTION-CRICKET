"""Removable inference-only experiment; never changes controller world coordinates."""
from collections import deque
from copy import copy
from dataclasses import dataclass

import cv2
import numpy as np


SCALES = (1.0, .85, .70, .60)


@dataclass(frozen=True)
class InputTransform:
    width: int
    height: int
    scaled_width: int
    scaled_height: int
    pad_x: int
    pad_y: int

    def restore(self, result):
        if self.scaled_width == self.width and self.scaled_height == self.height:
            return result
        restored = copy(result)
        restored.pose_landmarks = []
        for pose in result.pose_landmarks:
            landmarks = []
            for source in pose:
                point = copy(source)
                point.x = (source.x * self.width - self.pad_x) / self.scaled_width
                point.y = (source.y * self.height - self.pad_y) / self.scaled_height
                # Image Z uses image-width units; WORLD landmarks are not transformed.
                point.z = source.z * self.width / self.scaled_width
                landmarks.append(point)
            restored.pose_landmarks.append(landmarks)
        return restored


def prepare_input(frame, scale):
    if scale not in SCALES:
        raise ValueError("Unsupported experimental input scale")
    height, width = frame.shape[:2]
    sw, sh = max(1, round(width * scale)), max(1, round(height * scale))
    px, py = (width - sw) // 2, (height - sh) // 2
    transform = InputTransform(width, height, sw, sh, px, py)
    if scale == 1.0:
        return frame, transform
    canvas = np.zeros_like(frame)
    canvas[py:py+sh, px:px+sw] = cv2.resize(frame, (sw, sh), interpolation=cv2.INTER_AREA)
    return canvas, transform


class StationaryJitter:
    """Measurement only: 15 accepted step RMS values, in calibrated shoulder-width units."""
    def __init__(self):
        self.steps = deque(maxlen=15)
        self.previous = None

    def update(self, telemetry, controller):
        raw = [telemetry.get("rawDelta" + axis) for axis in "XYZ"]
        normalized = [telemetry.get("normalizedDelta" + axis) for axis in "XYZ"]
        output = controller.position_xyz
        if not controller.sample_accepted or output is None or any(v is None for v in raw + normalized):
            self.previous = None
            self.steps.clear()
            return
        sample = np.array((raw, normalized, output), dtype=float)
        if not np.all(np.isfinite(sample)):
            self.previous = None
            self.steps.clear()
            return
        if self.previous is not None:
            delta = sample - self.previous
            # Same micro-motion cutoff as the existing tracker jitter diagnostic.
            if np.linalg.norm(delta[1]) <= .03:
                self.steps.append(delta[[0, 2]])
            else:
                self.steps.clear()
        self.previous = sample

    def lines(self):
        if not self.steps:
            return ["Stationary step RMS: waiting for accepted micro-motion samples"]
        rms = np.sqrt(np.mean(np.square(self.steps), axis=0))
        return [f"{name} jitter XYZ: " + " ".join(f"{v:.5f}" for v in values)
                + f" | RMS {np.linalg.norm(values):.5f} (N={len(self.steps)})"
                for name, values in zip(("RAW WRIST", "OUTPUT"), rms)]
