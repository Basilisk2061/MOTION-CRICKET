"""Run while main.py is running: receive 10 frames, disconnect, reconnect."""
import json
import time

from websockets.sync.client import connect


def check():
    for attempt in range(2):
        with connect("ws://127.0.0.1:8765", open_timeout=3) as socket:
            print(f"Connection {attempt + 1}")
            previous = None
            for _ in range(10):
                message = json.loads(socket.recv(timeout=5))
                assert message["type"] == "controller"
                assert message["timestamp"] != previous, "Expected a fresh CV state"
                previous = message["timestamp"]
                print(json.dumps(message, allow_nan=False))
        print("Disconnected; CV should continue.")
        time.sleep(.5)
    print("PASS: continuous JSON and reconnect.")


if __name__ == "__main__":
    check()
