export class MenuComponentController {
  /** @type {import("angular").IAugmentedJQuery} */
  _el;
  menu = [];

  constructor($element, menuService) {
    this._el = $element;
    menuService.component = this;
  }

  show(event, menuOptions) {
    const menu = this._el[0].querySelector(".dropdown-menu");
    const dropdown = bootstrap.Dropdown.getInstance(menu);
    if (dropdown) {
      dropdown.hide();
    }

    const mouseReference = {
        getBoundingClientRect: () => {
          const x = event.clientX;
          const y = event.clientY;
          return {
            width: 0,
            height: 0,
            top: y,
            right: x,
            bottom: y,
            left: x,
          };
        },
      };

      this.menu = menuOptions;

      new bootstrap.Dropdown(menu, {
        // reference: e.target
        reference: mouseReference,
      }).show();
  }
}

export const MenuComponent = {
  template: `<div class="dropdown">
    <ul class="dropdown-menu" data-bs-toggle="dropdown">
      <li ng-repeat="menu in $ctrl.menu" ng-click="menu.click()"><a class="dropdown-item" href="#">{{menu.label}}</a></li>
    </ul>
  </div>`,
  controller: MenuComponentController,
};
