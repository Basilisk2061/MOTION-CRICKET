"""Focused non-webcam latest-state transport checks."""
import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import websocket_bridge as transport


class TransportHealthTests(unittest.IsolatedAsyncioTestCase):
    async def test_reconnect_sends_only_latest(self):
        bridge = transport.WebSocketBridge()
        sent = []

        async def send(payload):
            sent.append(payload)
            bridge.stop.set()

        socket = SimpleNamespace(close_code=None, close_reason='', send=send)
        bridge.publish_bat({'type': 'bat', 'timestamp': 1})
        await bridge._client(socket)
        bridge.stop.clear()
        bridge.publish_bat({'type': 'bat', 'timestamp': 2})
        bridge.publish_bat({'type': 'bat', 'timestamp': 3})
        await bridge._client(socket)
        self.assertEqual([transport.json.loads(p)['timestamp'] for p in sent], [1, 3])
        self.assertEqual(bridge.clients, 0)

    async def test_explicit_public_heartbeat(self):
        bridge = transport.WebSocketBridge()
        bridge.relay_url = 'wss://example.com/relay'
        bridge.session = 'K7P4AB'
        class Connection:
            async def __aenter__(self):
                bridge.stop.set()
                return SimpleNamespace(close_code=1000, close_reason='')
            async def __aexit__(self, *args):
                pass
        with patch.object(transport, 'connect', return_value=Connection()) as connect:
            await bridge._public_relay()
        self.assertEqual(connect.call_args.kwargs['ping_interval'], 2)
        self.assertEqual(connect.call_args.kwargs['ping_timeout'], 3)
        self.assertEqual(connect.call_args.kwargs['close_timeout'], .5)


if __name__ == '__main__':
    unittest.main()
