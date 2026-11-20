#!/usr/bin/env python3
"""
Spotify Ad Muter: mutes Spotify, and only Spotify, while an ad is playing,
then unmutes it when the music comes back. Everything else on your computer
keeps its sound.

Run it and leave it running:
    python spotify_ad_muter.py

Requirements
  Windows: pip install pycaw
  macOS:   nothing extra
  Linux:   pactl (PulseAudio or PipeWire) and one of playerctl / gdbus / dbus-send
"""
import argparse
import os
import re
import shutil
import signal
import subprocess
import sys
import time


def log(msg):
    if sys.stdout is None:  # running windowless (pythonw / .pyw)
        return
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def run(cmd):
    """Run a command and return its stdout, or '' if it fails."""
    try:
        return subprocess.run(
            cmd, capture_output=True, text=True, timeout=3,
            env={**os.environ, "LC_ALL": "C"},
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


# --------------------------------------------------------------------------
# Windows: an ad is on when Spotify's window title is not "Artist - Song".
# Muting uses Spotify's own entry in the Windows volume mixer.
# --------------------------------------------------------------------------
class WindowsBackend:
    SONG_TITLE = re.compile(r"\s[-–—]\s")  # "Artist - Song"

    def __init__(self):
        try:
            from pycaw.pycaw import AudioUtilities
            import psutil
        except ImportError:
            sys.exit("Missing dependency. Run:  pip install pycaw")
        import ctypes
        from ctypes import wintypes

        self.ctypes, self.wintypes = ctypes, wintypes
        self.AudioUtilities, self.psutil = AudioUtilities, psutil
        self.user32 = ctypes.windll.user32
        self.WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def _is_spotify_pid(self, pid):
        try:
            return self.psutil.Process(pid).name().lower() == "spotify.exe"
        except Exception:
            return False

    def _spotify_titles(self):
        ctypes, user32 = self.ctypes, self.user32
        titles = []

        def on_window(hwnd, _):
            length = user32.GetWindowTextLengthW(hwnd)
            if length:
                cls = ctypes.create_unicode_buffer(64)
                user32.GetClassNameW(hwnd, cls, 64)
                if cls.value.startswith("Chrome_WidgetWin"):  # Spotify's main window
                    pid = self.wintypes.DWORD()
                    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                    if self._is_spotify_pid(pid.value):
                        buf = ctypes.create_unicode_buffer(length + 1)
                        user32.GetWindowTextW(hwnd, buf, length + 1)
                        titles.append(buf.value)
            return True

        user32.EnumWindows(self.WNDENUMPROC(on_window), 0)
        return titles

    def is_ad(self):
        titles = self._spotify_titles()
        return bool(titles) and not any(self.SONG_TITLE.search(t) for t in titles)

    def _set_mute(self, muted):
        for session in self.AudioUtilities.GetAllSessions():
            try:
                if session.Process and session.Process.name().lower() == "spotify.exe":
                    session.SimpleAudioVolume.SetMute(int(muted), None)
            except Exception:
                pass

    def mute(self):
        self._set_mute(True)

    def unmute(self):
        self._set_mute(False)


# --------------------------------------------------------------------------
# macOS: Spotify's AppleScript reports ads as "spotify:ad:..." tracks.
# Muting sets Spotify's own volume slider to 0 and restores it afterwards.
# --------------------------------------------------------------------------
class MacBackend:
    def __init__(self):
        self.saved_volume = None

    @staticmethod
    def osa(script):
        return run(["osascript", "-e",
                    f'if application "Spotify" is running then tell application "Spotify" to {script}']).strip()

    def is_ad(self):
        out = self.osa('return (spotify url of current track) & " " & (id of current track)')
        return "spotify:ad:" in out

    def mute(self):
        if self.saved_volume is None:
            v = self.osa("return sound volume")
            self.saved_volume = int(v) if v.isdigit() and int(v) > 0 else 100
        self.osa("set sound volume to 0")

    def unmute(self):
        if self.saved_volume is not None:
            self.osa(f"set sound volume to {self.saved_volume}")
            self.saved_volume = None


# --------------------------------------------------------------------------
# Linux: Spotify's MPRIS metadata gives ads a track id like /com/spotify/ad/...
# Muting targets only Spotify's audio stream(s) in PulseAudio / PipeWire.
# --------------------------------------------------------------------------
class LinuxBackend:
    AD_MARKER = re.compile(r"/com/spotify/ad/|spotify:ad:")
    DEST, PATH = "org.mpris.MediaPlayer2.spotify", "/org/mpris/MediaPlayer2"

    def __init__(self):
        if not shutil.which("pactl"):
            sys.exit("pactl not found. Install it (Debian/Ubuntu: sudo apt install pulseaudio-utils).")
        if shutil.which("playerctl"):
            self.metadata_cmd = ["playerctl", "-p", "spotify", "metadata"]
        elif shutil.which("gdbus"):
            self.metadata_cmd = ["gdbus", "call", "--session", "--dest", self.DEST,
                                 "--object-path", self.PATH,
                                 "--method", "org.freedesktop.DBus.Properties.Get",
                                 "org.mpris.MediaPlayer2.Player", "Metadata"]
        elif shutil.which("dbus-send"):
            self.metadata_cmd = ["dbus-send", "--session", "--print-reply", f"--dest={self.DEST}",
                                 self.PATH, "org.freedesktop.DBus.Properties.Get",
                                 "string:org.mpris.MediaPlayer2.Player", "string:Metadata"]
        else:
            sys.exit("Need playerctl, gdbus or dbus-send to read what Spotify is playing.")

    def is_ad(self):
        return bool(self.AD_MARKER.search(run(self.metadata_cmd)))

    @staticmethod
    def _spotify_streams():
        out = run(["pactl", "list", "sink-inputs"])
        ids = []
        for block in re.split(r"^Sink Input #", out, flags=re.M)[1:]:
            if re.search(r'application\.(name|process\.binary) = "spotify"', block, re.I):
                ids.append(block.split("\n", 1)[0].strip())
        return ids

    def _set_mute(self, muted):
        for stream in self._spotify_streams():
            run(["pactl", "set-sink-input-mute", stream, "1" if muted else "0"])

    def mute(self):
        self._set_mute(True)

    def unmute(self):
        self._set_mute(False)


def pick_backend():
    if sys.platform.startswith("win"):
        return WindowsBackend()
    if sys.platform == "darwin":
        return MacBackend()
    return LinuxBackend()


def main():
    parser = argparse.ArgumentParser(description="Mute Spotify (only Spotify) during ads.")
    parser.add_argument("--interval", type=float, default=0.5,
                        help="seconds between checks (default 0.5)")
    args = parser.parse_args()

    backend = pick_backend()
    muted = False

    def stop(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)

    log("Watching Spotify for ads. Press Ctrl+C to quit.")
    try:
        while True:
            try:
                if backend.is_ad():
                    backend.mute()  # repeated each check in case Spotify opens a new stream
                    if not muted:
                        log("Ad detected: Spotify muted")
                        muted = True
                elif muted:
                    backend.unmute()
                    log("Ad over: Spotify unmuted")
                    muted = False
            except Exception as e:  # e.g. Spotify closed mid-check
                log(f"Check failed, retrying: {e}")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        if muted:
            backend.unmute()
            log("Spotify unmuted on exit")


if __name__ == "__main__":
    main()
