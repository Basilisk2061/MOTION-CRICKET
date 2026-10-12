"""EXE self-test only: native launcher controls and isolated loopback transport."""
import asyncio
import json
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from tracker_protocol import TrackerInstance, parse_join_uri
from transport_health import MotionTransport, MOTION_TIMEOUT, retry_delay
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


async def resilience_check():
    """Exercise the frozen bridge's real reconnect loop against an isolated relay."""
    import websocket_bridge as module
    bridge = WebSocketBridge()
    bridge.relay_url, bridge.session = 'wss://example.com/relay', 'TPJY8Y'
    attempts, failures, owners = [], [], []
    progress = []
    original_connect = module.connect
    assert MOTION_TIMEOUT == 1
    assert [retry_delay(n) for n in range(7)] == [0, .25, .5, 1, 2, 2, 2]

    def diagnostic(message):
        if message in ('Motion delivery stalled', 'Application heartbeat stale'):
            failures.append((time.monotonic(), message))
    bridge._debug = diagnostic

    async def relay(socket):
        latest, ack, started = None, 0, time.monotonic()
        connection = len(attempts)
        try:
            async for payload in socket:
                m = json.loads(payload)
                if m['type'] == 'controller':
                    latest = m['_transport']
                elif m['type'] == 'transport-ping':
                    elapsed = time.monotonic()-started
                    if connection == 7 and elapsed > .35:
                        continue  # Native socket stays OPEN; application responses stop.
                    if latest:
                        if elapsed < .35 or connection == 8:
                            ack = latest['sequence']
                            progress.append((connection, ack))
                        await socket.send(json.dumps({'type':'transport-pong','sequence':m['sequence'],
                            'motion':{**latest,'acknowledged':ack,'expected':True}}))
                        if connection == 8 and ack:
                            bridge.stop.set()
                    else:
                        await socket.send(json.dumps({'type':'transport-pong','sequence':m['sequence']}))
        except module.ConnectionClosed:
            pass

    async with serve(relay, '127.0.0.1', 0) as server:
        port = server.sockets[0].getsockname()[1]
        def connect_local(target, **options):
            attempts.append(time.monotonic())
            query = parse_qs(urlsplit(target).query)
            owners.append((query['owner'][0], int(query['generation'][0])))
            if 2 <= len(attempts) <= 6:
                raise OSError('Intentional packaged retry fault')
            return original_connect(f'ws://127.0.0.1:{port}', **options)
        async def publish():
            while not bridge.stop.is_set():
                with bridge.lock:
                    bridge.latest['controller'] = json.dumps({'type':'controller','timestamp':time.monotonic()})
                bridge._notify()
                await asyncio.sleep(1/30)
        publisher = asyncio.create_task(publish())
        try:
            with patch.object(module, 'connect', side_effect=connect_local):
                await asyncio.wait_for(bridge._public_relay(), 20)
        finally:
            bridge.stop.set(); publisher.cancel()
            await asyncio.gather(publisher, return_exceptions=True)
    assert len(attempts) == 8 and len(failures) == 2
    assert failures[0][1] == 'Motion delivery stalled'
    assert failures[1][1] == 'Application heartbeat stale'
    assert attempts[1]-failures[0][0] < .25, 'First reconnect must not add a one-second delay'
    assert attempts[7]-failures[1][0] < .25, 'Fresh ACK progress must reset retry backoff'
    for index, expected in enumerate([.25,.5,1,2,2], start=2):
        delay = attempts[index]-attempts[index-1]
        assert expected-.03 <= delay < expected+.3, (index, delay)
    assert len({owner for owner, _ in owners}) == 1
    assert [generation for _, generation in owners] == list(range(1,9))
    assert any(connection == 7 for connection, _ in progress)
    health = MotionTransport(lambda: 0)
    old = health.epoch
    health.wrap('{"type":"controller"}')
    health.reset('b'*32); health.wrap('{"type":"controller"}')
    ping = health.ping()
    health.pong({'sequence':ping['sequence'],'motion':{'epoch':old,'expected':True,'acknowledged':999}})
    assert health.ack == 0
    return {'producer_watchdog':'PASS: actual bundled ACK watchdog retired stalled delivery',
            'open_but_dead':'PASS: OPEN socket with missing application pongs retired',
            'immediate_reconnect':'PASS: real retry loop, first replacement under 250ms',
            'retry_backoff':'PASS: 250/500/1000ms then bounded at 2000ms',
            'backoff_reset':'PASS: fresh ACK progress restored immediate replacement',
            'generation':'PASS: stable owner, increasing generations, old epoch ACK ignored'}


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
