"""Secondary 2D visualization; never decides controller validity or position."""
from dataclasses import dataclass
import math
import numpy as np


MAX_ANGULAR_SPEED = math.radians(540)


def wrap_angle(angle):
    return (angle + math.pi) % (2 * math.pi) - math.pi


@dataclass
class BatPose:
    grip: np.ndarray  # compatibility alias: accepted right-hand image position
    direction: np.ndarray
    raw_direction: np.ndarray
    grip_velocity: np.ndarray
    bat_length: float
    state: str


class BatTracker:
    def __init__(self):
        self.reset()

    def reset(self):
        self.angle = None
        self.angular_velocity = 0.0

    def update(self, data, dt, frame_size):
        if data["tracking_state"] == "LOST" or data["image_position"] is None:
            self.reset()
            return None
        scale = np.asarray(frame_size)
        direction = data["image_direction"]
        if direction is None or np.linalg.norm(direction * scale) < 1e-6:
            if self.angle is None:
                return None
            target = self.angle
        else:
            direction = direction * scale
            target = math.atan2(direction[1], direction[0])
        if self.angle is None:
            self.angle = target
        dt = min(max(dt, .001), .1)
        count = max(1, math.ceil(dt / .008))
        for _ in range(count):
            step = dt / count
            acceleration = np.clip(225 * wrap_angle(target - self.angle)
                                   - 30 * self.angular_velocity,
                                   -math.radians(3000), math.radians(3000))
            self.angular_velocity = float(np.clip(
                self.angular_velocity + acceleration * step,
                -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED))
            self.angle = wrap_angle(self.angle + self.angular_velocity * step)
        # Mirror image X only for the webcam overlay, not world gameplay.
        position = data["image_position"]
        return BatPose(
            np.array((1 - position[0], position[1])) * scale,
            np.array((-math.cos(self.angle), math.sin(self.angle))),
            np.array((-math.cos(target), math.sin(target))),
            np.zeros(2), min(frame_size) * .55, data["tracking_state"],
        )
