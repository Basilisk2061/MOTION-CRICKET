from pathlib import Path
from dataclasses import replace
import time
import sys

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from tracking_3d import WorldTracker
from depth_diagnostics import DiagnosticLog
from websocket_bridge import WebSocketBridge
from marker_tracker import MarkerTracker
from input_scale_experiment import SCALES, prepare_input, StationaryJitter


MODEL_PATH = Path(__file__).with_name("pose_landmarker_lite.task")
WINDOW_NAME = "Motion Cricket - Bat Tracking"
ARM_LANDMARKS = {
    "left_shoulder": int(vision.PoseLandmark.LEFT_SHOULDER),
    "right_shoulder": int(vision.PoseLandmark.RIGHT_SHOULDER),
    "left_elbow": int(vision.PoseLandmark.LEFT_ELBOW),
    "right_elbow": int(vision.PoseLandmark.RIGHT_ELBOW),
    "left_wrist": int(vision.PoseLandmark.LEFT_WRIST),
    "right_wrist": int(vision.PoseLandmark.RIGHT_WRIST),
}
WRIST_IDS = {ARM_LANDMARKS["left_wrist"], ARM_LANDMARKS["right_wrist"]}


def to_pixel(position, width, height):
    return int(position[0] * width), int(position[1] * height)


def draw_raw_pose(frame, landmarks):
    height, width = frame.shape[:2]
    for connection in vision.PoseLandmarksConnections.POSE_LANDMARKS:
        start = landmarks[connection.start]
        end = landmarks[connection.end]
        if start.visibility >= 0.5 and end.visibility >= 0.5:
            start_point = (int(start.x * width), int(start.y * height))
            end_point = (int(end.x * width), int(end.y * height))
            cv2.line(frame, start_point, end_point, (70, 120, 70), 1)
    for landmark in landmarks:
        if landmark.visibility >= 0.5:
            point = (int(landmark.x * width), int(landmark.y * height))
            cv2.circle(frame, point, 2, (160, 160, 160), -1)


def draw_smoothed_arms(frame, points):
    height, width = frame.shape[:2]
    arm_connections = (
        ("left_shoulder", "left_elbow"),
        ("left_elbow", "left_wrist"),
        ("right_shoulder", "right_elbow"),
        ("right_elbow", "right_wrist"),
        ("left_shoulder", "right_shoulder"),
    )
    for first, second in arm_connections:
        a = points[ARM_LANDMARKS[first]].position
        b = points[ARM_LANDMARKS[second]].position
        if a is not None and b is not None:
            cv2.line(frame, to_pixel(a, width, height), to_pixel(b, width, height), (0, 255, 255), 3)
    for landmark_id in ARM_LANDMARKS.values():
        point = points[landmark_id]
        if point.position is not None:
            color = (0, 140, 255) if point.predicted else (0, 255, 255)
            cv2.circle(frame, to_pixel(point.position, width, height), 7, color, -1)


def draw_bat(frame, pose):
    # Local X crosses the blade; local Y runs from handle to toe.
    basis = np.array((
        (-pose.direction[1], pose.direction[0]), pose.direction
    ))

    def transform(vertices):
        return np.rint(
            np.asarray(vertices) @ basis * pose.bat_length + pose.grip
        ).astype(np.int32)

    def polygon(vertices, color):
        shape = transform(vertices)
        cv2.fillConvexPoly(frame, shape, color, lineType=cv2.LINE_AA)
        cv2.polylines(frame, [shape], True, (45, 40, 35), 2, cv2.LINE_AA)

    polygon([(-.019, -.06), (.019, -.06), (.019, .29), (-.019, .29)],
            (65, 65, 75))
    for offset in np.linspace(-.04, .25, 10):
        ends = transform([(-.019, offset), (.019, offset + .012)])
        cv2.line(frame, tuple(ends[0]), tuple(ends[1]), (160, 160, 165), 1, cv2.LINE_AA)
    wood = (160, 205, 235) if pose.state == "ACTIVE" else (110, 165, 205)
    polygon([(-.019, .27), (.019, .27), (.067, .35), (.075, .91),
             (.059, .97), (-.059, .97), (-.075, .91), (-.067, .35)], wood)
    polygon([(-.045, .40), (.045, .40), (.046, .50), (-.046, .50)], (60, 80, 180))
    toe = transform([(-.059, .95), (.059, .95)])
    cv2.line(frame, tuple(toe[0]), tuple(toe[1]), (75, 70, 65), 3, cv2.LINE_AA)
    cv2.circle(frame, tuple(pose.grip.astype(int)), 4, (255, 255, 255), -1)


def draw_direction_debug(frame, pose):
    grip = pose.grip.astype(int)
    raw_tip = (pose.grip + pose.raw_direction * 90).astype(int)
    final_tip = (pose.grip + pose.direction * 110).astype(int)
    cv2.arrowedLine(frame, tuple(grip), tuple(raw_tip), (0, 140, 255), 2, tipLength=0.18)
    cv2.arrowedLine(frame, tuple(grip), tuple(final_tip), (0, 255, 0), 2, tipLength=0.18)
    velocity_tip = (pose.grip + pose.grip_velocity * 0.12).astype(int)
    cv2.arrowedLine(frame, tuple(grip), tuple(velocity_tip), (255, 160, 30), 2)


def main():
    if sys.platform == "win32":
        import ctypes
        # Use physical pixels for HighGUI windows and mouse events on scaled displays.
        try:
            ctypes.windll.user32.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
            ctypes.windll.user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
            if not ctypes.windll.user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4)):
                raise OSError("Could not enable per-monitor DPI awareness")
        except (AttributeError, OSError):
            ctypes.windll.user32.SetProcessDPIAware()
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Pose model not found: {MODEL_PATH}")

    camera = cv2.VideoCapture(0)
    if not camera.isOpened():
        camera.release()
        raise RuntimeError("Could not open the default webcam (camera index 0).")
    print(f"Camera: {camera.getBackendName()} / {camera.get(cv2.CAP_PROP_FRAME_WIDTH):.0f}x"
          f"{camera.get(cv2.CAP_PROP_FRAME_HEIGHT):.0f} / reported {camera.get(cv2.CAP_PROP_FPS):.1f} FPS / "
          f"buffer {camera.get(cv2.CAP_PROP_BUFFERSIZE):.0f}; properties unchanged")

    options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    world_tracker = WorldTracker()
    diagnostic_log = DiagnosticLog()
    previous_time = time.perf_counter()
    fps = 0.0
    debug_enabled = False
    bridge = WebSocketBridge()
    markers = MarkerTracker()
    last_timestamp_ms = -1
    input_scale_index = 0
    jitter = StationaryJitter()

    try:
        bridge.start()
        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            while True:
                read_started = time.perf_counter()
                success, frame = camera.read()
                read_ms = (time.perf_counter() - read_started) * 1000
                if not success:
                    print("Could not read a frame from the webcam.")
                    break

                now = time.perf_counter()
                dt = now - previous_time
                previous_time = now
                current_fps = 1.0 / max(dt, 1e-6)
                fps = current_fps if fps == 0.0 else 0.9 * fps + 0.1 * current_fps

                inference_frame, input_transform = prepare_input(frame, SCALES[input_scale_index])
                rgb_frame = cv2.cvtColor(inference_frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                timestamp_ms = max(last_timestamp_ms + 1, int(now * 1000))
                last_timestamp_ms = timestamp_ms
                inference_started = time.perf_counter()
                result = landmarker.detect_for_video(mp_image, timestamp_ms)
                inference_ms = (time.perf_counter() - inference_started) * 1000
                result = input_transform.restore(result)
                # Publish wrist state before marker processing and debug rendering.
                world_data = world_tracker.update(result, dt, now)
                telemetry = {"captureHz": round(fps, 1), "inferenceHz": round(fps, 1),
                             "inferenceMs": round(inference_ms, 1), "readMs": round(read_ms, 1),
                             "processingMs": round((time.perf_counter() - now) * 1000, 1),
                             "sendHz": round(bridge.send_hz, 1)}
                telemetry.update(world_tracker.position_telemetry)
                jitter.update(world_tracker.position_telemetry, world_tracker.controller)
                bridge.publish(world_tracker.controller, world_tracker.reference is not None, telemetry)
                # Restore original image coordinates before mirroring the display.
                frame = cv2.flip(frame, 1)
                marker_message = markers.update(frame, now)
                bridge.publish_bat(marker_message)

                if result.pose_landmarks:
                    landmarks = [replace(point, x=1.0 - point.x)
                                 for point in result.pose_landmarks[0]]
                    if debug_enabled:
                        draw_raw_pose(frame, landmarks)
                    for name in ("right_shoulder", "right_elbow", "right_wrist"):
                        landmark_id = ARM_LANDMARKS[name]
                        landmark = landmarks[landmark_id]
                        if np.isfinite(landmark.x) and np.isfinite(landmark.y):
                            point = to_pixel((landmark.x, landmark.y), frame.shape[1], frame.shape[0])
                            color = (0, 255, 255) if name == "right_wrist" else (255, 180, 0)
                            cv2.circle(frame, point, 7 if name == "right_wrist" else 4, color, 2)
                            if name == "right_wrist":
                                cv2.putText(frame, "RAW RIGHT WRIST", (point[0]+9, point[1]),
                                            cv2.FONT_HERSHEY_SIMPLEX, .4, (0, 255, 255), 1)

                diagnostic_log.write(world_data, world_tracker)
                display = frame
                controller = world_tracker.controller
                grip_image = world_data.get("grip_image")
                if grip_image is not None:
                    point = to_pixel((1-grip_image[0], grip_image[1]), display.shape[1], display.shape[0])
                    cv2.drawMarker(display, point, (255, 0, 255), cv2.MARKER_CROSS, 18, 2)
                    cv2.putText(display, "GRIP (image proxy)", (point[0]+10, point[1]+16),
                                cv2.FONT_HERSHEY_SIMPLEX, .4, (255, 0, 255), 1)
                source = world_data.get("grip_status", "LOST")
                def xyz(value):
                    return "--" if value is None else " ".join(f"{v:+.3f}" for v in value)
                lines = [f"RIGHT HAND: {source} / {world_data.get('arm_reason', 'NONE')}",
                         f"RAW wrist (m): {xyz(world_data['raw_world'].get('right_wrist'))}",
                         f"OUTPUT GRIP (m): {xyz(world_data['grip'])}",
                         f"Calibration: {controller.calibration_state} | C calibrate / R reset / D pose / ESC exit"]
                calibration_hint = "" if world_tracker.reference is not None else " | press C to recalibrate"
                lines.append(f"CV INPUT SCALE: {SCALES[input_scale_index]*100:.0f}% | I cycle 100/85/70/60{calibration_hint}")
                lines.extend(jitter.lines())
                body_scale = world_tracker.position_telemetry.get("bodyScale")
                lines.append("Body scale: " + ("--" if body_scale is None else f"{body_scale:.4f}"))
                for index, line in enumerate(lines):
                    cv2.putText(display, line, (10, 48+index*22), cv2.FONT_HERSHEY_SIMPLEX,
                                .45, (255, 255, 255), 1, cv2.LINE_AA)
                cv2.putText(display, f"Capture/output {fps:.1f} Hz | Infer {inference_ms:.1f} ms | WS {bridge.send_hz:.1f} Hz", 
                            (10, 24), cv2.FONT_HERSHEY_SIMPLEX, .50, (255, 255, 255), 1, cv2.LINE_AA)
                cv2.imshow(WINDOW_NAME, display)
                key = cv2.waitKey(1) & 0xFF
                if key == 27:
                    break
                if key in (ord("i"), ord("I")):
                    input_scale_index = (input_scale_index + 1) % len(SCALES)
                    world_tracker.reset()
                    jitter = StationaryJitter()
                    print(f"CV INPUT SCALE: {SCALES[input_scale_index]*100:.0f}% - press C to recalibrate")
                if key in (ord("r"), ord("R")):
                    bounds = markers.bounds
                    if markers.debug:
                        markers.toggle_debug()
                    markers = MarkerTracker()
                    markers.bounds = bounds
                    world_tracker.reset()
                    jitter = StationaryJitter()
                if key in (ord("c"), ord("C")):
                    markers.begin_calibration(now)
                    world_tracker.begin_calibration()
                    jitter = StationaryJitter()
                if key in (ord("l"), ord("L")):
                    diagnostic_log.toggle()
                if key in (ord("d"), ord("D")):
                    debug_enabled = not debug_enabled
                if key in (ord("m"), ord("M")):
                    markers.toggle_debug()
                if key in (ord("p"), ord("P")):
                    markers.print_bounds()
                if key in (ord("1"), ord("2")):
                    markers.select_sample(key - ord("1"))
    finally:
        bridge.close()
        diagnostic_log.close()
        camera.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, RuntimeError) as error:
        print(f"Error: {error}")
        raise SystemExit(1)
