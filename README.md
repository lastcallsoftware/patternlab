# Pattern Lab

An interactive demonstration of a neural network learning to recognize patterns in a 4×4 grid. Built with TypeScript, HTML, CSS, SVG, and TensorFlow.js, without a UI framework or backend. Training runs locally in a Web Worker.

## Run locally

Use nvm to select Node.js 24.14.0, pinned in `.nvmrc`. This version is already installed in the current development environment.

```sh
nvm use
npm ci
npm run dev
```

Open the local URL printed by Vite, usually http://127.0.0.1:5173.

```sh
npm run build
npm run preview
```

The build produces static files in `dist/`. No publishing or deployment is configured.

Run `nvm use` in each new terminal from the project directory. On another machine, run `nvm install` first if the pinned version is not installed. App dependencies stay in the project-local `node_modules/`, with exact versions recorded in `package-lock.json`; `npm ci` reinstalls those locked dependencies when needed. Python and a Python virtual environment are not needed.

## Try the experiment

1. Pick a checkerboard, horizontal stripes, vertical stripes, or mixed example. Click individual cells to edit it.
2. Choose **Continuous** to keep training until you pause, or **Train** to process one full pass through all 1,024 training examples.
3. Pause and use **Neuron detail** to inspect one hidden neuron. Flip squares, compare their signed contributions, and see how the four scores change when that neuron is switched off.
4. Use **Scramble it** to progressively flip cells. Returning the slider to zero restores the starting grid.
5. Hover or focus a hidden neuron to isolate its connections. Browse all 256 separate test examples, eight per page. Each guess ends in a question mark and has one correctness mark beside it.
6. Optionally teach a personal example with your own label. Reset starts a fresh model with different initial weights.

## What the network learns

The model has 16 inputs, 8 ReLU hidden neurons, and 4 softmax outputs. Adam updates the connection weights and biases using categorical cross-entropy. The cell inputs are encoded as −1 and +1. The network's starting weights are seeded. **Untrain model** stops training, clears all rounds and personal corrections, and restores those original weights and biases while keeping your drawn grid.

There are two color orientations each of the checkerboard, alternating horizontal stripes, and alternating vertical stripes. Grids within two cell flips of a template keep its label. All other grids are labeled **Mixed**. These classes do not overlap: the six templates are at least eight cells apart.

Each automatic training round presents 1,024 examples, balanced at 256 per class. The underlying set contains 768 distinct training grids; 64 examples per class are repeated to reach 1,024 without overlapping the test set. Training includes clean templates, noisy patterns, and mixed grids both near and far from a pattern. Evaluation uses a separate fixed set of 256 grids, balanced at 64 per class. The current-guess cards page through the full evaluation set, with two examples of each category on every page. Shuffling and splitting are seeded and deterministic.

Recognition accuracy describes this balanced evaluation set, not all possible 65,536 grids. Output scores are model preferences and are not calibrated guarantees. Personal corrections may overlap evaluation examples and compromise their independence; the app calls this out after a correction.

The prominent **Prediction error (loss)** display measures average categorical cross-entropy on the same complete 1,024-example teaching set before training and after every update. It includes the starting value and a trend line. Lower is better, but loss need not decrease on every update, has no fixed maximum, and is not a percentage. Values below 0.001 are shown as `<0.001` rather than being rounded to zero. The separate recognition score checks performance on unseen grids.

Connection thickness reflects actual weight magnitude. Green connections have positive weights; peach connections have negative weights. A positive weight increases the receiving neuron's input when the sending value increases. Input glow shows cell state, hidden glow scales ReLU activity into a visible range, and output glow shows the softmax score. The trace uses actual input contributions and learned offsets. Its output comparison recomputes the softmax scores with one hidden neuron set to zero, leaving all other activity unchanged.

## Checks

```sh
npm test
npm run build
```

The tests verify all 65,536 grid labels, independent balanced splits, scrambling, genuine learning across three model seeds, unchanged baseline predictions, personal corrections, and tensor cleanup.

Browser checks use Playwright and cover real worker training, editing, pausing, tracing, corrections, reset, keyboard interaction, and mobile overflow:

```sh
npx playwright install chromium
npm run test:browser
```

If Chromium is already installed elsewhere, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Screenshots are saved in `artifacts/`; failure traces are saved in `test-results/`. No CI workflows are configured.

TensorFlow.js's bundled declaration files have compatibility errors under strict TypeScript checking, so `skipLibCheck` skips dependency declarations while keeping application code strict.

## Code map

- `src/main.ts`: application state, DOM controls, SVG visualization, and worker communication.
- `src/style.css`: responsive layout, styling, and reduced-motion handling.
- `src/patterns.ts`: templates, labels, deterministic data generation, and grid operations.
- `src/model.ts`: TensorFlow model, training, evaluation, and numeric snapshots.
- `src/training.worker.ts`: background training loop and messages.
- `src/protocol.ts`: typed messages shared between the UI and worker.

The application does not fetch fonts, scripts, or data from external services at runtime.

The **Training Data** panel shows every actual group of 32 grids before its learning update, colored by the correct label. **Slow** holds each group briefly; **Fast** removes that viewing delay. The preview is independent of the editable test grid.

Pausing stops at the current 32-example update, including during a partial round. Resuming continues with the next unprocessed group. Only completed rounds increment the round counter; the processed-example count includes partial rounds.
