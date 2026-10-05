"""Latest-state-only local bridge. No network I/O runs on the CV thread."""
import asyncio
import json
import math
import os
import re
import threading
import time

from websockets.asyncio.server import serve
from websockets.asyncio.client import connect
from urllib.parse import urlsplit, urlunsplit, urlencode
from websockets.exceptions import ConnectionClosed


def controller_json(controller, calibrated, telemetry=None):
    def number(value):
        if value is None:
            return None
        value = float(value)
        return value if math.isfinite(value) else None

    def vector(value):
        return None if value is None else dict(zip("xyz", map(number, value)))

    return json.dumps({
        "type": "controller",
        "timestamp": number(controller.timestamp),
        "calibrated": bool(calibrated),
        "calibrationState": getattr(controller, "calibration_state", "NOT_CALIBRATED"),
        "calibrationCountdown": getattr(controller, "calibration_countdown", 0),
        "state": controller.state,
        "position": vector(controller.position_xyz),
        "velocity": vector(controller.velocity_xyz),
        "speed": number(controller.speed),
        "forearmDirection": vector(controller.forearm_direction_xyz),
        "referenceForearmDirection": vector(getattr(controller, "reference_forearm_xyz", None)),
        "cameraDepth": number(controller.camera_depth),
        "confidence": number(controller.tracking_confidence),
        "sampleAccepted": bool(getattr(controller, "sample_accepted", False)),
        "trackingSource": getattr(controller, "tracking_source", "WRIST"),
        "lastReliableTimestamp": number(getattr(controller, "last_reliable_timestamp", None)),
        "telemetry": telemetry or {},
    }, separators=(",", ":"), allow_nan=False)


class WebSocketBridge:
    def __init__(self, port=8765):
        self.port = port
        self.relay_url = os.environ.get("MOTION_RELAY_URL", "")
        self.session = os.environ.get("MOTION_SESSION", "").upper()
        self.latest = {}
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.clients = 0
        self.send_hz = 0.0
        self.loop = None
        self.wake_events = set()
        self.debug = os.environ.get('MOTION_DEBUG') == '1'
        self.debug_output_at = self.debug_send_at = None
        self.debug_outputs = self.debug_sends = self.debug_timeouts = 0
        self.thread = threading.Thread(target=self._run, daemon=True)

    def _debug(self, text):
        if self.debug:
            print(f'[{time.strftime("%Y-%m-%dT%H:%M:%S%z")}] TRACKER {text}', flush=True)

    def start(self):
        self.thread.start()

    def publish(self, controller, calibrated, telemetry=None):
        if controller is None:
            return
        payload = controller_json(controller, calibrated, telemetry)
        with self.lock:
            self.latest['controller'] = payload
            if self.debug:
                self.debug_outputs += 1
                self.debug_output_at = time.perf_counter()
        self._wake()

    def publish_bat(self, message):
        payload = json.dumps(message, separators=(",", ":"), allow_nan=False)
        with self.lock:
            self.latest['bat'] = payload
        self._wake()

    def _wake(self):
        if self.loop is not None and not self.loop.is_closed():
            try:
                self.loop.call_soon_threadsafe(self._notify)
            except RuntimeError:
                pass  # Server shutdown must never interrupt capture.

    def _notify(self):
        for event in self.wake_events:
            event.set()

    def close(self):
        self.stop.set()
        if self.thread.is_alive():
            self.thread.join(timeout=2)

    def _run(self):
        try:
            asyncio.run(self._serve())
        except Exception as error:
            print(f"WebSocket unavailable: {error}. CV tracking continues.")

    async def _serve(self):
        self.loop = asyncio.get_running_loop()
        if self.relay_url:
            await self._public_relay()
            return
        async with serve(
            self._client, "127.0.0.1", self.port,
            compression=None, write_limit=4096, max_queue=1,
            max_size=1024, close_timeout=.5,
        ):
            print(f"WebSocket: listening on ws://127.0.0.1:{self.port}\nClients: 0")
            while not self.stop.is_set():
                await asyncio.sleep(.05)

    async def _public_relay(self):
        url = urlsplit(self.relay_url)
        if (url.scheme != "wss" or not url.hostname or url.username or url.password
                or url.query or url.fragment or url.path != "/relay"
                or not re.fullmatch(r"[A-HJ-NP-Z2-9]{6}", self.session)):
            raise ValueError("Use MOTION_RELAY_URL=wss://<public-host>/relay and a six-character MOTION_SESSION")
        target = urlunsplit((url.scheme, url.netloc, url.path,
                            urlencode({"session": self.session, "role": "tracker"}), ""))
        print(f"WebSocket: public relay / session {self.session}")
        while not self.stop.is_set():
            try:
                self._debug('CONNECT ATTEMPT')
                async with connect(target, compression=None, max_queue=1, write_limit=4096,
                                   max_size=4096, open_timeout=10, close_timeout=.5,
                                   ping_interval=2, ping_timeout=3) as socket:
                    self._debug('OPEN / CONNECTED (including reconnect)')
                    await self._client(socket)
            except Exception as error:
                self._debug(f'CONNECT ERROR {type(error).__name__}: {error}')
                print(f"Relay disconnected ({type(error).__name__}); retrying. CV continues.")
            # Native heartbeat detects half-open streams in a few seconds; retry off the CV thread.
            self._debug('RECONNECT SCHEDULED 1000ms')
            for _ in range(10):
                if self.stop.is_set():
                    return
                await asyncio.sleep(.1)

    async def _client(self, socket):
        self.clients += 1
        print(f"Clients: {self.clients}")
        previous = {}
        event = asyncio.Event()
        self.wake_events.add(event)
        sent, since = 0, time.perf_counter()
        diagnostic = None
        if self.debug:
            diagnostic = asyncio.create_task(self._debug_status(socket))
        try:
            while not self.stop.is_set():
                if socket.close_code is not None:
                    break
                event.clear()
                with self.lock:
                    snapshots = self.latest.copy()
                for kind, payload in snapshots.items():
                    if payload != previous.get(kind):
                        # One replaceable snapshot per type, never a frame queue.
                        await asyncio.wait_for(socket.send(payload), timeout=.25)
                        previous[kind] = payload
                        if kind == 'controller':
                            if self.debug:
                                self.debug_sends += 1
                                self.debug_send_at = time.perf_counter()
                            sent += 1
                            elapsed = time.perf_counter() - since
                            if elapsed >= 1:
                                self.send_hz = sent / elapsed
                                sent, since = 0, time.perf_counter()
                try:
                    await asyncio.wait_for(event.wait(), timeout=.1)
                except TimeoutError:
                    pass
        except ConnectionClosed as error:
            self._debug(f'CONNECTION CLOSED {error}')
        except TimeoutError:
            if self.debug:
                self.debug_timeouts += 1
            self._debug('SEND TIMEOUT 250ms')
        finally:
            if diagnostic is not None:
                diagnostic.cancel()
            self._debug(f'CLOSE code={socket.close_code} reason={socket.close_reason}')
            self.wake_events.discard(event)
            self.clients -= 1
            if not self.clients:
                self.send_hz = 0.0
            print(f"Clients: {self.clients}")

    async def _debug_status(self, socket):
        outputs, sends, at = self.debug_outputs, self.debug_sends, time.perf_counter()
        while True:
            await asyncio.sleep(1)
            now = time.perf_counter()
            age = lambda value: 'NONE' if value is None else f'{(now-value)*1000:.0f}ms'
            with self.lock:
                count, output_at = self.debug_outputs, self.debug_output_at
            self._debug(f'outputHz={(count-outputs)/(now-at):.1f} outputAge={age(output_at)} '
                        f'WS={socket.state.name} sendHz={(self.debug_sends-sends)/(now-at):.1f} '
                        f'sends={self.debug_sends} sendAge={age(self.debug_send_at)} timeouts={self.debug_timeouts}')
            outputs, sends, at = count, self.debug_sends, now
