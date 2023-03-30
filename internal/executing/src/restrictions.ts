export interface Restrictions {
  /**
   * 软性的超时限制，每隔 `intervalPerCheck` 后检查（默认为每次 `concretize`）。
   * 无法应对单步内耗时过长的情况，这需要配合 WebWorker 或者其他机制。
   *
   * 默认不限制。
   */
  softTimeout?: {
    ms: number;
    intervalPerCheck?: { concretizations: number };
  };
  /**
   * 最多允许调用 `concretize` 且结果并未记忆化的次数。
   *
   * FIXME: 目前该值的含义比较虚，需要阐明明确。
   *
   * 默认不限制。
   */
  maxNonMemoedConcretizations?: number;
  /**
   * 最多允许调用 `concretize` 的层数。
   * 最大的作用是在栈溢出前返回 RuntimeError。
   *
   * 默认不限制。
   */
  maxClosureCallDepth?: number;
}
