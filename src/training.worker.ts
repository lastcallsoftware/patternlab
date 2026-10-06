import * as tf from '@tensorflow/tfjs';
import { PatternNetwork } from './model';
import type { Command, WorkerMessage } from './protocol';
import type { Grid } from './patterns';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Command>) => void) | null;
  postMessage(message: WorkerMessage): void;
};
let network: PatternNetwork | undefined;
let grid: Grid = [];
let requestId = 0;
let running = false;
let busy = false;
let sampleDelay = 120;
let timer: ReturnType<typeof setTimeout> | undefined;
let sampleTimer: ReturnType<typeof setTimeout> | undefined;
let releaseSampleWait: (() => void) | undefined;

function publish(): void {
  if (network) scope.postMessage({ type: 'snapshot', snapshot: network.snapshot(grid), grid: [...grid], requestId, running, busy });
}

function fail(error: unknown): void {
  running = false;
  busy = false;
  clearTimeout(timer);
  scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}

async function epoch(): Promise<void> {
  if (!network || busy) return;
  busy = true;
  const continuous = running;
  publish();
  try {
    await network.trainEpoch(async (examples, start, total, round) => {
      scope.postMessage({ type: 'training-samples', examples, start, total, round });
      // Let the browser show the exact group before its training update.
      await new Promise<void>(resolve => {
        releaseSampleWait = resolve;
        sampleTimer = setTimeout(resolve, sampleDelay);
      });
      releaseSampleWait = undefined;
    }, () => continuous && !running);
    busy = false;
    publish();
    // Teaching is paced for people. Computation runs in this worker, while the
    // main thread can animate and accept grid edits throughout training.
    if (running) timer = setTimeout(() => void epoch(), 100);
  } catch (error) {
    fail(error);
  }
}

async function handle(command: Command): Promise<void> {
  if (command.type === 'pace') { sampleDelay = command.milliseconds; return; }
  if (command.type === 'init') {
    await tf.setBackend('cpu');
    await tf.ready();
    grid = command.grid;
    network = new PatternNetwork(command.seed);
    scope.postMessage({ type: 'training-samples', examples: network.nextTrainingSamples(), start: 0, total: 1024, round: 1 });
    publish();
    return;
  }
  if (!network) return;
  switch (command.type) {
    case 'inspect':
      grid = command.grid;
      requestId = command.requestId;
      publish();
      break;
    case 'run':
      if (!running && !busy) {
        running = true;
        void epoch();
      }
      break;
    case 'pause':
      running = false;
      clearTimeout(timer);
      clearTimeout(sampleTimer);
      releaseSampleWait?.();
      publish();
      break;
    case 'step':
      if (!running && !busy) void epoch();
      break;
    case 'teach':
      if (!running && !busy) {
        busy = true;
        publish();
        try {
          await network.teach(command.grid, command.label);
          busy = false;
          publish();
        } catch (error) {
          fail(error);
        }
      }
      break;
  }
}

scope.onmessage = event => { void handle(event.data).catch(fail); };
