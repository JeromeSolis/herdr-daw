// Activity lanes: the Master cell's overview of the last 30 minutes, colored by
// status: green working, red waiting on you, amber done, gray idle; nothing where no
// agent existed yet. Now is the right edge; faint gridlines mark every 10 minutes.
// Rows come from the session: one per agent while few, else one per track (its
// agents merged), and the last row takes whatever doesn't fit. A merged row shows,
// at each moment, its most urgent status (waiting on you > done > working > idle).
// Each lane carries its track number at the left when lanes are tall enough to read.
// History is recorded here (Herdr keeps no past states): every status change as it's
// seen, plus a sample every 10 s, for every agent in every Set, kept in localStorage
// so a reload doesn't wipe it. It starts empty the first time the mod runs.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { C } from "./kit.js";

export const SPAN = 30 * 60000; // what the lanes show, ms
const KEEP = SPAN + 60000; // what's kept
const STORE = "lanes";
const SLACK = 15000; // a segment counts this long past its last sample
const LABEL = 12; // label column, px
const MIN_LABELED = 5; // lane height below which labels are left out

const COLOR = { working: "#62d56a", blocked: "#ff4f4f", done: "#f5c84a", idle: "#5c5c5c" };
const WORD = { working: "working", blocked: "waiting on you", done: "done", idle: "idle" };
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };

export class ActivityLanes {
  constructor() {
    try { this.hist = JSON.parse(localStorage.getItem(STORE) ?? "{}"); } catch { this.hist = {}; }
    this.saved = Date.now();
  }

  // Extend each agent's last segment, or start a new one when its status changed
  // (or it was gone for more than a sample).
  record(list, now = Date.now()) {
    for (const a of list) {
      const segs = (this.hist[a.address] ??= []);
      const last = segs[segs.length - 1];
      if (last && last.s === a.status && now - last.to < 30000) last.to = now;
      else segs.push({ s: a.status, from: last && now - last.to < 30000 ? last.to : now, to: now });
    }
    for (const [k, segs] of Object.entries(this.hist)) {
      const kept = segs.filter((g) => now - g.to < KEEP);
      if (kept.length) this.hist[k] = kept;
      else delete this.hist[k];
    }
    if (now - this.saved > 60000) this.save(now);
  }

  save(now = Date.now()) {
    this.saved = now;
    try { localStorage.setItem(STORE, JSON.stringify(this.hist)); } catch {}
  }

  // The status these agents show at time t: the most urgent among them, or null.
  at(addrs, t) {
    let best = null;
    for (const a of addrs) {
      for (const g of this.hist[a] ?? []) {
        if (g.from <= t && t <= g.to + SLACK && (RANK[g.s] ?? 0) > (RANK[best] ?? 0)) best = g.s;
      }
    }
    return best;
  }

  // A row's runs across `cols` columns of the window: [{ s, a, b }] in columns.
  runs(addrs, cols, now) {
    const out = [];
    for (let c = 0; c < cols; c++) {
      const s = this.at(addrs, now - SPAN + ((c + 0.5) / cols) * SPAN);
      const last = out[out.length - 1];
      if (last && last.s === s) last.b = c + 1;
      else out.push({ s, a: c, b: c + 1 });
    }
    return out.filter((r) => r.s);
  }

  summary(runs, cols) {
    const tot = {};
    for (const r of runs) tot[r.s] = (tot[r.s] ?? 0) + ((r.b - r.a) / cols) * SPAN;
    const m = (ms) => (ms < 60000 ? "<1m" : `${Math.round(ms / 60000)}m`);
    return ["working", "blocked", "done", "idle"].filter((s) => tot[s]).map((s) => `${WORD[s]} ${m(tot[s])}`).join(" · ");
  }

  // Rows: [{ label, name, addrs }]. w × h px.
  view(rows, w, h, now = Date.now()) {
    const gap = rows.length > 5 ? 1 : 2;
    const lane = Math.max(2, Math.min(8, Math.floor((h - gap * (rows.length - 1)) / Math.max(1, rows.length))));
    const labeled = lane >= MIN_LABELED;
    const lw = labeled ? w - LABEL : w; // lane width
    const cols = Math.max(1, Math.round(lw));
    const drawn = rows.map((r) => ({ ...r, runs: this.runs(r.addrs, cols, now) }));
    const tip = rows.length
      ? ["Activity, last 30 min (now at the right)", ...drawn.map((r) => `${r.name}: ${this.summary(r.runs, cols) || "no history yet"}`)].join("\n")
      : "Activity lanes: no agents in this Set";
    const grid = [1, 2].map((k) => div().absolute().top(0).left(Math.round(w - (k * lw) / 3)).w(1).h(h).bg("#ffffff12"));
    return div()
      .id("master-lanes")
      .relative()
      .w(w)
      .h(h)
      .tooltip(tip)
      .child(
        v_flex()
          .w(w)
          .h(h)
          .gap(gap)
          .justify_center()
          .when(!rows.length, (el) => el.child(div().text_size(10).text_color(C.dim).child("no agents")))
          .children(
            drawn.map((r) =>
              h_flex()
                .w(w)
                .h(lane)
                .items_center()
                .when(labeled, (el) =>
                  el.child(div().w(LABEL).flex_none().font_family(C.mono).text_size(Math.min(9, lane + 3)).line_height(lane).text_color(C.dim).child(r.label)),
                )
                .child(
                  div()
                    .relative()
                    .w(lw)
                    .h(lane)
                    .rounded(1)
                    .bg("#161616")
                    .children(r.runs.map((x) => div().absolute().top(0).left((x.a / cols) * lw).w(Math.max(1, ((x.b - x.a) / cols) * lw)).h(lane).bg(COLOR[x.s] ?? COLOR.idle))),
                ),
            ),
          ),
      )
      .children(grid);
  }
}
