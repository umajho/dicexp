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
  ExecutionAppendix extends BasicExecutionAppendix = BasicExecutionAppendix,
  RuntimeError extends BasicRuntimeError = BasicRuntimeError,
  ExecutionResult extends //
  BasicExecutionResult<ExecutionAppendix, RuntimeError> = //
    BasicExecutionResult<ExecutionAppendix, RuntimeError>,
  //
  EvaluationOptions extends //
  BasicEvaluationOptions<ParseOptions, ExecutionOptions> = //
    BasicEvaluationOptions<ParseOptions, ExecutionOptions>,
  EvaluationResult extends //
  BasicEvaluationResult<ExecutionAppendix, ParseError, RuntimeError> = //
    BasicEvaluationResult<ExecutionAppendix, ParseError, RuntimeError>,
> {
  parse: (code: string, opts?: ParseOptions) => ParseResult;
  execute: (ir: IR, opts: ExecutionOptions) => ExecutionResult;
  evaluate: (code: string, opts: EvaluationOptions) => EvaluationResult;
}

export interface BasicParseOptions {}
export type BasicParseResult<IR, ParseError extends BasicParseError> =
  | ["ok", IR]
  | ["error", ParseError];
export interface BasicParseError {
  message: string;
}

export type JSValue = number | boolean | JSValue[];

export interface BasicExecutionOptions<TopLevelScope> {
  topLevelScope: TopLevelScope;
}
export type BasicExecutionResult<
  ExecutionAppendix extends BasicExecutionAppendix,
  RuntimeError extends BasicRuntimeError,
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

export interface BasicEvaluationOptions<Parse, Execute> {
  parse?: Parse;
  execute: Execute;
}
export type BasicEvaluationResult<
  ExecutionAppendix extends BasicExecutionAppendix,
  ParseError extends BasicParseError,
  RuntimeError extends BasicRuntimeError,
> =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "parse", ParseError]
  | ["error", "runtime", RuntimeError]
  | ["error", "other", Error];
