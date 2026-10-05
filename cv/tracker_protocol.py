"""Opt-in per-user URI registration and small Windows-only instance handoff."""
import ctypes
import hashlib
import ntpath
from pathlib import Path
import queue
import re
import threading
import time

KEY = r'Software\Classes\motioncricket'
URI = re.compile(r'motioncricket://join\?session=([A-HJ-NP-Z2-9]{6})', re.ASCII)


def parse_join_uri(value):
    match = URI.fullmatch(value) if isinstance(value, str) else None
    if not match:
        raise ValueError('Invalid Motion Cricket join link or six-character session code.')
    return match[1]


def registration_command(executable):
    path = str(executable)
    if not ntpath.isabs(path) or not path.lower().endswith('.exe') or any(c in path for c in '"\r\n\x00'):
        raise ValueError('Protocol handler requires an absolute EXE path.')
    return f'"{path}" "%1"'


def registered(executable, registry=None):
    if registry is None:
        import winreg as registry
    try:
        with registry.OpenKey(registry.HKEY_CURRENT_USER, KEY + r'\shell\open\command') as key:
            return registry.QueryValueEx(key, '')[0] == registration_command(executable)
    except OSError:
        return False


def register(executable, registry=None):
    if registry is None:
        import winreg as registry
    command = registration_command(executable)
    for path, values in [(KEY, {'': 'URL:Motion Cricket', 'URL Protocol': ''}),
                         (KEY + r'\shell\open\command', {'': command})]:
        with registry.CreateKey(registry.HKEY_CURRENT_USER, path) as key:
            for name, value in values.items():
                registry.SetValueEx(key, name, 0, registry.REG_SZ, value)


def unregister(executable, registry=None):
    if registry is None:
        import winreg as registry
    if not registered(executable, registry):
        raise ValueError('This tracker does not own the registered handler.')
    for suffix in (r'\shell\open\command', r'\shell\open', r'\shell', ''):
        registry.DeleteKey(registry.HKEY_CURRENT_USER, KEY + suffix)


class TrackerInstance:
    """Named pipe uses the Windows user's default ACL; only bounded UTF-8, never pickle.

    A named mutex serializes startup. Incoming links are revalidated on the Tk thread.
    No camera, sockets to the game, or automatic CONNECT are involved.
    """
    def __init__(self):
        from multiprocessing.connection import Listener
        self.messages = queue.Queue(maxsize=1)
        self.closed = False
        user = hashlib.sha256(str(Path.home()).encode()).hexdigest()[:24]
        self.address = rf'\\.\pipe\MotionCricketTracker-{user}'
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        kernel.CreateMutexW.restype = ctypes.c_void_p
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        ctypes.set_last_error(0)
        self.handle = kernel.CreateMutexW(None, False, f'Local\\MotionCricketTracker-{user}')
        if not self.handle:
            raise ctypes.WinError(ctypes.get_last_error())
        self.primary = ctypes.get_last_error() != 183
        self.kernel = kernel
        self.listener = None
        if self.primary:
            self.listener = Listener(self.address, family='AF_PIPE')
            threading.Thread(target=self.listen, daemon=True).start()

    def listen(self):
        while not self.closed:
            try:
                with self.listener.accept() as connection:
                    if not connection.poll(1):
                        continue
                    value = connection.recv_bytes(256).decode('utf-8')
                    if value:
                        parse_join_uri(value)
                    try:
                        self.messages.get_nowait()
                    except queue.Empty:
                        pass
                    self.messages.put_nowait(value)
                    connection.send_bytes(b'OK')
            except (OSError, EOFError, UnicodeError, ValueError):
                continue

    def forward(self, uri):
        from multiprocessing.connection import Client
        if uri:
            parse_join_uri(uri)
        for attempt in range(20):
            try:
                with Client(self.address, family='AF_PIPE') as connection:
                    connection.send_bytes((uri or '').encode('utf-8'))
                    return connection.poll(1) and connection.recv_bytes(16) == b'OK'
            except (OSError, EOFError):
                time.sleep(.1)
        return False

    def close(self):
        self.closed = True
        if self.listener:
            self.listener.close()
        self.kernel.CloseHandle(self.handle)
