// The right-click menu for a Set (Browser) or a track (Session View header): a row
// of clip colors, then Herdr's own items for it (as its built-in `menu` mod lists
// them). ↑/↓ move, Enter runs, Esc closes.
//   Set colors live in Herdr's shared "space.colors" (the sidebar and picker show
//   them too); track colors in "daw.track.colors", by tab id. The last swatch, ⌀,
//   goes back to the automatic color.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, keys, spaces, panes, exec, shared, setShared } from "herdr";
import { CLIPS, ANSI } from "./kit.js";

export const TRACK_COLORS = "daw.track.colors";

// Where a Set is now: its first terminal's live folder, else where it was made.
function place(s) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A Set's checkout: "main" (a repo's own), "linked" (a worktree), or null.
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}

function items(kind, tg, git) {
  if (kind === "tab")
    return [
      ["Rename", "tab.rename", { id: tg.id }],
      ["New tab", "tab.new", { space: tg.space }],
      ["Close", "tab.close", { id: tg.id }],
    ];
  return [
    ["Rename", "space.rename", { id: tg.id }],
    ...(git ? [["New worktree", "worktree", { space: tg.id, action: "new" }], ["Open worktree", "worktree", { space: tg.id, action: "open" }]] : []),
    ...(git === "linked" ? [["Remove worktree", "worktree", { space: tg.id, action: "remove" }]] : []),
    ["Close", "space.close", { id: tg.id }],
  ];
}

const ROW = 31;
const SEP = 9;
const SWATCHES = 30;

// Opens the menu sized to its items. A Set's worktree items need a git check first.
export function openMenu(kind, target, cx) {
  const open = (git) =>
    openOverlay({
      mod: "daw",
      kind: "popup",
      width: 220,
      height: 10 + SWATCHES + SEP + items(kind, target, git).length * ROW + SEP,
      props: { role: "menu", kind, target, git },
    });
  const space = kind === "space" && spaces().find((s) => s.id === target.id);
  const folder = space && place(space);
  if (!folder) return open(null);
  cx.spawn(async () => open(await checkout(folder, space.machine).catch(() => null)));
}

function setColor(kind, id, color) {
  if (kind === "space") {
    const ids = new Set(spaces().map((s) => s.id));
    const all = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([k]) => ids.has(k)));
    if (color) all[id] = color;
    else delete all[id];
    setShared("space.colors", all);
  } else {
    const ids = new Set(spaces().flatMap((s) => (s.tabs ?? []).map((t) => t.id)));
    const all = Object.fromEntries(Object.entries(shared(TRACK_COLORS) ?? {}).filter(([k]) => ids.has(k)));
    if (color) all[id] = color;
    else delete all[id];
    setShared(TRACK_COLORS, all);
  }
}

function menuIcon(command) {
  const name = command.endsWith(".close") ? "x" : command.endsWith(".rename") ? "square-pen" : command.endsWith(".new") ? "plus" : command === "worktree" ? "git-branch" : "terminal";
  return `mods/workspace-chrome/${name}.svg`;
}

// The key bound to a command, for the hint on the right.
function hint(name) {
  return keys().find((b) => b.section === "global" && b.action === name)?.keys ?? "";
}

export default class Menu {
  init(_props, cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  choose(i) {
    const p = props();
    const it = items(p.kind, p.target, p.git)[i];
    if (!it) return;
    this.close();
    if (it[1] === "worktree") openOverlay({ mod: "worktree", kind: "dialog", ...(it[2].action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: it[2] });
    else run(it[1], it[2]);
  }

  render(cx) {
    const t = theme();
    const p = props() ?? {};
    const list = items(p.kind, p.target ?? {}, p.git);
    const id = p.target?.id;
    // A Set the sidebar colored has a theme color name: its swatch is the DAW's version.
    const kept = p.kind === "space" ? (shared("space.colors") ?? {})[id] : (shared(TRACK_COLORS) ?? {})[id];
    const current = ANSI[kept] ?? kept;

    const swatch = (color, i) =>
      div()
        .id(`mc-${i}`)
        .size(14)
        .flex_none()
        .rounded(3)
        .cursor_pointer()
        .when(Boolean(color), (el) => el.bg(color))
        .when(!color, (el) => el.border_1().border_color(t.muted).flex().items_center().justify_center().text_size(10).text_color(t.muted).child("⌀"))
        .when(color === current || (!color && !current), (el) => el.border_2().border_color("#f2f2f2"))
        .hover((s) => s.opacity(0.8))
        .tooltip(color ? "Color" : "Automatic color")
        .on_click(() => {
          setColor(p.kind, id, color);
          this.close();
        });

    return v_flex()
      .id("daw-menu")
      .track_focus(this.handle)
      .size_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") this.close();
        else return;
        cx.notify();
      })
      .child(
        h_flex()
          .h(SWATCHES)
          .px(8)
          .gap(3)
          .items_center()
          .children([...CLIPS, null].map(swatch)),
      )
      .child(div().mx(7).my(4).h(1).bg(t.border))
      .children(
        list.map((it, i) =>
          v_flex()
            .when(it[1].endsWith(".close"), (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
            .child(
              h_flex()
                .id(`mi-${i}`)
                .h(ROW)
                .px(8)
                .gap(9)
                .rounded(7)
                .items_center()
                .text_color(t.foreground)
                .when(i === this.at, (el) => el.bg(t.selected))
                .hover((s) => s.bg(t.hover))
                .on_click(() => this.choose(i))
                .child(svg(menuIcon(it[1])).size(14).flex_none().text_color(t.muted))
                .child(div().flex_1().child(it[0]))
                .child(div().text_size(11).text_color(t.dim).child(hint(it[1]))),
            ),
        ),
      );
  }
}
