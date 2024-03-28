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
import { PaneComponent } from "./tabs/pane.component.js";
import { TabsComponent } from "./tabs/tabs.component.js";
import { WsService } from "./ws.service.js";
import { Ym2612Component } from "./ym2612/ym2612.component.js";

const appModule = angular.module("app", []);
appModule.component("memoryViewer", MemoryViewerComponent);
appModule.component("registerViewer", RegisterViewerComponent);
appModule.component("asmViewer", AsmViewerComponent);
appModule.component("spriteViewer", SpriteViewerComponent);
appModule.component("breakpoints", BreakpointsComponent);
appModule.component("appMenu", MenuComponent);
appModule.service("menuService", MenuService);
appModule.component("myTabs", TabsComponent);
appModule.component("myPane", PaneComponent);
appModule.component("ym2612", Ym2612Component);

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
      /* Register events. */
      WsService.on('open', () => {
        this.connected = true;
        this.btConnValue = "Disconnect!";
        console.log("Connection opened");

        WsService.send("regs");
        this.onBreakInInterruptsChange();
        WsService.syncBreakpoints();
      });

      /* Deals with messages. */
      WsService.on('message', (response) => {
        if (response.type === "regs") {
          this.isRunning = false;
          this.regs = response.data;
        }

        if (response.type === "asm") {
          this.asm = response.data;
          this.totalInstructionCount = response.count;
        }

        this.$scope.$apply();
      });

      /* Close events. */
      WsService.on('close', (event) => {
        this.btConnValue = "Connect!";
        console.log(
          "Connection closed: wasClean: " +
            event.wasClean +
            ", evCode: " +
            event.code
        );
        this.connected = false;
      });

      WsService.doConnect(addr);
    }

    /* Connect button. */
    onConnectClick() {
      if (this.connected == false) {
        var txt = document.getElementById("txtServer").value;
        this.doConnect(txt);
      } else {
        WsService.close();
        this.connected = false;
        this.btConnValue = "Connect!";
      }
    }

    onSendClick() {
      WsService.send(this.userMessage);
      this.userMessage = "";
    }

    /**
     * @param {string} address
     * @param {string} type
     */
    async viewMemory(address, type) {
      await WsService.tabsController.selectByName("Memory");
      WsService.memoryViewer.showMemoryLocation(address, type);
    }

    onBreakInInterruptsChange() {
      WsService.send(`${this.breakInInterrupts ? 'enable' : 'disable'} break_in_interrupts`)
    }

    onRunClick() {
      this.isRunning = true;
      WsService.send('run');
    }
  }
);

document.onkeydown = function (e) {
  if (e.key === "F11" || e.key === "F10") {
    e.preventDefault();
    WsService.send(`step`);
  }

  if (e.key === 'g' && e.metaKey) {
    const response = prompt("Go to where?");
    WsService.asmViewer.showAsm(response);
  }

  if (e.key === 'ArrowLeft' && e.metaKey && e.target.nodeName !== 'INPUT') {
    e.preventDefault();
    WsService.asmViewer.goBack();
  }
};
