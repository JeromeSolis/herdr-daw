# Herdr Studio (DAW)

An Ableton Live–style layout for Herdr: `layouts/daw.json` + `themes/daw.json` +
this mod. One mod, many roles (`main.js`): transport, browser, session, device,
status, scene, menu.

## The mapping

| Live          | Herdr                                                    |
| ------------- | -------------------------------------------------------- |
| Live Set      | a space (one shown at a time)                            |
| Track         | a tab                                                    |
| Clip          | a pane: an agent (like a MIDI clip) or a terminal (audio) |
| Instruments   | the agents installed where the Set lives (Browser)       |
| Scenes        | task scenes: a saved agent + its first message, per Set  |
| Master meter  | activity lanes: each agent's status over the last 30 min |

## What's where

- **Control Bar** (top, drags the window). TAB makes a tab; the amber LCD is the
  shown Set (click for the picker); `working/running` jumps to the next agent.
  The position display counts how long the Set has been working. ▶ lights green
  while agents work, ■ amber when some finished, ● pulses red when one needs you;
  each jumps through the agents in that state. CPU / RAM / GPU meters (GPU hides
  when nothing reports it), the command palette and settings.
- **Browser** (left). Search opens the picker. *Sets*: click shows one,
  double-click renames, right-click for the Set menu (color, Rename, worktrees,
  Close), + makes one. *Agents*: click starts one as a new track,
  ⌥-click (Alt-click) adds it as a clip beside the focused pane. *Running*: every
  agent, most urgent first; this is also the order `agent.next` / `agent.prev`
  follow. *Places*: the folders your terminals are in; click opens a tab there.
- **Session View**. Track headers: click shows the tab, double-click renames,
  right-click for its color and the tab menu. Clips: click focuses, double-click zooms,
  right-click for the terminal menu. A working agent's ▶ pulses green, a blocked
  one pulses red, a finished one shows an amber dot. Double-click the empty slot
  under a track's clips for a new terminal clip, or "+ track" for a new tab.
  The mixer row shows each track's most urgent clip as a meter; its ● jumps to a
  clip that needs you.
- **Master**. "+ scene" saves an agent and a first message; ▶ launches it as a new
  track; double-click edits it. The cell under Master holds the activity lanes.
- **Detail** (bottom). The shown track's panes, each with a device title bar:
  status activator, program, title, folder and branch; split, zoom and close.
- **Status bar**. The focused terminal on the left; BROWSER / SESSION / DETAIL
  show or hide those areas; ⇆ switches to the next layout.

## Context strips

Claude Code and OpenCode clips get a strip along their bottom edge: how full the
agent's context window is, red past 80%. Hover a clip for the figures. They come
from the agents' own records, every 5 s, for the shown Set:

- **Claude Code**: `~/.claude/sessions/<pid>.json` → the session's log under
  `~/.claude/projects/`.
- **OpenCode**: `~/.local/share/opencode/opencode.db` (needs the `sqlite3` CLI,
  built into macOS, a package on most Linux distributions). An OpenCode started
  without `--session` is matched to the most recent session in its folder, so two
  in one folder can't be told apart.

The window comes from the model: Claude models by name (1M for Opus and Sonnet
4.6 and later, Haiku 5 and later, Fable and Mythos; 200k for older ones), others
from OpenCode's models.dev cache (`~/.cache/opencode/models.json`). Unknown
models start at 200k, and any reading that doesn't fit steps the window up to the
next common size. To fix one size for every agent, add it to the session block's
props in `layouts/daw.json`:

```json
"content": { "mod": "daw", "props": { "role": "session", "context_window": 200000 } }
```

Strips need local agents: Sets on another machine, Pi and Hermes show none.

## Install

Copy these into `~/.config/herdr-app/`, keeping their paths, then switch to it
with `layout.switch` (⌘⇧L on macOS, Ctrl+Shift+L elsewhere, cycles the layouts) or
`herdr-app do layout.switch '{"name":"daw"}'`. A theme chosen in the theme picker
overrides `themes/daw.json`.

```
layouts/daw.json
layouts/daw.svg     the layout picker's preview
themes/daw.json
mods/daw/
```

It uses Herdr's built-in `menu`, `picker`, `pane` and `workspace-chrome` mods (for
menus and icons), so those must be present, as they are by default. Its fonts,
Geist and JetBrains Mono, ship with Herdr; nothing needs installing.

## Good to know

- Activity lanes start empty: Herdr keeps no past states, so the mod records them
  while it runs (in the mod's own storage) and keeps the last 31 minutes.
- Task scenes are stored per Set in Herdr's shared state (`daw.scenes`), track
  colors in `daw.track.colors`. A Set's color is Herdr's own (`space.colors`), so
  the sidebar and picker show the one you pick here.
- Tracks shrink to 64 px at the narrowest and the grid doesn't scroll sideways,
  so with more than about a dozen tabs Master is pushed off the right edge.
