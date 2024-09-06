import { WsService } from "../ws.service.js";

/**
 * @typedef {import("./breakpoints.service.js").Breakpoint & { edit: boolean }} Breakpoint
 */

/** @type {Breakpoint} */
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
      const copy = Array.from(this.bps.breakpoints);
      copy.splice(index, 1);
      this.bps.breakpoints = copy;
      WsService.syncBreakpoints();
    }

    onBptAdd() {
      this.bps.breakpoints = this.bps.breakpoints.concat([{...defaultBreakpoint}]);
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

      this.bps.breakpoints = Object.assign([], this.bps.breakpoints, { [index]: bpt });
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
          }
        }
      ]);
    }
  },
};
