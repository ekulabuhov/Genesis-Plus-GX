import { WsService } from "../ws.service.js";

/**
 * @typedef {import("./breakpoints.service.js").Breakpoint & { edit: boolean }} Breakpoint
 */

/** @type {Partial<Breakpoint>} */
const defaultBreakpoint = { edit: true, enabled: true, type: "rom" };

export const BreakpointsComponent = {
  bindings: {
    onViewMemory: "&",
  },
  templateUrl: "breakpoints/breakpoints.component.html",
  controller: class BreakpointsController {
    /** @type {import("../menu/menu.service.js").MenuService} */
    menuService;
    /** @type {import("./breakpoints.service.js").BreakpointsService} */
    bps;
    /** @type {(data: { address: string; type: string; }) => void} */
    onViewMemory;
    /** @type {Partial<Breakpoint>?} */
    newBreakpoint = null;

    /**
     *
     * @param {*} menuService
     * @param {import("./breakpoints.service.js").BreakpointsService} breakpointsService
     */
    constructor(menuService, breakpointsService) {
      this.menuService = menuService;
      this.bps = breakpointsService;
    }

    /**
     * @param {number} index
     */
    onBptDelete(index) {
      const copy = this.breakpointList();
      if (copy[index] === this.newBreakpoint) {
        this.newBreakpoint = null;
      } else {
        copy.splice(index, 1);
        this.bps.breakpoints = copy;
        WsService.syncBreakpoints();
      }
    }

    breakpointList() {
      const list = [...this.bps.breakpoints];
      if (this.newBreakpoint) {
        list.push(this.newBreakpoint);
      }
      return list;
    }

    onBptAdd() {
      this.newBreakpoint = { ...defaultBreakpoint };
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

      if (bpt === this.newBreakpoint) {
        this.bps.addBreakpoint(bpt);
        this.newBreakpoint = null;
      } else {
        this.bps.breakpoints = Object.assign([], this.bps.breakpoints, {
          [index]: bpt,
        });
      }
      WsService.syncBreakpoints();
    }

    onEnableChange() {
      this.bps.breakpoints = this.bps.breakpoints.concat();
      WsService.syncBreakpoints();
    }

    /**
     * Right click context menu
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
          },
        },
      ]);
    }
  },
};
