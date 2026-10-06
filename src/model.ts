import * as tf from '@tensorflow/tfjs';
import { HIDDEN_UNITS, makeDataset, winner, type Example, type Grid, type Pattern } from './patterns';
import type { Snapshot } from './protocol';

function createModel(seed: number): tf.Sequential {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    inputShape: [16], units: HIDDEN_UNITS, activation: 'relu',
    kernelInitializer: tf.initializers.glorotUniform({ seed }),
  }));
  model.add(tf.layers.dense({
    units: 4, activation: 'softmax',
    kernelInitializer: tf.initializers.glorotUniform({ seed: seed + 1 }),
  }));
  return model;
}

function inputs(examples: Example[]): tf.Tensor2D {
  return tf.tensor2d(examples.map(item => item.grid.map(value => value * 2 - 1)));
}

export class PatternNetwork {
  private model: tf.Sequential;
  private baseline: tf.Sequential;
  private optimizer: tf.Optimizer;
  private dataset = makeDataset();
  private trainX = inputs(this.dataset.train);
  private trainY = tf.tensor2d(this.dataset.train.map(item => [0, 1, 2, 3].map(label => Number(label === item.label))));
  private testX = inputs(this.dataset.test);
  private showcaseX = inputs(this.dataset.showcase);
  private baselineAccuracy: number;
  private before: number[];
  private epoch = 0;
  private trainingOffset = 0;
  private examplesSeen = 0;
  private corrections = 0;
  private loss: number;
  private baselineLoss: number;

  constructor(seed = 7) {
    this.model = createModel(seed);
    this.baseline = createModel(seed);
    this.optimizer = tf.train.adam(0.015);
    this.model.compile({ optimizer: this.optimizer, loss: 'categoricalCrossentropy' });
    this.loss = this.computeLoss();
    this.baselineLoss = this.loss;
    this.baselineAccuracy = this.evaluate(this.baseline).accuracy;
    this.before = this.predictLabels(this.baseline, this.showcaseX);
  }

  private predictLabels(model: tf.LayersModel, data: tf.Tensor2D): Pattern[] {
    return tf.tidy(() => {
      const scores = (model.predict(data) as tf.Tensor2D).arraySync();
      return scores.map(winner);
    });
  }

  private evaluate(model: tf.LayersModel): { accuracy: number; classAccuracy: number[] } {
    const predicted = this.predictLabels(model, this.testX);
    const correct = [0, 0, 0, 0];
    this.dataset.test.forEach((item, index) => {
      if (item.label === predicted[index]) correct[item.label]++;
    });
    return { accuracy: correct.reduce((a, b) => a + b, 0) / predicted.length, classAccuracy: correct.map(count => count / 64) };
  }

  async trainEpoch(
    onSamples?: (examples: Example[], start: number, total: number, round: number) => Promise<void>,
    shouldStop: () => boolean = () => false,
  ): Promise<void> {
    const total = this.dataset.train.length;
    while (this.trainingOffset < total) {
      if (shouldStop()) break;
      const start = this.trainingOffset;
      await onSamples?.(this.dataset.train.slice(start, start + 32), start, total, this.epoch + 1);
      if (shouldStop()) break;
      const x = this.trainX.slice([start, 0], [32, 16]);
      const y = this.trainY.slice([start, 0], [32, 4]);
      try {
        await this.model.trainOnBatch(x, y);
      } finally {
        x.dispose();
        y.dispose();
      }
      this.trainingOffset += 32;
      this.examplesSeen += 32;
      if (this.trainingOffset === total) {
        this.trainingOffset = 0;
        this.epoch++;
        break;
      }
    }
    this.loss = this.computeLoss();
  }

  nextTrainingSamples(): Example[] { return this.dataset.train.slice(this.trainingOffset, this.trainingOffset + 32); }

  private computeLoss(): number {
    // Measure every update against the same full teaching set. The number is
    // comparable before training, after a round, and after a personal correction.
    return tf.tidy(() => tf.metrics.categoricalCrossentropy(
      this.trainY, this.model.predict(this.trainX) as tf.Tensor2D,
    ).mean().dataSync()[0]);
  }

  async teach(grid: Grid, label: Pattern): Promise<void> {
    const x = tf.tensor2d([grid.map(value => value * 2 - 1)]);
    const y = tf.tensor2d([[0, 1, 2, 3].map(value => Number(value === label))]);
    try {
      // A correction is deliberately small; one example should not overwrite
      // everything learned from the balanced automatic teaching set.
      await this.model.trainOnBatch(x, y);
      this.loss = this.computeLoss();
      this.examplesSeen++;
      this.corrections++;
    } finally {
      x.dispose();
      y.dispose();
    }
  }

  snapshot(grid: Grid): Snapshot {
    const activation = tf.tidy(() => {
      const x = tf.tensor2d([grid.map(value => value * 2 - 1)]);
      return {
        probabilities: Array.from((this.model.predict(x) as tf.Tensor2D).dataSync()),
        baselineProbabilities: Array.from((this.baseline.predict(x) as tf.Tensor2D).dataSync()),
        hidden: Array.from((this.model.layers[0].apply(x) as tf.Tensor2D).dataSync()),
        // getWeights returns the layer's live tensors; keep them owned by the
        // model and copy their numbers for the visualization.
        weights: this.model.layers.map(layer => Array.from(layer.getWeights()[0].dataSync())),
        biases: this.model.layers.map(layer => Array.from(layer.getWeights()[1].dataSync())),
      };
    });
    return {
      ...activation, ...this.evaluate(this.model), epoch: this.epoch,
      examplesSeen: this.examplesSeen, corrections: this.corrections, loss: this.loss,
      baselineLoss: this.baselineLoss,
      baselineAccuracy: this.baselineAccuracy, before: this.before,
      after: this.predictLabels(this.model, this.showcaseX), showcase: this.dataset.showcase,
    };
  }

  dispose(): void {
    this.trainX.dispose();
    this.trainY.dispose();
    this.testX.dispose();
    this.showcaseX.dispose();
    this.model.dispose();
    this.baseline.dispose();
    this.optimizer.dispose();
  }
}
