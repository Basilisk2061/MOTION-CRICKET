"""World estimates stay in unmirrored MediaPipe coordinates.

World: hip-centered estimated metres, X image-right, Y down, Z away.
Image XYZ is normalized/model-relative, never used as metric depth.
Body: anatomical right, up, forward = cross(up, right). This is a
left-handed basis. Facing the camera, forward is approximately world -Z.
Primary calibrated coordinates use FIXED reference axes and shoulder width.
Origin and axes are fixed; model-world torso scale drift is compensated before filtering.
Live-body coordinates are also exposed for comparison during body rotation.
"""

from collections import Counter, deque
from dataclasses import dataclass
import time

import numpy as np
from position_3d import PositionGuard, BodyScaleNormalization, MIN_CONFIDENCE


LANDMARKS = {
    "left_shoulder": 11, "right_shoulder": 12,
    "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16,
    "left_hip": 23, "right_hip": 24,
}
POSITION_TAU = 0.06
DEPTH_DEAD_ZONE = 0.12  # shoulder widths / second


@dataclass
class RightHandControllerState:
    # Position/velocity use the fixed stance frame in shoulder-width units.
    # None before calibration or when LOST; active may be true before calibration.
    active: bool
    state: str
    position_xyz: np.ndarray | None
    velocity_xyz: np.ndarray | None
    speed: float | None
    forearm_direction_xyz: np.ndarray | None
    camera_depth: float | None
    tracking_confidence: float
    timestamp: float
    reference_forearm_xyz: np.ndarray | None = None
    sample_accepted: bool = False
    calibration_state: str = "NOT_CALIBRATED"
    calibration_countdown: int = 0
    tracking_source: str = "WRIST"
    last_reliable_timestamp: float | None = None


# Future character: right hand drives the bat; the LEFT character hand follows
# its handle through animation/IK. Left wrist/elbow observations are debug only.


def unit(value):
    length = np.linalg.norm(value)
    return value / length if np.isfinite(length) and length > 1e-6 else None


def body_frame(world):
    left, right = world["left_shoulder"], world["right_shoulder"]
    center = (left + right) / 2
    width = np.linalg.norm(right - left)
    axis_right = unit(right - left)
    torso = center - (world["left_hip"] + world["right_hip"]) / 2
    if axis_right is None or width < 0.05:
        return None
    up = unit(torso - np.dot(torso, axis_right) * axis_right)
    if up is None:
        return None
    forward = unit(np.cross(up, axis_right))
    return center, float(width), np.column_stack((axis_right, up, forward))


class WorldTracker:
    def __init__(self):
        self.rejection_counts = Counter()  # session totals survive C and R
        self.reset()

    def reset(self):
        self.reference = None
        self.collecting = False
        self.calibration_state = "NOT_CALIBRATED"
        self.countdown_remaining = 0.0
        self.samples = []
        self.filtered = {}
        self.previous_axes = None
        self.history = deque()
        self.trajectory = deque(maxlen=90)
        self.image_trail = deque(maxlen=30)
        self.right_guard = PositionGuard()
        self.scale_normalization = BodyScaleNormalization()
        self.scale_samples = []
        self.jitter_samples = deque(maxlen=15)
        self.previous_diagnostic = None
        self.position_telemetry = {}
        self.body_scale = .4  # estimated metres until torso scale is available
        self.image_position = None
        self.image_velocity = np.zeros(2)
        self.image_direction = None
        self.controller = None
        self.calibration_message = "NOT CALIBRATED (C)"

    def begin_calibration(self):
        self.reference = None
        self.collecting = False
        self.calibration_state = "COUNTDOWN"
        self.countdown_remaining = 3.0
        self.samples.clear()
        self.history.clear()
        self.trajectory.clear()
        self.previous_axes = None
        self.filtered.clear()
        self.right_guard = PositionGuard()
        self.scale_normalization = BodyScaleNormalization()
        self.scale_samples.clear()
        self.jitter_samples.clear()
        self.previous_diagnostic = None
        self.image_position = None
        self.image_velocity.fill(0)
        self.image_direction = None
        self.image_trail.clear()
        self.calibration_message = "GET INTO BATTING STANCE: 3"

    def update(self, result, dt, timestamp=None):
        timestamp = time.monotonic() if timestamp is None else timestamp
        if self.calibration_state == "COUNTDOWN":
            self.countdown_remaining = max(0.0, self.countdown_remaining - max(dt, 0))
            self.calibration_message = f"GET INTO BATTING STANCE: {int(np.ceil(self.countdown_remaining))}"
            if self.countdown_remaining <= 1e-6:
                self.countdown_remaining = 0
                self.calibration_state = "COLLECTING"
                self.collecting = True
                self.samples.clear()
                self.previous_axes = None
                self.calibration_message = "HOLD - COLLECTING"
        data = {
            "timestamp": timestamp,
            "calibrated": int(self.reference is not None), "tracking_state": "LOST",
            "raw_world": {}, "image": {}, "confidence": {}, "world": {},
            "grip_body": None, "right_body": None, "grip_live_body": None,
            "right_velocity": None, "grip_velocity": None, "depth_velocity": None,
            "depth_offset": None, "depth_movement": "UNAVAILABLE",
            "grip": None, "forearm": None, "axes": None,
            "shoulder_center": None, "shoulder_width": None,
            "gameplay": None, "camera_depth": None, "sample_accepted": False,
            "outlier_reason": "", "position_jump": None, "estimated_speed": None,
            "fixed_reference_frame": self.reference is not None,
            "image_position": None, "image_direction": None,
            "accepted_right": None, "right_acceleration": None,
        }
        image = result.pose_landmarks[0] if result.pose_landmarks else []
        world = result.pose_world_landmarks[0] if result.pose_world_landmarks else []
        for name, index in LANDMARKS.items():
            for source, destination in ((image, "image"), (world, "raw_world")):
                if len(source) > index:
                    point = source[index]
                    xyz = np.array((point.x, point.y, point.z), dtype=float)
                    if np.all(np.isfinite(xyz)):
                        data[destination][name] = xyz
            confidences = []
            for source in (image, world):
                if len(source) > index:
                    point = source[index]
                    confidences.extend(
                        value for value in (point.visibility, point.presence)
                        if value is not None
                    )
            confidence = min(confidences) if confidences else 0.0
            data["confidence"][name] = confidence
            threshold = MIN_CONFIDENCE if name in ("right_wrist", "right_elbow") else .55
            if confidence >= threshold and name in data["raw_world"]:
                raw = data["raw_world"][name]
                alpha = 1 - np.exp(-max(dt, .001) / POSITION_TAU)
                previous = self.filtered.get(name, raw)
                self.filtered[name] = previous + alpha * (raw - previous)
                data["world"][name] = self.filtered[name].copy()
            else:
                self.filtered.pop(name, None)

        body_names = ("left_shoulder", "right_shoulder", "left_hip", "right_hip")
        frame = body_frame(data["world"]) if all(n in data["world"] for n in body_names) else None
        center, live_width, axes = frame if frame is not None else (None, None, None)
        # Live axes are diagnostic only; an invalid torso never changes gameplay.
        if axes is not None:
            if self.previous_axes is not None and np.dot(axes[:, 2], self.previous_axes[:, 2]) < .5:
                axes = None
            else:
                self.previous_axes = axes
        if live_width is not None and self.right_guard.position is None:
            self.body_scale = live_width
        width = self.reference["width"] if self.reference else self.body_scale
        data.update(axes=axes, shoulder_center=center, shoulder_width=width,
                    tracking_state="ACTIVE")
        raw_right = data["raw_world"].get("right_wrist")
        hip = None
        world_scale = None
        image_width = image_torso = image_scale = None
        if frame is not None:
            hip = (data["world"]["left_hip"]+data["world"]["right_hip"])/2
            world_scale = float(np.hypot(np.linalg.norm(center-hip), .5*live_width))
        if all(n in data["image"] and data["confidence"][n] >= .55 for n in body_names):
            shoulders = (data["image"]["left_shoulder"][:2]+data["image"]["right_shoulder"][:2])/2
            hips = (data["image"]["left_hip"][:2]+data["image"]["right_hip"][:2])/2
            image_width = float(np.linalg.norm(data["image"]["left_shoulder"][:2]-data["image"]["right_shoulder"][:2]))
            image_torso = float(np.linalg.norm(shoulders-hips))
            image_scale = float(np.hypot(image_torso, .5*image_width))
        ratio = self.scale_normalization.update(world_scale, timestamp)
        normalized_right = self.scale_normalization.normalize(raw_right, hip)
        right, accepted_right, reason_right, jump_right = self.right_guard.update(
            normalized_right, data["confidence"].get("right_wrist", 0), timestamp, width)
        self.position_telemetry = {"worldScaleRatio": ratio}
        for key, value in (("bodyScale", image_scale), ("shoulderImageWidth", image_width),
                           ("torsoImageScale", image_torso), ("worldBodyScale", world_scale)):
            if value is not None:
                self.position_telemetry[key] = value
        if self.reference is not None and self.reference.get("image_scale"):
            self.position_telemetry["calibrationScale"] = self.reference["image_scale"]
            if image_scale is not None:
                self.position_telemetry["imageScaleRatio"] = image_scale/self.reference["image_scale"]
        if accepted_right and self.reference is not None:
            ref = self.reference
            if ref.get("image_wrist") is not None and "right_wrist" in data["image"]:
                image_delta = data["image"]["right_wrist"][:2]-ref["image_wrist"]
                self.position_telemetry.update(rawImageDeltaX=float(image_delta[0]), rawImageDeltaY=float(image_delta[1]))
            raw_delta = ref["axes"].T @ (raw_right-ref["reference_origin"])/width
            normalized_delta = ref["axes"].T @ (normalized_right-ref["reference_origin"])/width
            for index, axis in enumerate("XYZ"):
                self.position_telemetry["rawDelta"+axis] = float(raw_delta[index])
                self.position_telemetry["normalizedDelta"+axis] = float(normalized_delta[index])
            if self.previous_diagnostic is not None:
                raw_step = raw_delta-self.previous_diagnostic[0]
                normalized_step = normalized_delta-self.previous_diagnostic[1]
                # Micro-motion statistics only, not an extra movement gate/filter.
                if np.linalg.norm(normalized_step) <= .03:
                    self.jitter_samples.append((raw_step, normalized_step))
                else:
                    self.jitter_samples.clear()
            self.previous_diagnostic = (raw_delta, normalized_delta)
            if self.jitter_samples:
                rms = np.sqrt(np.mean(np.square(np.array(self.jitter_samples)), axis=0))
                for index, axis in enumerate("XYZ"):
                    self.position_telemetry["rawJitter"+axis] = float(rms[0,index])
                    self.position_telemetry["normalizedJitter"+axis] = float(rms[1,index])
        data["tracking_source"] = "WRIST" if accepted_right else "PREDICTED" if right is not None else "LOST"
        data["grip_status"] = "VALID" if accepted_right else "HELD"
        data["arm_reason"] = "NONE"
        reason = self.right_guard.diagnostic_reason
        if raw_right is None and len(world) > LANDMARKS["right_wrist"]:
            reason = "INVALID_3D"  # extraction discarded a present non-finite XYZ
        self.rejection_counts["ACCEPTED" if accepted_right else reason] += 1
        raw_image = None
        if len(image) > LANDMARKS["right_wrist"]:
            point = image[LANDMARKS["right_wrist"]]
            xy = np.array((point.x, point.y), dtype=float)
            if np.all(np.isfinite(xy)):
                raw_image = xy
        data.update(
            rejection_reason="NONE" if accepted_right else reason,
            raw_wrist_available=raw_image is not None,
            raw_world_available=raw_right is not None,
            raw_wrist_image=raw_image,
            rejection_metrics=self.right_guard.rejection_metrics,
        )
        # Legacy 'grip' fields are aliases of the ONE filtered right wrist.
        grip = right
        data.update(sample_accepted=accepted_right,
                    outlier_reason=reason_right,
                    position_jump=jump_right,
                    accepted_right=self.right_guard.accepted_position,
                    right_acceleration=self.right_guard.acceleration.copy())
        if not data["sample_accepted"] or data["confidence"].get("right_wrist", 0) < MIN_CONFIDENCE:
            data["tracking_state"] = "DEGRADED"
        elbow = data["world"].get("right_elbow")
        elbow = self.scale_normalization.normalize(elbow, hip)
        forearm = unit(right - elbow) if accepted_right and right is not None and elbow is not None else None
        data["forearm"] = forearm
        if grip is None or right is None:
            data["tracking_state"] = "LOST"
            self.image_trail.clear()
            self.image_position = None
            self.image_velocity.fill(0)
            self.image_direction = None
            self._gap()
            self._output(data)
            return data
        data["grip"] = grip
        if accepted_right and raw_image is not None:
            previous = self.image_position
            # Display-only image proxy uses the same adaptive response as the 3D grip.
            self.image_position = raw_image.copy() if previous is None else (
                previous + self.right_guard.last_alpha*(raw_image-previous))
            self.image_velocity = np.zeros(2) if previous is None else (self.image_position-previous)/max(dt,.001)
            self.image_trail.append(self.image_position.copy())
            image_elbow = data["image"].get("right_elbow")
            if image_elbow is not None:
                self.image_direction = self.image_position-image_elbow[:2]
        else:
            self.image_velocity.fill(0)
        data["grip_image"] = self.image_position
        data["image_position"] = self.image_position
        data["image_direction"] = self.image_direction
        self.history.append((timestamp, right.copy(), grip.copy(), grip.copy()))
        while self.history and timestamp - self.history[0][0] > .22:
            self.history.popleft()
        if data["sample_accepted"]:
            self.trajectory.append((timestamp, grip.copy()))
        if len(self.history) >= 4 and timestamp - self.history[0][0] >= .09:
            times = np.array([row[0] for row in self.history])
            times -= times.mean()
            denominator = np.dot(times, times)
            velocities = [
                times @ np.array([row[index] for row in self.history]) / denominator
                for index in (1, 2, 3)
            ]
            data["right_velocity"], data["grip_velocity"] = velocities[:2]
            data["estimated_speed"] = float(np.linalg.norm(velocities[1]))
            depth_speed = velocities[2][2] / (self.reference["width"] if self.reference else width)
            data["depth_velocity"] = depth_speed
            data["depth_movement"] = (
                "AWAY FROM CAMERA" if depth_speed > DEPTH_DEAD_ZONE else
                "TOWARD CAMERA" if depth_speed < -DEPTH_DEAD_ZONE else "STABLE"
            )
        # Regression history remains diagnostic; gameplay velocity uses real sample timing.
        data["right_velocity"] = self.right_guard.velocity.copy() if right is not None else None
        if self.collecting and accepted_right and axes is not None and forearm is not None:
            self.samples.append((timestamp, center.copy(), live_width, axes.copy(),
                                 right.copy(), grip.copy(), forearm.copy(), elbow.copy()))
            if world_scale is not None and hip is not None and image_scale is not None and raw_image is not None:
                self.scale_samples.append((timestamp, world_scale, hip.copy(), image_scale, raw_image.copy()))
                self.scale_samples = [s for s in self.scale_samples if timestamp-s[0] <= 1.1]
            self.samples = [s for s in self.samples if timestamp - s[0] <= 1.1]
            self.calibration_message = "HOLD - COLLECTING"
            if len(self.samples) >= 15 and timestamp - self.samples[0][0] >= .95:
                self._calibrate()
        elif self.collecting:
            self.samples.clear()
            self.calibration_message = "Hold right hand in stance... reliable pose needed"
        if self.reference is not None:
            ref = self.reference
            data["gameplay"] = ref["axes"].T @ (grip - ref["reference_origin"]) / ref["width"]
            data["grip_body"] = data["gameplay"]
            data["right_body"] = ref["axes"].T @ (right - ref["right"]) / ref["width"]
            if axes is not None and center is not None:
                data["grip_live_body"] = (
                    axes.T @ (grip - center) - ref["axes"].T @ (ref["grip"] - ref["center"])
                ) / ref["width"]
            data["depth_offset"] = (grip[2] - ref["reference_origin"][2]) / ref["width"]
            data["camera_depth"] = data["depth_offset"]
            data["calibrated"] = 1
            data["fixed_reference_frame"] = True
        self._output(data)
        return data

    def _output(self, data):
        ref = self.reference
        velocity = None
        forearm = data["forearm"]
        if ref is not None:
            if data["right_velocity"] is not None:
                velocity = ref["axes"].T @ data["right_velocity"] / ref["width"]
            if forearm is not None:
                forearm = ref["axes"].T @ forearm
        else:
            forearm = None
        self.controller = RightHandControllerState(
            active=data["tracking_state"] != "LOST", state=data["tracking_state"],
            position_xyz=data["gameplay"], velocity_xyz=velocity,
            speed=None if velocity is None else float(np.linalg.norm(velocity)),
            forearm_direction_xyz=forearm, camera_depth=data["camera_depth"],
            tracking_confidence=data["confidence"].get("right_wrist", 0),
            timestamp=data["timestamp"],
            reference_forearm_xyz=None if ref is None else ref["axes"].T @ ref["forearm"],
            sample_accepted=data["sample_accepted"],
            calibration_state=self.calibration_state,
            calibration_countdown=int(np.ceil(self.countdown_remaining)),
            tracking_source=data.get("tracking_source", "LOST"),
            last_reliable_timestamp=self.right_guard.last_accepted_time,
        )

    def _gap(self):
        self.history.clear()
        self.trajectory.clear()
        if self.collecting:
            self.samples.clear()
            self.calibration_message = "Hold right hand in stance... reliable pose needed"

    def _calibrate(self):
        centers = np.array([s[1] for s in self.samples])
        widths = np.array([s[2] for s in self.samples])
        axes = np.array([s[3] for s in self.samples])
        rights = np.array([s[4] for s in self.samples])
        grips = np.array([s[5] for s in self.samples])
        width = float(np.median(widths))
        relative = grips - centers
        spread = np.max(np.linalg.norm(relative - np.median(relative, axis=0), axis=1))
        if (spread > .10 * width or np.ptp(widths) > .12 * width
                or np.min(axes[:, :, 2] @ axes[-1, :, 2]) < .97):
            self.calibration_message = "Hold batting stance... motion/noise too high"
            return
        median_axes = np.median(axes, axis=0)
        right_axis = unit(median_axes[:, 0])
        up = unit(median_axes[:, 1] - np.dot(median_axes[:, 1], right_axis) * right_axis)
        reference_axes = np.column_stack((right_axis, up, np.cross(up, right_axis)))
        self.reference = {
            "center": np.median(centers, axis=0), "width": width,
            "axes": reference_axes, "right": np.median(rights, axis=0),
            "grip": np.median(grips, axis=0),
            "forearm": unit(np.median([s[6] for s in self.samples], axis=0)),
            "right_elbow": np.median([s[7] for s in self.samples], axis=0),
            "controller": "anatomical_right", "depth": float(np.median(grips[:, 2])),
        }
        self.reference.update(
            reference_origin=self.reference["grip"].copy(),
            reference_right=reference_axes[:, 0].copy(),
            reference_up=reference_axes[:, 1].copy(),
            reference_forward=reference_axes[:, 2].copy(),
            reference_shoulder_width=width,
        )
        if self.scale_samples:
            self.scale_normalization.calibrate(float(np.median([s[1] for s in self.scale_samples])),
                                               np.median([s[2] for s in self.scale_samples], axis=0))
            self.reference["image_scale"] = float(np.median([s[3] for s in self.scale_samples]))
            self.reference["image_wrist"] = np.median([s[4] for s in self.scale_samples], axis=0)
        self.collecting = False
        self.calibration_state = "CALIBRATED"
        self.calibration_message = "CALIBRATED"
