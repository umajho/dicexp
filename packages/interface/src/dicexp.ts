import { Repr } from "./repr";

// IR = Intermediate representation
export interface Dicexp<
  IR,
  TopLevelScope,
  Parse_ extends Parse<IR> = Parse<IR>,
  Execute_ extends Execute<IR, TopLevelScope> = Execute<IR, TopLevelScope>,
  Evaluate_ extends Evaluate<TopLevelScope> = Evaluate<TopLevelScope>,
> {
  parse: Parse_;
  execute: Execute_;
  evaluate: Evaluate_;
}

export type Parse<
  IR,
  ParseOptions extends BasicParseOptions = BasicParseOptions,
  ParseResult extends BasicParseResult<IR, BasicParseError> = //
    BasicParseResult<IR, BasicParseError>,
> = //
  (code: string, opts?: ParseOptions) => ParseResult;

export interface BasicParseOptions {}
export type BasicParseResult<
  IR,
  ParseError extends BasicParseError = BasicParseError,
> =
  | ["ok", IR]
  | ["error", ParseError];
export interface BasicParseError {
  message: string;
}

export type JSValue = number | boolean | JSValue[];

export type Execute<
  IR,
  TopLevelScope,
  ExecutionOptions extends BasicExecutionOptions<TopLevelScope> = //
    BasicExecutionOptions<TopLevelScope>,
  ExecutionResult extends BasicExecutionResult = BasicExecutionResult,
> = //
  (ir: IR, opts: ExecutionOptions) => ExecutionResult;

export interface BasicExecutionOptions<TopLevelScope> {
  topLevelScope: TopLevelScope;
}
export type BasicExecutionResult<
  ExecutionAppendix extends BasicExecutionAppendix = BasicExecutionAppendix,
  RuntimeError extends BasicRuntimeError = BasicRuntimeError,
> =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "runtime", RuntimeError, ExecutionAppendix];
export interface BasicExecutionAppendix {
  representation: Repr;
  statistics: BasicExecutionStatistics;
}
export interface BasicExecutionStatistics {
  timeConsumption: { ms: number };
}
export interface BasicRuntimeError {
  message: string;
}

export type Evaluate<
  TopLevelScope,
  EvaluationOptions extends BasicEvaluationOptions<TopLevelScope> = //
    BasicEvaluationOptions<TopLevelScope>,
  EvaluationResult extends BasicEvaluationResult = BasicEvaluationResult,
> = (
  code: string,
  opts: EvaluationOptions,
) => EvaluationResult;

export interface BasicEvaluationOptions<
  TopLevelScope,
  ParseOptions extends BasicParseOptions = BasicParseOptions,
  ExecutionOptions extends BasicExecutionOptions<TopLevelScope> = //
    BasicExecutionOptions<TopLevelScope>,
> {
  parse?: ParseOptions;
  execution: ExecutionOptions;
}
export type BasicEvaluationResult<
  ParseError extends BasicParseError = BasicParseError,
  ExecutionAppendix extends BasicExecutionAppendix = BasicExecutionAppendix,
  RuntimeError extends BasicRuntimeError = BasicRuntimeError,
> =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "parse", ParseError]
  | ["error", "runtime", RuntimeError, ExecutionAppendix]
  | ["error", "other", Error];
