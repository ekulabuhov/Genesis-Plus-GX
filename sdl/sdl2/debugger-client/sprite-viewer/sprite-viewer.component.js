import { getRgbPalettesFromCram } from "../utils.js";
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
      <tr ng-repeat="row in $ctrl.rows" ng-init="rowIndex=$index">
        <td ng-repeat="col in $ctrl.cols">
          <span ng-if="col.type !== 'canvas'">{{row[col.field]}}</span>
          <canvas id="canvas{{rowIndex}}" width="16" height="16" ng-if="col.type === 'canvas' && row[col.field]">{{row[col.field]}}</canvas>
        </td>
      </tr>
    </tbody>
  </table>`,
  controller: class SpriteViewerController {
    cols = [
      { label: "#", field: "index" },
      { label: "Image", type: "canvas", field: "imageData" },
      { label: "Location", field: "location" },
      { label: "Size", field: "size" },
      { label: "Link" },
      { label: "Tile Index", field: "tileIndex" },
      { label: "Palette Line", field: "paletteIdx" },
      { label: "X-Flip", field: "horizontalFlip" },
      { label: "Y-Flip", field: "verticalFlip" },
      { label: "Priority" },
    ];
    /** @type {{
     * index: number;
     * location: string;
     * size: string;
     * link: number;
     * tileIndex: number;
     * imageData?: ImageData
     * horizontalFlip: boolean
     * verticalFlip: boolean
     * paletteIdx: number
     * }[]} */
    rows = [];

    /**
     * @param {import("angular").IAugmentedJQuery} $element
     */
    constructor($element, $scope) {
      this.view = $element[0];

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

      const base = 0xb000;
      this.rows = [];

      // Sprite table address is at 0xB000
      for (let i = 0; i < 80 * 8; i += 8) {
        const mem = vram[Math.floor((base + i) / 16)];
        const j = i % 16;
        let imageData;

        const tileIdAndFlags = ((mem[j + 4] << 8) + mem[j + 5]);
        const tileIndex = tileIdAndFlags & 0b11111111111;
        const horizontalFlip = !!(tileIdAndFlags & (1 << 11));
        const verticalFlip = !!(tileIdAndFlags & (1 << 12));
        const paletteIdx = (tileIdAndFlags >> 13) & 3;
        if (tileIndex) {
          imageData = new ImageData(8, 8);
          const tileBytes = [
            ...vram[tileIndex * 2],
            ...vram[tileIndex * 2 + 1],
          ];
          let offset = 0;
          for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 4; x++) {
              const tileByte = tileBytes[y * 4 + (horizontalFlip ? 3 - x : x)];

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
          }
        }

        const x = {
          index: this.rows.length,
          // Y is byte 0-1 and X is 6-7
          location: `${(mem[j + 6] << 8) + mem[j + 7]},${
            (mem[j] << 8) + mem[j + 1]
          }`,
          size: `${(mem[j + 2] >> 2) + 1}x${(mem[j + 2] & 0b11) + 1}`,
          link: mem[j + 3],
          tileIndex,
          imageData,
        };

        this.rows.push({
          index: this.rows.length,
          location: `${(mem[j + 6] << 8) + mem[j + 7]},${
            (mem[j] << 8) + mem[j + 1]
          }`,
          size: `${(mem[j + 2] >> 2) + 1}x${(mem[j + 2] & 0b11) + 1}`,
          link: mem[j + 3],
          tileIndex,
          imageData,
          horizontalFlip,
          verticalFlip,
          paletteIdx
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
            ctx.scale(2, 2);
            ctx.putImageData(element.imageData, 0, 0);
            ctx.drawImage(canvas, 0, 0);
          }
        }
      }, 100);
    }
  },
};
