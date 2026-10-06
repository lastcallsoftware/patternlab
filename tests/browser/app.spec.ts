import { expect, test } from '@playwright/test';

test('grid edits, scramble, actual learning, pause, trace, correction, and reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Train continuously' })).toBeEnabled({ timeout: 20000 });
  await expect(page.locator('#network-status')).toHaveText('Untrained & curious');
  await expect(page.locator('#training-samples .training-sample')).toHaveCount(32);
  await expect(page.locator('#training-sample-position')).toContainText('Examples 1–32 / 1,024');
  await page.locator('#training-speed').selectOption('0');
  await expect(page.locator('#grid button')).toHaveCount(16);
  await expect(page.locator('#network .connection')).toHaveCount(160);
  const baseline = Number((await page.locator('#accuracy').innerText()).replace('%', ''));
  const baselineLoss = Number(await page.locator('#loss').innerText());
  expect(baselineLoss).toBeGreaterThan(0);
  await expect(page.locator('#loss-change')).toHaveText(`Before training: ${baselineLoss.toFixed(3)}`);
  console.log('Initial browser state:', (await page.locator('.experiment').ariaSnapshot()).slice(0, 800));

  const first = page.locator('#grid button').first();
  const before = await first.getAttribute('aria-pressed');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', String(before !== 'true'));
  await page.getByRole('button', { name: 'Try checkerboard' }).click();
  const clean = await page.locator('#grid button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed')));
  await page.locator('#scramble').fill('3');
  await expect(page.locator('#scramble-value')).toHaveText('3 / 16 squares');
  const scrambled = await page.locator('#grid button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed')));
  expect(scrambled.filter((value, index) => value !== clean[index])).toHaveLength(3);
  await page.locator('#scramble').fill('0');
  await expect.poll(() => page.locator('#grid button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed')))).toEqual(clean);

  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('#round-count')).toHaveText('1 round of practice');
  await expect(page.locator('#examples-seen')).toHaveText('1,024');
  await expect(page.locator('#training-sample-position')).toContainText('Examples 993–1024 / 1,024');
  await page.getByRole('button', { name: 'Train continuously' }).click();
  await expect(page.getByRole('button', { name: 'Pause training' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Train', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Use as training data' })).toBeDisabled();
  await page.getByRole('button', { name: 'Try vertical stripes' }).click();
  await expect.poll(async () => Number((await page.locator('#round-count').innerText()).split(' ')[0]), { timeout: 45000 }).toBeGreaterThanOrEqual(80);
  await page.getByRole('button', { name: 'Pause training' }).click();
  await expect(page.getByRole('button', { name: 'Train continuously' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Train', exact: true })).toBeEnabled();
  const stoppedRound = await page.locator('#round-count').innerText();
  await page.waitForTimeout(450);
  await expect(page.locator('#round-count')).toHaveText(stoppedRound);
  const learned = Number((await page.locator('#accuracy').innerText()).replace('%', ''));
  expect(learned).toBeGreaterThan(baseline + 40);
  expect(learned).toBeGreaterThanOrEqual(80);
  expect(Number(await page.locator('#loss').innerText())).toBeLessThan(baselineLoss * 0.25);
  await expect(page.locator('#loss-line')).toHaveAttribute('d', /L/);
  await expect(page.locator('#score-2')).toHaveText(/9\d%|100%/);

  await page.getByRole('button', { name: 'Neuron detail', exact: true }).click();
  await expect(page.locator('#signal-button')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#trace-explanation')).toBeVisible();
  await expect(page.locator('#trace-grid button')).toHaveCount(16);
  await page.locator('#trace-picker').getByRole('button', { name: 'Neuron 1', exact: true }).click();
  await expect(page.locator('#trace-sum')).toContainText('Neuron 1 activity');
  await expect(page.locator('#trace-effects')).toContainText('Without neuron:');
  const beforeFlip = await page.locator('#grid button').first().getAttribute('aria-pressed');
  await page.locator('#trace-grid button').first().click();
  await expect(page.locator('#grid button').first()).toHaveAttribute('aria-pressed', String(beforeFlip !== 'true'));
  await expect(page.locator('#trace-content')).toBeVisible();
  await page.screenshot({ path: 'artifacts/neuron-trace.png', fullPage: true });
  await page.getByRole('button', { name: 'Neuron detail', exact: true }).click();
  await expect(page.locator('#trace-explanation')).toBeHidden();
  await expect(page.locator('#signal-button')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Neuron detail', exact: true })).toBeEnabled();
  await page.locator('.node-layer-1').first().focus();
  await expect(page.locator('#neuron-detail')).toContainText('Neuron 1 · Activity');

  await page.locator('#correct-label').selectOption('2');
  await page.getByRole('button', { name: 'Use as training data' }).click();
  await expect(page.locator('#status-message')).toContainText('1 personal correction added');
  await page.getByRole('button', { name: 'How it works' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.screenshot({ path: 'artifacts/desktop-trained.png', fullPage: true });

  await page.getByRole('button', { name: 'Untrain model' }).click();
  await expect(page.locator('#network-status')).toHaveText('Untrained & curious');
  await expect(page.locator('#round-count')).toHaveText('0 rounds of practice');
  await expect(page.locator('#examples-seen')).toHaveText('0');
  await expect(page.locator('#loss')).toHaveText(baselineLoss.toFixed(3));
  await expect(page.locator('#loss-line')).not.toHaveAttribute('d', /L/);
  expect(errors).toEqual([]);
  console.log(`Browser learning: ${baseline}% → ${learned}% on unseen grids.`);
});

test('mobile layout fits and keyboard controls remain usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Train continuously' })).toBeEnabled({ timeout: 20000 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const cell = page.locator('#grid button').first();
  const pressed = await cell.getAttribute('aria-pressed');
  await cell.focus();
  await page.keyboard.press('Space');
  await expect(cell).toHaveAttribute('aria-pressed', String(pressed !== 'true'));
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('#round-count')).toHaveText('1 round of practice');
  await page.getByRole('button', { name: 'Neuron detail', exact: true }).click();
  await expect(page.locator('#signal-button')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#trace-explanation')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#trace-picker').getByRole('button', { name: 'Neuron 2', exact: true }).click();
  await expect(page.locator('#trace-sum')).toContainText('Neuron 2 activity');
  await page.locator('#trace-grid button').first().focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#trace-grid button').first()).toBeFocused();
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('reset during training and rapid grid edits do not leave stale activity or disabled controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Train continuously' })).toBeEnabled({ timeout: 20000 });
  await page.getByRole('button', { name: 'Train continuously' }).click();
  await expect(page.getByRole('button', { name: 'Pause training' })).toBeEnabled();
  await page.getByRole('button', { name: 'Untrain model' }).click();
  await page.getByRole('button', { name: 'Try horizontal stripes' }).click();
  await page.locator('#scramble').evaluate(node => {
    const slider = node as HTMLInputElement;
    for (const value of ['16', '3', '8', '1']) {
      slider.value = value;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await expect(page.getByRole('button', { name: 'Neuron detail', exact: true })).toBeEnabled();
  await expect(page.locator('#round-count')).toHaveText('0 rounds of practice');
  await expect(page.locator('#examples-seen')).toHaveText('0');
  await expect(page.locator('#scramble-value')).toHaveText('1 / 16 squares');
  const squareStates = await page.locator('#grid button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed') === 'true' ? '1' : '0'));
  const neuronStates = await page.locator('.node-layer-0 .neuron').evaluateAll(nodes => nodes.map(node => (node as SVGElement).style.getPropertyValue('--activity')));
  expect(neuronStates).toEqual(squareStates);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('#round-count')).toHaveText('1 round of practice');
  expect(errors).toEqual([]);
});

test('pause stops within a round and Train resumes its remaining groups', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Train continuously' })).toBeEnabled({ timeout: 20000 });
  await page.getByRole('button', { name: 'Train continuously' }).click();
  await expect(page.locator('#training-sample-position')).toContainText('Examples 65–96 / 1,024');
  await page.getByRole('button', { name: 'Pause training' }).click();
  await expect(page.getByRole('button', { name: 'Train', exact: true })).toBeEnabled({ timeout: 2000 });
  const count = Number((await page.locator('#examples-seen').innerText()).replaceAll(',', ''));
  expect(count).toBeGreaterThanOrEqual(64);
  expect(count).toBeLessThan(1024);
  expect(count % 32).toBe(0);
  await expect(page.locator('#round-count')).toHaveText('0 rounds of practice');
  await page.waitForTimeout(350);
  await expect(page.locator('#examples-seen')).toHaveText(count.toLocaleString());
  await page.locator('#training-speed').selectOption('0');
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('#round-count')).toHaveText('1 round of practice');
  await expect(page.locator('#examples-seen')).toHaveText('1,024');
});

test('all 256 test grids can be browsed and loaded into the experiment', async ({ page }) => {
  await page.goto('/');
  const next = page.getByRole('button', { name: 'Next test grids' });
  const previous = page.getByRole('button', { name: 'Previous test grids' });
  await expect(next).toBeEnabled({ timeout: 20000 });
  await expect(previous).toBeDisabled();
  const seen: string[] = [];
  for (let index = 0; index < 8; index++) {
    await expect(page.locator('#test-page-position')).toHaveText(`${index * 32 + 1}–${index * 32 + 32} of 256`);
    await expect(page.locator('.comparison-card')).toHaveCount(32);
    await expect(page.locator('.comparison-mark')).toHaveCount(32);
    seen.push(...await page.locator('.comparison-card').evaluateAll(cards => cards.map(card => card.getAttribute('data-example')!)));
    if (index < 7) await next.click();
  }
  expect(new Set(seen).size).toBe(256);
  await expect(next).toBeDisabled();
  const card = page.locator('.comparison-card').first();
  const pattern = await card.locator('i').evaluateAll(cells => cells.map(cell => cell.classList.contains('on')));
  await card.click();
  await expect.poll(() => page.locator('#grid button').evaluateAll(cells => cells.map(cell => cell.getAttribute('aria-pressed') === 'true'))).toEqual(pattern);
  await previous.click();
  await expect(page.locator('#test-page-position')).toHaveText('193–224 of 256');
  await page.getByRole('button', { name: 'Untrain model' }).click();
  await expect(page.locator('#test-page-position')).toHaveText('1–32 of 256');
  await expect(previous).toBeDisabled();
});
