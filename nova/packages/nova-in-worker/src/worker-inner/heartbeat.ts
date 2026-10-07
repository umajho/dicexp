export class Pulser {
  private _lastHeartbeat!: number;
  get lastHeartbeat() {
    return this._lastHeartbeat;
  }

  constructor(
    interval: { ms: number },
    onHeartbeat: () => void,
  ) {
    const pulse = () => {
      this._lastHeartbeat = Date.now();
      onHeartbeat();
      setTimeout(pulse, interval.ms);
    };
    pulse();
  }
}
