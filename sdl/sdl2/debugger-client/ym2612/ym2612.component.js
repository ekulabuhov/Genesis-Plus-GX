import { WsService } from "../ws.service.js";

export const Ym2612Component = {
  template: `
        <div class="d-flex flex-column h-100 position-relative">
          <div class="time-line" style="left: {{$ctrl.time}}%;"></div>
          <div class="grid">
            <div class="one-second"></div>
            <div class="one-second"></div>
            <div class="one-second"></div>
            <div class="one-second"></div>
            <div class="one-second"></div>
          </div>
          <div class="track position-relative flex-grow-1" ng-repeat="track in $ctrl.tracks" ng-init="trackIndex=$index">
            <div class="note" ng-repeat="note in track.notes" style="
              width: {{ (note.noteOff - note.noteOn) / 5000 * 100 }}%; 
              bottom: {{ $ctrl.noteTop(track, note) }}%;
              left: {{ note.noteOn / 5000 * 100 }}%;
              background-color: {{$ctrl.trackColors[trackIndex]}}" >
            </div>
          </div>
        </div>`,
  controller: class Ym2612Controller {
    /**
     * @type {[number, number, string][]}
     * [0] - is delta in ms against previous command
     * [1] - is address value from 0 to 4
     * [2] - is data value as hex string
     */
    commands = [];

    /**
     * @type {{
     *  notes: { octave: number, freq: number, noteOn: number, noteOff: number }[];
     *  minFreq: number;
     *  range: number;
     * }[]}
     */
    tracks = [];
    trackColors = [
      "blueviolet",
      "yellowgreen",
      "royalblue",
      "darkorange",
      "cadetblue",
      "mediumslateblue",
    ];
    time = 0;
    channelIdx = 0;

    /**
     * @param {import("angular").IAugmentedJQuery} $element
     * @param {import("angular").IScope} $scope
     */
    constructor($element, $scope) {
      let intervalId;
      const keyCodeToFreq = {
        KeyA: 644, // C
        KeyW: 681, // C#
        KeyS: 722, // D
        KeyE: 765, // D#
        KeyD: 810, // E
        KeyF: 858, // F
        KeyT: 910, // F#
        KeyG: 964, // G
        KeyY: 1021, // G#
        KeyH: 1081, // A
        KeyU: 1146, // A#
        KeyJ: 1214, // B
      };
      document.onkeydown = (e) => {
        if (e.code === "Space") {
          e.preventDefault();
          clearInterval(intervalId);
          intervalId = 0;
        } else if (e.code === "KeyX") {
          this.channelIdx++;
          console.log("channel", this.channelIdx);
        } else if (e.code === "KeyZ") {
          this.channelIdx--;
          console.log("channel", this.channelIdx);
        } else if (keyCodeToFreq[e.code] && !e.repeat) {
          const noteOnIndex = this.commands.findIndex((cmd, i) => {
            const data = parseInt(cmd[2], 16);
            return (
              this.commands[i - 1]?.[2] === "28" &&
              (data & 7) === this.channelIdx &&
              data >> 4 > 0
            );
          });

          // Channel data not found
          if (noteOnIndex === -1) {
            console.log("no instrument data found");
            return;
          }

          const lastNoteIndex = this.commands
            .slice(0, noteOnIndex - 1)
            .findLastIndex((cmd) => cmd[2] === "28");

          const playCmds = this.commands.slice(
            Math.max(0, lastNoteIndex),
            noteOnIndex + 1
          );

          const newFreq = ((2 << 11) + keyCodeToFreq[e.code]).toString(16);
          playCmds[playCmds.length - 3][2] = newFreq.slice(-2);
          playCmds[playCmds.length - 5][2] = newFreq.slice(0, 2);

          console.log({ playCmds });
          playCmds.forEach((cmd) =>
            ws.send(`memw 0x${(0xa04000 + cmd[1]).toString(16)} 0x${cmd[2]}`)
          );
        }
      };

      document.onkeyup = (e) => {
        if (keyCodeToFreq[e.code]) {
          ws.send(`memw 0x${(0xa04000 + 0).toString(16)} 0x28`);
          ws.send(`memw 0x${(0xa04000 + 1).toString(16)} ${this.channelIdx}`);
        }
      };

      WsService.on("open", () => {
        console.log("connected");
      });
      WsService.doConnect("ws://localhost:8080");

      WsService.on("message", (data) => {
        if (data.type === "ym2612" && intervalId) {
          if (!this.commands.length) {
            data.data[data.data.length - 2][0] = 0;
          }
          this.commands.push(...data.data);
        }
      });

      intervalId = setInterval(() => {
        if (!this.commands.length) {
          return;
        }

        const interval = 100 / (5000 / 50);

        this.time += interval;

        this.recalcTracks((5000 / 100) * this.time);

        if (this.time + interval > 100) {
          this.time = 0;
          this.commands = [];
        }

        $scope.$apply();
      }, 50);
    }

    recalcTracks(t) {
      let time = 0;
      const commands = this.commands.filter((c) => {
        time += c[0];
        return time < t;
      });
      for (let channelIdx = 0; channelIdx < 6; channelIdx++) {
        const notes = this.convertCommandsToNotes(commands, channelIdx, t);
        const allFreqs = notes.map((note) => note.freq * 2 ** note.octave);
        const maxFreq = Math.max(...allFreqs);
        const minFreq = Math.min(...allFreqs);
        let range = maxFreq - minFreq;

        range += (range / 140) * 20;

        this.tracks[channelIdx] = {
          notes,
          minFreq,
          range,
        };
      }
    }

    /**
     * @param {any[]} commands
     * @param {number} channelIdx
     */
    convertCommandsToNotes(commands, channelIdx, t) {
      const channel = (0xa4 + (channelIdx % 3)).toString(16).toUpperCase();
      const address = channelIdx < 3 ? 0 : 2;
      let lastFreq;
      let noteOn;
      let time = 0;
      return (
        commands
          .reduce((acc, val, i) => {
            time += val[0];
            if (val[2] === channel && val[1] === address) {
              lastFreq = commands[i + 1][2] + commands[i + 3][2];
            }

            // noteOn
            // [0, 0, '28'],
            // [0, 1, 'F0'],
            // ...
            // noteOff
            // [152, 0, '28'],
            // [0, 1, '0'],

            // noteOn command controls both sets of channels
            if (val[2] === "28" && val[1] === 0) {
              const command = parseInt(commands[i + 1][2], 16);
              if (command >> 4 > 0) {
                // 012 - first three channels
                // 456 - last three channels
                let ch = command & 0b111;
                if (ch > 2) ch--;
                const opers = command >> 4;
                if (ch === channelIdx && opers) {
                  noteOn = time;
                  acc.push({
                    bytes: lastFreq,
                    noteOn,
                    noteOff: t,
                  });
                }
              } else if (noteOn !== undefined) {
                const lastNote = acc[acc.length - 1];
                lastNote.noteOff = Math.max(time, lastNote.noteOn + 20);
                noteOn = undefined;
              }
            }
            return acc;
          }, [])
          .map((x) => ({ ...x, value: parseInt(x.bytes, 16) }))
          // Octave is the upper part of the word taking 3 bits
          .map((x) => ({ ...x, octave: x.value >> 11 }))
          // Frequency is the lower part of the word taking 11 bits
          .map((x) => ({ ...x, freq: x.value & (2 ** 11 - 1) }))
      );
    }

    noteTop(track, note) {
      return (
        ((note.freq * 2 ** note.octave - track.minFreq) / track.range) * 100
      );
    }

    async delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async play(trackIndex) {
      var context = new AudioContext();
      const notes = this.tracks[trackIndex].notes;
      await this.delay(notes[0].noteOn);

      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const o = context.createOscillator();
        const g = context.createGain();
        o.connect(g);
        g.connect(context.destination);
        o.frequency.value = note.freq * 2 ** (note.octave - 4);
        o.start(0);

        await new Promise((resolve) =>
          setTimeout(() => {
            g.gain.exponentialRampToValueAtTime(
              0.00001,
              context.currentTime + 0.04
            );
            resolve();
          }, note.noteOff - note.noteOn)
        );

        if (notes.length > i + 1) {
          const nextNote = notes[i + 1];
          await this.delay(nextNote.noteOn - note.noteOff);
        }
      }
    }
  },
};
