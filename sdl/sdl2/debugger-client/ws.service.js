export class WsService {
  /** @type {WebSocket} */
  static get ws() {
    return window["ws"];
  }

  /**
   * @param {import('./breakpoints/breakpoints.component').Breakpoint} bpt
   */
  static sendBreakpoint(bpt) {
    let type = 0;
    if (bpt.execute) {
      type |= 1;
    }

    if (bpt.read) {
      type |= 2;
    }

    if (bpt.write) {
      type |= 4;
    }

    this.ws.send(`bpt add ${bpt.address} ${type}`);
  }

  static syncBreakpoints() {
    /** @type {import('./breakpoints/breakpoints.component').Breakpoint[]} */
    const breakpoints = (
      JSON.parse(localStorage.getItem("breakpoints")) || []
    ).filter((bpt) => bpt.enabled);

    if (this.ws) {
      this.ws.send("bpt clear_all");

      if (breakpoints.length) {
        breakpoints.forEach((bpt) => this.sendBreakpoint(bpt));
      }
    }
  }
}
