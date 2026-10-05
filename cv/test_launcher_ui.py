"""Native launcher checks without starting a webcam or network connection."""
import unittest
from unittest.mock import patch
from pathlib import Path
import tkinter as tk
from PIL import Image
import ctypes
from ctypes import wintypes
from tracker_launcher import Launcher, display_status, valid_session


def capture_window(root, path):
    """Capture this native window only, even if another application covers it."""
    user, gdi = ctypes.windll.user32, ctypes.windll.gdi32
    for function in (user.GetDC, gdi.CreateCompatibleDC, gdi.CreateCompatibleBitmap, gdi.SelectObject):
        function.restype = ctypes.c_void_p
    user.GetDC.argtypes = [wintypes.HWND]
    user.GetParent.argtypes = [wintypes.HWND]
    user.GetParent.restype = wintypes.HWND
    user.ReleaseDC.argtypes = [wintypes.HWND, ctypes.c_void_p]
    user.PrintWindow.argtypes = [wintypes.HWND, ctypes.c_void_p, wintypes.UINT]
    gdi.CreateCompatibleDC.argtypes = [ctypes.c_void_p]
    gdi.CreateCompatibleBitmap.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
    gdi.SelectObject.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    gdi.DeleteObject.argtypes = gdi.DeleteDC.argtypes = [ctypes.c_void_p]
    gdi.GetDIBits.argtypes = [ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT, wintypes.UINT, ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT]
    hwnd, width, height = user.GetParent(root.winfo_id()), root.winfo_width(), root.winfo_height()
    dc = user.GetDC(hwnd)
    memory = gdi.CreateCompatibleDC(dc)
    bitmap = gdi.CreateCompatibleBitmap(dc, width, height)
    previous = gdi.SelectObject(memory, bitmap)
    try:
        if not user.PrintWindow(hwnd, memory, 3):
            raise RuntimeError('Could not capture tracker window')
        # BITMAPINFOHEADER: a top-down 32-bit client-area bitmap.
        import struct
        info = ctypes.create_string_buffer(struct.pack('<IiiHHIIiiII', 40, width, -height, 1, 32, 0, width*height*4, 0, 0, 0, 0))
        pixels = ctypes.create_string_buffer(width*height*4)
        gdi.SelectObject(memory, previous)
        previous = None
        if not gdi.GetDIBits(memory, bitmap, 0, height, pixels, info, 0):
            raise RuntimeError('Could not read tracker pixels')
        image = Image.frombytes('RGB', (width, height), pixels.raw, 'raw', 'BGRX')
        if image.getpixel((10, 10)) != (13, 13, 13):
            raise RuntimeError(f'Tracker background not captured correctly: {image.getpixel((10, 10))}')
        image.save(path)
    finally:
        if previous:
            gdi.SelectObject(memory, previous)
        gdi.DeleteObject(bitmap)
        gdi.DeleteDC(memory)
        user.ReleaseDC(hwnd, dc)


class LauncherUITest(unittest.TestCase):
    def test_native_launcher(self):
        root = tk.Tk()
        app = Launcher(root)
        try:
            self.assertEqual(root.cget('bg'), '#0d0d0d')
            app.session.set('bad')
            app.connect()
            self.assertIsNone(app.worker)
            self.assertIn('valid', app.status.get())
            self.assertTrue(valid_session('K7P4AB'))
            app.camera.current(1)
            with patch('tracker_launcher.threading.Thread') as thread:
                thread.return_value.is_alive.return_value = True
                app.session.set('K7P4AB')
                app.connect()
                self.assertEqual(thread.call_args.kwargs['args'], ('K7P4AB', 1))
                thread.return_value.start.assert_called_once()
                app.calibrate_button.invoke()
                self.assertTrue(app.calibrate.is_set())
                app.connect()
                self.assertTrue(app.stop.is_set())
                app.latest_status = 'Camera ready | Game connected\nTracking | CALIBRATED'
                app.poll()
                self.assertEqual(app.status_rows['CALIBRATION'].get(), 'READY')
                self.assertEqual(app.status_rows['GAME'].get(), 'RELAY CONNECTED')
                # REVIEW FIXTURE: simulated status only, not a physical tracking result.
                root.update()
                root.lift()
                root.after(500, root.quit)
                root.mainloop()
                folder = Path(__file__).resolve().parents[1] / 'build' / 'ux-review'
                folder.mkdir(parents=True, exist_ok=True)
                capture_window(root, folder/'tracker.png')
                self.assertTrue(root.bind('<Escape>'))
                thread.return_value.is_alive.return_value = False
                app.close()
                app.poll()
        finally:
            try:
                root.destroy()
            except tk.TclError:
                pass

    def test_status_is_truthful(self):
        self.assertEqual(display_status('Not connected', False)['CAMERA'], 'NOT OPEN')
        self.assertEqual(display_status('Camera ready | Connecting to game\nRight hand not visible | NOT_CALIBRATED', True)['TRACKING'], 'ARM NOT VISIBLE')
        self.assertNotEqual(display_status('Stopped', False)['CALIBRATION'], 'READY')


if __name__ == '__main__':
    unittest.main()
