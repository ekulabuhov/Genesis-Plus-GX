/** @typedef {Partial<{ 
 * edit: boolean; 
 * execute: boolean; 
 * read: boolean; 
 * write: boolean; 
 * address: string; 
 * enabled: boolean; 
 * }>} Breakpoint */

import { WsService } from "../ws.service.js";

export const BreakpointsComponent = {
  templateUrl: 'breakpoints/breakpoints.component.html',
  controller: class BreakpointsController {
    _breakpoints;

    /**
     * @type {Breakpoint[]}
     */
    get breakpoints() {
      if (!this._breakpoints) {
        this._breakpoints = JSON.parse(localStorage.getItem("breakpoints")) || [
          { edit: true, enabled: true },
        ];
      }
      return this._breakpoints;
    }

    set breakpoints(value) {
      if (value.length === 0) {
        value.push({ edit: true, enabled: true });
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
      this.breakpoints = this.breakpoints.concat([{ edit: true, enabled: true }]);
    }

    /**
     * @param {Breakpoint} bpt
     * @param {number} index
     */
    onBptSubmit(bpt, index) {
      bpt.edit = false;
      if (!bpt.address.toLowerCase().startsWith('0x')) {
        bpt.address = '0x' + bpt.address.toUpperCase();
      }

      this.breakpoints = Object.assign([], this.breakpoints, { [index]: bpt });

      WsService.syncBreakpoints();
    }

    onEnableChange(index) {
      this.breakpoints = this.breakpoints.concat();
      WsService.syncBreakpoints();
    }
  },
};
