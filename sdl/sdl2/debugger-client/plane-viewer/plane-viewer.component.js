import { getRgbPalettesFromCram, to0xHex, toHex } from "../utils.js";
import { WsService } from "../ws.service.js";

export const PlaneViewerComponent = {
  bindings: {
    base: "<",
    width: "<",
    height: "<",
    onViewMemory: "&",
  },
  template: `
    <div class="position-relative h-100 overflow-auto">
        <canvas 
          id="plane" 
          width="1024" 
          height="1024" 
          style="height: 1024px" 
          class="position-absolute"
        ></canvas>
        <canvas 
          id="overlay-plane" 
          width="1024" 
          height="1024" 
          class="position-absolute"
          ng-mousedown="$ctrl.onContextMenu($event)"
          oncontextmenu="return false"
        ></canvas>
    </div>
    `,
  controller: class PlaneViewerController {
    // <canvas id="plane" width="{{$ctrl.width * 8}}" height="{{$ctrl.height * 8}}" style="height: {{$ctrl.height * 8}}px" class="position-absolute"></canvas>
    //     <canvas id="overlay-plane" width="{{$ctrl.width * 8}}" height="{{$ctrl.height * 8}}" class="position-absolute"></canvas>
    /**
     * @typedef {Object} Tile
     * @prop {number} id - tile id
     * @prop {boolean} horizontalFlip
     * @prop {number} paletteIdx
     * @prop {number} vram - byte offset into vram for this nametable entry
     */
    /** @type {Tile[][]} - an array of height by width tiles */
    tiles;
    /** Base address of the plane table (e.g. 0xe000), the value is provided through the binding */
    base = 0;
    /**
     * Width in tiles. Value provided through binding.
     *
     * 256px | 512px | 1024px
     * @type { 32 | 64 | 128 }
     */
    width = 32;
    /**
     * Width in tiles. Value provided through binding.
     *
     * 256px | 512px | 1024px
     * @type { 32 | 64 | 128 }
     */
    height = 32;
    /** @type {(data: { address: string; type: string; }) => void} */
    onViewMemory;
    /** @type {import('../menu/menu.service').MenuService}*/
    menuService;
    /** @type {Tile} */
    hoveredTile;

    /**
     * @param {import("angular").IAugmentedJQuery} $element
     */
    constructor($element, menuService) {
      this.view = $element[0];
      this.menuService = menuService;

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

      /** @type {HTMLCanvasElement} */
      const overlayCanvas = this.view.querySelector("#overlay-plane");
      const overlayCtx = overlayCanvas.getContext("2d");
      if (!overlayCtx) return;

      /** @type {HTMLCanvasElement} */
      const canvas = this.view.querySelector("#plane");

      overlayCtx.imageSmoothingEnabled = false;
      overlayCtx.strokeStyle = "white";
      overlayCtx.font = "16px serif";
      overlayCtx.translate(-0.5, -0.5);

      overlayCanvas.onmouseleave = () => {
        overlayCtx.clearRect(0, 0, 1025, 257);
      };

      overlayCanvas.onmousemove = (e) => {
        overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
        overlayCtx.clearRect(0, 0, 1024, 1024);
        overlayCtx.translate(-0.5, -0.5);

        // Snap to 8x8 grid
        let x = Math.floor((e.offsetX - 4) / 8) * 8;
        let y = Math.floor((e.offsetY - 4) / 8) * 8;
        // Constraint to component
        x = Math.min(Math.max(0, x), (this.width - 1) * 8);
        y = Math.min(Math.max(0, y), (this.height - 1) * 8);

        overlayCtx.strokeRect(x, y, 8, 8);

        // Move tooltip to the left of the cursor if we're near the right screen border
        if (
          overlayCanvas.parentElement &&
          e.screenX + 185 >
            overlayCanvas.parentElement.getBoundingClientRect().right
        ) {
          overlayCtx.translate(-200.5, -0.5);
        }

        // Draw background for the tooltip
        overlayCtx.fillStyle = "rgba(255, 255, 255, 0.8)";
        overlayCtx.fillRect(x + 12, y - 8, 185, 86);

        const tileData = this.tiles[y / 8][x / 8];
        this.hoveredTile = tileData;
        const tileId = tileData.id;

        overlayCtx.fillStyle = "black";
        overlayCtx.fillText(`Position: ${x / 8}, ${y / 8}`, x + 16, y + 8);
        overlayCtx.fillText(
          `Tile: $${tileId.toString(16).toUpperCase()} / ${tileId}`,
          x + 16,
          y + 8 + 16
        );
        overlayCtx.fillText(
          `H-Flip: ${tileData.horizontalFlip}`,
          x + 16,
          y + 8 + 16 + 16
        );
        overlayCtx.fillText(
          `Palette: ${tileData.paletteIdx}`,
          x + 16,
          y + 8 + 16 + 16 + 16
        );
        overlayCtx.fillText(
          `Vram: ${toHex(tileData.vram)}`,
          x + 16,
          y + 8 + 16 + 16 + 16 + 16
        );

        overlayCtx.scale(8, 8);
        overlayCtx.drawImage(
          canvas,
          x,
          y,
          8,
          8,
          (x + 128) / 8,
          (y - 4) / 8,
          8 - 0.1,
          8 - 0.1
        );
      };
    }

    async lazyLoad() {
      this.tiles = Array(this.height)
        .fill(0)
        .map((x) => Array(this.width).fill(0));

      const { data: vram } = await WsService.showMemoryLocation(
        0,
        0xffff,
        "vram"
      );

      const palettes = await getRgbPalettesFromCram();

      /** @type {HTMLCanvasElement} */
      const canvas = this.view.querySelector("#plane");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.imageSmoothingEnabled = false;

      const imageData = ctx.createImageData(this.width * 8, this.height * 8);

      /**
       * Size of a nametable in bytes.
       * E.g. 128 tiles wide * 32 tiles high * 2 bytes per nametable entry = 0x2000 bytes.
       */
      const tileMapSize = this.width * this.height * 2;

      const tileMapStart = this.base >> 4;
      const tileMapEnd = (this.base >> 4) + (tileMapSize >> 4);

      for (let index = tileMapStart; index < tileMapEnd; index++) {
        /**
         * Each 'index' is 8 tiles. Find out how many times do we need to draw 8 tiles to draw one line.
         * E.g if screen width is 128 tiles: we draw 8 tiles 16 times before switching to next line.
         */
        const tileLine = Math.floor((index - tileMapStart) / (this.width / 8));
        // 8 tiles by 8 pixels by 4 rbga bytes
        const tileOffset =
          (index - tileMapStart) * 8 * 8 * 4 +
          tileLine * (this.width * 8 * 4 * 7);

        /**
         * Each vram[] record is 16 bytes. Each nametable entry is 2 bytes.
         * We draw 8 tiles in the following for loop.
         */
        for (let col = 0; col < 16; col += 2) {
          // Divide by 2 because we skip each other pixel
          // Multiply by 8 pixels in a row
          // Multiply by 4 color elements in rgba
          let offset = tileOffset + (col / 2) * 8 * 4;
          const word = (vram[index][col] << 8) + vram[index][col + 1];
          // tileIdx is last 10 bits
          const tile = word & 0x7ff;
          const horizontalFlip = !!(vram[index][col] & (1 << 3));
          const paletteIdx = (word >> 13) & 0b11;

          const x = (offset / 32) % this.width;
          const y = Math.floor(offset / (this.width * 8 * 4 * 8));
          this.tiles[y][x] = {
            id: tile,
            horizontalFlip,
            paletteIdx,
            vram: index * 16 + col,
          };

          const tileBytes = [...vram[tile * 2], ...vram[tile * 2 + 1]];
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
            // offset += 1016 * 4;
            offset += (this.width * 8 - 8) * 4;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }

    /**
     * @param {MouseEvent} event
     */
    onContextMenu(event) {
      if (event.which !== 3) {
        return;
      }
      this.menuService.showMenu(event, [
        {
          label: `View in memory (${toHex(this.hoveredTile.vram)})`,
          click: () => {
            this.onViewMemory({
              address: to0xHex(this.hoveredTile.vram),
              type: "vram",
            });
          },
        },
      ]);
    }
  },
};
