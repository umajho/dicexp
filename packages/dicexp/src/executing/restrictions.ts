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

  /**
   * 最多允许调用（通常函数+闭包）的次数。
   *
   * 默认不限制。
   */
  maxCalls?: number;

  /**
   * 最多允许闭包调用的深度。
   */
  // maxClosureCallDepth?: number;
  maxClosureCallDepth?: never;
}
