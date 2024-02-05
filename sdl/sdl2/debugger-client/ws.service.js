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
      if (!bpt.type || bpt.type === "rom") {
        type |= 2;
      } else if (bpt.type === "vram") {
        type |= 8;
      } else if (bpt.type === "cram") {
        type |= 32;
      }
    }

    if (bpt.write) {
      if (!bpt.type || bpt.type === "rom") {
        type |= 4;
      } else if (bpt.type === "vram") {
        type |= 16;
      } else if (bpt.type === "cram") {
        type |= 64;
      }
    }

    this.ws.send(`bpt add ${bpt.address} ${type} ${bpt.value_equal ?? ''}`);
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

  /**
   * @param {string} address
   * @param {'rom' | 'vram' | 'cram'} [type]
   */
  static showMemoryLocation(address, type) {
    // Replace last char with zero as control is zero based
    address = address.slice(0, address.length - 1) + "0";
    this.ws.send(`mem ${address} 128 ${type}`);
  }
}
