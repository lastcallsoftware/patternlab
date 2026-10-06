import assert from 'node:assert/strict';
import test from 'node:test';
import { bitCount, classifyMask, cleanPattern, distanceToPattern, gridFromMask, makeDataset, maskFromGrid, scramble, TEMPLATE_MASKS, type Pattern } from '../src/patterns.ts';

test('both color orientations of all clean patterns have the correct labels', () => {
  for (const label of [0, 1, 2] as const) {
    for (const inverted of [false, true]) {
      assert.equal(classifyMask(maskFromGrid(cleanPattern(label, inverted))), label);
    }
  }
});

test('all grids have unambiguous labels with the stated two-cell tolerance', () => {
  const counts = [0, 0, 0, 0];
  for (let mask = 0; mask < 65536; mask++) {
    assert.equal(maskFromGrid(gridFromMask(mask)), mask);
    const matches = TEMPLATE_MASKS.map(templates => templates.some(template => bitCount(mask ^ template) <= 2));
    assert.ok(matches.filter(Boolean).length <= 1, `Ambiguous grid ${mask}`);
    const expected = matches.some(Boolean) ? matches.indexOf(true) : 3;
    assert.equal(classifyMask(mask), expected);
    counts[expected]++;
  }
  assert.deepEqual(counts, [274, 274, 274, 64714]);
});

test('datasets are balanced, independent, and include boundary cases with deliberate training repeats', () => {
  const { train, test: heldOut, showcase } = makeDataset();
  assert.equal(showcase.length, 256);
  assert.deepEqual(new Set(showcase.map(item => item.mask)), new Set(heldOut.map(item => item.mask)));
  assert.equal(train.length, 1024);
  assert.equal(heldOut.length, 256);
  const trainMasks = new Set(train.map(item => item.mask));
  assert.equal(trainMasks.size, 768);
  assert.equal(new Set(heldOut.map(item => item.mask)).size, heldOut.length);
  assert.ok(heldOut.every(item => !trainMasks.has(item.mask)));
  for (const label of [0, 1, 2, 3] as Pattern[]) {
    assert.equal(train.filter(item => item.label === label).length, 256);
    assert.equal(heldOut.filter(item => item.label === label).length, 64);
    assert.equal(showcase.filter(item => item.label === label).length, 64);
  }
  assert.ok(TEMPLATE_MASKS.flat().every(mask => trainMasks.has(mask)));
  assert.equal(heldOut.filter(item => item.label === 3 && distanceToPattern(item.mask) <= 4).length, 32);
  assert.deepEqual(makeDataset(), makeDataset());
});

test('scrambling is reversible and changes exactly the requested number of cells', () => {
  const grid = cleanPattern(0);
  const order = [6, 3, 11, 0, 15, 1, 8, 4, 2, 13, 5, 10, 7, 14, 9, 12];
  for (let count = 0; count <= 16; count++) {
    assert.equal(bitCount(maskFromGrid(grid) ^ maskFromGrid(scramble(grid, count, order))), count);
  }
  assert.deepEqual(scramble(grid, 0, order), grid);
  assert.deepEqual(scramble(grid, 16, order), grid.map(value => 1 - value));
});
