export const RegisterViewerComponent = {
  template: `
    <div class="col">
      <div class="input-group mb-3" ng-repeat="reg in $ctrl.regLabels[0]">
        <span class="input-group-text">{{reg}}</span>
        <input
          type="text"
          class="form-control"
          ng-model="$ctrl.regs[reg]"
          ng-blur="$ctrl.onRegisterBlur(reg)"
          ng-mousedown="$ctrl.onRegisterClick($event, reg)"
          oncontextmenu="return false"
        />
      </div>
    </div>
    <div class="col">
      <div class="input-group mb-3" ng-repeat="reg in $ctrl.regLabels[1]">
        <span class="input-group-text">{{reg}}</span>
        <input
          type="text"
          class="form-control"
          ng-model="$ctrl.regs[reg]"
          ng-blur="$ctrl.onRegisterBlur(reg)"
          ng-mousedown="$ctrl.onRegisterClick($event, reg)"
          oncontextmenu="return false"
        />
      </div>
    </div>
    <div class="col">
      <ul class="list-group">
        <li class="list-group-item" ng-repeat="reg in $ctrl.regLabels[2]">
          <input
            class="form-check-input me-1"
            type="checkbox"
            ng-model="$ctrl.regs[reg.toLowerCase()]"
            ng-change="$ctrl.onFlagChange()"
            id="firstCheckbox"
          />
          <label class="form-check-label" for="firstCheckbox"
            >{{reg}}</label
          >
        </li>
      </ul>
    </div>
    <div class="dropdown">
      <ul class="dropdown-menu" data-bs-toggle="dropdown">
        <li ng-repeat="menu in $ctrl.menu" ng-click="menu.click()"><a class="dropdown-item" href="#">{{menu.label}}</a></li>
      </ul>
    </div>`,
  bindings: {
    regs: "<",
  },
  controller: class RegisterViewerController {
    regLabels = [
      ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "PC"],
      ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "SP"],
      ["C", "V", "Z", "N", "X"],
    ];
    /** @type {import("../index").regs} */
    regs;
    regEnum = [
      "D0",
      "D1",
      "D2",
      "D3",
      "D4",
      "D5",
      "D6",
      "D7",
      "A0",
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
      "A6",
      "A7",
      "PC",
      "SR",
      "SP",
    ];
    menu = [];

    $onChanges(changesObj) {
      if (changesObj["regs"].currentValue) {
        const data = Object.assign({}, changesObj["regs"].currentValue);
        this.regs = data;
        this.regs.c = !!(data.sr & 1);
        this.regs.v = !!((data.sr >> 1) & 1);
        this.regs.z = !!((data.sr >> 2) & 1);
        this.regs.n = !!((data.sr >> 3) & 1);
        this.regs.x = !!((data.sr >> 4) & 1);

        this.regLabels.forEach((row) =>
          row.forEach((reg) => {
            this.regs[reg] = this.displayReg(reg);
          })
        );
      }
    }

    /**
     * @param {string} reg
     */
    displayReg(reg) {
      /** @type {number?} */
      let regVal = this.regs[reg.toLowerCase()];
      if (regVal === undefined) {
        return;
      }

      regVal = regVal < 0 ? 0x100000000 + regVal : regVal;
      return "0x" + regVal.toString(16).toUpperCase().padStart(8, "0");
    }

    displayHex(val, size) {
      if (val === undefined) {
        return;
      }

      let slice = 0;
      if (size === "w") {
        slice = -4;
      }

      val = val < 0 ? 0x100000000 + val : val;
      return "$" + val.toString(16).toUpperCase().slice(slice);
    }

    onFlagChange() {
      // Clear last 5 bits
      this.regs.sr >>= 5;
      this.regs.sr <<= 5;
      this.regs.sr |=
        (this.regs.c && 0b1) |
        (this.regs.v && 0b10) |
        (this.regs.z && 0b100) |
        (this.regs.n && 0b1000) |
        (this.regs.x && 0b10000);

      const ws = window["ws"];
      ws.send(
        `regs set ${this.regEnum.indexOf("SR")} ${this.displayReg("SR")}`
      );
    }

    onRegisterBlur(reg) {
      const ws = window["ws"];
      if (ws) {
        ws.send(`regs set ${this.regEnum.indexOf(reg)} ${this.regs[reg]}`);
      }
    }

    // Right click handler
    onRegisterClick(event, reg) {
      if (event.which !== 3) {
        return;
      }

      event.preventDefault();

      const menu = document.querySelector("register-viewer .dropdown-menu");
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

      this.menu = [
        {
          label: `View in memory viewer (${this.displayHex(
            this.regs[reg.toLowerCase()]
          )})`,
          click: () => {
            const ws = window["ws"];
            // It's a display val (e.g. 0x00C00004)
            let val = this.regs[reg];
            // Replace last char with zero as control is zero based
            val = val.slice(0, val.length - 1) + "0";
            ws.send(`mem ${val} 128`);
          },
        },
      ];

      new bootstrap.Dropdown(menu, {
        // reference: e.target
        reference: mouseReference,
      }).show();

      return;
    }
  },
};
