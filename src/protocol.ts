import type { Example, Grid, Pattern } from './patterns';

export type Command =
  | { type: 'init'; seed: number; grid: Grid }
  | { type: 'inspect'; grid: Grid; requestId: number }
  | { type: 'pace'; milliseconds: number }
  | { type: 'run' }
  | { type: 'pause' }
  | { type: 'step' }
  | { type: 'teach'; grid: Grid; label: Pattern };

export type Snapshot = {
  probabilities: number[];
  baselineProbabilities: number[];
  hidden: number[];
  weights: number[][];
  biases: number[][];
  epoch: number;
  examplesSeen: number;
  corrections: number;
  loss: number;
  baselineLoss: number;
  accuracy: number;
  baselineAccuracy: number;
  classAccuracy: number[];
  before: number[];
  after: number[];
  showcase: Example[];
};

export type WorkerMessage =
  | { type: 'snapshot'; snapshot: Snapshot; grid: Grid; requestId: number; running: boolean; busy: boolean }
  | { type: 'training-samples'; examples: Example[]; start: number; total: number; round: number }
  | { type: 'error'; message: string };
