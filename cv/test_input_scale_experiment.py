import copy
from types import SimpleNamespace
import unittest

import numpy as np
from mediapipe.tasks.python.components.containers.landmark import NormalizedLandmark

from input_scale_experiment import SCALES, StationaryJitter, prepare_input
from tracking_3d import WorldTracker
from test_tracking_3d import result


def padded_result(source, transform):
    padded = copy.copy(source)
    padded.pose_landmarks = copy.deepcopy(source.pose_landmarks)
    for pose in padded.pose_landmarks:
        for p in pose:
            p.x = (p.x * transform.scaled_width + transform.pad_x) / transform.width
            p.y = (p.y * transform.scaled_height + transform.pad_y) / transform.height
            p.z *= transform.scaled_width / transform.width
    return padded


class InputScaleTests(unittest.TestCase):
    def test_identity(self):
        frame = np.arange(120*160*3, dtype=np.uint8).reshape(120, 160, 3)
        canvas, transform = prepare_input(frame, 1.0)
        self.assertIs(canvas, frame)
        source = result()
        self.assertIs(transform.restore(source), source)

    def test_canvas_aspect_center_and_full_fov(self):
        for h, w in ((720, 1280), (481, 641)):
            frame = np.full((h, w, 3), 90, dtype=np.uint8)
            frame[:20, :20] = (255, 0, 0)
            frame[:20, -20:] = (0, 255, 0)
            frame[-20:, :20] = (0, 0, 255)
            frame[-20:, -20:] = (255, 255, 255)
            for scale in SCALES[1:]:
                with self.subTest(size=(w, h), scale=scale):
                    canvas, t = prepare_input(frame, scale)
                    self.assertEqual(canvas.shape, frame.shape)
                    self.assertEqual((t.scaled_width, t.scaled_height), (round(w*scale), round(h*scale)))
                    self.assertLessEqual(abs(t.scaled_width/w - t.scaled_height/h), 1/min(w, h))
                    self.assertLessEqual(abs(t.pad_x - (w-t.scaled_width-t.pad_x)), 1)
                    self.assertLessEqual(abs(t.pad_y - (h-t.scaled_height-t.pad_y)), 1)
                    roi = canvas[t.pad_y:t.pad_y+t.scaled_height, t.pad_x:t.pad_x+t.scaled_width]
                    for point, value in ((roi[0, 0], frame[0, 0]), (roi[0, -1], frame[0, -1]),
                                         (roi[-1, 0], frame[-1, 0]), (roi[-1, -1], frame[-1, -1])):
                        np.testing.assert_array_equal(point, value)
                    mask = canvas.copy()
                    mask[t.pad_y:t.pad_y+t.scaled_height, t.pad_x:t.pad_x+t.scaled_width] = 0
                    self.assertFalse(mask.any())

    def test_inverse_coordinates_and_world_unchanged(self):
        source = SimpleNamespace(pose_landmarks=[[NormalizedLandmark(x=x, y=y, z=-.2, visibility=.9)
                                for x, y in ((0, 0), (1, 1), (.23, .71))]],
                                pose_world_landmarks=[[object()]])
        for scale in SCALES:
            _, t = prepare_input(np.zeros((481, 641, 3), np.uint8), scale)
            restored = t.restore(padded_result(source, t))
            self.assertIs(restored.pose_world_landmarks, source.pose_world_landmarks)
            for actual, expected in zip(restored.pose_landmarks[0], source.pose_landmarks[0]):
                np.testing.assert_allclose((actual.x, actual.y, actual.z), (expected.x, expected.y, expected.z), atol=1e-14)
                self.assertEqual(actual.visibility, .9)

    def test_identical_world_measurements_keep_controller_sensitivity(self):
        baseline = None
        for scale in SCALES:
            _, transform = prepare_input(np.zeros((720, 1280, 3), np.uint8), scale)
            tracker = WorldTracker()
            tracker.begin_calibration()
            outputs = []
            for i in range(155):
                source = result(shift=(0, 0, 0) if i < 125 else (-.08, -.04, -.06))
                tracker.update(transform.restore(padded_result(source, transform)), 1/30, (i+1)/30)
                if i >= 125:
                    outputs.append(tracker.controller.position_xyz)
            if baseline is None:
                baseline = outputs
            np.testing.assert_allclose(outputs, baseline, atol=1e-12)

    def test_jitter_is_measurement_only_and_excludes_movement(self):
        diagnostic = StationaryJitter()
        controller = SimpleNamespace(sample_accepted=True, position_xyz=(0, 0, 0))
        for i in range(25):
            p = .001*np.sin(i)
            telemetry = {prefix+a: p for prefix in ('rawDelta', 'normalizedDelta') for a in 'XYZ'}
            controller.position_xyz = (p/2, p/2, p/2)
            diagnostic.update(telemetry, controller)
            self.assertEqual(controller.position_xyz, (p/2, p/2, p/2))
        self.assertEqual(len(diagnostic.steps), 15)
        self.assertIn('OUTPUT jitter XYZ', diagnostic.lines()[1])
        diagnostic.update({prefix+a: 1 for prefix in ('rawDelta', 'normalizedDelta') for a in 'XYZ'}, controller)
        self.assertEqual(len(diagnostic.steps), 0)


if __name__ == '__main__':
    unittest.main()
