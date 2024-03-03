import { WsService } from "../ws.service.js";

export class MyTabsController {
  panes = [];

  constructor() {
    WsService.tabsController = this;
  }

  selectByName(name) {
    const foundPane = this.panes.find((pane) => pane.title === name);
    if (foundPane) {
      this.select(foundPane);
    }
  }

  select(pane) {
    this.panes.forEach((pane) => (pane.selected = false));
    pane.selected = true;
  }

  addPane(pane) {
    if (this.panes.length === 0) {
      this.select(pane);
    }
    this.panes.push(pane);
  }
}

export const TabsComponent = {
  transclude: true,
  controller: MyTabsController,
  template: `<div class="d-flex flex-column h-100 tabbable">
    <ul class="nav nav-underline">
        <li class="nav-item" ng-repeat="pane in $ctrl.panes">
            <a class="nav-link" ng-click="$ctrl.select(pane)" ng-class="{active:pane.selected}" href="#">{{pane.title}}</a>
        </li>
    </ul>
    <div class="tab-content overflow-auto" ng-transclude></div>
  </div>`,
};
