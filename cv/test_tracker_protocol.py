"""Focused URI/registry/handoff tests. Registry is mocked; no webcam is opened."""
import os
from pathlib import Path
import tempfile
import tkinter as tk
import unittest
from unittest.mock import Mock, patch
from tracker_protocol import KEY, parse_join_uri, registration_command, register, unregister, registered, TrackerInstance
from tracker_launcher import Launcher, parse_arguments


class Registry:
    HKEY_CURRENT_USER = 'HKCU'
    REG_SZ = 1

    def __init__(self):
        self.values = {}
        self.deleted = []

    class Handle:
        def __init__(self, path): self.path = path
        def __enter__(self): return self
        def __exit__(self, *args): pass

    def CreateKey(self, hive, path):
        assert hive == self.HKEY_CURRENT_USER and path.startswith(KEY)
        self.values.setdefault(path, {})
        return self.Handle(path)

    def OpenKey(self, hive, path):
        if path not in self.values: raise FileNotFoundError()
        return self.Handle(path)

    def SetValueEx(self, key, name, reserved, kind, value): self.values[key.path][name] = value
    def QueryValueEx(self, key, name): return self.values[key.path][name], self.REG_SZ
    def DeleteKey(self, hive, path):
        assert hive == self.HKEY_CURRENT_USER and path.startswith(KEY)
        self.deleted.append(path)
        self.values.pop(path, None)


class ProtocolTests(unittest.TestCase):
    def test_launch_arguments(self):
        self.assertIsNone(parse_arguments([]).uri)
        self.assertEqual(parse_arguments(['motioncricket://join?session=K7P4AB']).uri, 'motioncricket://join?session=K7P4AB')
        self.assertEqual(parse_arguments(['--self-test-report', 'report.json']).self_test_report, 'report.json')
        with self.assertRaises(ValueError):
            parse_arguments(['motioncricket://join?session=K7P4AB', '--self-test-report', 'bad.json'])

    def test_parser(self):
        self.assertEqual(parse_join_uri('motioncricket://join?session=K7P4AB'), 'K7P4AB')
        for value in ('', 'motioncricket://join?session=ABC123', 'motioncricket://run?session=K7P4AB',
                      'motioncricket://join?session=K7P4AB&run=cmd', 'motioncricket://join?session=K7P4AB#x',
                      'motioncricket://join?session=%4B7P4AB', 'motioncricket://join?session=K7P4AB&session=K7P4AB',
                      'motioncricket://join?session=k7p4ab', 'motioncricket://join/?session=K7P4AB',
                      'https://join?session=K7P4AB', 'motioncricket://join?session=K7P4AB\n'):
            with self.subTest(value=value), self.assertRaises(ValueError): parse_join_uri(value)

    def test_registration(self):
        exe = r'C:\My Tracker\MotionCricketTracker.exe'
        self.assertEqual(registration_command(exe), f'"{exe}" "%1"')
        for value in ('tracker.exe', 'C:\\file.py', 'C:\\bad".exe', 'C:\\bad\n.exe'):
            with self.assertRaises(ValueError): registration_command(value)
        registry = Registry()
        self.assertFalse(registered(exe, registry))
        register(exe, registry)
        self.assertEqual(registry.values[KEY]['URL Protocol'], '')
        self.assertTrue(registered(exe, registry))
        with self.assertRaises(ValueError): unregister(r'C:\Other\tracker.exe', registry)
        self.assertTrue(registered(exe, registry))
        unregister(exe, registry)
        self.assertFalse(registered(exe, registry))
        self.assertEqual(registry.deleted, [KEY+r'\shell\open\command', KEY+r'\shell\open', KEY+r'\shell', KEY])

    def test_population_never_connects(self):
        root = tk.Tk(); root.withdraw()
        app = Launcher(root)
        try:
            self.assertEqual(app.session.get(), '')
            self.assertIsNone(app.worker)
            app.receive_uri('motioncricket://join?session=K7P4AB')
            self.assertEqual(app.session.get(), 'K7P4AB')
            self.assertIsNone(app.worker)
            with self.assertRaises(ValueError): app.receive_uri('motioncricket://run?session=K7P4AB')
            self.assertEqual(app.session.get(), 'K7P4AB')
            app.worker = Mock(); app.worker.is_alive.return_value = True
            app.receive_uri('motioncricket://join?session=Z8Q5CD')
            self.assertEqual(app.session.get(), 'K7P4AB')
            self.assertEqual(app.pending_session, 'Z8Q5CD')
            self.assertFalse(app.stop.is_set())
            app.worker.is_alive.return_value = False
            app.poll()
            self.assertEqual(app.session.get(), 'Z8Q5CD')
            self.assertIsNone(app.pending_session)
            app.worker.start.assert_not_called()
        finally: root.destroy()

    @unittest.skipUnless(os.name == 'nt', 'Windows named pipe')
    def test_existing_instance_forwarding(self):
        with patch('tracker_protocol.Path.home', return_value=Path(tempfile.gettempdir()) / ('protocol-test-' + str(os.getpid()))):
            first = TrackerInstance()
            second = TrackerInstance()
            try:
                self.assertTrue(first.primary); self.assertFalse(second.primary)
                self.assertTrue(second.forward('motioncricket://join?session=K7P4AB'))
                self.assertEqual(first.messages.get(timeout=2), 'motioncricket://join?session=K7P4AB')
                self.assertTrue(second.forward(None))
                self.assertEqual(first.messages.get(timeout=2), '')
                with self.assertRaises(ValueError): second.forward('bad')
            finally: second.close(); first.close()


if __name__ == '__main__': unittest.main()
