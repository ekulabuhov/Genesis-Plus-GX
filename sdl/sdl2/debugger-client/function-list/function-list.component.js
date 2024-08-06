import { WsService } from "../ws.service.js";

export const FunctionListComponent = {
  template: `
  <table class="table">
    <thead>
      <tr>
        <th 
          ng-repeat="col in $ctrl.cols" 
          ng-click="$ctrl.onSortClick(col.sortBy)">
          {{col.label}}
          <i 
            ng-if="$ctrl.sortBy===col.sortBy"
            class="bi"
            ng-class="{'bi-arrow-down': $ctrl.sortDir, 'bi-arrow-up': !$ctrl.sortDir}"
          >
          </i>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr class="filters">
        <td></td>
        <td><input type="text" ng-model="$ctrl.nameSearch" ng-change="$ctrl.onNameSearchChange()" /></td>
        <td></td>
      </tr>
      <tr 
        ng-repeat="func in $ctrl.filteredFuncs | orderBy:$ctrl.sortBy:$ctrl.sortDir" 
        ng-click="$ctrl.onRowClick(func)"
        tabindex="0"
      >
        <td>{{func.start_address.toString(16).toUpperCase().padStart(8, "0")}}</td>
        <td>{{func.name}}</td>
        <td>{{func.references.length}}</td>
      </tr>
    </tbody>
  </table>`,
  controller: class FunctionListController {
    /** @type {import("../index.js").func[]} */
    filteredFuncs = [];
    /** @type {import("../index.js").func[]} */
    funcs = [];
    nameSearch = "";
    sortBy = "";
    sortDir = false;
    cols = [
      { sortBy: "start_address", label: "Location" },
      { sortBy: "name", label: "Name" },
      { sortBy: "references.length", label: "Referenced by" },
    ];

    constructor() {
      WsService.on("open", () => {
        setTimeout(async () => {
          this.filteredFuncs = this.funcs = await WsService.sendMessage(
            "funcs"
          );
        }, 500);
      });
    }

    onNameSearchChange() {
      this.filteredFuncs = this.nameSearch
        ? this.funcs.filter(
            (func) => func.name && func.name.indexOf(this.nameSearch) !== -1
          )
        : this.funcs;
    }

    /**
     * @param {import("../index.js").func} func
     */
    onRowClick(func) {
      WsService.asmViewer.showAsm(func.start_address.toString(16));
    }

    /**
     * @param {string} sortBy
     */
    onSortClick(sortBy) {
      if (this.sortBy === sortBy) {
        this.sortDir = !this.sortDir;
      } else {
        this.sortDir = false;
      }

      this.sortBy = sortBy;
    }
  },
};
