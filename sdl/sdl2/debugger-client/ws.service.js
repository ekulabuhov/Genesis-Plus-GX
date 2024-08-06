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
  static #callListeners(event, data) {
    this.listeners[event]?.forEach((handler) => handler(data));
  }

  /* Establish connection. */
  static doConnect(addr) {
    /* Do connection. */
    const ws = (this.ws = window["ws"] = new WebSocket(addr));
    ws.onopen = () => {
      this.#callListeners("open");
    };
    ws.onclose = () => {
      this.#callListeners("close");
    };
    ws.onmessage = (evt) => {
      const response = JSON.parse(evt.data);
      this.#callListeners("message", response);
      this.#onMessage(response);
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
      } else if (bpt.type === "z80") {
        type |= 2048;
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
   * 
   * @typedef {Object} showMemoryLocationResponse
   * @prop {number[][]} data - two dimensional array 16 bytes wide
   * @prop {number} address
   * 
   * @returns {Promise<showMemoryLocationResponse>}
   */
  static showMemoryLocation(address, size, type = 'rom') {
    if (typeof address !== "string") {
      address = "0x" + address.toString(16);
    }
    // Replace last char with zero as control is zero based
    address = address.slice(0, address.length - 1) + "0";
    return this.sendMessage(`mem ${address} ${size} ${type}`);
  }

  /**
   * @typedef {Object} instruction
   * @prop {number} address - position of the instruction
   * @prop {string} mnemonic - instruction name (e.g. 'jsr')
   * @prop {string} [op_1] - value of the first operand (e.g. 'CD8')
   * @prop {string} op_str - label of the first operand (e.g. 'FUN_copyDataToRam')
   * 
   * @typedef {Object} getAsmResponse
   * @prop {number} count - total instruction count
   * @prop {number} index
   * @prop {'asm'} type
   * @prop {instruction[]} data
   * 
   * @param {Object} param0 
   * @param {string|number} [param0.address='0'] 
   * @param {string|number} [param0.index='0'] 
   * 
   * @returns {Promise<getAsmResponse>}
   */
  static getAsm({ address = '0', index = '0' }) {
    return this.sendMessage(`asm ${address} ${index} 100`);
  }

  /**
   * Sends a message. Doesn't expect a reply. Use sendMessage if you need to wait for reply.
   * @param {string} message 
   */
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

  static #onMessage(data) {
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
