export const LABELS = ['Checkerboard', 'Horizontal stripes', 'Vertical stripes', 'Mixed'] as const;
export const HIDDEN_UNITS = 8;
export type Pattern = 0 | 1 | 2 | 3;
export type Grid = number[];
export type Example = { grid: Grid; label: Pattern; mask: number };

export function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function gridFromMask(mask: number): Grid {
  return Array.from({ length: 16 }, (_, index) => (mask >>> index) & 1);
}

export function maskFromGrid(grid: Grid): number {
  return grid.reduce((mask, value, index) => mask | (value << index), 0);
}

export function cleanPattern(label: Pattern, inverted = false): Grid {
  return Array.from({ length: 16 }, (_, index) => {
    const row = Math.floor(index / 4);
    const column = index % 4;
    const bit = label === 0 ? (row + column) % 2 : label === 1 ? row % 2 : column % 2;
    return inverted ? 1 - bit : bit;
  });
}

export const TEMPLATE_MASKS = ([0, 1, 2] as const).map(label => [
  maskFromGrid(cleanPattern(label)),
  maskFromGrid(cleanPattern(label, true)),
]);

export function bitCount(value: number): number {
  let count = 0;
  while (value) {
    value &= value - 1;
    count++;
  }
  return count;
}

export function distanceToPattern(mask: number): number {
  return Math.min(...TEMPLATE_MASKS.flat().map(template => bitCount(mask ^ template)));
}

// Patterns within two flipped cells retain their original label. The six
// templates are at least eight cells apart, so these labels never overlap.
export function classifyMask(mask: number): Pattern {
  for (let label = 0; label < 3; label++) {
    if (TEMPLATE_MASKS[label].some(template => bitCount(mask ^ template) <= 2)) {
      return label as Pattern;
    }
  }
  return 3;
}

export function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function scramble(grid: Grid, count: number, order: number[]): Grid {
  const result = [...grid];
  for (const index of order.slice(0, count)) result[index] = 1 - result[index];
  return result;
}

export function makeDataset(seed = 42): { train: Example[]; test: Example[]; showcase: Example[] } {
  const random = randomSource(seed);
  const buckets: number[][] = [[], [], [], []];
  for (let mask = 0; mask < 65536; mask++) buckets[classifyMask(mask)].push(mask);
  const train: Example[] = [];
  const test: Example[] = [];
  const example = (mask: number, label: Pattern): Example => ({ mask, label, grid: gridFromMask(mask) });

  for (let label = 0; label < 4; label++) {
    const pattern = label as Pattern;
    if (label < 3) {
      const templates = TEMPLATE_MASKS[label];
      const pool = shuffle(buckets[label].filter(mask => !templates.includes(mask)), random);
      train.push(...[...templates, ...pool.slice(0, 190)].map(mask => example(mask, pattern)));
      test.push(...pool.slice(190, 254).map(mask => example(mask, pattern)));
    } else {
      // Include boundary cases in both splits: random mixed grids alone would
      // make the task too easy and hide mistakes on almost-recognizable patterns.
      const near = shuffle(buckets[label].filter(mask => distanceToPattern(mask) <= 4), random);
      const far = shuffle(buckets[label].filter(mask => distanceToPattern(mask) > 4), random);
      train.push(...[...near.slice(0, 96), ...far.slice(0, 96)].map(mask => example(mask, pattern)));
      test.push(...[...near.slice(96, 128), ...far.slice(96, 128)].map(mask => example(mask, pattern)));
    }
  }
  // Keep the independent test split. Each named pattern has only 274 unique
  // grids, so a balanced 1,024-example round necessarily includes repeats.
  for (const label of [0, 1, 2, 3] as const) {
    train.push(...shuffle(train.filter(item => item.label === label), random).slice(0, 64));
  }
  const byLabel = ([0, 1, 2, 3] as const).map(label => test.filter(item => item.label === label));
  const showcase = Array.from({ length: 64 }, (_, index) => byLabel.map(examples => examples[index])).flat();
  return { train: shuffle(train, random), test, showcase };
}

export function winner(scores: number[]): Pattern {
  return scores.indexOf(Math.max(...scores)) as Pattern;
}
