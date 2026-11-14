// The Control Bar: the window's draggable top strip.
//   left    TAB (new tab), the active space in an LCD (opens the picker), working/agents as a "time signature"
//   center  position display (how long the shown space has been working), play / stop / record:
//           ▶ lit green while agents work, ■ lit amber when some finished, ● pulses red when one needs you;
//           each jumps to the next agent in that state
//   right   CPU / RAM / GPU meters (GPU hidden when nothing reports it), palette and settings, window buttons where the system has none

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, run, theme, exec, window as win } from "herdr";
import { C, own, mac, shortcut } from "./kit.js";

function elapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h}. ${String(m).padStart(2, "0")}. ${String(r).padStart(2, "0")}`;
}

// A recessed LCD-style box.
function lcd(id, el) {
  return own(h_flex())
    .id(id)
    .h(24)
    .px(8)
    .gap(6)
    .flex_none()
    .items_center()
    .rounded(2)
    .bg(C.well)
    .border_1()
    .border_color(C.wellEdge)
    .text_color(C.text)
    .child(el);
}

export default class Transport {
  init(_props, cx) {
    this.cursor = {};
    this.cpu = null;
    this.ram = null;
    this.gpu = undefined;
    this.cores = 1;
    cx.spawn(async (cx) => {
      try {
        const r = await exec(mac() ? "sysctl" : "nproc", mac() ? ["-n", "hw.ncpu"] : []);
        this.cores = Math.max(1, parseInt(r.stdout, 10) || 1);
      } catch {}
      await this.sample(cx);
    });
    cx.timer.every(3000, (cx) => this.sample(cx));
    // The position display only moves while something works.
    cx.timer.every(1000, (cx) => { if (agents().some((a) => a.status === "working")) cx.notify(); });
  }

  sample(cx) {
    return cx.spawn(async (cx) => {
      const [cpu, ram, gpu] = await Promise.all([this.readCpu(), this.readRam(), this.readGpu()]);
      const changed = cpu !== this.cpu || ram?.pct !== this.ram?.pct || gpu !== this.gpu;
      this.cpu = cpu;
      this.ram = ram;
      this.gpu = gpu;
      if (changed) cx.notify();
    });
  }

  // Every process's CPU share, over the machine's cores.
  async readCpu() {
    try {
      const r = await exec("ps", ["-A", "-o", "%cpu="], { timeout: 4000 });
      const total = r.stdout.split("\n").reduce((n, l) => n + (parseFloat(l) || 0), 0);
      return Math.min(100, Math.round(total / this.cores));
    } catch { return null; }
  }

  // Memory in use, as Activity Monitor counts it (app + wired + compressed);
  // on Linux, total minus MemAvailable.
  async readRam() {
    try {
      if (mac()) {
        if (!this.memTotal) this.memTotal = Number((await exec("sysctl", ["-n", "hw.memsize"])).stdout.trim()) || 0;
        const out = (await exec("vm_stat", [], { timeout: 4000 })).stdout;
        const page = Number(out.match(/page size of (\d+)/)?.[1] ?? 16384);
        const n = (name) => Number(out.match(new RegExp(`${name}:\\s+(\\d+)`))?.[1] ?? 0);
        const used = (n("Anonymous pages") - n("Pages purgeable") + n("Pages wired down") + n("Pages occupied by compressor")) * page;
        return this.memTotal ? { pct: Math.min(100, Math.round((100 * used) / this.memTotal)), used, total: this.memTotal } : null;
      }
      const info = (await exec("cat", ["/proc/meminfo"], { timeout: 4000 })).stdout;
      const kb = (name) => Number(info.match(new RegExp(`${name}:\\s+(\\d+)`))?.[1] ?? 0) * 1024;
      const total = kb("MemTotal"), used = total - kb("MemAvailable");
      return total ? { pct: Math.round((100 * used) / total), used, total } : null;
    } catch { return null; }
  }

  // GPU utilization: Apple's accelerator stats on macOS, nvidia-smi elsewhere.
  // No reading (no GPU, no tool) hides the meter.
  async readGpu() {
    if (this.noGpu) return null;
    try {
      if (mac()) {
        const out = (await exec("ioreg", ["-r", "-d", "1", "-c", "IOAccelerator"], { timeout: 4000 })).stdout;
        const all = [...out.matchAll(/"Device Utilization %"=(\d+)/g)].map((m) => Number(m[1]));
        if (all.length) return Math.min(100, Math.max(...all));
      } else {
        const r = await exec("nvidia-smi", ["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"], { timeout: 4000 });
        const all = r.stdout.split("\n").map((l) => parseFloat(l)).filter((v) => !Number.isNaN(v));
        if (r.code === 0 && all.length) return Math.min(100, Math.max(...all));
      }
    } catch {}
    this.noGpu = true;
    return null;
  }

  // One small meter: label, bar, percent.
  meter(name, value) {
    const v = value ?? 0;
    const color = v > 85 ? C.red : v > 60 ? C.amber : C.green;
    return h_flex()
      .gap(5)
      .items_center()
      .child(div().text_size(10).font_semibold().text_color(C.dim).child(name))
      .child(div().w(34).h(6).rounded(1).bg("#101010").child(div().h_full().w(Math.max(1, (34 * v) / 100)).rounded(1).bg(color)))
      .child(div().w(30).text_right().font_family(C.mono).text_size(11.5).child(value === null || value === undefined ? "…" : `${v}%`));
  }

  // Each transport button jumps through the agents in its state, in turn.
  jump(status) {
    const list = agents().filter((a) => a.status === status);
    if (!list.length) return;
    const i = ((this.cursor[status] ?? -1) + 1) % list.length;
    this.cursor[status] = i;
    run("agent.focus", { terminal: list[i].address });
  }

  transportButton(id, icon, lit, color, status, tip, pulse) {
    const glyph = svg(`mods/daw/${icon}.svg`).size(13).text_color(lit ? C.ink : C.muted);
    return own(div())
      .id(id)
      .w(30)
      .h(24)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .rounded(2)
      .border_1()
      .border_color(C.wellEdge)
      .bg(lit ? color : C.well)
      .cursor_pointer()
      .tooltip(tip)
      .when(!lit, (el) => el.hover((s) => s.bg("#262626")))
      .when(lit && pulse, (el) => el.loop("opacity", { from: 0.55, to: 1, period: 700 }))
      .on_click(() => this.jump(status))
      .child(glyph);
  }

  render() {
    const t = theme();
    const w = win() ?? {};
    const all = spaces();
    const space = all.find((s) => s.active);
    const list = agents();
    const count = (s) => list.filter((a) => a.status === s).length;
    const working = count("working"), done = count("done"), blocked = count("blocked");

    // The shown space's longest-running work, like a song position.
    const since = (space?.tabs ?? []).map((tb) => tb.working_since).filter(Boolean);
    const position = since.length ? elapsed(Date.now() - Math.min(...since)) : "1. 1. 1";

    const gb = (b) => (b / 1073741824).toFixed(1);
    const loadTip = [
      `CPU ${this.cpu ?? "…"}%`,
      this.ram ? `RAM ${gb(this.ram.used)} of ${gb(this.ram.total)} GB` : "RAM …",
      !this.noGpu ? `GPU ${this.gpu ?? "…"}%` : null,
    ].filter(Boolean).join(" · ");

    return h_flex()
      .size_full()
      .px(8)
      .gap(6)
      .items_center()
      .bg(C.bar)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .when(w.platform === "macos" && w.titlebar === "none" && !w.fullscreen, (el) => el.pl(78))
      // Left: tap-tempo's place makes tabs; the "tempo" LCD is the space.
      .child(
        own(div())
          .id("tr-tab")
          .h(24)
          .px(8)
          .flex()
          .items_center()
          .rounded(2)
          .border_1()
          .border_color(C.wellEdge)
          .bg(C.well)
          .text_size(10.5)
          .font_semibold()
          .text_color(C.muted)
          .cursor_pointer()
          .hover((s) => s.text_color(C.text).bg("#262626"))
          .tooltip("New tab in this space")
          .on_click(() => run("tab.new", space ? { space: space.id } : {}))
          .child("TAB"),
      )
      .child(
        lcd(
          "tr-space",
          h_flex()
            .gap(6)
            .items_center()
            .child(div().w(128).truncate().font_family(C.mono).text_size(12.5).text_color(C.amber).child(space?.name ?? "—"))
            .child(svg("mods/daw/caret.svg").size(10).text_color(C.dim)),
        )
          .cursor_pointer()
          .tooltip("Live Set (space) — click to open another")
          .on_click(() => run("mod.open", { name: "picker" })),
      )
      .child(
        lcd("tr-sig", div().font_family(C.mono).text_size(12.5).child(`${working}/${list.length}`))
          .cursor_pointer()
          .tooltip("Agents working / running — click for the next agent")
          .on_click(() => run("agent.next")),
      )
      .child(div().flex_1())
      // Center: position and transport.
      .child(
        lcd("tr-pos", div().w(84).text_right().font_family(C.mono).text_size(12.5).text_color(working ? C.text : C.muted).child(position))
          .tooltip("How long this space has been working"),
      )
      .child(this.transportButton("tr-play", "play", working > 0, C.green, "working", `${working} working — jump to one`, false))
      .child(this.transportButton("tr-stop", "stop", done > 0, C.yellow, "done", `${done} finished — jump to one`, false))
      .child(this.transportButton("tr-rec", "rec", blocked > 0, C.red, "blocked", `${blocked} need you — jump to one`, true))
      .child(div().flex_1())
      // Right: CPU / RAM / GPU meters, palette, settings.
      .child(
        lcd(
          "tr-load",
          h_flex()
            .gap(10)
            .items_center()
            .child(this.meter("CPU", this.cpu))
            .child(this.meter("RAM", this.ram?.pct))
            .when(!this.noGpu, (el) => el.child(this.meter("GPU", this.gpu))),
        ).tooltip(loadTip),
      )
      .child(
        lcd("tr-palette", div().text_size(10.5).font_semibold().text_color(C.muted).child(shortcut("app.palette") || "CMD"))
          .cursor_pointer()
          .hover((s) => s.bg("#262626"))
          .tooltip("Command palette")
          .on_click(() => run("app.palette")),
      )
      .child(
        lcd("tr-settings", svg("mods/workspace-chrome/settings.svg").size(13).text_color(C.muted))
          .cursor_pointer()
          .hover((s) => s.bg("#262626"))
          .tooltip("Settings")
          .on_click(() => run("app.settings")),
      )
      .when(Boolean(w.buttons), (el) =>
        el
          .child(lcd("tr-min", div().child("−")).cursor_pointer().on_click(() => run("window.minimize")))
          .child(lcd("tr-max", div().child("□")).cursor_pointer().on_click(() => run("window.maximize")))
          .child(lcd("tr-close", div().child("✕")).cursor_pointer().on_click(() => run("window.close"))),
      );
  }
}
