/** @typedef {Partial<{
 *  pc: number;
 *  prev_pc: number;
 *  sr: number;
 *  c: boolean;
 *  v: boolean;
 *  z: boolean;
 *  n: boolean;
 *  x: boolean;
 * }>} regs */

import { AsmViewerComponent } from "./asm-viewer/asm-viewer.component.js";
import { BreakpointsComponent } from "./breakpoints/breakpoints.component.js";
import { MemoryViewerComponent } from "./memory-viewer/memory-viewer.component.js";
import { RegisterViewerComponent } from "./register-viewer/register-viewer.component.js";
import { WsService } from "./ws.service.js";

const appModule = angular.module("app", []);
appModule.component("memoryViewer", MemoryViewerComponent);
appModule.component("registerViewer", RegisterViewerComponent);
appModule.component("asmViewer", AsmViewerComponent);
appModule.component("breakpoints", BreakpointsComponent);

appModule.controller(
  "RegController",
  class RegController {
    btConnValue = "Connect!";
    connected = false;
    userMessage = "";
    /** @type {regs} */
    regs = {};
    asm = [];
    $scope;
    memory = [
      [0x31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      [0x31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    ];
    address = 0;

    constructor($scope) {
      this.$scope = $scope;
    }

    /* Establish connection. */
    doConnect(addr) {
      /* Do connection. */
      const ws = (this.ws = window["ws"] = new WebSocket(addr));

      /* Register events. */
      ws.onopen = () => {
        this.connected = true;
        this.btConnValue = "Disconnect!";
        console.log("Connection opened");

        ws.send("regs");
        ws.send("mem 256 128");
        WsService.syncBreakpoints();
      };

      /* Deals with messages. */
      ws.onmessage = (evt) => {
        const response = JSON.parse(evt.data);

        if (response.type === "regs") {
          this.regs = response.data;
        }

        if (response.type === "asm") {
          this.asm = response.data;
        }

        if (response.type === "mem") {
          this.memory = response.data;
          this.address = response.address;
        }

        this.$scope.$apply();
      };

      /* Close events. */
      ws.onclose = (event) => {
        this.btConnValue = "Connect!";
        console.log(
          "Connection closed: wasClean: " +
            event.wasClean +
            ", evCode: " +
            event.code
        );
        this.connected = false;
      };
    }

    /* Connect button. */
    onConnectClick() {
      if (this.connected == false) {
        var txt = document.getElementById("txtServer").value;
        this.doConnect(txt);
      } else {
        this.ws.close();
        this.connected = false;
        this.btConnValue = "Connect!";
      }
    }

    onSendClick() {
      this.ws.send(this.userMessage);
      this.userMessage = "";
    }
  }
);

document.onkeydown = function (e) {
  if (e.key === "F11" || e.key === "F10") {
    e.preventDefault();
    /** @type {WebSocket} */
    const ws = window["ws"];
    ws.send(`step`);
  }
};
