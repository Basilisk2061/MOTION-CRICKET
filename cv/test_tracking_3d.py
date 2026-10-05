import csv
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

import numpy as np

from tracking_3d import LANDMARKS, WorldTracker
from depth_diagnostics import DiagnosticLog, draw_panel


def result(shift=(0, 0, 0), angle=0, missing=False):
    positions = {
        "left_shoulder": (.2, -.5, 0), "right_shoulder": (-.2, -.5, 0),
        "left_elbow": (.2, -.3, -.1), "right_elbow": (-.2, -.3, -.1),
        "left_wrist": (.02, -.3, -.4), "right_wrist": (-.02, -.3, -.4),
        "left_hip": (.15, 0, 0), "right_hip": (-.15, 0, 0),
    }
    c, s = np.cos(angle), np.sin(angle)
    rotation = np.array(((c, 0, s), (0, 1, 0), (-s, 0, c)))
    points = [SimpleNamespace(x=0, y=0, z=0, visibility=1, presence=1) for _ in range(33)]
    for name, index in LANDMARKS.items():
        value = np.array(positions[name])
        if "wrist" in name:
            value += shift
        value = rotation @ value
        points[index] = SimpleNamespace(
            x=value[0], y=value[1], z=value[2], visibility=1, presence=1
        )
    return SimpleNamespace(pose_landmarks=[points], pose_world_landmarks=[] if missing else [points])


class WorldTests(unittest.TestCase):
    def setUp(self):
        self.tracker = WorldTracker()
        self.t = 0

    def step(self, source=None):
        self.t += 1 / 30
        return self.tracker.update(result() if source is None else source, 1 / 30, self.t)

    def calibrate(self):
        self.tracker.begin_calibration()
        for _ in range(125):
            data = self.step()
        self.assertEqual(data["calibrated"], 1)
        return data

    def test_countdown_excludes_keyboard_pose(self):
        self.tracker.begin_calibration()
        for _ in range(80):
            self.step(result(shift=(.5, .5, .5)))
            self.assertEqual(self.tracker.calibration_state, "COUNTDOWN")
            self.assertEqual(len(self.tracker.samples), 0)
        for _ in range(80):
            self.step()
        self.assertEqual(self.tracker.calibration_state, "CALIBRATED")
        np.testing.assert_allclose(self.tracker.reference["right"], (-.02, -.3, -.4), atol=.02)
        self.assertIn("right_elbow", self.tracker.reference)

    def test_reference_and_signs(self):
        data = self.calibrate()
        np.testing.assert_allclose(data["grip_body"], 0, atol=1e-10)
        np.testing.assert_allclose(data["axes"].T @ data["axes"], np.eye(3), atol=1e-10)
        for _ in range(30):
            data = self.step(result(shift=(-.1, -.1, -.1)))
        self.assertTrue(np.all(data["grip_body"] > .2))
        self.assertLess(data["depth_offset"], -.2)

    def test_depth_toward_away_static(self):
        self.calibrate()
        for i in range(20):
            data = self.step(result(shift=(0, 0, -.01 * i)))
        self.assertEqual(data["depth_movement"], "TOWARD CAMERA")
        for i in range(20):
            data = self.step(result(shift=(0, 0, -.19 + .01 * i)))
        self.assertEqual(data["depth_movement"], "AWAY FROM CAMERA")
        for _ in range(40):
            data = self.step()
        self.assertEqual(data["depth_movement"], "STABLE")

    def test_missing_release_reset(self):
        self.calibrate()
        data = self.step(result(missing=True))
        self.assertIsNotNone(data["grip"])
        self.assertFalse(data["sample_accepted"])
        for _ in range(10):
            data = self.step(result(missing=True))
        self.assertIsNone(data["grip"])
        self.tracker.reset()
        self.assertIsNone(self.tracker.reference)

    def test_rotation_and_raw_outlier_preserved(self):
        self.calibrate()
        for angle in np.linspace(0, .5, 60):
            data = self.step(result(angle=angle))
        np.testing.assert_allclose(data["grip_live_body"], 0, atol=.015)
        data = self.step(result(shift=(0, 0, 2)))
        self.assertGreater(data["raw_world"]["right_wrist"][2], 1)

    def test_unstable_calibration_and_missing_right(self):
        self.tracker.begin_calibration()
        for _ in range(50):
            self.step(result(missing=True))
        self.assertIsNone(self.tracker.reference)
        for i in range(80):
            self.step(result(shift=(0, 0, .3 * np.sin(i * .3))))
        self.assertIsNone(self.tracker.reference)

    def test_csv_and_panel(self):
        data = self.calibrate()
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            log = DiagnosticLog(directory)
            log.toggle()
            log.write(data, self.tracker)
            for _ in range(10):
                missing = self.step(result(missing=True))
            log.write(missing, self.tracker)
            log.close()
            with log.path.open(newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[1]["grip_body_x"], "")
            self.assertIn("right_wrist_raw_world_z", rows[0])
            panel = draw_panel(np.zeros((480, 640, 3), np.uint8),
                               data, self.tracker, 30, log)
            self.assertEqual(panel.shape, (680, 1130, 3))

    def test_side_on_cover_drive_fixed_frame_and_spike(self):
        self.tracker.begin_calibration()
        for _ in range(125):
            data = self.step(result(angle=1.3))
        self.assertEqual(data["calibrated"], 1)
        origin = self.tracker.reference["reference_origin"].copy()
        axes = self.tracker.reference["axes"].copy()
        previous = data["gameplay"].copy()
        for i in range(60):
            phase = i / 59
            source = result(shift=(-.20 * phase, -.08 * np.sin(phase * np.pi),
                                   -.25 * phase), angle=1.3 - .7 * phase)
            data = self.step(source)
            self.assertTrue(data["sample_accepted"])
            self.assertLess(np.linalg.norm(data["gameplay"] - previous), .12)
            np.testing.assert_array_equal(self.tracker.reference["axes"], axes)
            np.testing.assert_array_equal(self.tracker.reference["reference_origin"], origin)
            previous = data["gameplay"].copy()
        spike = result(shift=(-.2, 0, -.25), angle=.6)
        spike.pose_world_landmarks[0][16].z += 4
        data = self.step(spike)
        self.assertFalse(data["sample_accepted"])
        self.assertIn("implausible", data["outlier_reason"])
        self.assertLess(np.linalg.norm(data["gameplay"] - previous), .2)
        for _ in range(4):
            data = self.step(result(shift=(-.2, 0, -.25), angle=.6))
        self.assertTrue(data["sample_accepted"])

    def test_live_torso_cannot_move_gameplay(self):
        self.calibrate()
        before = self.step()["gameplay"].copy()
        sample = result()
        for name in ("left_shoulder", "right_shoulder", "left_hip", "right_hip"):
            sample.pose_world_landmarks[0][LANDMARKS[name]].visibility = 0
        for _ in range(10):
            data = self.step(sample)
        self.assertTrue(data["sample_accepted"])
        self.assertIsNone(data["axes"])
        np.testing.assert_allclose(data["gameplay"], before, atol=1e-9)

    def test_camera_depth_not_side_on_forward(self):
        self.tracker.begin_calibration()
        for _ in range(125):
            self.step(result(angle=np.pi / 2))
        for i in range(20):
            data = self.step(result(shift=(0, 0, -.005 * i), angle=np.pi / 2))
        self.assertGreater(data["gameplay"][2], .15)
        self.assertAlmostEqual(data["camera_depth"], 0, places=6)


if __name__ == "__main__":
    unittest.main()
