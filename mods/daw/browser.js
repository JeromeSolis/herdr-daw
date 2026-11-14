// The Browser (left): search, then Sets (spaces), Agents, Running and Places.
//   Search: opens the picker. Sets: click shows one, double-click renames, + makes one.
//   Agents: the agents installed where the shown Set lives, like a DAW's instruments.
//   Click adds one as a new track (a tab); ⌥/Alt-click adds it as a clip in the shown
//   track (a split beside the focused pane). The number: how many run in this Set.
//   Running: running agents, most urgent first (needs you, done, working, idle); click
//   focuses one; this list is also the order agent.next / agent.prev follow.
//   Places: the folders your terminals are in; click opens a new tab there.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, panes, focused, run, theme, home, setAgentOrder, knownAgents, shared, setShared } from "herdr";
import { C, spaceColor, folder, programIcon, led, clean, label, shortcut, mod } from "./kit.js";

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };

// The + menu's cache of installed agents per machine, shared so both stay quick.
const KNOWN = "new-menu.agents";

function section(title, extra) {
  return h_flex()
    .h(24)
    .mt(6)
    .px(10)
    .items_center()
    .child(div().flex_1().child(label(title)))
    .when(Boolean(extra), (el) => el.child(extra));
}

function row(id, on) {
  return h_flex()
    .id(id)
    .h(22)
    .mx(4)
    .px(6)
    .gap(7)
    .items_center()
    .rounded(2)
    .text_size(12)
    .cursor_pointer()
    .when(on, (el) => el.bg("#4b3a1c").text_color("#f2f2f2"))
    .when(!on, (el) => el.text_color(C.muted).hover((s) => s.bg("#ffffff0d").text_color(C.text)));
}

export default class Browser {
  init(_props, cx) {
    this.loadAgents(cx, spaces().find((s) => s.active)?.machine ?? null);
    // Agents installed later show up within a minute.
    cx.timer.every(60000, (cx) => this.loadAgents(cx, spaces().find((s) => s.active)?.machine ?? null));
  }

  // The agents installed where the shown Set lives: the last list at once (the +
  // menu's cache), then a fresh check. Herdr caches the check for a minute.
  loadAgents(cx, machine) {
    const where = machine ?? "";
    this.machine = where;
    this.installed = (shared(KNOWN)?.[where] ?? []).filter((a) => a.installed);
    cx.spawn(async (cx) => {
      try {
        const list = await knownAgents({ on: machine });
        setShared(KNOWN, { ...(shared(KNOWN) ?? {}), [where]: list });
        if (this.machine === where) this.installed = list.filter((a) => a.installed);
      } catch {}
      cx.notify();
    });
  }

  // Click: a new track (tab) running the agent. ⌥-click: a new clip in the shown
  // track, split beside the focused pane (else the track's first).
  add(agent, active, alt) {
    if (!active) return;
    const tab = active.tabs.find((tb) => tb.active);
    const mine = tab ? panes().filter((p) => p.tab === tab.id) : [];
    const f = focused()?.pane;
    const beside = mine.find((p) => p.pane === f) ?? mine[0];
    if (alt && beside) run("pane.split", { direction: "right", pane: beside.pane, argv: agent.run });
    else run("tab.new", { name: agent.name, space: active.id, argv: agent.run });
  }

  render(cx) {
    const t = theme();
    const all = spaces();
    const active = all.find((s) => s.active);
    // A Set on another machine: its own agents.
    if ((active?.machine ?? "") !== this.machine) this.loadAgents(cx, active?.machine ?? null);
    const installed = this.installed ?? [];

    const list = agents()
      .map((a, i) => ({ a, i }))
      .sort((x, y) => (RANK[y.a.status] ?? 0) - (RANK[x.a.status] ?? 0) || x.i - y.i)
      .map((x) => x.a);
    setAgentOrder(list.map((a) => a.address));

    // Live folders first, then where spaces start, then home.
    const seen = new Set();
    const places = [];
    for (const f of [...panes().map((p) => p.cwd), ...all.map((s) => s.folder), home()]) {
      if (!f || seen.has(f)) continue;
      seen.add(f);
      places.push(f);
    }

    const plus = div()
      .id("brw-new-space")
      .size(16)
      .flex()
      .items_center()
      .justify_center()
      .rounded(2)
      .text_color(C.dim)
      .hover((s) => s.bg("#ffffff14").text_color(C.text))
      .tooltip("New Set (space)")
      .on_click(() => run("space.new"))
      .child(svg("mods/workspace-chrome/plus.svg").size(12));

    return v_flex()
      .size_full()
      .bg(C.panel)
      .child(
        div().p(6).flex_none().child(
          h_flex()
            .id("brw-search")
            .h(24)
            .px(7)
            .gap(6)
            .items_center()
            .rounded(2)
            .bg(C.well)
            .border_1()
            .border_color(C.wellEdge)
            .text_size(12)
            .text_color(C.dim)
            .cursor_pointer()
            .hover((s) => s.text_color(C.muted))
            .on_click(() => run("mod.open", { name: "picker" }))
            .child(svg("mods/workspace-chrome/search.svg").size(12))
            .child(div().flex_1().child("Search"))
            .child(div().text_size(10.5).child(shortcut("mod.open:picker"))),
        ),
      )
      .child(
        v_flex()
          .id("brw-scroll")
          .flex_1()
          .min_h(0)
          .pb(8)
          .overflow_y_scrollbar()
          .child(section("Sets", plus))
          .children(
            all.map((s, i) =>
              row(`brw-sp-${s.id}`, s.active)
                .on_click((e) => run(e.click_count === 2 ? "space.rename" : "space.select", { id: s.id }))
                .child(div().size(10).flex_none().rounded(2).bg(spaceColor(s, i)))
                .child(div().flex_1().min_w(0).truncate().child(s.name))
                .when(Boolean(s.status && s.status !== "idle"), (el) => el.child(led(t, s.status, 7)))
                .child(div().flex_none().text_size(10.5).text_color(C.dim).child(`${s.tabs.length}`)),
            ),
          )
          .child(section("Agents"))
          .when(!installed.length, (el) => el.child(div().px(14).h(22).flex().items_center().text_size(11.5).text_color(C.dim).child("Checking installed agents…")))
          .children(
            installed.map((ag) => {
              const here = list.filter((a) => a.space === active?.id && a.program?.key === ag.key).length;
              return row(`brw-in-${ag.key}`, false)
                .tooltip(`Click: new ${ag.name} track · ${mod("alt")}-click: add to the shown track`)
                .on_click((e) => this.add(ag, active, e.modifiers?.alt))
                .when(Boolean(ag.icon), (el) => el.child(programIcon(ag, 13, C.muted)))
                .child(div().flex_1().min_w(0).truncate().child(ag.name))
                .when(here > 0, (el) => el.child(div().flex_none().text_size(10.5).text_color(C.dim).child(String(here))));
            }),
          )
          .child(section("Running"))
          .when(!list.length, (el) => el.child(div().px(14).h(22).flex().items_center().text_size(11.5).text_color(C.dim).child("No agents running")))
          .children(
            list.map((a) => {
              const name = clean(a.title);
              const shownName = name && name !== a.program?.name ? name : a.program?.name || a.address;
              return row(`brw-ag-${a.address}`, a.focused)
                .tooltip(`${a.program?.name ?? "agent"} · ${a.space_name} / ${a.tab_name}`)
                .on_click(() => run("agent.focus", { terminal: a.address }))
                .child(led(t, a.status, 7))
                .when(Boolean(a.program?.icon), (el) => el.child(programIcon(a.program, 13, C.muted)))
                .child(div().flex_1().min_w(0).truncate().child(shownName))
                .when(a.pinned, (el) => el.child(div().flex_none().text_size(10).text_color(C.amber).child("●")))
                .child(div().flex_none().max_w(70).truncate().text_size(10.5).text_color(C.dim).child(a.space_name));
            }),
          )
          .child(section("Places"))
          .children(
            places.slice(0, 10).map((f, i) =>
              row(`brw-pl-${i}`, false)
                .tooltip(`New tab in ${f}`)
                .on_click(() => run("tab.new", active ? { space: active.id, folder: f } : { folder: f }))
                .child(svg("mods/daw/folder.svg").size(12).flex_none().text_color(C.dim))
                .child(div().flex_1().min_w(0).truncate().child(folder(f))),
            ),
          ),
      );
  }
}
