"""Latest-state-only local bridge. No network I/O runs on the CV thread."""
import asyncio
import json
import math
import threading
import time

from websockets.asyncio.server import serve
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
        self.latest = {}
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.clients = 0
        self.send_hz = 0.0
        self.loop = None
        self.wake_events = set()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()

    def publish(self, controller, calibrated, telemetry=None):
        if controller is None:
            return
        payload = controller_json(controller, calibrated, telemetry)
        with self.lock:
            self.latest['controller'] = payload
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
        async with serve(
            self._client, "127.0.0.1", self.port,
            compression=None, write_limit=4096, max_queue=1,
            max_size=1024, close_timeout=.5,
        ):
            print(f"WebSocket: listening on ws://127.0.0.1:{self.port}\nClients: 0")
            while not self.stop.is_set():
                await asyncio.sleep(.05)

    async def _client(self, socket):
        self.clients += 1
        print(f"Clients: {self.clients}")
        previous = {}
        event = asyncio.Event()
        self.wake_events.add(event)
        sent, since = 0, time.perf_counter()
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
                            sent += 1
                            elapsed = time.perf_counter() - since
                            if elapsed >= 1:
                                self.send_hz = sent / elapsed
                                sent, since = 0, time.perf_counter()
                try:
                    await asyncio.wait_for(event.wait(), timeout=.1)
                except TimeoutError:
                    pass
        except (ConnectionClosed, TimeoutError):
            pass
        finally:
            self.wake_events.discard(event)
            self.clients -= 1
            if not self.clients:
                self.send_hz = 0.0
            print(f"Clients: {self.clients}")
