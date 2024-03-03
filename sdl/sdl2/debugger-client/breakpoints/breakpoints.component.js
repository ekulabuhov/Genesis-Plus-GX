/** @typedef {Partial<{
 * edit: boolean;
 * execute: boolean;
 * read: boolean;
 * write: boolean;
 * address: string;
 * enabled: boolean;
 * type: 'rom' | 'vram' | 'cram';
 * value_equal: string;
 * }>} Breakpoint */

import { WsService } from "../ws.service.js";

/** @type {Breakpoint} */
const defaultBreakpoint = { edit: true, enabled: true, type: "rom" };

export const BreakpointsComponent = {
  bindings: {
    onViewMemory: "&",
  },
  templateUrl: "breakpoints/breakpoints.component.html",
  controller: class BreakpointsController {
    /** @type {Breakpoint[]} */
    _breakpoints;
    /** @type {import("../menu/menu.service.js").MenuService} */
    menuService;
    /** @type {(data: { address: string; type: string; }) => void} */
    onViewMemory;

    constructor(menuService) {
      this.menuService = menuService;
    }

    /** @type {Breakpoint[]} */
    get breakpoints() {
      if (!this._breakpoints) {
        this._breakpoints = JSON.parse(localStorage.getItem("breakpoints")) || [
          defaultBreakpoint,
        ];
      }
      return this._breakpoints;
    }

    set breakpoints(value) {
      if (value.length === 0) {
        value.push(defaultBreakpoint);
      }
      this._breakpoints = value;
      localStorage.setItem("breakpoints", JSON.stringify(value));
    }

    /**
     * @param {number} index
     */
    onBptDelete(index) {
      const copy = Array.from(this.breakpoints);
      copy.splice(index, 1);
      this.breakpoints = copy;
    }

    onBptAdd() {
      this.breakpoints = this.breakpoints.concat([defaultBreakpoint]);
    }

    /**
     * @param {Breakpoint} bpt
     * @param {number} index
     */
    onBptSubmit(bpt, index) {
      bpt.edit = false;
      if (!bpt.address.toLowerCase().startsWith("0x")) {
        bpt.address = "0x" + bpt.address.toUpperCase();
      } else {
        bpt.address =
          "0x" + bpt.address.toLowerCase().split("x")[1].toUpperCase();
      }

      this.breakpoints = Object.assign([], this.breakpoints, { [index]: bpt });

      WsService.syncBreakpoints();
    }

    onEnableChange(index) {
      this.breakpoints = this.breakpoints.concat();
      WsService.syncBreakpoints();
    }

    /**
     * @param {MouseEvent} event
     * @param {Breakpoint} bpt
     */
    onAddressClick(event, bpt) {
      if (event.which !== 3) {
        return;
      }

      event.preventDefault();

      this.menuService.showMenu(event, [
        {
          label: `View in memory viewer (${bpt.address})`,
          click: () => {
            this.onViewMemory({
              address: bpt.address,
              type: bpt.type.toLowerCase(),
            });
          },
        },
        {
          label: `View in disassembler (${bpt.address})`,
          click: () => {
            WsService.asmViewer.showAsm(bpt.address);
          }
        }
      ]);
    }
  },
};
