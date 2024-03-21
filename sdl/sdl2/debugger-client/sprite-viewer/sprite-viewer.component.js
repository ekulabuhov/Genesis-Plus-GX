import { WsService } from "../ws.service.js";

export const SpriteViewerComponent = {
  template: `
      <div class="d-flex w-100 align-items-center" ng-repeat="palette in $ctrl.palettes" ng-init="paletteIndex=$index">
        <div class="palette-label">Palette {{$index+1}}</div>
        <div class="pixel-row d-flex" ng-repeat="color in palette track by $index">
          <div style="background-color: #{{ $ctrl.evenPixel($index, paletteIndex) }}" class="pixel"></div>
        </div>
      </div>
      <div class="flex-column d-flex" ng-repeat="sprite in $ctrl.sprites">
        <div class="pixel-row d-flex" ng-repeat="row in sprite track by $index">
          <div class="d-flex" ng-repeat="byte in row track by $index">
              <div style="background-color: #{{ $ctrl.oddPixel(byte, 0) }}" class="pixel"></div>
              <div style="background-color: #{{ $ctrl.evenPixel(byte, 0) }}" class="pixel"></div>
          </div>
        </div>
      </div>`,
  controller: class SpriteViewerController {
    /** @type {number[][]} */
    vram;
    /** @type {number[][]} */
    cram;
    /** @type {number[][][]} - [sprite_idx][y][x] */
    sprites;

    /**
     * Mega Drive can handle 4 palettes 16 colors each at the same time
     * This multi-array contains 4 palettes with 16 RGB values each
     * @type {number[][]}
     */
    palettes;
    /** @type {HTMLElement} */
    view;
    /** @type {import("angular").IScope} */
    $scope;

    /**
     * @param {import("angular").IAugmentedJQuery} $element
     */
    constructor($element, $scope) {
      this.view = $element[0];
      this.$scope = $scope;

      WsService.on("open", () => {
        // When pane is not selected - the height is set to 0
        // Monitor height changes so we know when this component is displayed
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

          this.lazyLoad();
        });

        resizeObserver.observe(this.view);
      });
    }

    refresh() {
      // Each sprite is 8x8 pixels wide
      // Each pixel is 4 bits (half a byte)
      // One row is 32 bits or 4 bytes
      // One sprite is 4x8=32 bytes
      // Server sends data in 16 byte rows - therefore we need to reformat the array
      // [sprite_idx][y][x]
      const resizedVram = [];
      this.vram.forEach((row, rowIndex) => {
        row.forEach((byte, i) => {
          const byteIndex = rowIndex * 16 + i;
          const newRowIndex = Math.floor(byteIndex / 4);
          const spriteIndex = Math.floor(byteIndex / 32);
          resizedVram[spriteIndex] = resizedVram[spriteIndex] || [];
          resizedVram[spriteIndex][newRowIndex] =
            resizedVram[spriteIndex][newRowIndex] || [];
          resizedVram[spriteIndex][newRowIndex][byteIndex % 4] = byte;
        });
      });

      this.sprites = resizedVram;

      const newPalette = [[], [], [], []];
      for (let ci = 0; ci < this.cram.length; ci += 2) {
        const bytes = [...this.cram[ci], ...this.cram[ci + 1]];
        for (let i = 0; i < 32; i += 2) {
          const byte = bytes[i];
          // Max brightness value for CSS color is 0xFF and for Genesis it's 0xE, multiply by 0x12 to convert between two
          const blue = 0x12 * byte;
          const green = (bytes[i + 1] >> 4) * 0x12;
          const red = (bytes[i + 1] & 0xf) * 0x12;
          newPalette[ci / 2][i / 2] = (red << 16) + (green << 8) + blue;
        }
      }

      this.palettes = newPalette;
    }

    lazyLoad() {
      // Debouncing
      clearTimeout(this.lazyLoadTimeoutId);
      this.lazyLoadTimeoutId = setTimeout(async () => {
        let response = await WsService.showMemoryLocation(0, 256, "vram");
        this.vram = response.data;

        response = await WsService.showMemoryLocation(0, 128, "cram");
        this.cram = response.data;

        this.refresh();
        this.$scope.$apply();
      }, 500);
    }

    evenPixel(byte, selectedPalette) {
      return this.palettes[selectedPalette][byte & 0xf]
        .toString(16)
        .padStart(6, "0");
    }

    oddPixel(byte, selectedPalette) {
      return this.palettes[selectedPalette][byte >> 4]
        .toString(16)
        .padStart(6, "0");
    }
  },
};