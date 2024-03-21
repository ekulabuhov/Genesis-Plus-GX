export class MenuService {
  /** @type {import("./menu.component").MenuComponentController} */
  component;

  /**
   * @param {MouseEvent} event
   * @param {{ label: string; click: () => void; }[]} [menuOptions]
   */
  showMenu(event, menuOptions) {
    event.preventDefault();
    event.stopPropagation();
    this.component.show(event, menuOptions)
  }
}
