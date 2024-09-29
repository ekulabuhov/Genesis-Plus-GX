import { getRgbPalettesFromCram, toHex } from "../utils.js";
import { WsService } from "../ws.service.js";

export const SpriteViewerComponent = {
  template: `
  <table class="table">
    <thead>
      <tr>
        <th ng-repeat="col in $ctrl.cols">
          {{col.label}}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr ng-repeat="row in $ctrl.rows track by $index" ng-init="rowIndex=$index" ng-mousedown="$ctrl.onContextMenu($event, row)"
      oncontextmenu="return false">
        <td ng-repeat="col in $ctrl.cols">
          <span ng-style="col.style" ng-if="col.type !== 'canvas'">{{row[col.field]}}</span>
          <canvas id="canvas{{rowIndex}}" width="{{row.widthInTiles * 8 * $ctrl.scale}}" height="{{row.heightInTiles * 8 * $ctrl.scale}}" ng-if="col.type === 'canvas' && row[col.field]"></canvas>
        </td>
      </tr>
    </tbody>
  </table>`,
  bindings: {
    base: "<",
    onViewMemory: "&",
  },
  controller: class SpriteViewerController {
    cols = [
      { label: "#", field: "index" },
      { label: "Image", type: "canvas", field: "imageData" },
      { label: "Location", style: { "white-space": "pre" }, field: "location" },
      { label: "Size", field: "size" },
      { label: "Link" },
      { label: "Tile Index", field: "tileIndex" },
      { label: "Palette Line", field: "paletteIdx" },
      { label: "X-Flip", field: "horizontalFlip" },
      { label: "Y-Flip", field: "verticalFlip" },
      { label: "Priority" },
    ];
    /**
     * @typedef {{
     * index: number;
     * location: string;
     * locationX: number;
     * locationY: number;
     * size: string;
     * widthInTiles: number;
     * heightInTiles: number;
     * link: number;
     * tileIndex: number;
     * imageData?: ImageData
     * horizontalFlip: boolean
     * verticalFlip: boolean
     * paletteIdx: number
     * }} tableRow
     * */
    /** @type {tableRow[]} */
    rows = [];
    // Base address of the sprite table (e.g. 0xb000), the value is provided through the binding
    base = 0;
    scale = 2;
    /** @type {import("../menu/menu.service.js").MenuService} */
    menuService;
    /** @type {(data: { address: string; type: string; }) => void} */
    onViewMemory;
    /** @type {import("../breakpoints/breakpoints.service.js").BreakpointsService} */
    breakpointsService;

    /**
     * @param {import("angular").IAugmentedJQuery} $element
     */
    constructor($element, $scope, menuService, breakpointsService) {
      this.view = $element[0];
      this.menuService = menuService;
      this.breakpointsService = breakpointsService;

      WsService.on("open", () => {
        // When pane is not selected - the height is set to 0
        // Monitor height changes so we know when this component is displayed
        let previousViewHeight = 0;
        const resizeObserver = new ResizeObserver(async () => {
          if (previousViewHeight !== 0) {
            previousViewHeight = this.view.clientHeight;
            return;
          }

          previousViewHeight = this.view.clientHeight;
          if (!this.view.clientHeight) {
            return;
          }

          await this.lazyLoad();
          $scope.$apply();
        });

        resizeObserver.observe(this.view);
      });
    }

    async lazyLoad() {
      const { data: vram } = await WsService.showMemoryLocation(
        0,
        0xffff,
        "vram"
      );

      const palettes = await getRgbPalettesFromCram();

      this.rows = [];

      for (let i = 0; i < 80 * 8; i += 8) {
        const mem = vram[Math.floor((this.base + i) / 16)];
        // Sprite entries are 8 byte long, selects either first or second part of 16 bytes
        const j = i % 16;
        let imageData;

        const tileIdAndFlags = (mem[j + 4] << 8) + mem[j + 5];
        const tileIndex = tileIdAndFlags & 0b11111111111;
        const horizontalFlip = !!(tileIdAndFlags & (1 << 11));
        const verticalFlip = !!(tileIdAndFlags & (1 << 12));
        const paletteIdx = (tileIdAndFlags >> 13) & 3;
        const widthInTiles = (mem[j + 2] >> 2) + 1;
        const heightInTiles = (mem[j + 2] & 0b11) + 1;
        if (tileIndex) {
          imageData = new ImageData(8 * widthInTiles, 8 * heightInTiles);
          const tileBytes = [];
          for (let i = 0; i < (widthInTiles * heightInTiles * 32) / 16; i++) {
            tileBytes.push(...vram[tileIndex * 2 + i]);
          }

          let offset = 0;
          for (
            let tileIdx = 0;
            tileIdx < widthInTiles * heightInTiles;
            tileIdx++
          ) {
            // Width of a tile = 8px * 4 rgba bytes = 32 bytes
            // Area of a tile = 8px x 8px * 4 rgba bytes = 256 bytes per tile
            const xInTiles = Math.floor(tileIdx / heightInTiles);
            const yInTiles = tileIdx % heightInTiles;
            // Calculate position of first byte in ImageData
            offset = widthInTiles * 256 * yInTiles + xInTiles * 32;

            for (let y = 0; y < 8; y++) {
              for (let x = 0; x < 4; x++) {
                const tileByteIndex =
                  tileIdx * 32 + y * 4 + (horizontalFlip ? 3 - x : x);
                const tileByte = tileBytes[tileByteIndex];

                const evenPixel =
                  palettes[paletteIdx][
                    horizontalFlip ? tileByte & 0xf : tileByte >> 4
                  ];
                imageData.data[offset + 0] = evenPixel.red; // R value
                imageData.data[offset + 1] = evenPixel.green; // G value
                imageData.data[offset + 2] = evenPixel.blue; // B value
                imageData.data[offset + 3] = 255; // A value
                offset += 4;

                const oddPixel =
                  palettes[paletteIdx][
                    horizontalFlip ? tileByte >> 4 : tileByte & 0xf
                  ];
                imageData.data[offset + 0] = oddPixel.red; // R value
                imageData.data[offset + 1] = oddPixel.green; // G value
                imageData.data[offset + 2] = oddPixel.blue; // B value
                imageData.data[offset + 3] = 255; // A value
                offset += 4;
              }
              offset += (widthInTiles - 1) * 32;
            }
          }
        }

        const locationX = (mem[j + 6] << 8) + mem[j + 7];
        const locationY = (mem[j] << 8) + mem[j + 1];

        this.rows.push({
          index: this.rows.length,
          location: `${locationX},${locationY}\n${toHex(locationX)},${toHex(
            locationY
          )}`,
          locationX,
          locationY,
          size: `${widthInTiles}x${heightInTiles}`,
          widthInTiles,
          heightInTiles,
          link: mem[j + 3],
          tileIndex,
          imageData,
          horizontalFlip,
          verticalFlip,
          paletteIdx,
        });
      }

      setTimeout(() => {
        for (let i = 0; i < this.rows.length; i++) {
          const element = this.rows[i];
          if (element.imageData) {
            /** @type {HTMLCanvasElement} */
            const canvas = document.getElementById("canvas" + i);
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(this.scale, this.scale);
            ctx.putImageData(element.imageData, 0, 0);
            ctx.drawImage(canvas, 0, 0);
          }
        }
      }, 100);
    }

    /**
     *
     * @param {*} event
     * @param {tableRow} row
     */
    onContextMenu(event, row) {
      if (event.which !== 3) {
        return;
      }

      const address = row.index * 8 + this.base;
      const hexAddress = "0x" + address.toString(16);
      const xPosAddress = "0x" + (address + 7).toString(16);

      this.menuService.showMenu(event, [
        {
          label: `View memory (${toHex(address)})`,
          click: () => {
            this.onViewMemory({
              address: hexAddress,
              type: "vram",
            });
          },
        },
        {
          label: `Break on X position change (${row.locationX})`,
          click: () => {
            this.breakpointsService.addBreakpoint({
              address: xPosAddress,
              type: "vram",
              write: true,
              enabled: true,
              comment: `Break on sprite #${row.index} X position change`,
            });
          },
        },
      ]);
    }
  },
};
