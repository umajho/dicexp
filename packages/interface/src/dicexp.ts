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
  BasicEvaluationResult<ParseError, ExecutionAppendix, RuntimeError> = //
    BasicEvaluationResult<ParseError, ExecutionAppendix, RuntimeError>,
> {
  parse: Parse<IR, ParseOptions, ParseResult>;
  execute: Execute<IR, TopLevelScope, ExecutionOptions, ExecutionResult>;
  evaluate: Evaluate<TopLevelScope, EvaluationOptions, EvaluationResult>;
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
  BasicExecutionResult<BasicExecutionAppendix, BasicRuntimeError>,
> = //
  (ir: IR, opts: ExecutionOptions) => ExecutionResult;

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

// BasicEvaluationOptions<BasicParseOptions, BasicExecutionOptions<TopLevelScope>
// BasicEvaluationResult<ParseError, ExecutionAppendix, RuntimeError>
export type Evaluate<
  TopLevelScope,
  EvaluationOptions extends BasicEvaluationOptions<
    BasicParseOptions,
    BasicExecutionOptions<TopLevelScope>
  >,
  EvaluationResult extends BasicEvaluationResult<
    BasicParseError,
    BasicExecutionAppendix,
    BasicRuntimeError
  >,
> = (
  code: string,
  opts: EvaluationOptions,
) => EvaluationResult;

export interface BasicEvaluationOptions<ParseOptions, ExecutionOptions> {
  parse?: ParseOptions;
  execution: ExecutionOptions;
}
export type BasicEvaluationResult<
  ParseError extends BasicParseError,
  ExecutionAppendix extends BasicExecutionAppendix,
  RuntimeError extends BasicRuntimeError,
> =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "parse", ParseError]
  | ["error", "runtime", RuntimeError, ExecutionAppendix]
  | ["error", "other", Error];
