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
# Instead of polling, Windows notifies us the moment Spotify's title changes
# (SetWinEventHook), and muting uses Spotify's volume-mixer entry, looked up
# in advance so the mute itself is a single call.
# --------------------------------------------------------------------------
class WindowsBackend:
    SONG_TITLE = re.compile(r"\s[-–—]\s")  # "Artist - Song"
    EVENT_OBJECT_NAMECHANGE = 0x800C
    WINEVENT_SKIPOWNPROCESS = 0x0002
    OBJID_WINDOW = 0
    WM_TIMER = 0x0113
    SAFETY_CHECK_MS = 1000     # full re-check in case an event is ever missed
    SESSION_REFRESH_S = 5      # re-find Spotify's audio sessions (restarts, device changes)

    def __init__(self):
        try:
            from pycaw.pycaw import AudioUtilities
            import psutil
        except ImportError:
            sys.exit("Missing dependency. Run:  py -m pip install pycaw")
        import ctypes
        from ctypes import wintypes as wt

        self.ctypes, self.wt = ctypes, wt
        self.AudioUtilities, self.psutil = AudioUtilities, psutil

        u = ctypes.WinDLL("user32")  # private copy so our argtypes don't affect other libraries
        self.WINEVENTPROC = ctypes.WINFUNCTYPE(None, wt.HANDLE, wt.DWORD, wt.HWND,
                                               wt.LONG, wt.LONG, wt.DWORD, wt.DWORD)
        self.WNDENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
        u.SetWinEventHook.argtypes = [wt.DWORD, wt.DWORD, wt.HMODULE, self.WINEVENTPROC,
                                      wt.DWORD, wt.DWORD, wt.UINT]
        u.SetWinEventHook.restype = wt.HANDLE
        u.UnhookWinEvent.argtypes = [wt.HANDLE]
        u.EnumWindows.argtypes = [self.WNDENUMPROC, wt.LPARAM]
        u.GetClassNameW.argtypes = [wt.HWND, wt.LPWSTR, ctypes.c_int]
        u.InternalGetWindowText.argtypes = [wt.HWND, wt.LPWSTR, ctypes.c_int]
        u.GetWindowThreadProcessId.argtypes = [wt.HWND, ctypes.POINTER(wt.DWORD)]
        u.GetMessageW.argtypes = [ctypes.POINTER(wt.MSG), wt.HWND, wt.UINT, wt.UINT]
        u.GetMessageW.restype = wt.BOOL
        u.TranslateMessage.argtypes = [ctypes.POINTER(wt.MSG)]
        u.DispatchMessageW.argtypes = [ctypes.POINTER(wt.MSG)]
        u.SetTimer.argtypes = [wt.HWND, ctypes.c_size_t, wt.UINT, ctypes.c_void_p]
        u.SetTimer.restype = ctypes.c_size_t
        u.KillTimer.argtypes = [wt.HWND, ctypes.c_size_t]
        self.user32 = u

        self._pid_is_spotify = {}
        self._volumes = []
        self._volumes_at = 0.0
        self.refresh_sessions()

    # ---- Spotify's windows -------------------------------------------------
    def _is_spotify_window(self, hwnd):
        ctypes, u = self.ctypes, self.user32
        cls = ctypes.create_unicode_buffer(64)
        u.GetClassNameW(hwnd, cls, 64)
        if not cls.value.startswith("Chrome_WidgetWin"):  # Spotify's main window class
            return False
        pid = self.wt.DWORD()
        u.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        pid = pid.value
        if pid not in self._pid_is_spotify:
            try:
                name = self.psutil.Process(pid).name().lower()
            except Exception:
                name = ""
            self._pid_is_spotify[pid] = name == "spotify.exe"
        return self._pid_is_spotify[pid]

    def _title(self, hwnd):
        # InternalGetWindowText reads the title Windows already has stored,
        # so it never waits on Spotify (GetWindowText can).
        buf = self.ctypes.create_unicode_buffer(512)
        self.user32.InternalGetWindowText(hwnd, buf, 512)
        return buf.value

    def is_ad(self):
        titles = []

        def on_window(hwnd, _):
            if self._is_spotify_window(hwnd):
                title = self._title(hwnd)
                if title:
                    titles.append(title)
            return True

        self.user32.EnumWindows(self.WNDENUMPROC(on_window), 0)
        return bool(titles) and not any(self.SONG_TITLE.search(t) for t in titles)

    # ---- Spotify's audio ---------------------------------------------------
    def refresh_sessions(self):
        volumes = []
        for session in self.AudioUtilities.GetAllSessions():
            try:
                if session.Process and session.Process.name().lower() == "spotify.exe":
                    volumes.append(session.SimpleAudioVolume)
            except Exception:
                pass
        self._volumes, self._volumes_at = volumes, time.monotonic()
        self._pid_is_spotify.clear()  # process ids get reused; start fresh

    def _set_mute(self, muted):
        if not self._volumes:
            self.refresh_sessions()
        try:
            for volume in self._volumes:
                volume.SetMute(int(muted), None)
        except Exception:  # Spotify restarted: find its new sessions and retry
            self.refresh_sessions()
            for volume in self._volumes:
                try:
                    volume.SetMute(int(muted), None)
                except Exception:
                    pass

    def mute(self):
        self._set_mute(True)

    def unmute(self):
        self._set_mute(False)

    # ---- event loop --------------------------------------------------------
    def run(self, controller):
        ctypes, u = self.ctypes, self.user32

        def check():
            try:
                controller.update(self.is_ad())
            except Exception as e:
                log(f"Check failed, retrying: {e}")

        def on_name_change(_hook, _event, hwnd, id_object, id_child, _thread, _time):
            # Fires for title changes in every app; bail out fast unless it's Spotify's window.
            if id_object == self.OBJID_WINDOW and id_child == 0 and hwnd \
                    and self._is_spotify_window(hwnd):
                check()

        callback = self.WINEVENTPROC(on_name_change)  # keep a reference while hooked
        hook = u.SetWinEventHook(self.EVENT_OBJECT_NAMECHANGE, self.EVENT_OBJECT_NAMECHANGE,
                                 None, callback, 0, 0, self.WINEVENT_SKIPOWNPROCESS)
        if not hook:
            sys.exit("Could not listen for Spotify title changes (SetWinEventHook failed).")
        # A slow timer wakes the loop so Ctrl+C works, repeats the mute while an ad
        # plays, and catches anything an event might have missed.
        timer = u.SetTimer(None, 0, self.SAFETY_CHECK_MS, None)
        check()
        msg = self.wt.MSG()
        try:
            while u.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                if msg.message == self.WM_TIMER:
                    if time.monotonic() - self._volumes_at > self.SESSION_REFRESH_S:
                        self.refresh_sessions()
                    check()
                else:
                    u.TranslateMessage(ctypes.byref(msg))
                    u.DispatchMessageW(ctypes.byref(msg))
        finally:
            u.KillTimer(None, timer)
            u.UnhookWinEvent(hook)


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


class Controller:
    """Mutes on the first sign of an ad, unmutes when it's over."""

    def __init__(self, backend):
        self.backend, self.muted = backend, False

    def update(self, ad):
        if ad:
            self.backend.mute()  # repeated while the ad plays, in case Spotify opens a new stream
            if not self.muted:
                self.muted = True
                log("Ad detected: Spotify muted")
        elif self.muted:
            self.backend.unmute()
            self.muted = False
            log("Ad over: Spotify unmuted")

    def shutdown(self):
        if self.muted:
            self.backend.unmute()
            log("Spotify unmuted on exit")


def poll(backend, controller, interval):
    while True:
        try:
            controller.update(backend.is_ad())
        except Exception as e:  # e.g. Spotify closed mid-check
            log(f"Check failed, retrying: {e}")
        time.sleep(interval)


def pick_backend():
    if sys.platform.startswith("win"):
        return WindowsBackend()
    if sys.platform == "darwin":
        return MacBackend()
    return LinuxBackend()


def main():
    parser = argparse.ArgumentParser(description="Mute Spotify (only Spotify) during ads.")
    parser.add_argument("--interval", type=float, default=0.5,
                        help="macOS/Linux: seconds between checks (default 0.5). "
                             "Windows reacts instantly and ignores this.")
    args = parser.parse_args()

    backend = pick_backend()
    controller = Controller(backend)

    def stop(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)

    log("Watching Spotify for ads. Press Ctrl+C to quit.")
    try:
        if isinstance(backend, WindowsBackend):
            backend.run(controller)
        else:
            poll(backend, controller, args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        controller.shutdown()


if __name__ == "__main__":
    main()
