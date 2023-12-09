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
            {{(lineIndex*16).toString(16).toUpperCase().padStart(8, "0")}}
        </div>
        <div class="hex-values">
            <span 
              tabindex="0"
              ng-mousedown="$ctrl.selected = lineIndex * 16 + $index" 
              ng-mouseover="$ctrl.hovered = lineIndex * 16 + $index" 
              ng-class="{selected: $ctrl.selected === lineIndex * 16 + $index, hovered: $ctrl.hovered === lineIndex * 16 + $index}" 
              class="hex-value" 
              ng-repeat="byte in line track by $index">{{ byte.toString(16).toUpperCase().padStart(2, "0") }} </span>
        </div>
        <div class="ascii-values">
            <span 
              tabindex="0"
              ng-mousedown="$ctrl.selected = lineIndex * 16 + $index" 
              ng-mouseover="$ctrl.hovered = lineIndex * 16 + $index" 
              class="ascii-value" 
              ng-class="{selected: $ctrl.selected === lineIndex * 16 + $index, hovered: $ctrl.hovered === lineIndex * 16 + $index}" 
              ng-repeat="byte in line track by $index">{{ $ctrl.convertToAscii(byte) }} </span>
        </div>
    </div>
    `,
  controller: class MemoryViewerController {
    constructor() {
      this.lines = new Array(10).fill(0);
      this.memory = [[0x31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]];
      this.selected = 0;
      this.hovered = 0;
    }

    convertToAscii(byte) {
      return byte > 0x30 ? String.fromCharCode(byte) : ".";
    }
  },
};
