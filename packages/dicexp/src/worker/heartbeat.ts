export class Pulser {
  private _lastHeartbeat!: number;
  get lastHeartbeat() {
    return this._lastHeartbeat;
  }

  constructor(interval: { ms: number }) {
    const pulse = () => {
      this._lastHeartbeat = Date.now();
      this.postHeartbeat();
      setTimeout(pulse, interval.ms);
    };
    pulse();
  }

  postHeartbeat() {
    postMessage(["heartbeat"]);
  }
}
