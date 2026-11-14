// A pane's header drawn as a device title bar. Props: { pane, terminal }.
//   Activator (left): yellow for a plain terminal; an agent's status color otherwise
//   (working pulses green, blocked pulses red, done amber, idle gray).
//   Then the program, its title, the folder and branch; buttons split right/down,
//   zoom and close. Click focuses the pane, double-click zooms it.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme } from "herdr";
import { C, folder, programIcon, clean } from "./kit.js";

export default class Device {
  init() {}

  button(id, icon, command, args, tip) {
    return div()
      .id(id)
      .size(18)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(2)
      .text_color(C.dim)
      .tooltip(tip)
      .hover((s) => s.bg("#ffffff14").text_color(C.text))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(12));
  }

  render() {
    const t = theme();
    const pane = props()?.pane;
    const p = panes().find((x) => x.pane === pane);
    if (!p) return div();
    const g = p.program;
    const name = p.mod ? p.title || p.mod : g?.name || "shell";
    const title = clean(p.title);
    const sub = title && title !== name && title.toLowerCase() !== g?.key ? title : "";
    const where = folder(p.cwd);
    const st = p.status;
    const color = st ? (st === "idle" ? "#7a7a7a" : t[st]) : C.yellow;
    let activator = div().size(10).flex_none().rounded_full().bg(color).border_1().border_color("#00000066");
    if (st === "working") activator = activator.loop("opacity", { from: 0.4, to: 1, period: 900 });
    if (st === "blocked") activator = activator.loop("opacity", { from: 0.25, to: 1, period: 600 });

    return h_flex()
      .id(`dev-${pane}`)
      .size_full()
      .pl(7)
      .pr(4)
      .gap(7)
      .items_center()
      .bg(p.focused ? "#424242" : "#333333")
      .border_b(1)
      .border_color("#0c0c0c")
      .text_size(11.5)
      .on_click((e) => run(e.click_count === 2 ? "pane.zoom" : "pane.focus", { pane }))
      .child(activator)
      .when(Boolean(g?.icon), (el) => el.child(programIcon(g, 13, p.focused ? C.text : C.muted)))
      .child(div().flex_none().max_w(200).truncate().font_semibold().text_color(p.focused ? "#f0f0f0" : C.muted).child(name))
      .when(Boolean(sub), (el) => el.child(div().flex_shrink(1).min_w(0).max_w(320).truncate().text_color(C.muted).child(sub)))
      .child(div().flex_1().min_w(0).truncate().text_color(C.dim).child(where + (p.branch ? `  ⎇ ${p.branch}` : "")))
      .when(st === "blocked", (el) =>
        el.child(div().flex_none().px(5).h(15).flex().items_center().rounded(2).bg(t.blocked).text_size(9.5).font_bold().text_color(C.ink).child("NEEDS YOU")),
      )
      .when(st === "done", (el) => el.child(div().flex_none().px(5).h(15).flex().items_center().rounded(2).bg(t.done).text_size(9.5).font_bold().text_color(C.ink).child("DONE")))
      .when(p.zoomed, (el) => el.child(div().flex_none().px(5).h(15).flex().items_center().rounded(2).bg(C.amber).text_size(9.5).font_bold().text_color(C.ink).child("ZOOM")))
      .child(this.button(`dv-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }, "Split right"))
      .child(this.button(`dv-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }, "Split down"))
      .child(this.button(`dv-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }, p.zoomed ? "Unzoom" : "Zoom"))
      .child(this.button(`dv-x-${pane}`, "close", "pane.close", { pane }, "Close"));
  }
}
