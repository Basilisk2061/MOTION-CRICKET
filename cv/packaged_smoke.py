"""EXE self-test only: native launcher controls and isolated loopback transport."""
import asyncio
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from tracker_protocol import TrackerInstance, parse_join_uri
from transport_health import MotionTransport
from websocket_bridge import WebSocketBridge
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve


async def transport_check():
    bridge = WebSocketBridge()
    health = MotionTransport()
    bridge.latest['controller'] = json.dumps({'type': 'controller', 'timestamp': 150})
    packets = []
    pings = 0
    fresh = 'b' * 32

    async def relay(socket):
        nonlocal pings
        latest = None
        async for payload in socket:
            message = json.loads(payload)
            if message['type'] == 'controller':
                packets.append(message)
                latest = message['_transport']
                if len(packets) == 1:
                    with bridge.lock:
                        bridge.latest['controller'] = json.dumps({'type': 'controller', 'timestamp': 151})
                    await socket.send(json.dumps({'type': 'transport-resync', 'epoch': fresh}))
            elif message['type'] == 'transport-ping':
                pings += 1
                response = {'type': 'transport-pong', 'sequence': message['sequence']}
                if latest:
                    response['motion'] = {**latest, 'acknowledged': latest['sequence'], 'expected': True}
                await socket.send(json.dumps(response))

    async with serve(relay, '127.0.0.1', 0) as server:
        port = server.sockets[0].getsockname()[1]
        async with connect(f'ws://127.0.0.1:{port}') as socket:
            sender = asyncio.create_task(bridge._client(socket, health))
            monitor = asyncio.create_task(bridge._application_health(socket, health))
            try:
                async def finished():
                    while pings < 2 or health.epoch != fresh or health.ack < 1:
                        if sender.done(): sender.result(); raise AssertionError('Sender stopped')
                        if monitor.done(): monitor.result(); raise AssertionError('Heartbeat stopped')
                        await asyncio.sleep(.01)
                await asyncio.wait_for(finished(), 6)
                current = next(m for m in packets if m['_transport']['epoch'] == fresh)
                assert current['timestamp'] == 151 and current['_transport']['sequence'] == 1
            finally:
                bridge.stop.set()
                sender.cancel(); monitor.cancel()
                await asyncio.gather(sender, monitor, return_exceptions=True)
    return {'application_heartbeat': 'PASS: actual monitor exchanged fresh pings/pongs on loopback',
            'transport_health': 'PASS: imported and running inside frozen EXE',
            'recovery': 'PASS: new epoch resent current snapshot; cumulative ACK advanced'}


def launcher_check(app):
    app.camera.current(1)
    assert app.camera.current() == 1
    uri = 'motioncricket://join?session=TPJY8Y'
    assert parse_join_uri(uri) == 'TPJY8Y'
    assert parse_join_uri('motioncricket://join/?session=TPJY8Y') == 'TPJY8Y'
    try:
        parse_join_uri('motioncricket://join?session=ABC123')
    except ValueError:
        pass
    else:
        raise AssertionError('ABC123 must remain invalid')
    app.receive_uri(uri)
    assert app.session.get() == 'TPJY8Y' and app.worker is None
    # Exercise the real button callbacks without opening a webcam or contacting production.
    with patch('threading.Thread') as thread:
        thread.return_value.is_alive.return_value = True
        app.connect_button.invoke()
        assert thread.call_args.kwargs['args'] == ('TPJY8Y', 1)
        thread.return_value.start.assert_called_once()
        app.calibrate_button.invoke()
        assert app.calibrate.is_set()
        app.connect_button.invoke()
        assert app.stop.is_set()
        thread.return_value.is_alive.return_value = False
        app.poll()
        assert str(app.camera.cget('state')) == 'readonly' and app.connect_button.cget('text') == 'CONNECT'
    app.worker = None
    # Real Windows mutex/pipe, isolated from the user's existing tracker and registry.
    with tempfile.TemporaryDirectory(prefix='motion-cricket-smoke-') as folder:
        with patch('tracker_protocol.Path.home', return_value=Path(folder)):
            first = TrackerInstance()
            second = TrackerInstance()
            try:
                assert first.primary and not second.primary
                assert second.forward(uri)
                app.instance = first
                app.session.set('')
                app.poll()
                assert app.session.get() == 'TPJY8Y' and app.worker is None
            finally:
                app.instance = None
                second.close(); first.close()
    return {'camera_selector': 'PASS: Camera 1 selected and forwarded',
            'connect_disconnect': 'PASS: real UI callbacks; worker mocked, no webcam/network',
            'calibration_control': 'PASS: real button sets the existing calibration event',
            'uri': 'PASS: TPJY8Y prefilled; optional slash accepted; ABC123 rejected',
            'no_auto_connect': 'PASS', 'single_instance': 'PASS: real isolated Windows mutex/pipe forwarding'}
