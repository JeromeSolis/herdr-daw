// Session View of the shown space, as a Live Set:
//   space = the Set (one shown at a time), tab = a track, pane = a clip.
// A clip is an agent or a terminal, like MIDI and audio clips: an agent clip is
// filled with the track's color and shows the agent's session title and status; a
// terminal clip is a darker shade with a ›_ mark and what it runs.
//   Track headers (tabs): click shows the tab, double-click renames it, right-click
//   opens the tab menu (Rename, New tab, Close). The focused pane has a white outline.
//   Clips: click shows the tab and focuses that pane, double-click zooms it,
//   right-click opens the terminal menu. A working agent's clip is playing (a green
//   triangle, pulsing); every other clip's triangle stays dark. Blocked agents pulse red,
//   done ones show an amber dot. A Claude Code or OpenCode agent's clip has a context
//   strip along its bottom edge (of its model's window, see context.js; red past 80%),
//   read from the agent's own records. The layout can fix the window for every agent
//   with a `context_window` prop on the session block.
//   Double-click an empty slot: a new terminal clip (a split) in that track.
//   Mixer: the track's number (yellow when shown), its meter (most urgent clip), and ●
//   jumps to a clip that needs you.
//   Master: task scenes, saved per Set: each is a name, an agent and its first
//   message; ▶ launches it as a new track (tab), double-click edits it, "+ scene" adds
//   one. Its mixer cell holds activity lanes: the last 30 minutes of each agent's
//   status (lanes.js). The drop zone right of the
//   tracks: double-click adds a terminal track.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, panes, agents, run, theme, openOverlay } from "herdr";
import { C, CLIPS, programIcon, clean, scenesOf, installedOn } from "./kit.js";
import { ContextReader, harness, short } from "./context.js";
import { ActivityLanes } from "./lanes.js";

const ROW = 22;
const HEAD = 22;
const MIXER = 42;
const MASTER = 168;
const DROP = 96;
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const TRACK_MAX = 172; // widest a track gets, px
const LANES_PER_AGENT = 5; // more agents than this: one activity lane per track

const urgent = (list) => list.reduce((a, s) => ((RANK[s] ?? 0) > (RANK[a] ?? 0) ? s : a), null);
const trackColor = (tab) => CLIPS[(tab.index - 1) % CLIPS.length];

// A clip color a shade darker: terminal clips.
function shade(hex, f) {
  const n = parseInt(hex.slice(1, 7), 16);
  const c = (v) => Math.round(v * f).toString(16).padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

// What a clip says: what it's doing (an agent's session title, a shell's command),
// else its program. `full` (the tooltip) has both.
function clipText(p) {
  if (p.mod) return { short: p.title || p.mod, full: p.title || p.mod };
  const prog = p.program?.name || "shell";
  const title = clean(p.title);
  // A terminal Herdr hasn't named is titled by its address (t7): that says nothing.
  const telling =
    title && title !== prog && title !== p.terminal && title.toLowerCase() !== p.program?.key && !/^[~/]/.test(title);
  return telling ? { short: title, full: `${prog} · ${title}` } : { short: prog, full: prog };
}

const show = (tab, pane) => {
  if (!tab.active) run("tab.select", { id: tab.id });
  run("pane.focus", { pane });
};

export default class Session {
  init(props, cx) {
    this.size = { width: 900, height: 236 };
    this.context = new ContextReader(props?.context_window);
    // Context for the clips' strips: every 5 s, only while the Set has agents whose
    // context can be read; redrawn only when a figure changed.
    const poll = (cx) => {
      const list = this.readable(spaces().find((s) => s.active));
      if (!list.length && !Object.keys(this.context.ctx).length) return;
      cx.spawn(async (cx) => { if (await this.context.refresh(list)) cx.notify(); });
    };
    poll(cx);
    cx.timer.every(5000, poll);
    // Activity lanes: a sample every 10 s keeps them moving (status changes are
    // recorded as they render).
    this.lanes = new ActivityLanes();
    cx.timer.every(10000, (cx) => {
      const list = agents();
      if (!list.length) return;
      this.lanes.record(list);
      cx.notify();
    });
  }

  close() {
    this.lanes?.save();
  }


  clip(t, tab, p, color, w) {
    const agent = Boolean(p.program?.agent);
    const selected = tab.active && p.focused;
    const st = p.status;
    const text = clipText(p);
    // The agent's context, as a strip along the clip's bottom edge.
    const ctx = p.terminal ? this.context.context(p.terminal) : null;
    const share = ctx === null ? 0 : Math.min(1, ctx.tokens / ctx.window);
    const tip = ctx === null
      ? text.full
      : `${text.full}\ncontext ${short(ctx.tokens)} of ${short(ctx.window)} tokens (${Math.round(share * 100)}%)${ctx.model ? ` · ${ctx.model}` : ""}`;
    return div()
      .id(`clip-${p.pane}`)
      .w(w)
      .h_full()
      .flex_none()
      .p(1)
      .border_r(1)
      .border_color(C.slotEdge)
      .child(
        h_flex()
          .id(`clip-body-${p.pane}`)
          .size_full()
          .rounded(2)
          .bg(agent ? color : shade(color, 0.55))
          .border_1()
          .border_color(selected ? "#ffffff" : "#00000033")
          .relative()
          .items_center()
          .overflow_hidden()
          .cursor_pointer()
          .hover((s) => s.opacity(0.88))
          .tooltip(tip)
          .on_click((e) => (e.click_count === 2 ? run("pane.zoom", { pane: p.pane }) : show(tab, p.pane)))
          .on_mouse_down("right", (_e, cx) => {
            cx.stop_propagation();
            const props = p.terminal
              ? { tab: "pane", target: { pane: p.pane, terminal: p.terminal } }
              : { tab: "tab", target: { id: tab.id, space: spaces().find((s) => s.active)?.id } };
            openOverlay({ mod: "menu", kind: "popup", width: 220, props });
          })
          // Launch button: green and pulsing while this clip's agent is working, dark otherwise.
          .child(
            div()
              .w(16)
              .h_full()
              .flex_none()
              .flex()
              .items_center()
              .justify_center()
              .bg("#00000038")
              .child(
                p.status === "working"
                  ? svg("mods/daw/play.svg").size(9).text_color(C.green).loop("opacity", { from: 0.35, to: 1, period: 900 })
                  : svg("mods/daw/play.svg").size(9).text_color("#00000099"),
              ),
          )
          .child(
            agent
              ? div().pl(5).flex_none().child(programIcon(p.program, 12, C.ink))
              : div().pl(5).flex_none().font_family(C.mono).text_size(10).font_bold().text_color("#e8e8e8").child("›_"),
          )
          .child(
            div()
              .flex_1()
              .min_w(0)
              .px(5)
              .truncate()
              .text_size(11)
              .font_medium()
              .text_color(agent ? C.ink : "#e8e8e8")
              .when(!agent, (el) => el.font_family(C.mono).text_size(10.5))
              .child(text.short),
          )
          .when(p.zoomed, (el) => el.child(div().pr(4).text_size(9.5).font_bold().text_color(agent ? C.ink : "#e8e8e8").child("Z")))
          .when(st === "blocked", (el) =>
            el.child(div().mr(5).size(8).flex_none().rounded_full().bg(t.blocked).border_1().border_color(C.ink).loop("opacity", { from: 0.25, to: 1, period: 600 })),
          )
          .when(st === "done", (el) => el.child(div().mr(5).size(8).flex_none().rounded_full().bg(t.done).border_1().border_color(C.ink)))
          // Context strip: dark on the clip color, red past 80% of the window.
          .when(ctx !== null, (el) =>
            el.child(
              div().absolute().left(0).bottom(0).h(3).w(w - 4).bg("#00000026")
                .child(div().h_full().w(Math.max(2, (w - 4) * share)).bg(share > 0.8 ? C.red : "#000000a0")),
            ),
          ),
      );
  }

  // An empty slot; the one right below a track's clips makes a new clip on double-click.
  empty(tab, mine, r, w) {
    const next = r === mine.length && mine.length > 0;
    return div()
      .id(`slot-${tab.id}-${r}`)
      .w(w)
      .h_full()
      .flex_none()
      .p(1)
      .border_r(1)
      .border_color(C.slotEdge)
      .child(
        h_flex()
          .id(`slot-body-${tab.id}-${r}`)
          .size_full()
          .rounded(1)
          .bg(C.slot)
          .pl(5)
          .items_center()
          .when(next, (el) =>
            el
              .hover((s) => s.bg("#363636"))
              .tooltip("Double-click: new terminal clip (split)")
              .on_click((e) => {
                if (e.click_count !== 2) return;
                if (!tab.active) run("tab.select", { id: tab.id });
                run("pane.split", { direction: "right", pane: mine[mine.length - 1].pane });
              }),
          )
          .child(div().size(6).bg(C.stopGlyph)),
      );
  }

  // Framed like a clip: an inset, rounded box with a faint edge, outlined white
  // while its tab is shown.
  header(tab, mine, color, w) {
    return div()
      .id(`track-${tab.id}`)
      .w(w)
      .h_full()
      .flex_none()
      .p(1)
      .border_r(1)
      .border_color(C.slotEdge)
      .child(
        h_flex()
          .id(`track-body-${tab.id}`)
          .size_full()
          .px(6)
          .gap(9)
          .items_center()
          .rounded(2)
          .bg(color)
          .border_1()
          .border_color(tab.active ? "#ffffff" : "#00000033")
          .when(!tab.active, (el) => el.opacity(0.62))
          .cursor_pointer()
          .hover((s) => s.opacity(0.88))
          .tooltip(`Track ${tab.index}${tab.settled ? " (settled)" : ""}`)
          .on_click((e) => (e.click_count === 2 ? run("tab.rename", { id: tab.id }) : run("tab.select", { id: tab.id })))
          // Herdr's tab menu: Rename, New tab, Close (the track and its clips).
          .on_mouse_down("right", (_e, cx) => {
            cx.stop_propagation();
            openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: tab.id, space: spaces().find((s) => s.active)?.id } } });
          })
          // Its number always, then the tab's name once someone named it ("2  fix login").
          .child(div().flex_none().text_size(11).font_bold().text_color(C.ink).child(String(tab.index)))
          .when(tab.named, (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().text_color(C.ink).child(tab.name))),
      );
  }

  mixer(tab, mine, w) {
    const blocked = mine.find((p) => p.status === "blocked");
    const statuses = mine.map((p) => p.status);
    const working = statuses.filter((s) => s === "working").length;
    const st = urgent(statuses);
    const inner = Math.max(10, w - 14);
    const level = st === "blocked" ? C.red : st === "done" ? C.yellow : working ? C.green : null;
    const fill = st === "blocked" || st === "done" ? inner : working ? inner * Math.min(1, 0.45 + 0.2 * working) : 0;
    let bar = div().h_full().rounded(1).bg(level ?? "#00000000").w(Math.max(0, fill));
    if (working && st === "working") bar = bar.loop("width", { from: fill * 0.35, to: fill, period: 520 });
    const agentsHere = mine.filter((p) => p.program?.agent).length;
    return v_flex()
      .w(w)
      .h_full()
      .flex_none()
      .px(6)
      .py(5)
      .gap(5)
      .border_r(1)
      .border_color(C.slotEdge)
      .child(div().w(inner).h(5).rounded(1).bg("#141414").child(bar))
      .child(
        h_flex()
          .gap(4)
          .items_center()
          .child(
            div()
              .id(`act-${tab.id}`)
              .h(16)
              .min_w(20)
              .px(4)
              .flex()
              .items_center()
              .justify_center()
              .rounded(1)
              .bg(tab.active ? C.yellow : "#4a4a4a")
              .text_size(10)
              .font_bold()
              .text_color(tab.active ? C.ink : C.muted)
              .cursor_pointer()
              .tooltip(`Show track ${tab.index}`)
              .on_click(() => run("tab.select", { id: tab.id }))
              .child(String(tab.index)),
          )
          .child(
            div()
              .id(`arm-${tab.id}`)
              .size(16)
              .flex_none()
              .flex()
              .items_center()
              .justify_center()
              .rounded(1)
              .bg(blocked ? C.red : "#3a3a3a")
              .when(Boolean(blocked), (el) =>
                el.cursor_pointer().tooltip("Needs you — jump to it").on_click(() => show(tab, blocked.pane)).loop("opacity", { from: 0.5, to: 1, period: 600 }),
              )
              .child(svg("mods/daw/rec.svg").size(9).text_color(blocked ? C.ink : "#5c5c5c")),
          )
          .child(
            div()
              .flex_1()
              .min_w(0)
              .truncate()
              .text_size(10)
              .text_color(C.dim)
              .child(`${mine.length} clip${mine.length === 1 ? "" : "s"}${agentsHere ? ` · ${agentsHere} agent${agentsHere === 1 ? "" : "s"}` : ""}`),
          ),
      );
  }

  // A task scene in Master. ▶ launches it: a new track (tab) named after it, running
  // its agent with its task. The triangle is green while a track it launched is working
  // (a tab of that name), with a red or amber dot when one needs you or finished.
  // Double-click the name: edit it. The row after the last scene adds one.
  scene(t, r, active, scenes, installed, tabs) {
    const cell = (el) => h_flex().id(`scene-${r}`).w(MASTER).h_full().flex_none().p(1).child(el);
    const sc = scenes[r];
    if (!sc) {
      const next = r === scenes.length && active;
      return cell(
        h_flex()
          .id(`scene-body-${r}`)
          .size_full()
          .px(8)
          .rounded(1)
          .items_center()
          .bg("#2f2f2f")
          .text_size(10.5)
          .text_color(C.dim)
          .when(Boolean(next), (el) =>
            el
              .cursor_pointer()
              .hover((s) => s.bg("#383838").text_color(C.muted))
              .tooltip("Add a task scene: a saved agent + first message")
              .on_click(() => this.editScene(active.id, null))
              .child("+ scene"),
          ),
      );
    }
    const agent = installed.find((a) => a.key === sc.agent);
    const mine = tabs.filter((tb) => tb.name === sc.name).map((tb) => tb.status);
    const st = urgent(mine);
    const tip = `${agent?.name ?? `${sc.agent} (not installed here)`}${sc.task ? ` — ${sc.task}` : ""}`;
    return cell(
      h_flex()
        .id(`scene-body-${r}`)
        .size_full()
        .rounded(1)
        .items_center()
        .bg("#3a3a3a")
        .overflow_hidden()
        .child(
          div()
            .id(`scene-go-${r}`)
            .w(18)
            .h_full()
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .bg("#00000030")
            .when(Boolean(agent && active), (el) =>
              el
                .cursor_pointer()
                .hover((s) => s.bg("#00000060"))
                .tooltip(`Launch: new ${sc.name} track`)
                .on_click(() => run("tab.new", { name: sc.name, space: active.id, argv: agent.run, ...(sc.task ? { task: sc.task } : {}) })),
            )
            .child(svg("mods/daw/play.svg").size(9).text_color(!agent ? "#4d4d4d" : st === "working" ? C.green : C.muted)),
        )
        .when(Boolean(agent?.icon), (el) => el.child(div().pl(5).flex_none().child(programIcon(agent, 11, C.muted))))
        .child(
          div()
            .id(`scene-name-${r}`)
            .flex_1()
            .min_w(0)
            .px(5)
            .truncate()
            .text_size(10.5)
            .text_color(agent ? C.text : C.dim)
            .cursor_pointer()
            .tooltip(`${tip}\nDouble-click to edit`)
            .on_click((e) => { if (e.click_count === 2 && active) this.editScene(active.id, r); })
            .child(sc.name),
        )
        .when(st === "blocked" || st === "done", (el) =>
          el.child(div().mr(5).size(7).flex_none().rounded_full().bg(t[st]).when(st === "blocked", (d) => d.loop("opacity", { from: 0.25, to: 1, period: 600 }))),
        ),
    );
  }

  editScene(space, index) {
    openOverlay({ mod: "daw", kind: "dialog", width: 460, height: 420, props: { role: "scene", space, index } });
  }

  // Master's cell: activity lanes for the shown Set, in clip order. Up to
  // LANES_PER_AGENT agents get a lane each; more, and each track gets one (its
  // agents merged). Rows that don't fit (2 px lanes, 1 px gaps) merge into a last "+".
  output(active, w) {
    const tabs = active?.tabs ?? [];
    const order = new Map();
    panes().forEach((p, i) => order.set(p.terminal, i));
    const tabAt = (id) => tabs.findIndex((tb) => tb.id === id);
    const list = agents()
      .filter((a) => a.space === active?.id)
      .sort((a, b) => tabAt(a.tab) - tabAt(b.tab) || (order.get(a.address) ?? 0) - (order.get(b.address) ?? 0));
    const h = MIXER - 12;
    let rows;
    if (list.length <= LANES_PER_AGENT) {
      rows = list.map((a) => ({ label: String(a.tab_index), name: `${a.tab_index} · ${clean(a.title) || a.program?.name || a.address}`, addrs: [a.address] }));
    } else {
      rows = tabs
        .map((tb) => ({ tb, addrs: list.filter((a) => a.tab === tb.id).map((a) => a.address) }))
        .filter((x) => x.addrs.length)
        .map(({ tb, addrs }) => ({ label: String(tb.index), name: `Track ${tb.index}${tb.named ? ` ${tb.name}` : ""} (${addrs.length} agent${addrs.length === 1 ? "" : "s"})`, addrs }));
    }
    const fit = Math.floor((h + 1) / 3);
    if (rows.length > fit) {
      const rest = rows.slice(fit - 1);
      rows = [...rows.slice(0, fit - 1), { label: "+", name: `${rest.length} more tracks merged (${rest.map((r) => r.label).join(", ")})`, addrs: rest.flatMap((r) => r.addrs) }];
    }
    return v_flex().id("master-out").w(w).h_full().flex_none().px(8).py(5).justify_center().child(this.lanes.view(rows, w - 16, h));
  }

  // The shown Set's agents on this machine whose context can be read.
  readable(active) {
    if (!active || active.machine) return [];
    const tabs = new Set(active.tabs.map((tb) => tb.id));
    return panes()
      .filter((p) => tabs.has(p.tab) && p.terminal && harness(p))
      .map((p) => ({ terminal: p.terminal, cwd: p.cwd, kind: harness(p) }));
  }

  render(cx) {
    const t = theme();
    this.lanes.record(agents());
    const active = spaces().find((s) => s.active);
    const allPanes = panes();

    const tracks = (active?.tabs ?? []).map((tab) => ({ tab, mine: allPanes.filter((p) => p.tab === tab.id), color: trackColor(tab) }));
    const W = this.size.width, H = this.size.height;
    const avail = W - MASTER - DROP - 12;
    const w = Math.max(64, Math.min(TRACK_MAX, Math.floor(avail / Math.max(1, tracks.length))));
    const most = Math.max(0, ...tracks.map((tr) => tr.mine.length));
    const fit = Math.floor((H - HEAD - MIXER - 2) / ROW);
    const scenes = active ? scenesOf(active.id) : [];
    const installed = installedOn(active?.machine ?? null);
    const rows = Math.max(most + 1, fit, scenes.length + 1, 1);

    const row = (r) =>
      h_flex()
        .id(`row-${r}`)
        .h(ROW)
        .flex_none()
        .border_b(1)
        .border_color(C.slotEdge)
        .children(tracks.map((tr) => (tr.mine[r] ? this.clip(t, tr.tab, tr.mine[r], tr.color, w) : this.empty(tr.tab, tr.mine, r, w))))
        .child(div().w(DROP).h_full().flex_none())
        .child(div().flex_1())
        .child(this.scene(t, r, active, scenes, installed, active?.tabs ?? []));

    const drop = div()
      .id("drop-zone")
      .w(DROP)
      .h_full()
      .flex_none()
      .px(6)
      .flex()
      .items_center()
      .text_size(9.5)
      .text_color(C.dim)
      .cursor_pointer()
      .hover((s) => s.text_color(C.muted))
      .tooltip("Double-click: add a terminal track (new tab)")
      .on_click((e) => {
        if (e.click_count === 2) run("tab.new", active ? { space: active.id } : {});
      })
      .child("+ track");

    return v_flex()
      .id("session-root")
      .size_full()
      .bg(C.panel)
      .overflow_hidden()
      .on_size_change((size, cx) => {
        if (size.width !== this.size.width || size.height !== this.size.height) {
          this.size = size;
          cx.notify();
        }
      })
      // Track (tab) headers, the drop zone and Master.
      .child(
        h_flex()
          .h(HEAD)
          .flex_none()
          .bg("#1f1f1f")
          .border_b(1)
          .border_color(C.ink)
          .children(tracks.map((tr) => this.header(tr.tab, tr.mine, tr.color, w)))
          .child(drop)
          .child(div().flex_1())
          .child(h_flex().w(MASTER).h_full().flex_none().px(8).items_center().bg("#4a4a4a").text_size(11).font_semibold().text_color(C.text).child("Master")),
      )
      // Clip slots and scenes.
      .child(
        v_flex()
          .id("session-rows")
          .flex_1()
          .min_h(0)
          .overflow_y_scroll()
          .children(Array.from({ length: rows }, (_, r) => row(r))),
      )
      // Mixer strip.
      .child(
        h_flex()
          .h(MIXER)
          .flex_none()
          .bg("#2c2c2c")
          .border_t(1)
          .border_color(C.ink)
          .children(tracks.map((tr) => this.mixer(tr.tab, tr.mine, w)))
          .child(div().w(DROP).h_full().flex_none())
          .child(div().flex_1())
          .child(this.output(active, MASTER)),
      );
  }
}
