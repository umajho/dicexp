export interface Restrictions {
  /**
   * 软性的超时限制，每隔 `intervalPerCheck` 后检查（默认为每次调用（通常函数+闭包））。
   * 无法应对单步内耗时过长的情况，这需要配合 WebWorker 或者其他机制。
   *
   * 默认不限制。
   */
  softTimeout?: {
    ms: number;
    intervalPerCheck?: { calls: number };
  };
}
