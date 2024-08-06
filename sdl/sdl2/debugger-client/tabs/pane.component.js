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
  // title is a valid HTML attribute that shows a tooltip
  // Setting it to empty here to hide the tooltip
  template: `<div class="h-100 tab-pane" ng-show="$ctrl.selected" ng-transclude title></div>`,
};
