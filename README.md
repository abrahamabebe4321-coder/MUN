# MUN Chair

MUN Chair is a tool for chairing one Model UN committee. It helps you time debate, track motions and votes, and score every delegate interaction. It runs in a web browser and keeps working without an internet connection.

## Features

- Setup with country flags: search for countries, paste a list, or add custom delegations.
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

## Run it on your laptop

You need Node.js 20 or newer. In the project folder, run these commands one at a time.

```bash
npm install
```

```bash
npm run build
```

```bash
npm run preview
```

Open the address it prints (normally http://localhost:4173). After the first visit the app keeps working without internet, and Chrome or Edge offer "Install app" in the address bar.

## Using it during a conference

1. Set up the committee and its delegations.
2. Take roll call on the Roll call tab. Repeat it each session with "Next session".
3. Open the projector window and move it to the projector screen.
4. Run opening speeches from the Debate tab.
5. Log motions on the Motions & voting tab and vote on them in the order shown. A passed caucus starts automatically.
6. During speeches, rate each speech and log POIs.
7. Track draft resolutions and amendments on the Resolutions tab.
8. Press "End conference" to get the summary.

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

Everything is stored only in that browser, on that laptop. Before you change laptop or clear browser data, use Settings -> Download backup. On the new machine, use Settings -> Restore from backup to load it.

## Development

```bash
npm run dev
```

```bash
npm test
```

Built with React, TypeScript, Vite and Vitest.
