export const MemoryViewerComponent = {
  template: `
    <div class="header">
      <div class="invisible">00000000</div>
      <div class="hex-values">
        <span class="hex-value" ng-repeat="byte in $ctrl.memory[0] track by $index">{{$index.toString(16).toUpperCase().padStart(2, "0")}}</span>
      </div>
      <div class="ascii-values">Decoded Text</div>
    </div>
    <div class="memory-viewer" ng-repeat="line in $ctrl.memory track by $index" ng-init="lineIndex=$index">
        <div class="address">
            {{($ctrl.address + lineIndex * 16).toString(16).toUpperCase().padStart(8, "0")}}
        </div>
        <div class="hex-values">
            <span 
              tabindex="0"
              ng-mousedown="$ctrl.selected = lineIndex * 16 + $index" 
              ng-mouseover="$ctrl.hovered = lineIndex * 16 + $index" 
              ng-class="{selected: $ctrl.selected === lineIndex * 16 + $index, hovered: $ctrl.hovered === lineIndex * 16 + $index}" 
              class="hex-value" 
              ng-keydown="$ctrl.updateSelectedHex($event)"
              ng-repeat="byte in line track by $index">{{ byte.toString(16).toUpperCase().padStart(2, "0") }}</span>
        </div>
        <div class="ascii-values">
            <span 
              tabindex="0"
              ng-mousedown="$ctrl.selected = lineIndex * 16 + $index" 
              ng-mouseover="$ctrl.hovered = lineIndex * 16 + $index" 
              class="ascii-value" 
              ng-class="{selected: $ctrl.selected === lineIndex * 16 + $index, hovered: $ctrl.hovered === lineIndex * 16 + $index}" 
              ng-repeat="byte in line track by $index">{{ $ctrl.convertToAscii(byte) }} 
            </span>
        </div>
    </div>
    `,
  bindings: {
    memory: "<",
    address: "<",
  },
  controller: class MemoryViewerController {
    /** @type {number[][]} */
    memory;
    selected = 0;
    hovered = 0;
    address = 0;

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

      const lineIndex = Math.floor(this.selected / 16);
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
          `memw 0x${(this.address + this.selected)
            .toString(16)
            .toUpperCase()} ${value}`
        );

        if (this.selected + 1 < totalSize) {
          this.selected++;
        }
      }
    }
  },
};
