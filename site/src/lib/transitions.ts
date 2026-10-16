// Page change = turning a sketchbook page over its left-hand spine. Keyframes and the
// hinge live in global.css; reduced motion turns all of it off there.
// Forward: the old page lifts off (eased so most of the new page shows in the first
// ~200ms), the new page comes out of its shadow underneath. Back: the previous page
// falls back over the spine and lands.
const lift = 'cubic-bezier(0.2, 0.45, 0.25, 1)'; // moves from the first frame, so the turn picks up the flag's pull
const land = 'cubic-bezier(0.4, 0, 0.2, 1)';

export const pageTurn = {
  forwards: {
    old: { name: 'page-turn-out', duration: '0.42s', easing: lift, fillMode: 'both' },
    new: { name: 'page-turn-in', duration: '0.42s', easing: 'ease-out', fillMode: 'both' },
  },
  backwards: {
    old: { name: 'page-back-out', duration: '0.44s', easing: 'ease-in', fillMode: 'both' },
    new: { name: 'page-back-in', duration: '0.44s', easing: land, fillMode: 'both' },
  },
};
