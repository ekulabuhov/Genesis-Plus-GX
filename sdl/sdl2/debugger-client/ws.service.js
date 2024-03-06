export class WsService {
  /** @typedef {'open'|'message'|'close'} eventTypes */
  /** @type {WebSocket} */
  ws;
  static listeners = {};
  /**
   *
   * @param {eventTypes} event
   * @param {*} handler
   */
  static on(event, handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    this.listeners[event].push(handler);
  }

  /**
   *
   * @param {eventTypes} event
   */
  static _callListeners(event, data) {
    this.listeners[event]?.forEach((handler) => handler(data));
  }

  /* Establish connection. */
  static doConnect(addr) {
    /* Do connection. */
    const ws = (this.ws = window["ws"] = new WebSocket(addr));
    ws.onopen = () => {
      this._callListeners("open");
    };
    ws.onclose = () => {
      this._callListeners("close");
    };
    ws.onmessage = (evt) => {
      const response = JSON.parse(evt.data);
      this._callListeners("message", response);
      this._onMessage(response);
    };
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

    this.ws.send(`bpt add ${bpt.address} ${type} ${bpt.value_equal ?? ""}`);
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
   * @param {string|number} address
   * @param {number} size
   * @param {'rom' | 'vram' | 'cram'} [type]
   */
  static showMemoryLocation(address, size, type = 'rom') {
    if (typeof address !== "string") {
      address = "0x" + address.toString(16);
    }
    // Replace last char with zero as control is zero based
    address = address.slice(0, address.length - 1) + "0";
    return this.sendMessage(`mem ${address} ${size} ${type}`);
  }

  static getAsm(address) {
    return this.sendMessage(`asm ${address} 0 100`);
  }

  static send(message) {
    this.ws.send(message);
  }

  static close() {
    this.ws.close();
  }

  static sendMessage(message) {
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      this.ws.send(message);
    });
  }

  static _onMessage(data) {
    const resolve = this.waiting.shift();
    if (resolve) {
      resolve(data);
    }
  }

  static waiting = [];

  /** @type {import("./asm-viewer/asm-viewer.component").AsmViewerController} */
  static asmViewer;
  /** @type {import("./tabs/tabs.component").MyTabsController} */
  static tabsController;
  /** @type {import("./memory-viewer/memory-viewer.component").MemoryViewerController} */
  static memoryViewer;
}
