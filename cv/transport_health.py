"""Production-only motion delivery evidence, independent of CV sample values."""
import json
import time
import uuid


class MotionTransport:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.epoch = uuid.uuid4().hex
        self.sequence = self.ack = 0
        self.ping_sequence = self.pong_sequence = 0
        self.heartbeat_at = self.sent_at = clock()
        self.pending_at = None
        self.expected = False

    def wrap(self, payload):
        self.sequence += 1
        self.sent_at = self.clock()
        message = json.loads(payload)
        message['_transport'] = {'epoch': self.epoch, 'sequence': self.sequence}
        return json.dumps(message, separators=(',', ':'), allow_nan=False)

    def reset(self, epoch):
        if not isinstance(epoch, str) or len(epoch) != 32 or any(c not in '0123456789abcdef' for c in epoch):
            return False
        if epoch == self.epoch:
            return False
        self.epoch = epoch
        self.sequence = self.ack = 0
        self.expected = False
        self.pending_at = None
        self.sent_at = self.clock()
        return True

    def ping(self):
        self.ping_sequence += 1
        message = {'type': 'transport-ping', 'sequence': self.ping_sequence}
        if self.sequence:
            message['motion'] = {'epoch': self.epoch, 'sequence': self.sequence}
        return message

    def pong(self, message):
        sequence = message.get('sequence')
        if not isinstance(sequence, int) or not self.pong_sequence < sequence <= self.ping_sequence:
            return
        self.pong_sequence = sequence
        self.heartbeat_at = self.clock()
        motion = message.get('motion') or {}
        if motion.get('epoch') and motion['epoch'] != self.epoch:
            return # Prior recovery ACKs cannot alter current-epoch motion health.
        self.expected = motion.get('expected') is True and motion.get('epoch') == self.epoch
        ack = motion.get('acknowledged', 0)
        if self.expected and isinstance(ack, int) and self.ack < ack <= self.sequence:
            self.ack = ack
            self.pending_at = None
        if self.expected and self.sequence > self.ack:
            if self.pending_at is None:
                self.pending_at = self.clock()
        else:
            self.pending_at = None

    def failure(self):
        now = self.clock()
        if now - self.heartbeat_at > 6:
            return 'Application heartbeat stale'
        if self.pending_at is not None and now - self.pending_at > 6 and now - self.sent_at < 6:
            return 'Motion delivery stalled'
        return None
