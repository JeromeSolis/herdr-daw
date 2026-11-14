// The scene editor: a dialog for one task scene of a Set.
// Props: { role: "scene", space, index (null: a new scene), overlay }.
// A scene has a name, an agent (one installed where the Set lives) and a task, the
// agent's first message. Save (⌘↩ / Ctrl+Enter in the task) keeps it, Delete removes
// it, Esc closes.

import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { props, closeOverlay, theme, spaces } from "herdr";
import { C, scenesOf, saveScenes, installedOn, programIcon, primary } from "./kit.js";

export default class SceneEditor {
  init(_p, cx) {
    const p = props() ?? {};
    const scene = p.index === null || p.index === undefined ? null : scenesOf(p.space)[p.index];
    this.space = p.space;
    this.index = scene ? p.index : null;
    this.agent = scene?.agent ?? installedOn(this.machine())[0]?.key ?? "claude";
    this.name = InputState.new({ placeholder: "Review PR", value: scene?.name ?? "" });
    this.task = TextareaState.new({ placeholder: "What should the agent do first?", value: scene?.task ?? "", rows: 6 });
    this.name.on("submit", () => this.save());
    this.task.on("submit", (e) => { if (e.secondary) this.save(); });
    this.name.focus();
    cx.timer.after(300, () => this.name.focus());
    this.handle = cx.focus_handle();
  }

  machine() {
    return spaces().find((s) => s.id === this.space)?.machine ?? null;
  }

  close() {
    closeOverlay(props().overlay);
  }

  save() {
    const name = this.name.value().trim();
    if (!name) return;
    const list = [...scenesOf(this.space)];
    const scene = { name, agent: this.agent, task: this.task.value().trim() };
    if (this.index === null) list.push(scene);
    else list[this.index] = scene;
    saveScenes(this.space, list);
    this.close();
  }

  remove() {
    if (this.index !== null) saveScenes(this.space, scenesOf(this.space).filter((_s, i) => i !== this.index));
    this.close();
  }

  render() {
    const t = theme();
    const agents = installedOn(this.machine());
    const field = (text) => div().pt(14).pb(6).text_size(10).font_semibold().text_color(C.dim).child(text.toUpperCase());
    const button = (id, text, kind, action) =>
      h_flex()
        .id(id)
        .h(28)
        .px(12)
        .items_center()
        .rounded(3)
        .border_1()
        .border_color(C.wellEdge)
        .bg(kind === "primary" ? C.amber : C.well)
        .text_color(kind === "primary" ? C.ink : kind === "danger" ? C.red : C.text)
        .text_size(12)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.opacity(0.88))
        .on_click(action)
        .child(text);
    const box = (el) => el.px(8).rounded(3).border_1().border_color(C.wellEdge).bg(C.well).text_size(12.5).text_color(C.text);

    return v_flex()
      .id("scene-editor")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { this.close(); cx.stop_propagation(); }
      })
      .size_full()
      .min_h(0)
      .p(16)
      .bg(C.panel)
      .text_color(C.text)
      .child(
        h_flex()
          .items_center()
          .child(div().flex_1().text_size(14).font_semibold().child(this.index === null ? "New scene" : "Edit scene"))
          .child(div().text_size(10.5).text_color(C.dim).child("Esc")),
      )
      .child(field("Name"))
      .child(box(Input.new(this.name).h(30)))
      .child(field("Agent"))
      .child(
        h_flex()
          .flex_wrap()
          .gap(6)
          .when(!agents.length, (el) => el.child(div().text_size(11.5).text_color(C.dim).child("No installed agents found yet")))
          .children(
            agents.map((a) =>
              h_flex()
                .id(`sc-ag-${a.key}`)
                .h(26)
                .px(8)
                .gap(6)
                .items_center()
                .rounded(3)
                .border_1()
                .border_color(C.wellEdge)
                .bg(this.agent === a.key ? C.amber : C.well)
                .text_color(this.agent === a.key ? C.ink : C.muted)
                .text_size(12)
                .cursor_pointer()
                .on_click((_e, cx) => { this.agent = a.key; cx.notify(); })
                .when(Boolean(a.icon), (el) => el.child(programIcon(a, 13, this.agent === a.key ? C.ink : C.muted)))
                .child(a.name),
            ),
          ),
      )
      .child(field("Task (its first message)"))
      .child(box(Textarea.new(this.task).h(110).py(6)))
      .child(div().pt(5).text_size(10.5).text_color(C.dim).child(`Launching the scene starts a new track (tab) with this agent and task. ${primary("↩", "Enter")} saves.`))
      .child(div().flex_1())
      .child(
        h_flex()
          .pt(14)
          .gap(8)
          .when(this.index !== null, (el) => el.child(button("sc-delete", "Delete", "danger", () => this.remove())))
          .child(div().flex_1())
          .child(button("sc-cancel", "Cancel", "plain", () => this.close()))
          .child(button("sc-save", "Save", "primary", () => this.save())),
      );
  }
}
