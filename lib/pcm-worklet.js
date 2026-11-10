// AudioWorklet: przekazuje surowe próbki mono (Float32) do wątku głównego w paczkach ~0,25 s.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(4096);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0];
    if (ch && ch.length) {
      const len = ch[0].length;
      for (let i = 0; i < len; i++) {
        let v = 0;
        for (let c = 0; c < ch.length; c++) v += ch[c][i];
        this.buf[this.n++] = v / ch.length;
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf.slice(0));
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
