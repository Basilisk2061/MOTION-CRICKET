import copy
import unittest
import numpy as np
from position_3d import BodyScaleNormalization, PositionGuard
from tracking_3d import WorldTracker
from test_tracking_3d import result


class BodyScaleTests(unittest.TestCase):
    def tracker(self):
        tracker = WorldTracker()
        tracker.begin_calibration()
        for i in range(125):
            tracker.update(result(), 1/30, (i+1)/30)
        self.assertIsNotNone(tracker.reference)
        return tracker, 125/30

    def sample(self, scale, shift=(0, 0, 0), metric_world=False):
        source = result(shift=shift)
        source.pose_world_landmarks = copy.deepcopy(source.pose_world_landmarks)
        source.pose_landmarks = copy.deepcopy(source.pose_landmarks)
        for point in source.pose_landmarks[0]:
            point.x *= scale; point.y *= scale; point.z *= scale
        if not metric_world:
            for point in source.pose_world_landmarks[0]:
                point.x *= scale; point.y *= scale; point.z *= scale
        return source

    def settled(self, tracker, timestamp, scale, shift=(0, 0, 0), metric_world=False):
        for _ in range(100):
            timestamp += 1/30
            data = tracker.update(self.sample(scale, shift, metric_world), 1/30, timestamp)
        return timestamp, data

    def test_equivalent_far_close_movement_and_jitter(self):
        values = []
        for scale in (.6, 1.6):
            tracker, t = self.tracker()
            t, _ = self.settled(tracker, t, scale)
            t, data = self.settled(tracker, t, scale, (-.10, -.05, -.08))
            values.append(data['gameplay'])
            for i in range(100):
                t += 1/30
                jitter = np.sin(i)*np.array((.001, .002, .003))
                tracker.update(self.sample(scale, jitter), 1/30, t)
            telemetry = tracker.position_telemetry
            values.append(np.array([telemetry['normalizedJitter'+a] for a in 'XYZ']))
            print('SYNTHETIC scale', scale, 'image body', telemetry['bodyScale'],
                  'raw jitter', [telemetry['rawJitter'+a] for a in 'XYZ'],
                  'normalized jitter', values[-1])
        np.testing.assert_allclose(values[0], values[2], atol=1e-4)
        np.testing.assert_allclose(values[1], values[3], atol=1e-5)

    def test_image_scale_does_not_double_normalize_metric_world(self):
        tracker, t = self.tracker()
        t, far = self.settled(tracker, t, .6, (-.1, -.05, -.08), True)
        t, close = self.settled(tracker, t, 1.6, (-.1, -.05, -.08), True)
        np.testing.assert_allclose(far['gameplay'], close['gameplay'], atol=1e-8)
        self.assertAlmostEqual(tracker.scale_normalization.ratio, 1)

    def test_gradual_change_and_extremes(self):
        n = BodyScaleNormalization(); n.calibrate(.5, np.zeros(3))
        previous = np.zeros(3)
        for i, scale in enumerate(np.linspace(.5, .8, 300)):
            ratio = n.update(scale, i/30)
            p = n.normalize(np.array((.05, .1, -.2))*scale/.5, np.zeros(3))
            if i: self.assertLess(np.linalg.norm(p-previous), .003)
            previous = p
            self.assertTrue(.6 <= ratio <= 1.8)
        for scale in (0, 1e-8, 1e8, np.nan, None):
            for _ in range(50):
                i += 1; n.update(scale, i/30)
            self.assertTrue(.6 <= n.ratio <= 1.8)
            self.assertTrue(np.all(np.isfinite(n.normalize(np.ones(3), None))))

    def test_fast_movement_and_no_cross_axis_noise_response(self):
        for scale in (.6, 1.6):
            n = BodyScaleNormalization(); n.calibrate(.5, np.zeros(3))
            for i in range(100): n.update(.5*scale, i/30)
            guard = PositionGuard(); guard.update(np.zeros(3), 1, 0, .4)
            measured = n.normalize(np.array((.2, -.1, .1))*scale, np.zeros(3))
            output, accepted, _, _ = guard.update(measured, 1, 1/30, .4)
            self.assertTrue(accepted); np.testing.assert_allclose(output, (.2, -.1, .1), atol=.001)
        quiet, noisy = PositionGuard(), PositionGuard()
        for i in range(30):
            quiet.update(np.array((.001*np.sin(i), 0, 0)), 1, i/30, .4)
            noisy.update(np.array((.001*np.sin(i), 0, .15*np.sin(i))), 1, i/30, .4)
            np.testing.assert_allclose(quiet.position[:2], noisy.position[:2], atol=1e-12)


if __name__ == '__main__': unittest.main()
