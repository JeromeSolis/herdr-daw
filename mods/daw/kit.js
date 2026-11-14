// Shared bits for the DAW layout's roles: palette, clip colors, small helpers.

import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { home, shared, setShared, layout, keys, window as win } from "herdr";

// Fixed studio colors (the rest come from theme(): themes/daw.json).
export const C = {
  bar: "#2a2a2a",
  panel: "#262626",
  well: "#1c1c1c", // recessed boxes (LCDs, empty slots, search)
  wellEdge: "#0d0d0d",
  slot: "#2f2f2f",
  slotEdge: "#232323",
  stopGlyph: "#4d4d4d",
  ink: "#141414", // text on a colored clip
  text: "#d6d6d6",
  muted: "#a3a3a3",
  dim: "#727272",
  amber: "#ffa62b",
  yellow: "#f5c84a",
  green: "#62d56a",
  red: "#ff4f4f",
  header: "#343434",
  headerOn: "#3f3f3f",
  mono: "JetBrains Mono",
};

// Clip colors for tracks (spaces). Spaces the sidebar colored keep their hue.
export const CLIPS = ["#ff9b3d", "#f2d24c", "#a3da4e", "#4fd6a8", "#4cc2ef", "#7f9dff", "#b98cf2", "#f27bbd", "#ff6b66", "#c9a77a"];
const ANSI = { ansi6: "#4fd6a8", ansi3: "#ff9b3d", ansi4: "#4cc2ef", ansi5: "#b98cf2", ansi2: "#a3da4e", ansi1: "#f27bbd" };

export function spaceColor(space, i) {
  const named = (shared("space.colors") ?? {})[space?.id];
  return ANSI[named] ?? CLIPS[i % CLIPS.length];
}

export function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export const shown = (id) => {
  const n = find(layout(), id);
  return Boolean(n) && !n.hidden;
};

export function programIcon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// A control inside a window-drag block keeps its own presses.
export function own(el) {
  return el.on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_mouse_down("right", (_e, cx) => cx.stop_propagation());
}

export const mac = () => win()?.platform === "macos";

// Modifier names as this platform writes them: ⌥-click on macOS, Alt-click elsewhere.
const MODS = () =>
  mac() ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘", fn: "fn" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super", fn: "Fn" };
export const mod = (name) => MODS()[name];
// A key with the platform's primary modifier (⌘ on macOS, Ctrl elsewhere): "⌘↩" / "Ctrl+Enter".
export const primary = (macKey, otherKey) => (mac() ? `⌘${macKey}` : `Ctrl+${otherKey}`);

// The keys bound to a global action, as this platform writes them ("⌘P", "Ctrl+Shift+P"),
// or "" when it has none. Follows the user's keys.json, as Herdr's + menu does.
export function shortcut(action) {
  const k = keys().find((b) => b.section === "global" && b.action === action);
  if (!k?.keys.trim()) return "";
  const names = MODS();
  const alias = { secondary: mac() ? "cmd" : "ctrl", super: "cmd", win: "cmd" };
  return k.keys
    .trim()
    .split(/\s+/)
    .map((stroke) => {
      const parts = stroke.split("-");
      let key = parts.pop();
      if (key === "") { key = "-"; parts.pop(); }
      const held = new Set(parts.map((m) => alias[m.toLowerCase()] ?? m.toLowerCase()));
      if (/^[A-Z]$/.test(key)) held.add("shift");
      const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1).toLowerCase();
      return [...Object.keys(names).filter((m) => held.has(m)).map((m) => names[m]), label].join(mac() ? "" : "+");
    })
    .join(" ");
}

// Ableton-ish small caps section label.
export function label(text) {
  return div().text_size(10).font_semibold().text_color(C.dim).child(text.toUpperCase());
}

// A status LED: working pulses green, blocked pulses red, done glows amber.
export function led(t, status, size = 8) {
  const color = status && status !== "idle" ? t[status] : "#4a4a4a";
  const dot = div().size(size).flex_none().rounded_full().bg(color);
  if (status === "working") return dot.loop("opacity", { from: 0.35, to: 1, period: 900 });
  if (status === "blocked") return dot.loop("opacity", { from: 0.25, to: 1, period: 600 });
  return dot;
}

// Agent title without its leading status glyphs.
export const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}~/]+/u, "").trim();

// Task scenes, saved per Set (space id): { name, agent (a program key), task }.
const SCENES = "daw.scenes";
export const scenesOf = (space) => (shared(SCENES) ?? {})[space] ?? [];
export function saveScenes(space, list) {
  setShared(SCENES, { ...(shared(SCENES) ?? {}), [space]: list });
}

// Installed agents for a machine, as the Browser (and Herdr's + menu) last checked.
export const installedOn = (machine) => ((shared("new-menu.agents") ?? {})[machine ?? ""] ?? []).filter((a) => a.installed);

// A small square toggle like the view selectors in a DAW's corners.
export function toggle(id, text, on, onClick, tip) {
  return own(h_flex())
    .id(id)
    .h(18)
    .px(6)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(2)
    .border_1()
    .border_color(C.wellEdge)
    .text_size(10)
    .font_semibold()
    .cursor_pointer()
    .bg(on ? C.amber : C.well)
    .text_color(on ? C.ink : C.muted)
    .hover((s) => s.text_color(on ? C.ink : C.text))
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .on_click(onClick)
    .child(text);
}
