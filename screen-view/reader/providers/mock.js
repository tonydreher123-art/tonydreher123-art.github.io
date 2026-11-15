// Mock provider: no AI, no network, no key. Gives the same canned answer every time
// for the same question, so tests and demos are repeatable.
// It does NOT look at what is in the picture; it only uses the picture size.

const CANNED = [
  {
    match: /\b(share|sharing|start)\b/i,
    text: 'To start sharing, use the big green button near the top of the page.',
    steps: ['Click "Share my screen".', 'In the box that pops up, pick the tab you want to show.', 'Click the blue "Share" button in that box.'],
    marks: [{ kind: 'circle', cx: 0.5, cy: 0.22, r: 0.08, label: 'Share my screen button' }],
  },
  {
    match: /\b(stop|end|quit)\b/i,
    text: 'To stop sharing, use the red Stop button.',
    steps: ['Click the red "Stop" button.', 'Check that the page says nothing is being shared.'],
    marks: [{ kind: 'arrow', x1: 0.2, y1: 0.1, x2: 0.45, y2: 0.25, label: 'Stop button' }],
  },
  {
    match: /\b(code|room|pair|connect)\b/i,
    text: 'The room code is the large yellow letters in the middle of the page.',
    steps: ['Find the yellow code.', 'On the phone, scan the square picture, or type the code.'],
    marks: [{ kind: 'highlight', x: 0.3, y: 0.4, w: 0.4, h: 0.1, label: 'Room code' }],
  },
];
const FALLBACK = {
  text: 'This is a practice answer from the test helper. A real AI would look at the picture and answer your question.',
  steps: ['Ask your question again once a real AI helper is turned on.'],
  marks: [{ kind: 'circle', cx: 0.5, cy: 0.5, r: 0.1, label: 'Center of the screen' }],
};

export function createMockProvider({ delayMs = 0 } = {}) {
  let calls = 0;
  return {
    name: 'mock',
    needsKey: false,
    get calls() { return calls; },
    async ask({ snap, question }) {
      calls++;
      if (delayMs) await new Promise(r => setTimeout(r, delayMs));
      const hit = CANNED.find(c => c.match.test(question)) || FALLBACK;
      return {
        text: hit.text + ` (Practice answer. Picture size ${snap.width}×${snap.height}.)`,
        steps: hit.steps.slice(),
        marks: hit.marks.map(m => ({ ...m })),
        needsUserAction: true,
      };
    },
  };
}
