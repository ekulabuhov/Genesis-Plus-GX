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
  template: `
    <div
  style="
    border: 1px solid var(--bs-border-color);
    border-radius: var(--bs-border-radius);
    padding: 20px;
  "
>
  <div class="header" style="display: flex">
    Breakpoints
    <div class="buttons" style="margin-left: auto">
      <button 
        class="btn btn-dark btn-sm"
        ng-click="$ctrl.onBptAdd()"
      >
        <i class="bi bi-plus-lg"></i>
      </button>
    </div>
  </div>
  <table class="table" style="margin: 0">
    <thead>
      <tr>
        <th scope="col" style="width: 70px">#</th>
        <th scope="col" style="width: 250px">Address</th>
        <th scope="col">Condition</th>
        <th scope="col"></th>
      </tr>
    </thead>
    <tbody>
      <tr ng-repeat="bpt in $ctrl.breakpoints track by $index">
        <td ng-if-start="bpt.edit">
          <input
            class="form-check-input"
            type="checkbox"
            ng-model="bpt.enabled"
            ng-change="$ctrl.onEnableChange($index)"
          />
        </td>
        <td>
          <input
            type="text"
            class="form-control form-control-sm"
            style="max-width: 200px"
            ng-model="bpt.address"
          />
        </td>
        <td ng-if-end="bpt.edit" colspan="2">
          <div style="display: flex; align-items: center">
            <div class="form-check form-check-inline" style="margin-bottom: 0">
              <input
                class="form-check-input"
                type="checkbox"
                id="inlineCheckbox1"
                ng-model="bpt.read"
              />
              <label class="form-check-label" for="inlineCheckbox1">Read</label>
            </div>
            <div class="form-check form-check-inline">
              <input
                class="form-check-input"
                type="checkbox"
                id="inlineCheckbox3"
                ng-model="bpt.write"
              />
              <label class="form-check-label" for="inlineCheckbox3"
                >Write</label
              >
            </div>
            <div class="form-check form-check-inline">
              <input
                class="form-check-input"
                type="checkbox"
                id="inlineCheckbox2"
                ng-model="bpt.execute"
              />
              <label class="form-check-label" for="inlineCheckbox2"
                >Execute</label
              >
            </div>
            <button 
              class="btn btn-sm btn-dark" 
              style="margin-left: auto" 
              ng-click="bpt.edit = true"
              ng-if="!bpt.edit"
            >
              <i class="bi bi-pencil"></i>
            </button>

            <button 
              class="btn btn-sm btn-dark" 
              style="margin-left: auto" 
              ng-click="$ctrl.onBptSubmit(bpt, $index)"
              ng-if="bpt.edit"
            >
              <i class="bi bi-check-lg"></i>
            </button>
            

            <button 
              class="btn btn-sm btn-dark"
              ng-click="$ctrl.onBptDelete($index)"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </td>

        <td ng-if-start="!bpt.edit">
          <input
            class="form-check-input"
            type="checkbox"
            ng-model="bpt.enabled"
            ng-change="$ctrl.onEnableChange($index)"
          />
        </td>
        <td>{{bpt.address}}</td>
        <td>{{ bpt.read ? 'Read' : '' }} {{ bpt.write ? 'Write' : '' }} {{ bpt.execute ? 'Execute' : '' }}</td>
        <td ng-if-end="!bpt.edit">
          <div style="display: flex; align-items: center">
            <button 
              class="btn btn-sm btn-dark" 
              style="margin-left: auto" 
              ng-click="bpt.edit = true"
            >
              <i class="bi bi-pencil"></i>
            </button>
            
            <button 
              class="btn btn-sm btn-dark"
              ng-click="$ctrl.onBptDelete($index)"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</div>`,
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
