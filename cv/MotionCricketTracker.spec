from pathlib import Path
from PyInstaller.utils.hooks import collect_all

cv_dir = Path(SPECPATH)
mp_data, mp_binaries, mp_imports = collect_all("mediapipe")
a = Analysis([str(cv_dir / "tracker_launcher.py")], pathex=[str(cv_dir)],
             binaries=mp_binaries,
             datas=mp_data + [(str(cv_dir / "pose_landmarker_lite.task"), ".")],
             hiddenimports=mp_imports, hookspath=[], runtime_hooks=[], excludes=[])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="MotionCricketTracker",
          debug=False, bootloader_ignore_signals=False, strip=False, upx=False, console=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="MotionCricketTracker")
