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
      if (!bpt.type || bpt.type === 'ROM') {
        type |= 2;
      } else if (bpt.type === 'VRAM') {
        type |= 8;
      } else if (bpt.type === 'CRAM') {
        type |= 32;
      }
    }

    if (bpt.write) {
      if (!bpt.type || bpt.type === 'ROM') {
        type |= 4;
      } else if (bpt.type === 'VRAM') {
        type |= 16;
      } else if (bpt.type === 'CRAM') {
        type |= 64;
      }
    }

    this.ws.send(`bpt add ${bpt.address} ${type} ${bpt.value_equal}`);
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
