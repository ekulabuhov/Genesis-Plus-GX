export class MenuService {
  /** @type {import("./menu.component").MenuComponentController} */
  component;

  /**
   * @param {MouseEvent} event
   * @param {{ label: string; click: () => void; }[]} [menuOptions]
   */
  showMenu(event, menuOptions) {
    this.component.show(event, menuOptions)
  }
}
