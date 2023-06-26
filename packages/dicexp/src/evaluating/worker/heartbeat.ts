import { tryPostMessage } from "./post_message";

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
    tryPostMessage(["heartbeat"]);
  }
}
