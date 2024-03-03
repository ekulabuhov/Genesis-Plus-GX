export const PaneComponent = {
  transclude: true,
  require: {
    tabsCtrl: "^myTabs",
  },
  bindings: {
    title: "@",
  },
  controller: class PaneController {
    $onInit() {
      this.tabsCtrl.addPane(this);
    };
  },
  template: `<div class="tab-pane" ng-show="$ctrl.selected" ng-transclude></div>`,
};
