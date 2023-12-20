
/** @typedef {Partial<{
 *  pc: number;
 *  prev_pc: number;
 *  sr: number;
 *  c: number;
 *  v: number;
 *  z: number;
 *  n: number;
 *  x: number;
 * }>} regs */

import { AsmViewerComponent } from "./asm-viewer/asm-viewer.component.js";
import { MemoryViewerComponent } from "./memory-viewer/memory-viewer.component.js";
import { RegisterViewerComponent } from "./register-viewer/register-viewer.component.js";

const appModule = angular.module("app", []);
appModule.component("memoryViewer", MemoryViewerComponent);
appModule.component("registerViewer", RegisterViewerComponent);
appModule.component("asmViewer", AsmViewerComponent);

appModule.controller("RegController", function ($scope) {});
