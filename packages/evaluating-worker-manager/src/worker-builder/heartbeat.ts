import { MessagePoster } from "./types";

export class Pulser {
  private _lastHeartbeat!: number;
  get lastHeartbeat() {
    return this._lastHeartbeat;
  }

  constructor(
    interval: { ms: number },
    private poster: MessagePoster,
  ) {
    const pulse = () => {
      this._lastHeartbeat = Date.now();
      this.postHeartbeat();
      setTimeout(pulse, interval.ms);
    };
    pulse();
  }

  postHeartbeat() {
    this.poster.tryPostMessage(["heartbeat"]);
  }
}
