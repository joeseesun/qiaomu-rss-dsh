/**
 * Variable-height list window (ported from the Obsidian plugin 0.29.0):
 * prefix sums keep offsets exact, measured heights correct the estimate, and
 * the viewport range includes overscan on both sides.
 */
import assert from 'node:assert/strict';
import { ListWindow } from '../src/client/list-window.js';

const ids = Array.from({ length: 200 }, (_, index) => `e${index}`);
const window = new ListWindow(100);

window.setItems(ids);
assert.equal(window.total, 200 * 100, 'the initial estimate applies to every row');
assert.equal(window.offset(0), 0);
assert.equal(window.offset(50), 5000);

// Measured heights replace the estimate and move every later offset.
assert.equal(window.measure('e0', 200), true);
assert.equal(window.measure('e0', 200), false, 'an unchanged height is a no-op');
assert.equal(window.total, 200 * 100 + 100);
assert.equal(window.offset(1), 200);

// The same key list is a no-op (scroll anchoring across page appends).
window.setItems(ids);
assert.equal(window.total, 200 * 100 + 100);

// The viewport range renders the visible rows plus overscan.
const start = window.range(0, 400);
assert.equal(start.start, 0);
assert.equal(start.end, 10);
assert.equal(start.before, 0);
assert.ok(start.after > 0, 'content below the viewport is a spacer');
const scrolled = window.range(5000, 400);
assert.ok(scrolled.start > 0 && scrolled.start <= 50, 'range follows the scroll position');
assert.equal(window.idAt(scrolled.start), ids[scrolled.start]);

// Appending a page keeps earlier measurements.
const grown = [...ids, ...Array.from({ length: 10 }, (_, index) => `n${index}`)];
window.setItems(grown);
assert.equal(window.total, 210 * 100 + 100);
assert.equal(window.measure('e1', 150), true, 'measurement survives a setItems refresh');
assert.equal(window.offset(2), 350);

// Clear drops measurements back to the estimate.
window.clearMeasurements();
assert.equal(window.total, 210 * 100);

console.log('List window: estimate offsets, measured corrections, overscan ranges and refresh retention passed');
