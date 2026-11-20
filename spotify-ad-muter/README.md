# Spotify Ad Muter

A single small Python script that mutes **only Spotify** while an ad plays and
unmutes it when the music returns. Your other apps (browser, calls, games) keep
their sound. It checks twice a second and uses almost no CPU or memory.

## How it works

| OS      | How it spots an ad                                  | What it mutes                          |
|---------|-----------------------------------------------------|----------------------------------------|
| Windows | Spotify's window title stops being `Artist - Song`  | Spotify's slider in the volume mixer   |
| macOS   | Spotify reports the current track as `spotify:ad:…` | Spotify's own volume (restored after)  |
| Linux   | Spotify's MPRIS track id is `/com/spotify/ad/…`     | Spotify's PulseAudio/PipeWire stream   |

## Install & run

You need Python 3.8+ ([python.org](https://www.python.org/downloads/)).

**Windows**
```bash
pip install pycaw
```
```bash
python spotify_ad_muter.py
```

**macOS** (the first run asks you to let Terminal control Spotify; click OK)
```bash
python3 spotify_ad_muter.py
```

**Linux** (`pactl` plus `playerctl`, `gdbus` or `dbus-send`, usually already installed)
```bash
python3 spotify_ad_muter.py
```

Leave it running. Press `Ctrl+C` to quit, and it unmutes Spotify if an ad was playing.
`--interval 0.3` makes it check more often.

## Start it automatically at login

**Windows:** rename the file to `spotify_ad_muter.pyw` (runs with no console window),
press `Win+R`, type `shell:startup`, and put a shortcut to the `.pyw` file in that folder.
If you'd prefer a standalone `.exe`:
```bash
pip install pyinstaller
```
```bash
pyinstaller --onefile --noconsole spotify_ad_muter.py
```

**macOS:** make `~/Library/LaunchAgents/spotify-ad-muter.plist` (use your real path):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>spotify-ad-muter</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/python3</string><string>/PATH/TO/spotify_ad_muter.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
```
```bash
launchctl load ~/Library/LaunchAgents/spotify-ad-muter.plist
```

**Linux:** make `~/.config/autostart/spotify-ad-muter.desktop`:
```ini
[Desktop Entry]
Type=Application
Name=Spotify Ad Muter
Exec=python3 /PATH/TO/spotify_ad_muter.py
```

## Notes

- This only mutes. The ad still plays silently; it isn't skipped or blocked.
- On Windows, pausing Spotify also counts as "not a song", so Spotify is muted
  while paused. It unmutes within half a second of a song starting, so you may lose
  the first moment of a song when you resume.
- The desktop app is required. Spotify in a web browser isn't supported.
