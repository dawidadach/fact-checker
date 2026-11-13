// AudioWorklet: odtwarza kawałki PCM (Float32, 16 kHz) przysłane z karty – z nich panel robi zwykły strumień audio
// (MediaStream) dla transkrypcji. Gdy nic nie przyszło – cisza. Zaległość ponad 30 s jest ucinana (zostaje świeży dźwięk).
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.q = [];
    this.off = 0;
    this.len = 0;
    this.port.onmessage = ({ data }) => {
      if (!(data instanceof Float32Array) || !data.length) return;
      this.q.push(data);
      this.len += data.length;
      while (this.len > sampleRate * 30 && this.q.length > 1) this.len -= this.q.shift().length;
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      while (this.q.length && this.off >= this.q[0].length) { this.len -= this.q.shift().length; this.off = 0; }
      out[i] = this.q.length ? this.q[0][this.off++] : 0;
    }
    return true;
  }
}
registerProcessor("pcm-player", PcmPlayer);
