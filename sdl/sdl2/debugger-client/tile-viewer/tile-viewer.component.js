import { WsService } from "../ws.service.js";

const PIXEL_HEIGHT = 20;
const TILE_HEIGHT = PIXEL_HEIGHT * 8;
const BYTES_PER_TILE = 32;
const TILES_PER_ROW = 5;
const TOTAL_VRAM_BYTES = 0x10000;
// It's always 2048, calculations are just for clarity
const TOTAL_TILES = TOTAL_VRAM_BYTES / BYTES_PER_TILE;
// 409.6 - 409 full rows + half a row (0.6)
const TOTAL_ROWS = TOTAL_TILES / TILES_PER_ROW;
const TOTAL_FULL_ROWS = Math.ceil(TOTAL_ROWS);

export const TileViewerComponent = {
  template: `
        <div class="d-flex w-100 align-items-center" ng-repeat="palette in $ctrl.palettes" ng-init="paletteIndex=$index">
          <div class="palette-label">Palette {{$index+1}}</div>
          <div class="pixel-row d-flex" ng-repeat="color in palette track by $index">
            <div style="background-color: #{{ $ctrl.evenPixel($index, paletteIndex) }}" class="pixel"></div>
          </div>
        </div>
      <div style="height: {{$ctrl.totalHeight}}px" class="align-content-start d-flex flex-wrap position-relative overflow-hidden">
        <div class="d-flex flex-wrap position-absolute" style="top: {{$ctrl.topOffset}}px">
          <div class="tile flex-column d-flex" ng-repeat="tile in $ctrl.tiles" ng-init="tileIndex=$index + ($ctrl.topOffset / 160 * 5)">
            <div class="pixel-row d-flex" ng-repeat="row in tile track by $index" ng-init="rowIndex=$index">
              <div class="d-flex" ng-repeat="byte in row track by $index">
                  <div 
                    ng-init="byteIndex=tileIndex * 64 + rowIndex * 8 + $index * 2"
                    style="background-color: #{{ $ctrl.oddPixel(byte, 0) }}" 
                    class="pixel" 
                    ng-mouseover="$ctrl.displayPixelTooltip($event, byteIndex, tileIndex, rowIndex, $index * 2, byte)"
                    ng-class="{hovered: $ctrl.hovered === byteIndex}" 
                  >
                  </div>
                  <div
                    ng-init="byteIndex2=tileIndex * 64 + rowIndex * 8 + $index * 2 + 1"
                    style="background-color: #{{ $ctrl.evenPixel(byte, 0) }}" 
                    class="pixel" 
                    ng-mouseover="$ctrl.displayPixelTooltip($event, byteIndex2, tileIndex, rowIndex, $index * 2 + 1, byte)"
                    ng-class="{hovered: $ctrl.hovered === byteIndex2}" 
                  >
                  </div>
              </div>
            </div>
          </div>
        </div>
      </div>`,
  controller: class TileViewerController {
    /** @type {number[][]} */
    vram;
    /** @type {number[][]} */
    cram;
    /** @type {number[][][]} - [tile_idx][y][x] */
    tiles;
    topOffset = 0;
    // Layout of 5 tiles per row uses 32 bytes * 5 = 160 bytes per row
    // Coincidentally, the height of a tiles is 20px * 8 rows = 160px
    // Calculate the minimum amount of space needed to show them all
    totalHeight = TOTAL_FULL_ROWS * TILE_HEIGHT;

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

      this.view.onscroll = (e) => {
        if (this.stopScrollEvents) {
          // Do a final load when scrolling stops (debounced)
          clearTimeout(this.lazyLoadTimeoutId);
          this.lazyLoadTimeoutId = setTimeout(() => {
            this.view.onscroll(e);
          }, 100);
          return;
        }
        const visibleBottom = this.view.scrollTop + this.view.clientHeight;
        const visibleTop = this.view.scrollTop;
        const visibleDataHeight = TILE_HEIGHT * this.rowsToFillScreen;

        if (visibleBottom + 160 - this.topOffset > visibleDataHeight) {
          const newOffset = Math.floor(this.view.scrollTop / 160) * 160;
          console.log("should load down", { newOffset, visibleBottom });
          this.lazyLoad(newOffset);
        } else if (visibleTop < this.topOffset) {
          let newOffset = Math.floor(this.view.scrollTop / 160) * 160 - 320;
          newOffset = Math.max(0, newOffset);
          console.log("should load up", { newOffset, visibleTop });
          this.lazyLoad(newOffset);
        }
      };

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

          if (!this.vram) {
            this.lazyLoad();
          }
        });

        resizeObserver.observe(this.view);
      });
    }

    /**
     * @param {MouseEvent} event
     * @param {number} byteIndex
     * @param {number} tileIndex
     * @param {number} rowIndex
     * @param {number} columnIndex
     * @param {number} byte
     */
    displayPixelTooltip(event, byteIndex, tileIndex, rowIndex, columnIndex, byte) {
      // Adds 'hovered' class to show border
      this.hovered = byteIndex;

      new bootstrap.Tooltip(event.target, {
        title: `Tile: ${tileIndex} [$${(tileIndex * 32)
          .toString(16)
          .padStart(4, "0")} - $${((tileIndex + 1) * 32)
          .toString(16)
          .padStart(4, "0")}]
Position: ${columnIndex}, ${rowIndex}
Color: ${event.target.style.backgroundColor}
Index in palette: ${columnIndex % 2 ? byte & 0xf : byte >> 4}
Address: $${(tileIndex * 32 + rowIndex * 4 + Math.floor(columnIndex / 2))
          .toString(16)
          .padStart(4, "0")}`,
        container: "body",
        sanitize: false,
        customClass: "asm-tooltip",
      }).show();
    }

    refresh() {
      // Each tile is 8x8 pixels wide
      // Each pixel is 4 bits (half a byte)
      // One row is 32 bits or 4 bytes
      // One tile is 4x8=32 bytes
      // Server sends data in 16 byte rows - therefore we need to reformat the array
      // [tile_idx][y][x]
      const resizedVram = [];
      this.vram.forEach((row, rowIndex) => {
        row.forEach((byte, i) => {
          const byteIndex = rowIndex * 16 + i;
          const newRowIndex = Math.floor(byteIndex / 4) % 8;
          const tileIndex = Math.floor(byteIndex / 32);
          resizedVram[tileIndex] = resizedVram[tileIndex] || [];
          resizedVram[tileIndex][newRowIndex] =
            resizedVram[tileIndex][newRowIndex] || [];
          resizedVram[tileIndex][newRowIndex][byteIndex % 4] = byte;
        });
      });

      this.tiles = resizedVram;

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

    get rowsToFillScreen() {
      // Each row is 160px in height, load 2 screens worth of data
      return Math.ceil(this.view.clientHeight / 160) * 2;
    }

    lazyLoad(offset = 0) {
      this.stopScrollEvents = true;
      setTimeout(async () => {
        console.log('does load')
        let response = await WsService.showMemoryLocation(
          offset,
          TILE_HEIGHT * this.rowsToFillScreen,
          "vram"
        );
        this.vram = response.data;

        response = await WsService.showMemoryLocation(0, 128, "cram");
        this.cram = response.data;

        this.refresh();
        this.topOffset = offset;
        this.$scope.$apply();
        // hack: remove all tooltips before re-rendering to avoid stuck tooltips
        document.querySelectorAll('.tooltip.asm-tooltip').forEach(el => el.remove());
        this.stopScrollEvents = false;
      }, 100);
    }

    /**
     * @param {number} byte
     * @param {number} selectedPalette
     */
    evenPixel(byte, selectedPalette) {
      return this.palettes[selectedPalette][byte & 0xf]
        .toString(16)
        .padStart(6, "0");
    }

    /**
     * @param {number} byte
     * @param {number} selectedPalette
     */
    oddPixel(byte, selectedPalette) {
      return this.palettes[selectedPalette][byte >> 4]
        .toString(16)
        .padStart(6, "0");
    }
  },
};
