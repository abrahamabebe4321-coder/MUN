# MUN Chair

MUN Chair is a tool for chairing one Model UN committee. It helps you time debate, track motions and votes, and score every delegate interaction. It runs in a web browser and keeps working without an internet connection.

## Features

- Setup with country flags: search for countries, or use "More ways to add" to paste a list or add custom delegations.
- Roll call with present / present and voting, and live majority thresholds.
- Opening speeches, general speakers list, moderated and unmoderated caucus, with speech and caucus timers.
- Scoring of speeches, POIs (question, answer, follow-up), motions, points, amendments and penalties, each in three quality tiers.
- Motion queue that orders motions by disruptiveness and lets you bring back failed or withdrawn ones.
- Quick-count and roll-call voting with simple or two-thirds majority.
- Resolution tracking: sponsors, signatories, amendments and the final vote.
- Private leaderboard with an editable log for each delegate.
- Projector window that shows timers, speakers, motions and vote results, but never scores.
- End-of-conference summary with suggested awards, per-delegate reports, CSV export and print.
- Undo and redo.
- Backup and restore.
- Light and dark theme.

## Use it on your laptop

### Easiest: one file

Download `MUN-Chair.html` from the repository (on GitHub, open the file and use the download button). Save it anywhere and double-click it to open it in Chrome or Edge. It works with no internet.

To show the projector view, use the Projector button, then click Fullscreen.

With the projector connected as a second display (Windows: Win+P, then Extend; Mac: System Settings, Displays, arrange rather than mirror), clicking Projector opens the projector window on that display. Chrome and Edge may ask once to allow "window management"; choose Allow. Fullscreen then fills only the projector display, so the laptop screen stays free for the dashboard. If the displays are mirrored, fullscreen covers both screens; press Esc to leave it.

Keep using the same file on the same laptop: your committee is saved in that browser. Use More -> Settings -> Download backup before switching laptops.

### Online link

After GitHub Pages is switched on once (Settings -> Pages -> Source: GitHub Actions), the app is at https://abrahamabebe4321-coder.github.io/MUN/ and updates automatically when the code changes. After the first visit it also works offline, and Chrome or Edge offer "Install app".

### For developers

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run release:single
```

The last command rebuilds `MUN-Chair.html`.

## Using it during a conference

The chair screen has four tabs: Debate, Motions, Resolutions and Scores. Roll call and Settings are in the "More" menu.

1. Set up the committee and its delegations.
2. Take roll call from the "More" menu (or click the attendance count). For each new session, choose "Next session" in the "More" menu.
3. Open the projector window (see the projector notes above) and put it on the projector screen.
4. Run opening speeches from the Debate tab.
5. Log motions on the Motions tab and vote on them in the order shown. A passed caucus starts automatically.
6. During speeches, rate each one by clicking one to three pips, and log POIs. Rarely used timer controls are under "Adjust".
7. Track draft resolutions and amendments on the Resolutions tab.
8. Choose "End conference" in the "More" menu to get the summary.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Start or pause the speech timer |
| N | Next speaker |
| P / V / A | Present / present and voting / absent while calling the roll |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Esc | Close a dialog |

## Scoring

Points = base x quality. Quality is Works (x1), Decent (x2) or Insightful (x3).

| Action | Base points |
| --- | --- |
| GSL or moderated caucus speech | 6 |
| Opening speech | 5 |
| Resolution speech | 8 |
| Amendment speech | 4 |
| Amendment proposed | 3 (+2 if it passes) |
| POI asked | 2 |
| POI answer | 2 |
| Follow-up | 1 |
| Motion raised | 1 (+1 if it passes) |
| Point of order / parliamentary inquiry | 1 |
| Personal privilege | 0 (logged only) |
| Unmod leadership | 3 |
| Sponsor | 5 (flat) |
| Signatory | 1 (flat) |
| Penalty | -2 |

Three insightful POIs (18 points) equal one insightful speech. Every value can be changed in Settings.

## Your data

Everything is stored only in that browser, on that laptop. Before you change laptop or clear browser data, use Settings (in the "More" menu) -> Download backup. On the new machine, use Settings -> Restore from backup to load it.

## Development

```bash
npm run dev
```

```bash
npm test
```

Built with React, TypeScript, Vite and Vitest.
