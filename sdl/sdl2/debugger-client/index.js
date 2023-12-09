/** @typedef {{pc?: number}} regs */
/** @typedef {{address: number; mnemonic: string; op_str: string; }[]} asm */

import {MemoryViewerComponent} from "./memory-viewer/memory-viewer.component.js";

angular.module("app", []).controller("RegController", function ($scope) {
  var todoList = this;
  todoList.regs = [
    ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "PC"],
    ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "SP"],
  ];

  $scope.$watch(
    () => this.vals,
    (/** @type {regs} */ newVal) => {
      if (newVal.pc) {
        const instrIndex = this.asm.findIndex(a => a.address === newVal.pc);
        this.debugLineTop = instrIndex * 24 + 2;
      }

      console.log("Name changed to " + JSON.stringify(newVal));
    }
  );

  // Values of m68k registers
  /** @type {regs} */
  todoList.vals = {};

  todoList.debugLineTop = 2;

  /** @type {asm} */
  todoList.asm = [];

  todoList.displayReg = function (reg) {
    /** @type {number?} */
    let regVal = todoList.vals[reg.toLowerCase()];
    if (regVal === undefined) {
      return;
    }

    regVal = regVal < 0 ? 0x100000000 + regVal : regVal;
    return "0x" + regVal.toString(16).toUpperCase().padStart(8, "0");
  };
}).component('memoryViewer', MemoryViewerComponent);
