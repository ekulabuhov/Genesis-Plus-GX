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
      // Return a promise that resolves when the pane is rendered (height becomes more than 0px)
      return new Promise((resolve) => {
        const ro = new ResizeObserver((e) => {
          if (!e[0].target.clientHeight) {
            return;
          }
          resolve();
          ro.disconnect();
        });
        ro.observe(document.querySelector(`my-pane[title=${name}] .tab-pane`));
      });
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
    <div class="tab-content h-100 overflow-auto" style="border: 1px solid var(--bs-border-color);
    border-radius: var(--bs-border-radius);" ng-transclude></div>
  </div>`,
};
