import type { Snapshot } from './protocol';

export function scoresWithoutNeuron(snapshot: Snapshot, neuron: number): number[] {
  const logits = snapshot.biases[1].map((bias, output) => bias + snapshot.hidden.reduce(
    (sum, activity, index) => sum + (index === neuron ? 0 : activity * snapshot.weights[1][index * 4 + output]), 0,
  ));
  const maximum = Math.max(...logits);
  const exp = logits.map(value => Math.exp(value - maximum));
  const total = exp.reduce((a, b) => a + b, 0);
  return exp.map(value => value / total);
}
