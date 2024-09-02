import { WsService } from "../ws.service.js";
import { describeInstruction } from "./describe-instruction.js";
import { explainOperation } from "./explain-operation.js";

/**
 * @typedef {Object} instruction
 * @prop {number} address - position of the instruction
 * @prop {string} mnemonic - instruction name (e.g. 'jsr')
 * @prop {string} [op_1] - value of the first operand (e.g. 'CD8')
 * @prop {string} op_str - label of the first operand (e.g. 'FUN_copyDataToRam')
 * @prop {string} [explain] - is used to add context to executed instruction, e.g. explain type of VDP operation
 * @prop {string} valTooltip - is used to add even more context when you hover over, e.g. explain bits set in VDP operation
 * @prop {string} comment
 * @prop {'label' | 'empty'} [type] - modifies how data is rendered, e.g. labels omit addresses at the beginning
 */

export class AsmViewerController {
  /** @type {instruction[]} */
  asm = [];
  debugLineTop = 0;
  branchLineTop = 0;
  branchLineHeight = 0;
  /** @type {import("../index").regs} */
  regs;
  firstInstructionIndex = 0;
  stopScrollEvents = false;
  totalInstructionCount = 0;
  /**
   * Used to display function names in the listing
   * @type {import("../index").func[]} */
  funcs = [];
  /** @type {import("../menu/menu.service.js").MenuService} */
  menuService;
  /**
   * Records scroll offsets when navigation occurs e.g. "Show disassembly".
   * Is used when Cmd+LeftArrow is pressed to navigate back
   * @type {string[]}
   */
  scrollHistory = [];
  // Is set only when asm is requested by PC change
  waitingForAsm = false;
  /** @type {import("../breakpoints/breakpoints.service.js").BreakpointsService} */
  bps;

  /**
   * @param {import("../menu/menu.service.js").MenuService} menuService
   * @param {import("../breakpoints/breakpoints.service.js").BreakpointsService} breakpointsService
   */
  constructor(menuService, breakpointsService) {
    this.menuService = menuService;
    this.bps = breakpointsService;
    this.bps.onChange(() => this.updateBreakpointMarkers());
    WsService.asmViewer = this;

    WsService.on("open", async () => {
      this.funcs = await WsService.sendMessage("funcs");
    });

    WsService.on("message", (data) => {
      if (data.type === "asm") {
        this.firstInstructionIndex = data.index;
      }
    });

    const el = this.disasmWindow;
    el.onscroll = (e) => {
      if (this.stopScrollEvents) {
        return;
      }

      const firstTop = this.firstInstructionIndex * 24;
      const currentInstructionIdx = Math.ceil(el.scrollTop / 24) + 1;
      if (
        el.scrollTop < firstTop + el.clientHeight * 2 &&
        currentInstructionIdx < this.firstInstructionIndex
      ) {
        console.log("should load up");
        this.stopScrollEvents = true;
        setTimeout(() => {
          const currentInstructionIdx = Math.ceil(el.scrollTop / 24);
          WsService.getAsm({ index: Math.max(1, currentInstructionIdx) });
        }, 500);
      }

      // Y pixel position of the last instruction
      const lastTop = (this.firstInstructionIndex + this.asm.length) * 24;
      // If there are less than 2 screens available below (current screen included) - load more data
      if (el.scrollTop > lastTop - el.clientHeight * 2) {
        console.log("should load down");
        this.stopScrollEvents = true;
        setTimeout(() => {
          const bottomInstructionIdx = Math.ceil(
            el.scrollTop / 24 + el.clientHeight / 24
          );
          const addr =
            this.asm[bottomInstructionIdx - this.firstInstructionIndex]
              ?.address;
          console.log({ addr: addr?.toString(16) });

          WsService.getAsm({ index: bottomInstructionIdx });
        }, 500);
      }
    };
  }

  /**
   * Converts breakpoints to top offsets that are rendered on the gutter
   */
  updateBreakpointMarkers() {
    /** @type {number[]} */
    this.breakpointMarkers = this.bps.breakpoints.reduce((acc, bp) => {
      const instrIndex = this.asm.findIndex(
        (a) =>
          bp.type === "rom" &&
          bp.address &&
          a.address == parseInt(bp.address) &&
          !a.type
      );
      if (instrIndex !== -1) {
        acc.push((instrIndex + this.firstInstructionIndex) * 24);
      }
      return acc;
    }, /** @type {number[]} */ ([]));
  }

  /** @type {WebSocket} */
  get ws() {
    return window["ws"];
  }

  /** @type {HTMLDivElement} */
  get disasmWindow() {
    return document.querySelector(".disasm-window");
  }

  $onChanges(changesObj) {
    if (changesObj["asm"]?.currentValue) {
      this.insertFunctionLabels();
      this.updateBreakpointMarkers();

      if (this.stopScrollEvents) {
        this.stopScrollEvents = false;
      }

      if (this.waitingForAsm) {
        this.waitingForAsm = false;
        this.refresh();
      }
    }

    if (changesObj["regs"]?.currentValue) {
      this.refresh();
    }
  }

  insertFunctionLabels() {
    this.funcs.forEach((func) => {
      const instruction = this.asm.find(
        (asm) => asm.address === func.start_address
      );
      if (instruction) {
        instruction.references = func.references;
      }
    });
  }

  /**
   * @param {MouseEvent} event
   * @param {{address: string; func?: string}[]} references
   */
  onReferencesClick(event, references) {
    event.preventDefault();
    event.stopPropagation();
    this.menuService.showMenu(
      event,
      references.map((r) => ({
        label: r.func
          ? `Go to ${r.func} ($${r.address})`
          : `Go to $${r.address}`,
        click: () => this.showAsm("0x" + r.address),
      }))
    );
  }

  async refresh() {
    if (!this.regs?.pc) {
      return;
    }

    this.branchLineHeight = this.branchLineTop = undefined;

    const disasmWindow = this.disasmWindow;

    const instr = this.asm.find((a) => a.address === this.regs.pc && !a.type);
    if (!instr) {
      console.log("instruction not found for ", this.regs.pc);
      /** @type {WebSocket} */
      const ws = window["ws"];
      ws.send(`asm ${this.regs.pc} 0 100`);
      this.waitingForAsm = true;
      return;
    }

    const instrIndex = this.asm.indexOf(instr);
    this.debugLineTop = (instrIndex + this.firstInstructionIndex) * 24 + 2;

    // Below logic is called when you step through code
    const marginInLines = 3;
    // If we're outside of current listing - jump to current instruction
    if (
      this.debugLineTop < disasmWindow.scrollTop ||
      this.debugLineTop > disasmWindow.scrollTop + disasmWindow.clientHeight
    ) {
      disasmWindow.scroll(
        0,
        (instrIndex + this.firstInstructionIndex - marginInLines) * 24
      );
    }
    // If we're close to the bottom border - auto scroll the listing
    else if (
      this.debugLineTop >
      disasmWindow.scrollTop + disasmWindow.clientHeight - 72
    ) {
      const visibleLines = Math.floor(disasmWindow.clientHeight / 24);
      disasmWindow.scroll({
        top:
          (instrIndex +
            this.firstInstructionIndex -
            visibleLines +
            marginInLines) *
          24,
        behavior: "smooth",
      });
    }

    const { explain } = explainOperation(instr, this.regs);
    instr.explain = explain;

    if (instr.comment !== this.regs.comment && !instr.explain) {
      instr.explain = this.regs.comment;
    }

    const branchInstructions = [
      "bcc",
      "bcs",
      "beq",
      "bge",
      "bgt",
      "bhi",
      "bhs",
      "ble",
      "blo",
      "bls",
      "blt",
      "bmi",
      "bne",
      "bpl",
      "bvc",
      "bvs",
    ];

    if (branchInstructions.indexOf(instr.mnemonic.split(".")[0]) !== -1) {
      const target = parseInt(instr.op_str.replace("$", "0x"));
      this.branchLineTop = instrIndex * 24 + 10;
      let branchEnd = this.asm.findIndex((a) => a.address === target);
      if (branchEnd === -1) {
        branchEnd = this.asm.length - 1;
      }
      this.branchLineHeight = branchEnd * 24 + 4 - this.branchLineTop + 10;
    }
  }

  displayTooltip(
    /** @type {MouseEvent}  */ event,
    /** @type {string} */ mnemonic
  ) {
    const title = describeInstruction(mnemonic);
    if (!title) {
      return;
    }

    new bootstrap.Tooltip(event.target, {
      title,
      container: "body",
      sanitize: false,
      customClass: "asm-tooltip",
    }).show();
  }

  displayExplainTooltip(event, title) {
    if (!title) {
      return;
    }

    new bootstrap.Tooltip(event.target, {
      title,
      container: "body",
      sanitize: false,
      customClass: "asm-tooltip",
    }).show();
  }

  /**
   *
   * @param {*} event
   * @param {instruction} pa
   */
  onOpClick(event, pa) {
    const label = pa.op_str;
    this.menuService.showMenu(event, [
      {
        label: `Go to ${label} ($${pa.op_1})`,
        click: () => this.showAsm(pa.op_1),
      },
      {
        label: `Rename ${label}`,
        click: () => {
          const newName = prompt(`Rename ${label} to:`, label);
          if (newName) {
            WsService.send(`fn name 0x${pa.op_1} ${newName}`);
            this.funcs.find(
              (func) => func.start_address === parseInt(pa.op_1, 16)
            ).name = newName;
            pa.op_str = newName;
          }
        },
      },
    ]);
  }

  /**
   * @param {MouseEvent} event
   * @param {instruction} pa
   */
  onFnLabelClick(event, pa) {
    this.menuService.showMenu(event, [
      {
        label: `Rename ${pa.mnemonic}`,
        click: () => {
          const newName = prompt(`Rename ${pa.mnemonic} to:`, pa.mnemonic);
          if (newName) {
            WsService.send(`fn name 0x${pa.address.toString(16)} ${newName}`);
            this.funcs.find((func) => func.start_address === pa.address).name =
              newName;
            pa.mnemonic = newName;
          }
        },
      },
    ]);
  }

  /**
   * @param {string} address - treated as hex, "200" and "0x200" are equal
   */
  async showAsm(address, saveHistory = true) {
    if (address.indexOf("0x") === -1) {
      address = "0x" + address;
    }

    if (saveHistory) {
      const currentInstructionAddress =
        this.asm[
          Math.round(this.disasmWindow.scrollTop / 24) -
            this.firstInstructionIndex +
            3
        ]?.address;

      if (currentInstructionAddress) {
        this.scrollHistory.push(currentInstructionAddress.toString(16));
      }
    }

    const data = await WsService.getAsm({ address });

    const instrIndex = data.data.findIndex(
      (instr) => instr.address === parseInt(address, 16)
    );

    // Adding 100 because we get 100 extra instructions on each side around address
    this.disasmWindow.scrollTo(
      0,
      (this.firstInstructionIndex + instrIndex - 3) * 24
    );
  }

  goBack() {
    if (this.scrollHistory.length) {
      this.showAsm(this.scrollHistory.pop(), false);
    }
  }

  /**
   * @param {instruction} pa
   */
  onCodeRowClick(pa) {
    const comment = prompt(
      `Add comment to 0x${pa.address.toString(16)}:`,
      pa.comment || ""
    );
    // null is returned when Cancel is clicked
    if (comment !== null) {
      WsService.send(`add comment ${pa.address} ${comment}`);
      pa.comment = comment;
    }
  }

  /**
   * Called when clicking on the gutter besides the line number
   * @param {PointerEvent} event
   * @param {instruction} pa
   */
  onBreakpointToggle(event, pa) {
    // Stop it from calling the "add comment" handler above
    event.stopPropagation();
    const hexAddress = "0x" + pa.address.toString(16);

    // If it exists - remove it
    if (this.bps.breakpoints.some((bp) => bp.address === hexAddress)) {
      this.bps.breakpoints = this.bps.breakpoints.filter(
        (bp) => bp.address !== hexAddress
      );
    } else {
      // If it doesn't exist - add it
      this.bps.breakpoints = this.bps.breakpoints.concat([
        {
          address: hexAddress,
          type: "rom",
          execute: true,
          enabled: true,
        },
      ]);
    }

    WsService.syncBreakpoints();
  }
}

export const AsmViewerComponent = {
  template: `
    <div class="disasm-window overflow-y-scroll" style="position: relative">
        <div class="code-overlay w-100" style="position: absolute">
            <div
              class="debug-line"
              style="top: {{ $ctrl.debugLineTop }}px"
            ></div>
            <div
              ng-repeat="bpt in $ctrl.breakpointMarkers track by $index"
              class="breakpoint-glyph"
              style="top: {{ bpt }}px"
            ></div>
            <div
              ng-if="$ctrl.branchLineTop"
              class="branch-line"
              style="top: {{ $ctrl.branchLineTop }}px; height: {{ $ctrl.branchLineHeight }}px"
            ></div>
        </div>
        <div class="code-listing" style="height: {{ $ctrl.totalInstructionCount * 24 }}px">
            <div 
              class="code-row" 
              ng-repeat="pa in $ctrl.asm" style="top: {{ ($ctrl.firstInstructionIndex + $index) * 24 }}px"
              ng-click="$ctrl.onCodeRowClick(pa)"
            >
                <span ng-if-start="pa.type === 'label'"
                  ng-click="$ctrl.onFnLabelClick($event, pa)"
                >{{pa.mnemonic}}:</span>
                <button ng-if-end
                  ng-if="pa.references.length" 
                  class="btn btn-link p-0"
                  ng-click="$ctrl.onReferencesClick($event, pa.references)"
                >
                  {{pa.references.length}} reference{{pa.references.length > 1 ? 's' : ''}}
                </button>

                <span ng-if="pa.type === 'empty'"></span>

                <span ng-if-start="pa.type !== 'label' && pa.type !== 'empty'" 
                  class="addr"
                  ng-click="$ctrl.onBreakpointToggle($event, pa)"
                >
                    0x{{pa.address.toString(16)}}:
                </span>
                <span ng-if="$ctrl.showBytes" class="bytes">
                    {{pa.bytes}}
                </span>
                <span class="mnemonic" ng-mouseover="$ctrl.displayTooltip($event, pa.mnemonic)">
                    {{pa.mnemonic}}
                </span>
                <span ng-if="!pa.op_1" class="op_str">
                    <span class="text-truncate">{{pa.op_str}}</span>
                </span>
                <button class="btn btn-link p-0" ng-if="pa.op_1" ng-click="$ctrl.onOpClick($event, pa)">
                    {{pa.op_str}}
                </button>
                <span ng-if-end ng-mouseover="$ctrl.displayExplainTooltip($event, pa.valTooltip)">
                    {{pa.explain}}
                </span>
                <span ng-if="pa.comment" class="comment">; {{pa.comment.replaceAll('\n', '\n; ')}} {{ pa.extra_lines }}</span>
            </div>
        </div>
    </div>`,
  bindings: {
    regs: "<",
    asm: "<",
    showBytes: "<",
    totalInstructionCount: "<",
  },
  controller: AsmViewerController,
};
