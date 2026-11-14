// Herdr Studio: a DAW-style layout (layouts/daw.json), one mod in roles.
// The layout gives each copy props { role }:
//   transport  the Control Bar on top: space LCD, play/stop/record for agent states, CPU meter
//   browser    the left Browser: search, spaces, agents, places
//   session    the Session View clip grid: spaces as tracks, tabs as clips, scenes, mixer
//   device     a pane's header, drawn as a device title bar
//   status     the bottom bar: focused terminal info and view toggles
//   scene      the task scene editor (a dialog the session grid opens)

import { View, div } from "gpui-kit";
import { props } from "herdr";
import Transport from "./transport.js";
import Browser from "./browser.js";
import Session from "./session.js";
import Device from "./device.js";
import Status from "./status.js";
import SceneEditor from "./scene.js";

const ROLES = { transport: Transport, browser: Browser, session: Session, device: Device, status: Status, scene: SceneEditor };

export default class Daw extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const R = ROLES[pr.role];
    this.role = R ? new R() : null;
    this.role?.init?.(pr, cx);
  }

  // Final cleanup for roles that keep something (the session's activity lanes).
  async close(cx) {
    await this.role?.close?.(cx);
  }

  render(cx) {
    if (!this.role) return div().child(`daw: no role "${props()?.role}"`);
    return this.role.render(cx);
  }
}
