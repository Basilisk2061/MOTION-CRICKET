import json
import unittest
from transport_health import MotionTransport


class MotionTransportTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.health = MotionTransport(lambda: self.now)

    def pong(self, ack, expected=True):
        ping = self.health.ping()
        self.health.pong({'sequence': ping['sequence'], 'motion': {'epoch': self.health.epoch, 'acknowledged': ack, 'expected': expected}})

    def test_identical_fresh_motion_is_healthy(self):
        for _ in range(100):
            self.now += .1
            payload = json.loads(self.health.wrap('{"type":"controller","position":{"x":1,"y":1,"z":1}}'))
            self.assertEqual(payload['position'], dict(x=1, y=1, z=1))
            self.pong(self.health.sequence)
            self.assertIsNone(self.health.failure())

    def test_healthy_pongs_do_not_mask_motion_stall(self):
        for _ in range(9):
            self.now += 1
            self.health.wrap('{"type":"controller"}')
            self.pong(0)
        self.assertEqual(self.health.failure(), 'Motion delivery stalled')

    def test_absent_game_does_not_stall(self):
        for _ in range(20):
            self.now += 1
            self.health.wrap('{"type":"controller"}')
            self.pong(0, False)
            self.assertIsNone(self.health.failure())

    def test_native_alive_without_application_pong_is_unhealthy(self):
        self.now = 7
        self.assertEqual(self.health.failure(), 'Application heartbeat stale')

    def test_new_connection_has_no_old_sequence_or_ack(self):
        self.health.wrap('{"type":"controller"}')
        new = MotionTransport(lambda: self.now)
        self.assertNotEqual(new.epoch, self.health.epoch)
        self.assertEqual(new.sequence, 0)
        self.assertIsNone(new.pending_at)

    def test_old_pong_cannot_extend_lease(self):
        self.pong(0, False)
        self.now = 7
        self.health.pong({'sequence': 1})
        self.assertEqual(self.health.failure(), 'Application heartbeat stale')

    def test_recovery_resets_epoch_and_old_ack_cannot_change_health(self):
        old = self.health.epoch
        self.health.wrap('{"type":"controller"}')
        self.assertTrue(self.health.reset('b' * 32))
        latest = json.loads(self.health.wrap('{"type":"controller","timestamp":150}'))
        self.assertEqual(latest['_transport']['sequence'], 1)
        self.assertEqual(latest['timestamp'], 150)
        self.pong(0)
        pending = self.health.pending_at
        ping = self.health.ping()
        self.health.pong({'sequence': ping['sequence'], 'motion': {'epoch': old, 'expected': True, 'acknowledged': 999}})
        self.assertEqual(self.health.ack, 0)
        self.assertEqual(self.health.pending_at, pending)


if __name__ == '__main__':
    unittest.main()
