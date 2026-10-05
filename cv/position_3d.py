"""One adaptive right-wrist position filter; invalid samples hold, never predict."""
import numpy as np

MIN_CONFIDENCE = .25
HIGH_CONFIDENCE = .60
OCCLUSION_SECONDS = .25

class PositionGuard:
    def __init__(self):
        self.position = None
        self.velocity = np.zeros(3)
        self.acceleration = np.zeros(3)
        self.accepted_position = None
        self.previous_accepted_sample = None
        self.raw_position = None
        self.timestamp = None
        self.last_accepted_time = None
        self.last_reliable_position = None
        self.confidence = 0.0
        self.diagnostic_reason = "MISSING_LANDMARK"
        self.rejection_metrics = {}
        self.last_alpha = 1.0
        self.last_axis_alpha = np.ones(3)

    def update(self, measurement, confidence, timestamp, width):
        if self.timestamp is not None and timestamp <= self.timestamp:
            return None if self.position is None else self.position.copy(), False, "STALE_SAMPLE", None
        self.timestamp = timestamp
        self.raw_position = None if measurement is None else measurement.copy()
        self.rejection_metrics = {}
        dt = max(.001, timestamp-self.last_accepted_time) if self.last_accepted_time is not None else 1/30
        reason = ("MISSING_LANDMARK" if measurement is None else
                  "INVALID_3D" if not np.all(np.isfinite(measurement)) or np.linalg.norm(measurement)>10 else
                  "LOW_CONFIDENCE" if not np.isfinite(confidence) or confidence<MIN_CONFIDENCE else "NONE")
        jump = None
        if reason == "NONE" and self.accepted_position is not None:
            jump = float(np.linalg.norm(measurement-self.accepted_position))
            limit = max(4*width, 60*width*min(dt,.15))
            self.rejection_metrics = {"jump":jump, "jump_limit":limit}
            if jump>limit:
                reason = "POSITION_JUMP"
        self.diagnostic_reason = reason
        if reason != "NONE":
            self.velocity.fill(0); self.acceleration.fill(0)
            if self.last_accepted_time is None or timestamp-self.last_accepted_time>OCCLUSION_SECONDS:
                self.position = None
            return None if self.position is None else self.position.copy(), False, reason, jump
        previous = None if self.position is None else self.position.copy()
        old_raw = self.accepted_position
        if previous is None:
            self.position = measurement.copy()
            self.last_alpha = 1.0
            self.last_axis_alpha.fill(1)
            self.velocity.fill(0)
        else:
            speed = np.abs(measurement-old_raw)/dt if old_raw is not None else np.zeros(3)
            # 50 ms at rest, rapidly approaching 4 ms during a swing.
            tau = .004 + .046*np.exp(-speed/max(.20*width,1e-6))
            self.last_axis_alpha = 1-np.exp(-dt/tau)
            self.last_alpha = float(np.mean(self.last_axis_alpha[:2]))
            self.position += self.last_axis_alpha*(measurement-self.position)
            self.velocity = (self.position-previous)/dt
        self.previous_accepted_sample = None if old_raw is None else (self.last_accepted_time,old_raw.copy())
        self.accepted_position = measurement.copy()
        self.last_reliable_position = self.position.copy()
        self.last_accepted_time = timestamp
        self.confidence = confidence
        return self.position.copy(), True, "", jump


class BodyScaleNormalization:
    """Correct model-world scale drift, never divide metric data by image size."""
    def __init__(self):
        self.reference_scale = None
        self.reference_hip = np.zeros(3)
        self.last_hip = None
        self.ratio = 1.0
        self.timestamp = None

    def calibrate(self, scale, hip):
        self.reference_scale = float(scale)
        self.reference_hip = np.asarray(hip).copy()
        self.last_hip = self.reference_hip.copy()
        self.ratio = 1.0

    def update(self, scale, timestamp):
        if self.timestamp is not None and timestamp <= self.timestamp:
            return self.ratio
        dt = 1/30 if self.timestamp is None else min(.1, timestamp-self.timestamp)
        self.timestamp = timestamp
        if self.reference_scale is not None and scale is not None and np.isfinite(scale) and scale > .05:
            target = float(np.clip(scale/self.reference_scale, .6, 1.8))
            self.ratio += (1-np.exp(-dt/.12))*(target-self.ratio)
        return self.ratio

    def normalize(self, wrist, hip):
        if hip is not None and np.all(np.isfinite(hip)):
            self.last_hip = np.asarray(hip).copy()
        hip = self.last_hip
        if wrist is None or self.reference_scale is None or hip is None:
            return wrist
        return self.reference_hip + (wrist-hip)/self.ratio
