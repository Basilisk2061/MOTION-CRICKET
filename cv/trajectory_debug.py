import cv2
import numpy as np


def draw_trajectory(frame, tracker, data):
    height, width = frame.shape[:2]

    def pixel(point):
        return (int((1 - point[0]) * width), int(point[1] * height))

    trail = list(tracker.image_trail)
    raw = data["raw_wrist_image"]
    if raw is not None:
        center = pixel(raw)
        cv2.rectangle(frame, (center[0] - 5, center[1] - 5),
                      (center[0] + 5, center[1] + 5), (255, 220, 0), 1)
        cv2.putText(frame, "RAW", (center[0] + 8, center[1] + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, .45, (255, 220, 0), 1, cv2.LINE_AA)
    if data["image_position"] is not None:
        center = pixel(data["image_position"])
        color = (40, 240, 80) if data["tracking_state"] == "ACTIVE" else (0, 170, 255)
        cv2.circle(frame, center, 10, color, 3, cv2.LINE_AA)
        cv2.putText(frame, "RIGHT HAND", (center[0] + 12, center[1] - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, .5, color, 1, cv2.LINE_AA)
    if len(trail) > 1:
        vertices = np.array([pixel(point) for point in trail], dtype=np.int32)
        cv2.polylines(frame, [vertices], False, (40, 220, 80), 2, cv2.LINE_AA)
    if not data["sample_accepted"]:
        rejected = raw
        if rejected is not None:
            cv2.drawMarker(frame, pixel(rejected), (0, 70, 255),
                           cv2.MARKER_TILTED_CROSS, 12, 2)
    cv2.putText(frame, "Green: accepted hand trail | Red X: rejected/unavailable 3D",
                (10, height - 15), cv2.FONT_HERSHEY_SIMPLEX, .43,
                (220, 220, 220), 1, cv2.LINE_AA)
