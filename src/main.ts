import './style.css';
import { LABELS, HIDDEN_UNITS, cleanPattern, classifyMask, maskFromGrid, randomSource, scramble, shuffle, winner, type Example, type Grid, type Pattern } from './patterns';
import { scoresWithoutNeuron } from './explanation';
import type { Command, Snapshot, WorkerMessage } from './protocol';

const colors = ['#caf578', '#f3b58e', '#91d5e1', '#c8b8e9'];
const icons = [
  '<path d="M3 3h6v6H3zm6 6h6v6H9zm6-6h6v6h-6zM3 15h6v6H3zm12 0h6v6h-6z"/>',
  '<path d="M3 4h18v4H3zm0 6h18v4H3zm0 6h18v4H3z"/>',
  '<path d="M4 3h4v18H4zm6 0h4v18h-4zm6 0h4v18h-4z"/>',
  '<path d="M3 3h6v6H3zm12 0h6v6h-6zM9 9h6v6H9zM3 15h6v6H3zm12 0h6v6h-6z"/>',
];
const icon = (index: number) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[index]}</svg>`;
const playIcon = '<svg class="control-icon" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5 12 7l-9 5.5z"/></svg>';
const fastForwardIcon = '<svg class="control-icon" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1.5 6.5 7 1 12.5zM7.5 1.5 13 7l-5.5 5.5z"/></svg>';
const pauseIcon = '<svg class="control-icon" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2h3v10H3zM8 2h3v10H8z"/></svg>';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#" aria-label="Pattern Lab home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>pattern<span>lab</span></a>
    <span class="header-note"><span class="status-dot"></span> An interactive learning experiment</span>
    <button class="text-button" id="how-button">How it works <span aria-hidden="true">↗</span></button>
  </header>
  <main>
    <section class="intro" aria-labelledby="page-title">
      <div><h1 id="page-title">Watch a neural network<br><em>learn.</em></h1></div>
      <div class="intro-copy"><p>Sixteen squares. Four possible patterns.<br>A little brain that learns from examples.</p></div>
    </section>
    <section class="experiment" aria-labelledby="pattern-grid-title">
      <div class="experiment-topline"><h2 id="pattern-grid-title">Pattern Grid</h2><span id="network-status" role="status">Waking up the network…</span></div>
      <div class="stage">
        <section class="input-panel" aria-labelledby="input-title">
          <div class="panel-heading"><span class="step-number">01</span><h2 id="input-title">Make a pattern</h2></div>
          <p class="panel-description">Click a square. Change its mind.</p>
          <div id="grid" class="pixel-grid" role="group" aria-label="Editable 4 by 4 pattern"></div>
          <div class="preset-buttons" role="group" aria-label="Sample patterns">${LABELS.map((label, index) => `<button class="preset ${index === 0 ? 'selected' : ''}" data-pattern="${index}" aria-label="Try ${label.toLowerCase()}" aria-pressed="${index === 0}" title="${label}">${icon(index)}</button>`).join('')}</div>
          <div class="grid-tools"><button class="text-button" id="invert-button">↔ Invert</button><button class="text-button" id="random-button">Shuffle ↻</button></div>
          <div class="scramble-control"><div><label for="scramble">Scramble it</label><output for="scramble" id="scramble-value">0 / 16 squares</output></div><input id="scramble" type="range" min="0" max="16" value="0" aria-describedby="scramble-hint"><p id="scramble-hint">How much can you change before it gets confused?</p></div>
        </section>
        <section class="network-panel" aria-labelledby="network-title">
          <div class="panel-heading"><span class="step-number">02</span><h2 id="network-title">Follow the signal</h2></div>
          <p class="panel-description">Connections change as the network learns.</p>
          <div class="network-canvas"><svg id="network" viewBox="0 0 460 340" role="group" aria-label="Neural network: 16 inputs, 8 hidden neurons, 4 outputs"><g class="network-labels" aria-hidden="true"><text x="28" y="342"><tspan x="28">Grid squares</tspan><tspan class="layer-name" x="28" dy="18">(input layer)</tspan></text><text x="224" y="342"><tspan x="224">Inference</tspan><tspan class="layer-name" x="224" dy="18">(hidden layer)</tspan></text><text x="425" y="342"><tspan x="425">Label guesses</tspan><tspan class="layer-name" x="425" dy="18">(output layer)</tspan></text></g></svg></div>
          <div class="network-legend"><span><i class="legend-line positive"></i>Positive connection</span><span><i class="legend-line negative"></i>Negative connection</span><span><i class="legend-node"></i>More glow = more activity</span></div>
          <p class="neuron-detail" id="neuron-detail">Hover or focus a neuron to explore its connections.</p>
        </section>
        <section class="answer-panel" aria-labelledby="answer-title">
          <div class="panel-heading"><span class="step-number">03</span><h2 id="answer-title">See its guess</h2></div>
          <p class="panel-description">Which pattern does it favor?</p>
          <div id="answers" class="answers">${LABELS.map((label, index) => `<div class="answer" data-answer="${index}" style="--category-color:${colors[index]}"><div class="answer-label">${icon(index)}<span>${label}</span><strong id="score-${index}">—</strong></div><div class="answer-track" role="progressbar" aria-label="${label} score" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="answer-fill"></div></div></div>`).join('')}</div>
          <p class="small-note">Scores show its preference, not a guarantee.</p>
          <form id="correction-form"><label for="correct-label">Apply label:</label><select id="correct-label" title="Choose the correct label for the current grid">${LABELS.map((label, index) => `<option value="${index}">${label}</option>`).join('')}</select><button class="secondary-button" id="correct-button" title="Train the model using the current grid with the selected label" disabled>Use As Training Data</button></form>
          <p class="status-message" id="status-message" role="status"></p>
        </section>
      </div>
      <button class="trace-disclosure" id="signal-button" aria-expanded="false" aria-controls="trace-explanation" disabled><svg class="disclosure-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg><span>Neuron Detail</span></button>
      <section id="trace-explanation" class="trace-explanation" hidden>
        <div class="trace-picker" id="trace-picker" role="group" aria-label="Choose a hidden neuron"></div>
        <div id="trace-content" class="trace-content">
          <div><h3>1. Squares push and pull</h3><p>Green adds. Peach subtracts. Flip a square to see its contribution change.</p><div id="trace-grid" class="trace-grid" role="group" aria-label="Square contributions; click to flip"></div><p class="small-note">Both on and off squares send a signal: +1 for on, −1 for off. Each connection scales that signal.</p></div>
          <div><h3>2. The neuron combines them</h3><div id="trace-sum" class="trace-sum"></div><p class="small-note">The starting offset is learned too. A negative total becomes zero activity.</p></div>
          <div><h3>3. What difference does it make?</h3><p>Compare the actual guess with the same network if this neuron's activity were set to zero.</p><div id="trace-effects"></div><p class="small-note">All other neurons stay active. This experiment shows one neuron's effect for this grid, not a rule about what it always detects.</p></div>
        </div>
      </section>
      <div class="teaching-bar">
        <section class="training-preview" aria-labelledby="training-title"><div class="training-preview-heading"><h2 id="training-title">Training Data</h2></div><div id="training-samples" class="training-samples" role="group" aria-label="Upcoming training examples"></div><div class="training-labels">${LABELS.map((label, index) => `<span style="--category-color:${colors[index]}"><i></i>${label}</span>`).join('')}</div><p id="training-sample-position">Preparing examples…</p><p class="training-processed"><strong id="examples-seen">0</strong> training examples processed</p></section>
        <div class="loss-panel"><div class="loss-label">Prediction error</div><div class="loss-reading"><strong id="loss" aria-describedby="loss-explanation">—</strong><div><span id="loss-change">Before training: —</span></div></div><p id="loss-explanation" class="loss-explanation">How far its guesses are from the correct answers across the 1,024 training examples. Confident wrong guesses increase this number most. Lower means it fits those examples better; this is not a percentage.</p><svg id="loss-chart" viewBox="0 0 200 30" preserveAspectRatio="none" role="img" aria-label="Prediction error over training rounds"><path id="loss-area"/><path id="loss-line"/></svg><div class="chart-caption" id="loss-caption" hidden><span>Before training</span><span id="loss-round-count">0 rounds of practice</span></div></div>
        <div class="teaching-controls"><button class="secondary-button" id="step-button" disabled title="Train on all 1,024 samples, then stop">${playIcon} Train</button><button class="primary-button" id="train-button" disabled aria-label="Train continuously" title="Train continuously, reusing the 1024 training samples">${fastForwardIcon}</button><label class="training-speed-control" for="training-speed">Speed <select id="training-speed"><option value="120">Slow</option><option value="0">Fast</option></select></label><button class="secondary-button" id="reset-button" title="Clear all learning and restore the original connections">Untrain model <span aria-hidden="true">↺</span></button></div>
      </div>
    </section>
    <section class="learning-section" aria-labelledby="learning-title">
      <div class="learning-layout">
        <div class="comparison-panel"><div class="training-preview-heading"><h2 id="learning-title">Testing Data</h2></div><div id="comparison" class="comparison-grid"></div><div class="training-labels comparison-labels">${LABELS.map((label, index) => `<span style="--category-color:${colors[index]}"><i></i>${label}</span>`).join('')}</div><nav class="test-navigation" aria-label="Browse test grids"><button class="text-button" id="previous-test-page" aria-label="Previous test grids" disabled>← Previous</button><span id="test-page-position" aria-live="polite">1–32 of 256</span><button class="text-button" id="next-test-page" aria-label="Next test grids" disabled>Next →</button></nav><p class="small-note">Click a sample to load it into the Pattern Grid.</p></div>
        <div class="progress-panel"><div class="metric-label">Test accuracy</div><div class="accuracy-metric"><strong id="accuracy">—</strong><span id="accuracy-change">Before training: —</span></div><p class="testing-description">The percentage of 256 separate test grids it labels correctly. These grids are kept out of automatic training.</p><div class="chart-wrap"><svg id="progress-chart" viewBox="0 0 420 105" preserveAspectRatio="none" role="img" aria-label="Accuracy on unseen grids over training rounds"><path class="chart-guide" d="M5 10H415M5 50H415M5 95H415"/><path id="chart-area"/><path id="chart-line"/></svg></div><div class="chart-caption" id="accuracy-caption" hidden><span>Before training</span><span id="round-count">0 rounds of practice</span></div></div>
        <div class="testing-breakdown"><h3>Accuracy by pattern</h3><div class="class-results" id="class-results"></div></div>
      </div>
    </section>
  </main>
  <dialog id="how-dialog" aria-labelledby="how-title">
    <div class="dialog-top"><span class="eyebrow">A QUICK FIELD GUIDE</span><button class="reset-button" id="close-dialog" aria-label="Close explanation">×</button></div>
    <h2 id="how-title">How Pattern Lab works</h2>
    <p>The model -- a small <strong>neural network</strong> -- reads 4×4 grids and guesses one of four <strong>labels</strong> for each: it's either a checkerboard, horizontal stripes, vertical stripes, or a mixed (random) pattern that doesn't fit any of the other categories.</p>
    <p>The interface is divided into three main sections:</p>
    <ul>
      <li>
        <p><strong>Pattern Grid</strong>.  Here you can view and edit one sample grid at a time and see how the model guesses a label for it.  The percentages to the right show its confidence in each guess.</p>
        <p>The three columns of circles in the middle are the <strong>neurons</strong> in its neural network.</p>
        <ul>
          <li>The first column is the <strong>input layer</strong>, and corresponds directly to the "pixels" in the input grid.</li>
          <li>The third column is the <strong>output layer</strong>, which corresponds to the predicted label for grid in the editor.  The neuron in this column that is most strongly activated indicates the model's prediction.</li>
          <li>The middle column is the <strong>hidden layer</strong>, which processes the input and computes the prediction.  Notice how each neuron is connected to every input and every output.  The strengths of those connections -- the "weights" and "biases" -- determines the model's behavior.  These are the values that are adjusted during training.</li>
        </ul>
        <p>Initially, the model is untrained, so its guesses are basically random.  As you train it, the guesses should improve.</p></li>
        <!-- <p>In the lower right you can train the model on the current sample in the Pattern Grid.  Select the correct label for it and click the <strong>Use As Training Data</strong> button.  Use with caution, though -- training on a single sample more than once can bias the model towards it and actually make the model <i>less</i> accurate.</p> -->
        <p>If you want, you can expand the <strong>Neuron Detail</strong> panel to see exactly how the value of each neuron is calculated and how it affects the model's predictions.</p>
      <li>
        <p><strong>Training Data</strong>.  Here you can view the samples used to train the model, and actually train it!  The correct label for each sample, determined before training, is indicated by its color.</p>
        <p>Use the buttons to the right to train the model.  As you train it, you'll see a few things happen:</p>
        <ul>
          <li>The accuracy of the guess for the current grid in the Pattern Grid improves.</li>
          <li>The prediction error (technically known as <strong>loss</strong>) in the Training Data section decreases.</li>
          <li>The accuracy of the model's guesses for the test samples in the Testing Data section increases.</li>
        </ul>
        <p>Note that you can train the model on the same set of training samples multiple times.  In fact, this is necessary to achieve good performance.  To reach 90% accuracy on the test data, the model requires about 10-12 rounds of training.</p>
      </li>
      <li>
        <p><strong>Testing Data</strong>.  Here you can view the test samples used to evaluate the model.  The test samples are separate from the training data, and crucially, the model does not "know" the correct labels for them.  The check or X next to each sample indicates whether the model's prediction for that sample was correct.</p>
        <p>The percentage in the middle shows how accurately the model classifies all the test examples.</p>
        <p>The percentages to the right show the accuracy of the model's predictions for each category.</p>
    </ul>
    <p>Play around with the model and see how it learns!  I promise, you can't break anything.</p>
    <button class="primary-button" id="start-experiment">Let's experiment <span aria-hidden="true">→</span></button>
  </dialog>
`;

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const gridElement = element('grid');
const trainButton = element<HTMLButtonElement>('train-button');
const stepButton = element<HTMLButtonElement>('step-button');
const correctButton = element<HTMLButtonElement>('correct-button');
const signalButton = element<HTMLButtonElement>('signal-button');
const range = element<HTMLInputElement>('scramble');
const networkSvg = document.getElementById('network') as unknown as SVGSVGElement;
const random = randomSource(2026);
let baseGrid = cleanPattern(0);
let grid = [...baseGrid];
let flipOrder = shuffle(Array.from({ length: 16 }, (_, index) => index), random);
let worker: Worker;
let snapshot: Snapshot | undefined;
let ready = false;
let running = false;
let busy = false;
let failed = false;
let awaitingPrediction = true;
let requestId = 0;
let selectedPattern: Pattern | null = 0;
let history: { epoch: number; accuracy: number; loss: number }[] = [];
let focusedNeuron: number | null = null;
let tracedNeuron = 0;
let traceSquareFocus = -1;
let traceActive = false;
let comparisonBuilt = false;
let testPage = 0;
const testPageSize = 32;
const seed = 7;

const cells = Array.from({ length: 16 }, (_, index) => {
  const button = document.createElement('button');
  button.className = 'pixel';
  button.type = 'button';
  button.addEventListener('click', () => {
    grid[index] = 1 - grid[index];
    commitBase();
    inspect();
  });
  gridElement.append(button);
  return button;
});

function updateGrid(): void {
  cells.forEach((cell, index) => {
    cell.classList.toggle('on', grid[index] === 1);
    cell.setAttribute('aria-pressed', String(grid[index] === 1));
    cell.setAttribute('aria-label', `Row ${Math.floor(index / 4) + 1}, column ${index % 4 + 1}: ${grid[index] ? 'on' : 'off'}`);
  });
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach(button => {
    const selected = Number(button.dataset.pattern) === selectedPattern;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function commitBase(): void {
  baseGrid = [...grid];
  range.value = '0';
  element('scramble-value').textContent = '0 / 16 squares';
  selectedPattern = null;
  flipOrder = shuffle(flipOrder, random);
}

function send(command: Command): void { worker.postMessage(command); }

function inspect(): void {
  updateGrid();
  requestId++;
  awaitingPrediction = true;
  if (traceActive) {
    traceSquareFocus = Array.from(element('trace-grid').querySelectorAll('button')).indexOf(document.activeElement as HTMLButtonElement);
    element('trace-content').style.visibility = 'hidden';
  }
  updateControls();
  if (ready) send({ type: 'inspect', grid: [...grid], requestId });
}

document.querySelectorAll<HTMLButtonElement>('.preset').forEach(button => {
  button.addEventListener('click', () => {
    const label = Number(button.dataset.pattern) as Pattern;
    grid = label === 3 ? randomMixed() : cleanPattern(label);
    commitBase();
    selectedPattern = label;
    element<HTMLSelectElement>('correct-label').value = String(label);
    inspect();
  });
});

function randomMixed(): Grid {
  let result: Grid;
  do { result = Array.from({ length: 16 }, () => Number(random() >= 0.5)); }
  while (classifyMask(maskFromGrid(result)) !== 3);
  return result;
}

element('invert-button').addEventListener('click', () => {
  grid = grid.map(value => 1 - value);
  commitBase();
  inspect();
});
element('random-button').addEventListener('click', () => {
  grid = randomMixed();
  commitBase();
  selectedPattern = 3;
  element<HTMLSelectElement>('correct-label').value = '3';
  inspect();
});
range.addEventListener('input', () => {
  grid = scramble(baseGrid, Number(range.value), flipOrder);
  element('scramble-value').textContent = `${range.value} / 16 squares`;
  selectedPattern = null;
  inspect();
});

type Position = { x: number; y: number };
const positions: Position[][] = [
  Array.from({ length: 16 }, (_, index) => ({ x: 28, y: 25 + index * 19.3 })),
  Array.from({ length: HIDDEN_UNITS }, (_, index) => ({ x: 224, y: 36 + index * 38.3 })),
  Array.from({ length: 4 }, (_, index) => ({ x: 425, y: 62 + index * 72 })),
];
const svgNamespace = 'http://www.w3.org/2000/svg';
const paths: { element: SVGPathElement; layer: number; from: number; to: number }[] = [];
const nodes: SVGCircleElement[][] = [];

for (let layer = 0; layer < 2; layer++) {
  positions[layer].forEach((start, from) => {
    positions[layer + 1].forEach((end, to) => {
      const path = document.createElementNS(svgNamespace, 'path');
      path.setAttribute('d', `M${start.x},${start.y}C${start.x + 82},${start.y} ${end.x - 82},${end.y} ${end.x},${end.y}`);
      path.setAttribute('class', `connection connection-${layer}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('aria-hidden', 'true');
      networkSvg.append(path);
      paths.push({ element: path, layer, from, to });
    });
  });
}

positions.forEach((layer, layerIndex) => {
  nodes[layerIndex] = layer.map((point, index) => {
    const group = document.createElementNS(svgNamespace, 'g');
    group.setAttribute('class', `node-group node-layer-${layerIndex}`);
    const circle = document.createElementNS(svgNamespace, 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', String(layerIndex === 0 ? 5 : layerIndex === 1 ? 12 : 15));
    circle.setAttribute('class', 'neuron');
    circle.style.setProperty('--node-color', layerIndex === 2 ? colors[index] : colors[0]);
    group.append(circle);
    if (layerIndex === 1) {
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', `Hidden neuron ${index + 1}. Press Enter to trace this neuron.`);
      const hit = document.createElementNS(svgNamespace, 'circle');
      hit.setAttribute('cx', String(point.x));
      hit.setAttribute('cy', String(point.y));
      hit.setAttribute('r', '19');
      hit.setAttribute('fill', 'transparent');
      group.append(hit);
      const text = document.createElementNS(svgNamespace, 'text');
      text.setAttribute('x', String(point.x));
      text.setAttribute('y', String(point.y + 3));
      text.setAttribute('class', 'neuron-number');
      text.textContent = String(index + 1);
      group.append(text);
      const focus = () => { focusedNeuron = index; updateConnections(); updateNeuronDetail(); };
      const blur = () => { focusedNeuron = null; updateConnections(); updateNeuronDetail(); };
      const select = () => {
        if (!ready || running || busy || awaitingPrediction) return;
        tracedNeuron = index;
        traceActive = true;
        renderTrace();
        updateControls();
      };
      group.addEventListener('click', select);
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
      });
      group.addEventListener('mouseenter', focus);
      group.addEventListener('mouseleave', blur);
      group.addEventListener('focus', focus);
      group.addEventListener('blur', blur);
    }
    networkSvg.append(group);
    return circle;
  });
});

function updateConnections(): void {
  paths.forEach(path => {
    const width = positions[path.layer + 1].length;
    const weight = snapshot?.weights[path.layer][path.from * width + path.to] ?? 0;
    const selected = traceActive ? tracedNeuron : focusedNeuron;
    const attached = selected === null || (path.layer === 0 ? path.to : path.from) === selected;
    const opacity = selected === null ? 0.07 + Math.min(Math.abs(weight), 2) * 0.13 : attached ? 0.65 : 0.025;
    const contribution = weight * (path.layer === 0 ? grid[path.from] * 2 - 1 : snapshot?.hidden[path.from] ?? 0);
    path.element.style.stroke = (traceActive ? contribution : weight) >= 0 ? '#b9de89' : '#eea784';
    path.element.style.strokeWidth = String(0.6 + Math.min(Math.abs(weight), 3) * 0.8);
    path.element.style.opacity = String(opacity);
  });
}

function updateNeuronDetail(): void {
  element('neuron-detail').textContent = traceActive ? `Tracing neuron ${tracedNeuron + 1}: green signals add; peach signals subtract.` : focusedNeuron === null
    ? 'Hover or focus a neuron to explore its connections.'
    : `Neuron ${focusedNeuron + 1} · Activity ${snapshot?.hidden[focusedNeuron].toFixed(2) ?? '—'} · Its clues are learned, not assigned.`;
}

function renderNetwork(): void {
  nodes[0].forEach((node, index) => node.style.setProperty('--activity', String(grid[index])));
  nodes[1].forEach((node, index) => {
    const activity = snapshot?.hidden[index] ?? 0;
    node.style.setProperty('--activity', String(1 - Math.exp(-activity)));
    node.parentElement?.setAttribute('aria-label', `Hidden neuron ${index + 1}, activity ${activity.toFixed(2)}. Press Enter to trace this neuron.`);
  });
  nodes[2].forEach((node, index) => node.style.setProperty('--activity', String(snapshot?.probabilities[index] ?? 0)));
  updateConnections();
  updateNeuronDetail();
}

const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;

function renderTrace(): void {
  element('trace-explanation').hidden = !traceActive;
  signalButton.setAttribute('aria-expanded', String(traceActive));
  signalButton.setAttribute('aria-controls', 'trace-explanation');
  nodes[1].forEach((node, index) => node.parentElement?.classList.toggle('trace-phase', traceActive && index === tracedNeuron));
  updateConnections();
  updateNeuronDetail();
  document.querySelector('.network-legend .positive')!.parentElement!.lastChild!.textContent = traceActive ? 'Adds to this guess' : 'Positive connection';
  document.querySelector('.network-legend .negative')!.parentElement!.lastChild!.textContent = traceActive ? 'Subtracts from this guess' : 'Negative connection';
  if (!traceActive || !snapshot || awaitingPrediction) return;
  element('trace-content').style.visibility = 'visible';
  const focusedSquare = Array.from(element('trace-grid').querySelectorAll('button')).indexOf(document.activeElement as HTMLButtonElement);
  element('trace-picker').innerHTML = Array.from({ length: HIDDEN_UNITS }, (_, index) => `<button class="secondary-button" aria-pressed="${index === tracedNeuron}">Neuron ${index + 1}</button>`).join('');
  element('trace-picker').querySelectorAll('button').forEach((button, index) => button.onclick = () => { tracedNeuron = index; renderTrace(); element('trace-picker').querySelectorAll('button')[index].focus(); });
  const contributions = grid.map((value, index) => (value * 2 - 1) * snapshot!.weights[0][index * HIDDEN_UNITS + tracedNeuron]);
  element('trace-grid').innerHTML = contributions.map((value, index) => `<button class="trace-cell ${value >= 0 ? 'adds' : 'subtracts'}" aria-label="Row ${Math.floor(index / 4) + 1}, column ${index % 4 + 1}: ${grid[index] ? 'on' : 'off'}, contribution ${signed(value)}. Flip square." style="--strength:${0.1 + Math.min(Math.abs(value) / 3, 1) * 0.5}"><span>${grid[index] ? 'ON' : 'OFF'}</span><strong>${signed(value)}</strong></button>`).join('');
  element('trace-grid').querySelectorAll('button').forEach((button, index) => button.onclick = () => cells[index].click());
  const restoreSquare = focusedSquare >= 0 ? focusedSquare : traceSquareFocus;
  if (restoreSquare >= 0) element('trace-grid').querySelectorAll('button')[restoreSquare].focus();
  traceSquareFocus = -1;
  const sum = contributions.reduce((a, b) => a + b, 0);
  const bias = snapshot.biases[0][tracedNeuron];
  const activity = snapshot.hidden[tracedNeuron];
  element('trace-sum').innerHTML = `<div><span>Squares together</span><strong>${signed(sum)}</strong></div><div><span>Starting offset</span><strong>${signed(bias)}</strong></div><div><span>Total</span><strong>${signed(sum + bias)}</strong></div><div class="trace-activity"><span>Neuron ${tracedNeuron + 1} activity</span><strong>${activity.toFixed(2)}</strong></div><p>${activity > 0 ? 'Active: this neuron sends its clue onward.' : 'Quiet: this neuron contributes nothing to this guess.'}</p>`;
  const without = scoresWithoutNeuron(snapshot, tracedNeuron);
  element('trace-effects').innerHTML = LABELS.map((label, index) => {
    const actual = snapshot!.probabilities[index] * 100;
    const removed = without[index] * 100;
    return `<div class="trace-effect"><div><span>${label}</span><strong>${actual.toFixed(1)}%</strong></div><div class="trace-effect-track"><i style="width:${actual}%;background:${colors[index]}"></i><b style="left:${removed}%" title="Without neuron: ${removed.toFixed(1)}%"></b></div><small>Without neuron: ${removed.toFixed(1)}% · ${actual - removed >= 0 ? '+' : ''}${(actual - removed).toFixed(1)} points with it</small></div>`;
  }).join('');
  element('status-message').textContent = 'Choose a neuron, then flip a square. The trace follows the actual calculation for your current grid.';
}

signalButton.addEventListener('click', () => {
  if (traceActive) { cancelTrace(); defaultMessage(); return; }
  tracedNeuron = snapshot!.hidden.indexOf(Math.max(...snapshot!.hidden));
  traceActive = true;
  renderTrace();
});

function cancelTrace(): void {
  traceActive = false;
  renderTrace();
}

function updateControls(): void {
  trainButton.disabled = !ready || failed || (!running && busy);
  trainButton.setAttribute('aria-label', running ? 'Pause training' : 'Train continuously');
  trainButton.title = running ? 'Pause training' : 'Train continuously, reusing the 1024 training samples';
  trainButton.innerHTML = running ? pauseIcon : fastForwardIcon;
  trainButton.classList.toggle('training', running);
  stepButton.disabled = !ready || failed || running || busy;
  correctButton.disabled = !ready || failed || running || busy || awaitingPrediction;
  signalButton.disabled = !ready || failed || running || busy || awaitingPrediction;
  element('network-status').textContent = failed ? 'Learning interrupted' : !ready ? 'Waking up the network…' : running ? 'Learning from examples' : busy ? 'Practicing one round' : (snapshot?.examplesSeen ?? 0) > 0 ? 'Ready to experiment' : 'Untrained & curious';
}

function defaultMessage(): void {
  if (failed || traceActive) return;
  const message = element('status-message');
  if (running) message.textContent = '';
  else if (snapshot?.corrections) message.textContent = `${snapshot.corrections} personal correction${snapshot.corrections === 1 ? '' : 's'} added. Training data now includes grid(s) you have taught it.`;
  else message.textContent = '';
}

trainButton.addEventListener('click', () => {
  cancelTrace();
  send({ type: running ? 'pause' : 'run' });
  trainButton.disabled = true;
});
stepButton.addEventListener('click', () => {
  cancelTrace();
  send({ type: 'step' });
  stepButton.disabled = true;
  trainButton.disabled = true;
  correctButton.disabled = true;
});
element('correction-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!ready || failed || running || busy || correctButton.disabled) return;
  cancelTrace();
  const label = Number(element<HTMLSelectElement>('correct-label').value) as Pattern;
  send({ type: 'teach', grid: [...grid], label });
  correctButton.disabled = true;
  element('status-message').textContent = `Teaching this grid as ${LABELS[label].toLowerCase()}…`;
});

function renderComparison(): void {
  if (!snapshot) return;
  const start = testPage * testPageSize;
  const visible = snapshot.showcase.slice(start, start + testPageSize);
  if (!comparisonBuilt) {
    element('comparison').innerHTML = visible.map((item, offset) => {
      const index = start + offset;
      return `<button class="comparison-card" data-example="${index}">${item.grid.map(value => `<i class="${value ? 'on' : ''}" aria-hidden="true"></i>`).join('')}<span class="comparison-mark" id="after-${index}" aria-hidden="true"></span></button>`;
    }).join('');
    document.querySelectorAll<HTMLButtonElement>('.comparison-card').forEach(button => button.addEventListener('click', () => {
      if (!snapshot) return;
      const item = snapshot.showcase[Number(button.dataset.example)];
      grid = [...item.grid];
      commitBase();
      element<HTMLSelectElement>('correct-label').value = String(item.label);
      inspect();
    }));
    comparisonBuilt = true;
  }
  visible.forEach((item, offset) => {
    const index = start + offset;
    const guessed = snapshot!.after[index];
    const correct = guessed === item.label;
    const mark = element(`after-${index}`);
    mark.textContent = correct ? '✓' : '×';
    mark.className = correct ? 'comparison-mark correct' : 'comparison-mark incorrect';
    const card = document.querySelector<HTMLButtonElement>(`[data-example="${index}"]`)!;
    card.style.setProperty('--category-color', colors[guessed]);
    card.setAttribute('aria-label', `Inspect test grid. Guess: ${LABELS[guessed]}. ${correct ? 'Correct' : 'Incorrect'}. Correct answer: ${LABELS[item.label]}.`);
    card.title = `Guess: ${LABELS[guessed]} · ${correct ? 'Correct' : 'Incorrect'} · Correct answer: ${LABELS[item.label]}`;
  });
  element('test-page-position').textContent = `${start + 1}–${start + visible.length} of ${snapshot.showcase.length}`;
  element<HTMLButtonElement>('previous-test-page').disabled = testPage === 0;
  element<HTMLButtonElement>('next-test-page').disabled = start + testPageSize >= snapshot.showcase.length;
  element('class-results').innerHTML = snapshot.classAccuracy.map((accuracy, index) => `<span style="--category-color:${colors[index]}">${icon(index)}<span class="class-result-label">${LABELS[index]}</span>${Math.round(accuracy * 100)}%</span>`).join('');
}

function changeTestPage(direction: number): void {
  if (!snapshot) return;
  testPage = Math.max(0, Math.min(Math.ceil(snapshot.showcase.length / testPageSize) - 1, testPage + direction));
  comparisonBuilt = false;
  renderComparison();
}
element('previous-test-page').addEventListener('click', () => changeTestPage(-1));
element('next-test-page').addEventListener('click', () => changeTestPage(1));

function renderChart(): void {
  const hasCompletedRound = history.some(point => point.epoch > 0);
  element<HTMLElement>('accuracy-caption').hidden = !hasCompletedRound;
  element<HTMLElement>('loss-caption').hidden = !hasCompletedRound;
  const points = history.map((point, index) => {
    const x = 5 + index / Math.max(1, history.length - 1) * 410;
    const y = 95 - point.accuracy * 85;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.length ? `M${points.join('L')}` : '';
  element('chart-line').setAttribute('d', line);
  element('chart-area').setAttribute('d', line ? `${line}L${history.length > 1 ? 415 : 5},95L5,95Z` : '');
  element('progress-chart').setAttribute('aria-label', `Recognition accuracy on unseen grids: ${history.map(point => `round ${point.epoch}, ${Math.round(point.accuracy * 100)} percent`).join('; ')}`);
  const maximumLoss = Math.max(0.01, ...history.map(point => point.loss));
  const lossPoints = history.map((point, index) => `${(2 + index / Math.max(1, history.length - 1) * 196).toFixed(1)},${(28 - point.loss / maximumLoss * 26).toFixed(1)}`);
  const lossLine = lossPoints.length ? `M${lossPoints.join('L')}` : '';
  element('loss-area').setAttribute('d', lossLine ? `${lossLine}L${history.length > 1 ? 198 : 2},28L2,28Z` : '');
  element('loss-line').setAttribute('d', lossLine);
  element('loss-chart').setAttribute('aria-label', `Prediction error on the fixed teaching set: ${history.map(point => `round ${point.epoch}, ${point.loss.toFixed(3)}`).join('; ')}`);
}

function renderSnapshot(): void {
  if (!snapshot) return;
  const predicted = winner(snapshot.probabilities);
  snapshot.probabilities.forEach((value, index) => {
    const answer = document.querySelector<HTMLElement>(`[data-answer="${index}"]`)!;
    answer.classList.toggle('favored', index === predicted);
    element(`score-${index}`).textContent = `${Math.round(value * 100)}%`;
    answer.querySelector<HTMLElement>('.answer-fill')!.style.width = `${value * 100}%`;
    answer.querySelector('.answer-track')!.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  });
  element('accuracy').innerHTML = `${Math.round(snapshot.accuracy * 100)}<span>%</span>`;
  element('accuracy-change').textContent = `Before training: ${Math.round(snapshot.baselineAccuracy * 100)}%`;
  const roundCount = `${snapshot.epoch} round${snapshot.epoch === 1 ? '' : 's'} of training`;
  element('round-count').textContent = roundCount;
  element('loss-round-count').textContent = roundCount;
  element('examples-seen').textContent = snapshot.examplesSeen.toLocaleString();
  element('loss').textContent = snapshot.loss < 0.001 ? '<0.001' : snapshot.loss.toFixed(3);
  element('loss-change').textContent = `Before training: ${snapshot.baselineLoss.toFixed(3)}`;
  const last = history.at(-1);
  if (last?.epoch === snapshot.epoch) { last.accuracy = snapshot.accuracy; last.loss = snapshot.loss; }
  else history.push({ epoch: snapshot.epoch, accuracy: snapshot.accuracy, loss: snapshot.loss });
  renderNetwork();
  renderTrace();
  renderChart();
  renderComparison();
  updateControls();
  defaultMessage();
}

function showError(message: string): void {
  cancelTrace();
  failed = true;
  running = false;
  busy = false;
  updateControls();
  element('status-message').textContent = `The network couldn't continue. Try resetting it. ${message}`;
}

function renderTrainingSamples(examples: Example[], start: number, total: number, round: number): void {
  element('training-samples').innerHTML = examples.map(example => `<div class="training-sample" role="img" aria-label="${LABELS[example.label]} training example" title="${LABELS[example.label]}" style="--category-color:${colors[example.label]}">${example.grid.map(value => `<i class="${value ? 'on' : ''}"></i>`).join('')}</div>`).join('');
  element('training-sample-position').textContent = `Round ${round} · Examples ${start + 1}–${start + examples.length} / ${total.toLocaleString()}`;
}
element<HTMLSelectElement>('training-speed').addEventListener('change', event => {
  send({ type: 'pace', milliseconds: Number((event.target as HTMLSelectElement).value) });
});

function startWorker(): void {
  worker?.terminate();
  cancelTrace();
  ready = false;
  running = false;
  busy = false;
  failed = false;
  awaitingPrediction = true;
  snapshot = undefined;
  requestId = 0;
  history = [];
  comparisonBuilt = false;
  testPage = 0;
  element<HTMLButtonElement>('previous-test-page').disabled = true;
  element<HTMLButtonElement>('next-test-page').disabled = true;
  element('test-page-position').textContent = '1–32 of 256';
  element('training-samples').replaceChildren();
  element('training-sample-position').textContent = 'Preparing examples…';
  element('comparison').replaceChildren();
  element('class-results').replaceChildren();
  element('accuracy').textContent = '—';
  element('accuracy-change').textContent = 'Before training: —';
  element('round-count').textContent = '0 rounds of practice';
  element<HTMLElement>('accuracy-caption').hidden = true;
  element('loss-round-count').textContent = '0 rounds of practice';
  element<HTMLElement>('loss-caption').hidden = true;
  element('examples-seen').textContent = '0';
  element('loss').textContent = '—';
  element('loss-change').textContent = 'Before training: —';
  LABELS.forEach((_, index) => {
    element(`score-${index}`).textContent = '—';
    const answer = document.querySelector<HTMLElement>(`[data-answer="${index}"]`)!;
    answer.classList.remove('favored');
    answer.querySelector<HTMLElement>('.answer-fill')!.style.width = '0%';
    answer.querySelector('.answer-track')!.setAttribute('aria-valuenow', '0');
  });
  renderChart();
  renderNetwork();
  element('status-message').textContent = 'Starting with fresh random connections…';
  updateControls();
  const next = new Worker(new URL('./training.worker.ts', import.meta.url), { type: 'module' });
  worker = next;
  next.onmessage = (event: MessageEvent<WorkerMessage>) => {
    if (worker !== next) return;
    const message = event.data;
    if (message.type === 'training-samples') { renderTrainingSamples(message.examples, message.start, message.total, message.round); return; }
    if (message.type === 'error') { showError(message.message); return; }
    const wasReady = ready;
    ready = true;
    running = message.running;
    busy = message.busy;
    // Never display a guess for an older grid after a fast click or slider drag.
    if (message.requestId !== requestId || message.grid.some((value, index) => value !== grid[index])) {
      if (!wasReady) send({ type: 'inspect', grid: [...grid], requestId });
      updateControls();
      return;
    }
    awaitingPrediction = false;
    snapshot = message.snapshot;
    renderSnapshot();
  };
  next.onerror = event => showError(event.message || 'The background training worker failed to load.');
  send({ type: 'init', seed, grid: [...grid] });
  send({ type: 'pace', milliseconds: Number(element<HTMLSelectElement>('training-speed').value) });
}

element('reset-button').addEventListener('click', () => {
  startWorker();
});

const dialog = element<HTMLDialogElement>('how-dialog');
element('how-button').addEventListener('click', () => dialog.showModal());
element('close-dialog').addEventListener('click', () => dialog.close());
element('start-experiment').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
window.addEventListener('pagehide', () => worker?.terminate());

updateGrid();
renderNetwork();
startWorker();
