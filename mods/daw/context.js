// Context readings for agent clips: how many tokens each agent's context window holds
// now, and how big that window is, from the agent's own records (Herdr has none). Its
// last reply's input + cached tokens is what the next request carries.
//   Claude Code: terminal --hc get--> foreground pid --~/.claude/sessions/<pid>.json-->
//     sessionId --> ~/.claude/projects/*/<sessionId>.jsonl (each reply has `usage` and
//     `model`).
//   OpenCode: ~/.local/share/opencode/opencode.db, the session given with --session /
//     -s, else the most recently active top-level session in the pane's folder (two
//     OpenCodes in one folder can't be told apart); its last reply's `tokens` and model.
// Others (Pi, Hermes) keep no readable context figures. Local agents only.
//
// The window: the session block's `context_window` prop when the layout sets one, else
// the model's: Claude models by name, OpenCode's from its models.dev cache
// (~/.cache/opencode/models.json). A reading past the window means the window is
// bigger than that (a 1M beta, an unknown model), so it steps up to the next size.

import { hc, home, readTextFile, exec } from "herdr";

const DEFAULT_WINDOW = 200000; // a model we know nothing about
const SIZES = [200000, 256000, 400000, 1000000, 2000000];
const TAIL = 150000; // bytes read from the end of a Claude log
const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;

export const harness = (p) =>
  p.program?.key === "claude" || p.app === "claude-code" ? "claude" : p.program?.key === "opencode" || p.app === "opencode" ? "opencode" : null;

// A Claude model's context window from its id (also inside Bedrock / Vertex ids):
// Fable and Mythos, Opus and Sonnet from 4.6, Haiku from 5: 1M; older: 200k.
export function claudeWindow(model) {
  const m = /claude-(?:(fable|mythos)|(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?)/.exec(model ?? "");
  if (!m) return null;
  if (m[1]) return 1000000;
  const v = Number(m[3]) + Number(m[4] ?? 0) / 10;
  if (m[2] === "haiku") return v >= 5 ? 1000000 : 200000;
  return v >= 4.6 ? 1000000 : 200000;
}

export class ContextReader {
  // window: a fixed context window for every agent (the layout's `context_window`).
  constructor(window) {
    this.fixed = Number(window) > 0 ? Number(window) : null;
    this.fg = {}; // terminal -> foreground { pid, argv }
    this.logs = {}; // Claude sessionId -> log path
    this.limits = {}; // "provider/model" -> OpenCode's window (null: not listed)
    this.ctx = {}; // terminal -> { tokens, window, model }
  }

  async foreground(addr) {
    if (this.fg[addr]) return this.fg[addr];
    const r = await hc(["get", addr]);
    const f = JSON.parse(r.stdout || "{}")?.foreground;
    if (f?.pid) this.fg[addr] = { pid: f.pid, argv: f.argv ?? [] };
    return this.fg[addr] ?? null;
  }

  // The window to measure against: the layout's, else the model's, raised past a
  // reading that doesn't fit.
  window(tokens, model) {
    const w = this.fixed ?? model ?? DEFAULT_WINDOW;
    return tokens <= w ? w : SIZES.find((s) => s >= tokens) ?? tokens;
  }

  async claude(addr) {
    const f = await this.foreground(addr);
    if (!f) return null;
    const raw = await readTextFile(`${home()}/.claude/sessions/${f.pid}.json`);
    if (!raw) { delete this.fg[addr]; return null; } // restarted: look again next time
    const { sessionId } = JSON.parse(raw);
    if (!sessionId) return null;
    if (!this.logs[sessionId]) {
      const r = await exec("sh", ["-c", `ls "$HOME"/.claude/projects/*/${sessionId}.jsonl 2>/dev/null | head -1`]);
      if (r.stdout.trim()) this.logs[sessionId] = r.stdout.trim();
    }
    const path = this.logs[sessionId];
    if (!path) return null;
    const lines = (await exec("tail", ["-c", String(TAIL), path], { timeout: 5000 })).stdout.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"usage"')) continue;
      try {
        const e = JSON.parse(lines[i]);
        const msg = e.type === "assistant" ? e.message : null;
        const u = msg?.usage;
        if (!u || msg.model === "<synthetic>") continue; // Claude Code's own notes carry empty usage
        const tokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        if (tokens > 0) return { tokens, window: this.window(tokens, claudeWindow(msg.model)), model: msg.model };
      } catch {}
    }
    return null;
  }

  // OpenCode's window for a model, from its models.dev cache (read with sqlite3, which
  // OpenCode's readings need anyway, so the 5 MB file isn't parsed here).
  async limit(provider, model) {
    const key = `${provider}/${model}`;
    if (key in this.limits) return this.limits[key];
    const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
    const file = `${home()}/.cache/opencode/models.json`;
    const r = await exec("sqlite3", [":memory:", `select json_extract(readfile(${sql(file)}), ${sql(`$.${q(provider)}.models.${q(model)}.limit.context`)})`], { timeout: 5000 });
    const n = parseInt(r.stdout.trim(), 10);
    this.limits[key] = r.code === 0 && n > 0 ? n : claudeWindow(model);
    return this.limits[key];
  }

  async opencode(addr, cwd) {
    const f = await this.foreground(addr);
    const argv = f?.argv ?? [];
    const i = argv.findIndex((a) => a === "--session" || a === "-s");
    const db = `${home()}/.local/share/opencode/opencode.db`;
    const session = i >= 0 && argv[i + 1]
      ? sql(argv[i + 1])
      : `(select id from session where directory = ${sql(cwd ?? "")} and parent_id is null order by time_updated desc limit 1)`;
    const q = `select coalesce(json_extract(data,'$.tokens.input'),0) + coalesce(json_extract(data,'$.tokens.cache.read'),0) + coalesce(json_extract(data,'$.tokens.cache.write'),0),
        coalesce(json_extract(data,'$.providerID'),''), coalesce(json_extract(data,'$.modelID'),'')
      from message where session_id = ${session} and json_extract(data,'$.role') = 'assistant' and json_extract(data,'$.tokens') is not null
      order by time_created desc limit 1`;
    const r = await exec("sqlite3", ["-readonly", "-separator", "\t", db, q], { timeout: 5000 });
    const [n, provider, model] = r.stdout.trim().split("\t");
    const tokens = parseInt(n, 10);
    if (r.code !== 0 || !(tokens > 0)) return null;
    const limit = this.fixed ? null : await this.limit(provider, model);
    return { tokens, window: this.window(tokens, limit), model };
  }

  // Refresh these panes ({ terminal, cwd, kind }); returns true when a figure changed.
  async refresh(list) {
    let changed = false;
    const live = new Set(list.map((p) => p.terminal));
    for (const p of list) {
      let r = null;
      try { r = p.kind === "claude" ? await this.claude(p.terminal) : await this.opencode(p.terminal, p.cwd); } catch {}
      const was = this.ctx[p.terminal];
      if (r?.tokens !== was?.tokens || r?.window !== was?.window) changed = true;
      if (r === null) delete this.ctx[p.terminal];
      else this.ctx[p.terminal] = r;
    }
    for (const k of Object.keys(this.ctx)) if (!live.has(k)) { delete this.ctx[k]; changed = true; }
    for (const k of Object.keys(this.fg)) if (!live.has(k)) delete this.fg[k];
    return changed;
  }

  // { tokens, window, model } for a terminal, or null.
  context(addr) {
    return this.ctx[addr] ?? null;
  }
}

export const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n));
