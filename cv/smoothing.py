from dataclasses import dataclass

import numpy as np


@dataclass
class SmoothedPoint:
    position: np.ndarray | None
    accepted: bool
    predicted: bool


class AdaptivePointFilter:
    """Responsive EMA with short prediction through unreliable measurements."""

    def __init__(self, min_alpha=0.28, max_alpha=0.78, speed_scale=2.5):
        self.min_alpha = min_alpha
        self.max_alpha = max_alpha
        self.speed_scale = speed_scale
        self.reset()

    def reset(self):
        self.position = None
        self.velocity = np.zeros(2, dtype=np.float32)
        self.missed_frames = 0

    def update(self, measurement, visibility, dt, min_visibility, max_speed):
        dt = min(max(dt, 1e-3), 0.1)
        accepted = (
            measurement is not None and np.all(np.isfinite(measurement))
            and visibility >= min_visibility
        )

        if accepted and self.position is not None and self.missed_frames < 3:
            measured_speed = np.linalg.norm(measurement - self.position) / dt
            accepted = measured_speed <= max_speed

        if not accepted:
            self.missed_frames += 1
            if self.position is not None and self.missed_frames <= 3:
                self.position = self.position + self.velocity * dt * 0.65
                self.velocity *= 0.65
                return SmoothedPoint(self.position.copy(), False, True)
            return SmoothedPoint(None, False, False)

        if self.position is None or self.missed_frames >= 3:
            self.position = measurement.astype(np.float32)
            self.velocity.fill(0.0)
        else:
            delta = measurement - self.position
            speed = np.linalg.norm(delta) / dt
            alpha = self.min_alpha + (self.max_alpha - self.min_alpha) * min(
                speed / self.speed_scale, 1.0
            )
            previous = self.position.copy()
            self.position = previous + alpha * delta
            instant_velocity = (self.position - previous) / dt
            self.velocity = 0.7 * self.velocity + 0.3 * instant_velocity

        self.missed_frames = 0
        return SmoothedPoint(self.position.copy(), True, False)


class ArmLandmarkSmoother:
    def __init__(self, landmark_ids, wrist_ids):
        self.filters = {landmark_id: AdaptivePointFilter() for landmark_id in landmark_ids}
        self.wrist_ids = set(wrist_ids)

    def reset(self):
        for point_filter in self.filters.values():
            point_filter.reset()

    def update(self, measurements, dt):
        output = {}
        for landmark_id, point_filter in self.filters.items():
            measurement, visibility = measurements.get(landmark_id, (None, 0.0))
            is_wrist = landmark_id in self.wrist_ids
            output[landmark_id] = point_filter.update(
                measurement,
                visibility,
                dt,
                min_visibility=0.55 if is_wrist else 0.45,
                max_speed=5.0 if is_wrist else 6.0,
            )
        return output
