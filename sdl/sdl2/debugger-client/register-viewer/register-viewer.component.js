export const RegisterViewerComponent = {
  template: `
    <div class="col">
      <div class="input-group mb-3" ng-repeat="reg in $ctrl.regLabels[0]">
        <span class="input-group-text">{{reg}}</span>
        <input
          type="text"
          class="form-control"
          value="{{$ctrl.displayReg(reg)}}"
        />
      </div>
    </div>
    <div class="col">
      <div class="input-group mb-3" ng-repeat="reg in $ctrl.regLabels[1]">
        <span class="input-group-text">{{reg}}</span>
        <input
          type="text"
          class="form-control"
          value="{{$ctrl.displayReg(reg)}}"
        />
      </div>
    </div>
    <div class="col">
      <ul class="list-group">
        <li class="list-group-item" ng-repeat="reg in $ctrl.regLabels[2]">
          <input
            class="form-check-input me-1"
            type="checkbox"
            ng-checked="$ctrl.regs[reg.toLowerCase()]"
            id="firstCheckbox"
          />
          <label class="form-check-label" for="firstCheckbox"
            >{{reg}}</label
          >
        </li>
      </ul>
    </div>`,
  controller: class RegisterViewerController {
    regLabels = [
      ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "PC"],
      ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "SP"],
      ["C", "V", "Z", "N", "X"],
    ];
    /** @type {import("../index").regs} */
    _regs = {};

    set regs(data) {
      this._regs = data;
      this._regs.c = data.sr & 1;
      this._regs.v = (data.sr >> 1) & 1;
      this._regs.z = (data.sr >> 2) & 1;
      this._regs.n = (data.sr >> 3) & 1;
      this._regs.x = (data.sr >> 4) & 1;
    }

    get regs() {
      return this._regs;
    }

    displayReg(reg) {
      /** @type {number?} */
      let regVal = this.regs[reg.toLowerCase()];
      if (regVal === undefined) {
        return;
      }

      regVal = regVal < 0 ? 0x100000000 + regVal : regVal;
      return "0x" + regVal.toString(16).toUpperCase().padStart(8, "0");
    }
  },
};
