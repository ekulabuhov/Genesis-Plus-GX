import { WsService } from "../ws.service.js";

export class MemoryViewerController {
  /** @type {number[][]} Two dimensional array 16 bytes wide */
  memory;
  // Offset from address
  selected = 0;
  hovered;
  // Starting address
  address = 0;
  /** @type {'rom' | 'vram' | 'cram'} */
  selectedMemType = "rom";
  /** @type {HTMLDivElement} */
  view;
  $scope;
  memorySize = {
    "rom": 0x400000,
    "vram": 0x10000,
    "cram": 0x80
  };
  lazyLoadTimeoutId;

  /**
   * @param {import("angular").IAugmentedJQuery} $element
   */
  constructor($element, $scope) {
    WsService.memoryViewer = this;

    $element.on("mouseleave", () => {
      this.hovered = undefined;
      $scope.$apply();
    });

    /** @type {HTMLDivElement} */
    this.view = document.querySelector(".memory-view");
    this.$scope = $scope;

    WsService.on("open", () => {
      // When Memory pane is not selected - the height is set to 0
      // Monitor height changes so we know when viewer is displayed
      let previousViewHeight = 0;
      const resizeObserver = new ResizeObserver(() => {
        if (previousViewHeight !== 0) {
          previousViewHeight = this.view.clientHeight;
          return;
        }

        previousViewHeight = this.view.clientHeight;
        if (!this.view.clientHeight) {
          return;
        }

        this.#lazyLoad();
      });

      resizeObserver.observe(this.view);
    });

    this.view.onscroll = () => {
      if (this.stopScrollEvents) {
        return;
      }

      const firstTop = (this.address / 16) * 24;
      if (
        this.view.scrollTop < firstTop + this.view.clientHeight * 2 &&
        this.address !== 0
      ) {
        console.log("should load up");
        this.#lazyLoad();
      }

      const lastTop = (this.address / 16 + this.memory.length) * 24;
      if (this.view.scrollTop > lastTop - this.view.clientHeight * 2) {
        console.log("should load down");
        this.#lazyLoad();
      }
    };
  }

  #lazyLoad() {
    this.stopScrollEvents = true;
    // Debouncing
    clearTimeout(this.lazyLoadTimeoutId);
    this.lazyLoadTimeoutId = setTimeout(async () => {
      const currentMemoryAddress = Math.floor(this.view.scrollTop / 24) * 16;
      const visibleLines = Math.ceil(this.view.clientHeight / 24);
      // Load 2 screens above current screen
      // Load 1 currently visible screen
      // Load 2 screens below current screen
      const address = Math.max(0, currentMemoryAddress - visibleLines * 16 * 2);
      const size = visibleLines * 16 * 5;
      console.log(`loading from ${address.toString(16)} to ${(address+size).toString(16)}`)
      const response = await WsService.showMemoryLocation(
        address,
        Math.min(size, this.memorySize[this.selectedMemType] - address),
        this.selectedMemType
      );
      this.memory = response.data;
      this.address = response.address;
      this.stopScrollEvents = false;
      this.$scope.$apply();
    }, 500);
  };

  /**
   * @param {number} byte
   */
  convertToAscii(byte) {
    return byte > 0x30 ? String.fromCharCode(byte) : ".";
  }

  updateSelectedHex(/** @type {KeyboardEvent} */ event) {
    const totalSize = this.memory.length * 16;

    if (
      ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].indexOf(
        event.key
      ) !== -1
    ) {
      if (event.key === "ArrowRight" && this.selected + 1 < totalSize) {
        this.selected++;
      } else if (event.key === "ArrowLeft" && this.selected > 0) {
        this.selected--;
      } else if (
        event.key === "ArrowDown" &&
        this.selected + 16 < totalSize
      ) {
        this.selected += 16;
      } else if (event.key === "ArrowUp" && this.selected - 16 >= 0) {
        this.selected -= 16;
      }

      event.preventDefault();
      this.waitingSecondKey = false;
      return;
    }

    if (
      [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "backspace",
      ].indexOf(event.key.toLowerCase()) === -1
    ) {
      return;
    }

    const lineIndex = Math.floor((this.selected - this.address) / 16);
    let value = this.memory[lineIndex][this.selected % 16];

    if (event.key === "Backspace") {
      this.memory[lineIndex][this.selected % 16] = 0;
      return;
    }

    if (this.waitingSecondKey) {
      value <<= 4;
      value += parseInt("0x" + event.key);
      this.waitingSecondKey = false;
    } else {
      value = parseInt("0x" + event.key);
      this.waitingSecondKey = true;
    }

    this.memory[lineIndex][this.selected % 16] = value;

    if (!this.waitingSecondKey) {
      /** @type {WebSocket} */
      const ws = window["ws"];
      ws.send(
        `memw 0x${this.selected
          .toString(16)
          .toUpperCase()} ${value} ${this.selectedMemType}`
      );

      if (this.selected + 1 < totalSize) {
        this.selected++;
      }
    }
  }

  showMemoryLocation(address, type) {
    const alignedAddress = address.slice(0, address.length - 1) + "0";
    this.selectedMemType = type;
    this.view.scroll(0, parseInt(alignedAddress) / 16 * 24);
    this.selected = parseInt(address);
  }

  onSelectMemType() {
    this.view.scroll(0, 0);
    this.#lazyLoad();
  }
}

export const MemoryViewerComponent = {
  template: `
    <select class="form-select border-0 shadow-none" ng-model="$ctrl.selectedMemType" ng-change="$ctrl.onSelectMemType()">
      <option value="rom">ROM</option>
      <option value="vram">VRAM</option>
      <option value="cram">CRAM</option>
    </select>
    <div class="header">
      <div class="invisible">00000000</div>
      <div class="hex-values">
        <span class="hex-value" ng-repeat="byte in $ctrl.memory[0] track by $index">{{$index.toString(16).toUpperCase().padStart(2, "0")}}</span>
      </div>
      <div class="ascii-values">Decoded Text</div>
    </div>
    <div class="h-100 memory-view overflow-y-auto">
      <div class="memory-window position-relative" style="height: calc({{$ctrl.memorySize[$ctrl.selectedMemType]}} / 16 * 24px)">
        <div class="memory-row position-absolute" style="top: {{($ctrl.address / 16 + lineIndex) * 24}}px" ng-repeat="line in $ctrl.memory track by $index" ng-init="lineIndex=$index">
            <div class="address">
                {{($ctrl.address + lineIndex * 16).toString(16).toUpperCase().padStart(8, "0")}}
            </div>
            <div class="hex-values">
                <span 
                  tabindex="0"
                  ng-mousedown="$ctrl.selected = $ctrl.address + lineIndex * 16 + $index" 
                  ng-mouseover="$ctrl.hovered = lineIndex * 16 + $index" 
                  ng-class="{selected: $ctrl.selected === $ctrl.address + lineIndex * 16 + $index, hovered: $ctrl.hovered === lineIndex * 16 + $index}" 
                  class="hex-value" 
                  ng-keydown="$ctrl.updateSelectedHex($event)"
                  ng-repeat="byte in line track by $index">{{ byte.toString(16).toUpperCase().padStart(2, "0") }}</span>
            </div>
            <div class="ascii-values">
                <span 
                  tabindex="0"
                  ng-mousedown="$ctrl.selected = $ctrl.address + lineIndex * 16 + $index" 
                  ng-mouseover="$ctrl.hovered = lineIndex * 16 + $index" 
                  class="ascii-value" 
                  ng-class="{selected: $ctrl.selected === $ctrl.address + lineIndex * 16 + $index, hovered: $ctrl.hovered === lineIndex * 16 + $index}" 
                  ng-repeat="byte in line track by $index">{{ $ctrl.convertToAscii(byte) }} 
                </span>
            </div>
        </div>
      </div>
    </div>
    `,
  controller: MemoryViewerController,
};
