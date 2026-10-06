import assert from 'node:assert/strict';
import test from 'node:test';
import * as tf from '@tensorflow/tfjs';
import { scoresWithoutNeuron } from '../src/explanation.ts';
import { PatternNetwork } from '../src/model.ts';
import { cleanPattern, winner } from '../src/patterns.ts';

test('real training improves held-out recognition across different starting weights', async () => {
  await tf.setBackend('cpu');
  await tf.ready();
  const originalTensorCount = tf.memory().numTensors;
  for (const seed of [7, 18, 29]) {
    const network = new PatternNetwork(seed);
    try {
      const initial = network.snapshot(cleanPattern(0));
      assert.equal(initial.epoch, 0);
      const testGrid = cleanPattern(0);
      initial.hidden.forEach((activity, neuron) => {
        const total = testGrid.reduce((sum, value, input) => sum + (value * 2 - 1) * initial.weights[0][input * 8 + neuron], initial.biases[0][neuron]);
        assert.ok(Math.abs(activity - Math.max(0, total)) < 0.00001, 'Trace must reconstruct the actual hidden activity');
      });
      const quietNeuron = initial.hidden.indexOf(0);
      assert.ok(quietNeuron >= 0);
      scoresWithoutNeuron(initial, quietNeuron).forEach((value, index) => assert.ok(Math.abs(value - initial.probabilities[index]) < 0.00001, 'Removing a quiet neuron must leave guesses unchanged'));
      const removed = scoresWithoutNeuron(initial, initial.hidden.indexOf(Math.max(...initial.hidden)));
      assert.ok(Math.abs(removed.reduce((a, b) => a + b, 0) - 1) < 0.00001);
      assert.ok(removed.some((value, index) => Math.abs(value - initial.probabilities[index]) > 0.001));
      assert.ok(Number.isFinite(initial.loss) && initial.loss > 0);
      assert.equal(initial.loss, initial.baselineLoss);
      assert.deepEqual(initial.probabilities, initial.baselineProbabilities);
      // Adam creates its persistent optimizer state on the first update.
      const presented: number[] = [];
      await network.trainEpoch(async (examples, start, total, round) => {
        assert.equal(start, presented.length);
        assert.equal(examples.length, 32);
        assert.equal(total, 1024);
        assert.equal(round, 1);
        presented.push(...examples.map(example => example.mask));
      });
      assert.equal(presented.length, 1024);
      assert.equal(new Set(presented).size, 768);
      const stableTensorCount = tf.memory().numTensors;
      for (let round = 1; round < 100; round++) await network.trainEpoch();
      const learned = network.snapshot(cleanPattern(0));
      console.log(`Seed ${seed}: held-out accuracy ${(initial.accuracy * 100).toFixed(1)}% → ${(learned.accuracy * 100).toFixed(1)}%; per class ${learned.classAccuracy.map(value => `${(value * 100).toFixed(0)}%`).join(', ')}`);
      assert.ok(learned.accuracy >= 0.82, `Seed ${seed}: accuracy ${learned.accuracy}`);
      assert.ok(learned.classAccuracy.every(value => value >= 0.65), `Seed ${seed}: at least one class failed to learn`);
      assert.ok(learned.accuracy > initial.accuracy + 0.4);
      assert.equal(learned.epoch, 100);
      assert.equal(learned.examplesSeen, 102400);
      assert.ok(Number.isFinite(learned.loss));
      assert.ok(learned.loss < initial.loss * 0.25, 'The fixed teaching-set error did not fall substantially');
      assert.equal(learned.baselineLoss, initial.baselineLoss);
      assert.ok(Math.abs(learned.probabilities.reduce((a, b) => a + b, 0) - 1) < 0.00001);
      assert.deepEqual(learned.baselineProbabilities, initial.baselineProbabilities);
      assert.deepEqual(learned.before, initial.before);
      assert.ok(learned.weights.some((weights, layer) => weights.some((value, index) => value !== initial.weights[layer][index])));
      for (const label of [0, 1, 2] as const) {
        for (const inverted of [false, true]) {
          assert.equal(winner(network.snapshot(cleanPattern(label, inverted)).probabilities), label);
        }
      }
      for (let index = 0; index < 20; index++) network.snapshot(cleanPattern(0));
      assert.ok(tf.memory().numTensors <= stableTensorCount + 2, 'Repeated snapshots or training leaked tensors');
      await network.teach(cleanPattern(0), 0);
      const corrected = network.snapshot(cleanPattern(0));
      assert.equal(corrected.corrections, 1);
      assert.equal(corrected.examplesSeen, 102401);
      assert.ok(Number.isFinite(corrected.loss));
    } finally {
      network.dispose();
    }
  }
  assert.equal(tf.memory().numTensors, originalTensorCount, 'Disposing the network leaked tensors');
});

test('pausing a partial round preserves updates and resumes without repeating samples', async () => {
  const paused = new PatternNetwork(7);
  const uninterrupted = new PatternNetwork(7);
  let stop = false;
  try {
    await paused.trainEpoch(async (_, start) => { if (start === 64) stop = true; }, () => stop);
    const partial = paused.snapshot(cleanPattern(0));
    assert.equal(partial.examplesSeen, 64);
    assert.equal(partial.epoch, 0);
    assert.notEqual(partial.loss, partial.baselineLoss);
    assert.equal(paused.nextTrainingSamples().length, 32);
    const resumedStarts: number[] = [];
    await paused.trainEpoch(async (_, start) => { resumedStarts.push(start); });
    await uninterrupted.trainEpoch();
    assert.equal(resumedStarts[0], 64);
    assert.equal(resumedStarts.length, 30);
    const resumed = paused.snapshot(cleanPattern(0));
    const reference = uninterrupted.snapshot(cleanPattern(0));
    assert.equal(resumed.examplesSeen, 1024);
    assert.equal(resumed.epoch, 1);
    assert.deepEqual(resumed.weights, reference.weights);
    assert.deepEqual(resumed.biases, reference.biases);
    assert.equal(resumed.loss, reference.loss);
  } finally {
    paused.dispose();
    uninterrupted.dispose();
  }
});
