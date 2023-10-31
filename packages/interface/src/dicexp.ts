import { Repr } from "./repr";

// IR = Intermediate representation
export interface Dicexp<
  IR,
  TopLevelScope,
  //
  ParseOptions extends BasicParseOptions = BasicParseOptions,
  ParseError extends BasicParseError = BasicParseError,
  ParseResult extends BasicParseResult<IR, ParseError> = //
    BasicParseResult<IR, ParseError>,
  //
  ExecutionOptions extends BasicExecutionOptions<TopLevelScope> = //
    BasicExecutionOptions<TopLevelScope>,
  ExecutionStatistics extends BasicExecutionStatistics = //
    BasicExecutionStatistics,
  ExecutionAppendix extends BasicExecutionAppendix<ExecutionStatistics> = //
    BasicExecutionAppendix<ExecutionStatistics>,
  RuntimeError extends BasicRuntimeError = BasicRuntimeError,
  ExecutionResult extends //
  BasicExecutionResult<ExecutionStatistics, ExecutionAppendix, RuntimeError> = //
    BasicExecutionResult<ExecutionStatistics, ExecutionAppendix, RuntimeError>,
  //
  EvaluationOptions extends //
  BasicEvaluationOptions<ParseOptions, ExecutionOptions> = //
    BasicEvaluationOptions<ParseOptions, ExecutionOptions>,
  EvaluationResult extends //
  BasicEvaluationResult<ExecutionAppendix, ParseError, RuntimeError> = //
    BasicEvaluationResult<ExecutionAppendix, ParseError, RuntimeError>,
> {
  parse: Parse<IR, ParseOptions, ParseResult>;
  execute: Execute<IR, TopLevelScope, ExecutionOptions, ExecutionResult>;
  evaluate: (code: string, opts: EvaluationOptions) => EvaluationResult;
}

export type Parse<
  IR,
  ParseOptions extends BasicParseOptions,
  ParseResult extends BasicParseResult<IR, BasicParseError>,
> = //
  (code: string, opts?: ParseOptions) => ParseResult;

export interface BasicParseOptions {}
export type BasicParseResult<IR, ParseError extends BasicParseError> =
  | ["ok", IR]
  | ["error", ParseError];
export interface BasicParseError {
  message: string;
}

export type JSValue = number | boolean | JSValue[];

export type Execute<
  IR,
  TopLevelScope,
  ExecutionOptions extends BasicExecutionOptions<TopLevelScope>,
  ExecutionResult extends //
  BasicExecutionResult<
    BasicExecutionStatistics,
    BasicExecutionAppendix<BasicExecutionStatistics>,
    BasicRuntimeError
  >,
> = //
  (ir: IR, opts: ExecutionOptions) => ExecutionResult;

export interface BasicExecutionOptions<TopLevelScope> {
  topLevelScope: TopLevelScope;
}
export type BasicExecutionResult<
  ExecutionStatistics extends BasicExecutionStatistics,
  ExecutionAppendix extends BasicExecutionAppendix<ExecutionStatistics>,
  RuntimeError extends BasicRuntimeError,
> =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "runtime", RuntimeError, ExecutionAppendix];
export interface BasicExecutionAppendix<
  ExecutionStatistics extends BasicExecutionStatistics,
> {
  representation: Repr;
  statistics: ExecutionStatistics;
}
export interface BasicExecutionStatistics {
  timeConsumption: { ms: number };
}
export interface BasicRuntimeError {
  message: string;
}

export interface BasicEvaluationOptions<ParseOptions, ExecutionOptions> {
  parse?: ParseOptions;
  execution: ExecutionOptions;
}
export type BasicEvaluationResult<
  ExecutionAppendix extends BasicExecutionAppendix<BasicExecutionStatistics>,
  ParseError extends BasicParseError,
  RuntimeError extends BasicRuntimeError,
> =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "parse", ParseError]
  | ["error", "runtime", RuntimeError]
  | ["error", "other", Error];
