// Page change = turning a big sketchbook page over its left-hand spine.
// Keyframes live in global.css. Reduced motion turns all of this off there.
const ease = 'cubic-bezier(0.55, 0.05, 0.25, 1)';

export const pageTurn = {
  forwards: {
    old: { name: 'page-turn-out', duration: '0.62s', easing: ease, fillMode: 'both' },
    new: { name: 'page-turn-in', duration: '0.42s', delay: '0.22s', easing: 'ease-out', fillMode: 'both' },
  },
  backwards: {
    old: { name: 'page-back-out', duration: '0.32s', easing: 'ease-in', fillMode: 'both' },
    new: { name: 'page-back-in', duration: '0.6s', delay: '0.08s', easing: ease, fillMode: 'both' },
  },
};
