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
import { MenuComponent } from "./menu/menu.component.js";
import { MenuService } from "./menu/menu.service.js";
import { RegisterViewerComponent } from "./register-viewer/register-viewer.component.js";
import { SpriteViewerComponent } from "./sprite-viewer/sprite-viewer.component.js";
import { WsService } from "./ws.service.js";

const appModule = angular.module("app", []);
appModule.component("memoryViewer", MemoryViewerComponent);
appModule.component("registerViewer", RegisterViewerComponent);
appModule.component("asmViewer", AsmViewerComponent);
appModule.component("spriteViewer", SpriteViewerComponent);
appModule.component("breakpoints", BreakpointsComponent);
appModule.component("appMenu", MenuComponent);
appModule.service("menuService", MenuService);

appModule.controller(
  "RegController",
  class RegController {
    btConnValue = "Connect!";
    connected = false;
    userMessage = "";
    /** @type {regs} */
    regs;
    asm = [];
    $scope;
    memory = [
      [0x31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      [0x31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    ];
    address = 0;
    cram = [];
    vram = [];
    _breakInInterrupts;
    isRunning = false;

    constructor($scope) {
      this.$scope = $scope;
    }
        
    get breakInInterrupts() {
      if (!this._breakInInterrupts) {
        this._breakInInterrupts = localStorage.getItem("breakInInterrupts") === "true"
      }
      return this._breakInInterrupts;
    }

    set breakInInterrupts(value) {
      this._breakInInterrupts = value;
      localStorage.setItem("breakInInterrupts", value);
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
        ws.send("mem 0 128 cram");
        ws.send("mem 0 256 vram");
        this.onBreakInInterruptsChange();
        WsService.syncBreakpoints();
      };

      /* Deals with messages. */
      ws.onmessage = (evt) => {
        const response = JSON.parse(evt.data);

        if (response.type === "regs") {
          this.isRunning = false;
          this.regs = response.data;
        }

        if (response.type === "asm") {
          this.asm = response.data;
          this.firstInstructionIndex = response.index;
          this.totalInstructionCount = response.count;
        }

        if (response.type === "mem") {
          this.memory = response.data;
          this.address = response.address;
          this.memType = response.mem_type;

          if (response.mem_type === "cram") {
            this.cram = response.data;
          }

          if (response.mem_type === "vram") {
            this.vram = response.data;
          }
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

    /**
     * @param {string} address
     * @param {string} type
     */
    viewMemory(address, type) {
      const alignedAddress = address.slice(0, address.length - 1) + "0";
      this.memSelectedOffset = parseInt(address) - parseInt(alignedAddress);
      WsService.showMemoryLocation(address, type);
    }

    onBreakInInterruptsChange() {
      this.ws.send(`${this.breakInInterrupts ? 'enable' : 'disable'} break_in_interrupts`)
    }

    onRunClick() {
      this.isRunning = true;
      this.ws.send('run');
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
