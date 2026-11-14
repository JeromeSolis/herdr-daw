// The status bar (bottom): what the focused terminal is on the left; the space and
// tab, then view toggles (Browser, Session, Detail) and the layout switch on the right.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, theme, layout } from "herdr";
import { C, folder, shown, toggle, find } from "./kit.js";

const flip = (id) => run("layout.toggle", { id });

// Without the terminals the session grid takes the whole height, then gets its
// own height back.
function flipDetail() {
  const session = find(layout(), "session");
  if (shown("detail")) {
    if (session?.size?.px) localStorage.setItem("session.px", String(session.size.px));
    run("layout.hide", { id: "detail" });
    run("layout.resize", { id: "session", weight: 1 });
  } else {
    run("layout.show", { id: "detail" });
    run("layout.resize", { id: "session", px: Number(localStorage.getItem("session.px")) || 236 });
  }
}

export default class Status {
  init() {}

  render() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((tb) => tb.active);
    const p = panes().find((x) => x.focused);
    const parts = p
      ? [p.program?.name ?? (p.mod || "shell"), folder(p.cwd), p.branch ? `⎇ ${p.branch}` : null, p.status ? p.status : null].filter(Boolean)
      : [];
    return h_flex()
      .size_full()
      .px(8)
      .gap(6)
      .items_center()
      .bg(C.bar)
      .border_t(1)
      .border_color(t.border)
      .text_size(11)
      .text_color(C.muted)
      .child(div().flex_1().min_w(0).truncate().child(parts.length ? parts.join("   ·   ") : "No terminal selected"))
      .child(div().flex_none().max_w(260).truncate().pr(4).text_color(C.dim).child(space ? `${space.name}  /  ${tab?.name ?? ""}` : ""))
      .child(toggle("st-browser", "BROWSER", shown("browser"), () => flip("browser"), "Show or hide the browser"))
      .child(toggle("st-session", "SESSION", shown("session"), () => flip("session"), "Show or hide the session grid"))
      .child(toggle("st-detail", "DETAIL", shown("detail"), flipDetail, "Show or hide the terminals"))
      .child(toggle("st-layout", "⇆", false, () => run("layout.switch"), "Next layout"));
  }
}
