import csv
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

from tracking_3d import LANDMARKS


def flatten(data, tracker):
    row = {name: data[name] for name in (
        "timestamp", "calibrated", "tracking_state", "depth_movement",
        "depth_velocity", "depth_offset", "shoulder_width",
        "camera_depth", "sample_accepted", "outlier_reason", "position_jump",
        "estimated_speed", "fixed_reference_frame",
        "rejection_reason", "raw_wrist_available", "raw_world_available",
    )}
    row["calibration_state"] = tracker.calibration_message
    row["controller"] = "anatomical_right"
    for name in ("residual", "residual_limit", "jump", "jump_limit"):
        row[f"rejection_{name}"] = data["rejection_metrics"].get(name)

    def vector(prefix, value):
        for index, axis in enumerate("xyz"):
            row[f"{prefix}_{axis}"] = None if value is None else value[index]

    for name in ("gameplay", "grip_body", "right_body", "grip_live_body", "grip",
                 "right_velocity", "grip_velocity", "forearm", "shoulder_center",
                 "accepted_right", "right_acceleration"):
        vector(name, data[name])
    for name in LANDMARKS:
        for source in ("raw_world", "image", "world"):
            vector(f"{name}_{source}", data[source].get(name))
        row[f"{name}_confidence"] = data["confidence"].get(name)
    for index, name in enumerate(("right", "up", "forward")):
        vector(f"body_{name}", None if data["axes"] is None else data["axes"][:, index])
        ref = tracker.reference
        vector(f"reference_axis_{name}", None if ref is None else ref["axes"][:, index])
    vector("reference_origin", None if tracker.reference is None else tracker.reference["reference_origin"])
    for key in ("center", "right", "grip", "forearm"):
        vector(f"reference_{key}", None if tracker.reference is None else tracker.reference[key])
    row["reference_width"] = None if tracker.reference is None else tracker.reference["width"]
    return row


class DiagnosticLog:
    def __init__(self, directory=None):
        self.directory = Path(directory) if directory else Path(__file__).with_name("logs")
        self.file = None
        self.writer = None
        self.path = None
        self.frames = 0
        self.error = ""

    def toggle(self):
        if self.file:
            self.close()
            return
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            self.path = self.directory / f"tracking_{datetime.now():%Y%m%d_%H%M%S_%f}.csv"
            self.file = self.path.open("x", newline="", encoding="utf-8")
            self.writer = None
            self.frames = 0
            self.error = ""
            print(f"Diagnostic CSV: {self.path}")
        except OSError as error:
            self.error = f"Logging error: {error}"
            print(self.error)

    def write(self, data, tracker):
        if not self.file:
            return
        try:
            row = flatten(data, tracker)
            if self.writer is None:
                self.writer = csv.DictWriter(self.file, fieldnames=list(row))
                self.writer.writeheader()
            self.writer.writerow(row)
            self.frames += 1
            if self.frames % 30 == 0:
                self.file.flush()
        except OSError as error:
            self.error = f"Logging error: {error}"
            print(self.error)
            self.close()

    def close(self):
        if self.file:
            try:
                self.file.close()
            except OSError as error:
                self.error = f"Logging close error: {error}"
                print(self.error)
        self.file = None
        self.writer = None


def draw_panel(frame, data, tracker, fps, log):
    height = max(680, frame.shape[0])
    panel = np.full((height, 490, 3), (27, 27, 27), dtype=np.uint8)

    def xyz(value):
        return "--" if value is None else "  ".join(f"{v:+.3f}" for v in value)

    speed = data["grip_velocity"]
    lines = [
        f"CONTROLLER: RIGHT HAND    FPS: {fps:.1f}",
        f"RIGHT HAND: {data['tracking_state']}",
        tracker.calibration_message,
        "RIGHT HAND X / Y / Z (shoulder widths)",
        xyz(data["grip_body"]),
        f"RAW WRIST AVAILABLE: {'YES' if data['raw_wrist_available'] else 'NO'} (image)",
        f"VALID WORLD XYZ: {'YES' if data['raw_world_available'] else 'NO'}",
        f"CONFIDENCE: {data['confidence'].get('right_wrist', 0):.3f} / min .25 / high .60",
        f"SAMPLE: {'ACCEPTED' if data['sample_accepted'] else 'REJECTED'}",
        "RIGHT WRIST RAW WORLD XYZ (estimated m)",
        xyz(data["raw_world"].get("right_wrist")),
        "RIGHT HAND SPEED: " + ("--" if speed is None else f"{np.linalg.norm(speed):.3f} est. m/s"),
        "DEPTH: " + data["depth_movement"],
        "Camera Z delta from calibration (+away):",
        "--" if data["depth_offset"] is None else f"{data['depth_offset']:+.3f} shoulder widths",
        "REASON: " + data["rejection_reason"],
        "Low conf includes image/world visibility/presence.",
        "Logging: " + ("ON" if log.file else "OFF"),
        "C calibrate | L log | R reset | D 2D debug",
        "ESC exit",
    ]
    if log.error:
        lines[17] = "Logging failed - see terminal"
    counts = tracker.rejection_counts
    lines += [
        f"Accepted: {counts['ACCEPTED']} | Low confidence: {counts['LOW_CONFIDENCE']}",
        f"Position jump: {counts['POSITION_JUMP']} | Velocity: {counts['VELOCITY_LIMIT']}",
        "Acceleration rejection: 0 (no such gate)",
        f"Missing/invalid: {counts['MISSING_LANDMARK'] + counts['INVALID_3D']}",
        f"Confirming: {counts['CONFIRMING_POSITION']} | Other: {counts['OTHER']}",
    ]
    for index, line in enumerate(lines):
        cv2.putText(panel, line, (12, 25 + index * 25), cv2.FONT_HERSHEY_SIMPLEX,
                    .47, (225, 225, 225), 1, cv2.LINE_AA)
    top, bottom, x = 645, 665, 300
    cv2.line(panel, (x, top), (x, bottom), (180, 180, 180), 2)
    cv2.putText(panel, "AWAY (+world Z)", (12, top + 5),
                cv2.FONT_HERSHEY_SIMPLEX, .46, (220, 220, 220), 1)
    cv2.putText(panel, "TOWARD (-world Z)", (12, bottom + 5),
                cv2.FONT_HERSHEY_SIMPLEX, .46, (220, 220, 220), 1)
    if data["depth_offset"] is not None:
        # Only the marker is clipped; numeric values and CSV are never clipped.
        y = int((top + bottom) / 2 - np.clip(data["depth_offset"], -1, 1) * (bottom - top) / 2)
        cv2.circle(panel, (x, y), 7, (0, 200, 255), -1)
    output = np.zeros((height, frame.shape[1] + panel.shape[1], 3), dtype=np.uint8)
    output[:frame.shape[0], :frame.shape[1]] = frame
    output[:, frame.shape[1]:] = panel
    return output
