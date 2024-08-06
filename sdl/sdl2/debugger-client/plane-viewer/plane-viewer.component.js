import { getRgbPalettesFromCram } from "../utils.js";
import { WsService } from "../ws.service.js";

export const PlaneViewerComponent = {
  bindings: {
    plane: "<",
  },
  template: `
    <div class="position-relative h-100 overflow-auto">
        <canvas id="plane" width="1024" height="256" style="height: 256px" class="position-absolute"></canvas>
        <canvas id="overlay-plane" width="1024" height="256" class="position-absolute"></canvas>
    </div>
    `,
  controller: class PlaneViewerController {
    /** @type {{id: number, horizontalFlip: boolean, paletteIdx: number}[][]} */
    tiles;
    /** @type {"a"|"b"} */
    plane;

    /**
     * @param {import("angular").IAugmentedJQuery} $element
     */
    constructor($element) {
      this.view = $element[0];
      this.tiles = Array(32)
        .fill(0)
        .map((x) => Array(128).fill(0));

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
        overlayCtx.clearRect(0, 0, 1024, 256);
        overlayCtx.translate(-0.5, -0.5);

        // Snap to 8x8 grid
        let x = Math.floor((e.offsetX - 4) / 8) * 8;
        let y = Math.floor((e.offsetY - 4) / 8) * 8;
        // Constraint to component
        x = Math.max(0, x);
        y = Math.max(0, y);

        overlayCtx.strokeRect(x, y, 8, 8);

        // Move tooltip to the left of the cursor if we're near the right screen border
        if (
          overlayCanvas.parentElement &&
          e.screenX + 185 >
            overlayCanvas.parentElement.getBoundingClientRect().right
        ) {
          overlayCtx.translate(-200.5, -0.5);
        }

        overlayCtx.fillStyle = "rgba(255, 255, 255, 0.8)";
        overlayCtx.fillRect(x + 12, y - 8, 185, 70);

        const tileData = this.tiles[y / 8][x / 8];
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
      const { data: vram } = await WsService.showMemoryLocation(
        0,
        0xffff,
        "vram"
      );

      const { data: cram } = await WsService.showMemoryLocation(0, 128, "cram");

      const palettes = await getRgbPalettesFromCram();

      /** @type {HTMLCanvasElement} */
      const canvas = this.view.querySelector("#plane");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.imageSmoothingEnabled = false;

      const imageData = ctx.createImageData(
        ctx.canvas.width,
        ctx.canvas.height
      );

      // Plane A
      let tileMapStart = 0xc00;
      let tileMapEnd = 0xe00;

      // Plane B
      if (this.plane === "b") {
        tileMapStart = 0xe00;
        tileMapEnd = 0x1000;
      }

      // Plane A is at 0xC000 - 0xDFFF
      // Plane B is at 0xE000 - 0xFFFF
      for (let index = tileMapStart; index < tileMapEnd; index++) {
        const tileLine = Math.floor((index - tileMapStart) / 0x10);
        // 8 tiles by 8 pixels by 4 rbga bytes
        const tileOffset =
          (index - tileMapStart) * 8 * 8 * 4 + tileLine * (1024 * 4 * 7);
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

          const x = (offset / 32) % 128;
          const y = Math.floor(offset / (1024 * 4 * 8));
          this.tiles[y][x] = {
            id: tile,
            horizontalFlip,
            paletteIdx,
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
            offset += 1016 * 4;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }
  },
};
