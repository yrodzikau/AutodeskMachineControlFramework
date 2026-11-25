// @ts-nocheck -- run by `node --test` (npm test); the project has no @types/node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_OVERLAY_MODE, OVERLAY_SMOOTHING_UNSUPPORTED_HINT, resolveOverlayModes } from './layerViewOverlayModes.ts';

function resolve (overrides = {}) {
	return resolveOverlayModes({ name: 'Heat Map', mode: 'off', smoothingSupported: true, ...overrides });
}

// Mode, availability and shown flag of the menu entries, for example 'off* pixels+ smooth-': + available,
// - not available, * shown.
function menu (state) {
	return state.entries.map((entry) => entry.mode + (entry.shown ? '*' : (entry.available ? '+' : '-'))).join(' ');
}

test('the overlay starts in the mode Off', () => {
	assert.equal(DEFAULT_OVERLAY_MODE, 'off');
	const state = resolve({ mode: DEFAULT_OVERLAY_MODE });

	assert.equal(state.mode, 'off');
	assert.equal(state.shown, false);
	assert.equal(state.caption, 'Off');
	assert.equal(menu(state), 'off* pixels+ smooth+');
	assert.match(state.title, /^Show the heat map of the layer/);
});

test('the menu lists Off, Pixels and Smooth and checks the chosen mode', () => {
	for (const mode of ['off', 'pixels', 'smooth']) {
		const state = resolve({ mode });
		assert.deepEqual(state.captions, ['Off', 'Pixels', 'Smooth']);
		assert.deepEqual(state.entries.filter((entry) => entry.shown).map((entry) => entry.mode), [mode]);
		assert.equal(state.mode, mode);
		assert.equal(state.shown, mode !== 'off');
	}
	assert.equal(resolve({ mode: 'pixels' }).caption, 'Pixels');
	assert.equal(resolve({ mode: 'smooth' }).caption, 'Smooth');
	assert.match(resolve({ mode: 'pixels' }).title, /every pixel as a square/);
	assert.match(resolve({ mode: 'smooth' }).title, /smoothed between its pixels/);
});

test('without smoothing in the browser Smooth is listed with the reason and cannot be chosen', () => {
	const state = resolve({ smoothingSupported: false });
	const smooth = state.entries.find((entry) => entry.mode === 'smooth');

	assert.equal(menu(state), 'off* pixels+ smooth-');
	assert.equal(smooth.available, false);
	assert.equal(smooth.hint, OVERLAY_SMOOTHING_UNSUPPORTED_HINT);
	assert.ok(state.entries.filter((entry) => entry.mode !== 'smooth').every((entry) => entry.available && entry.hint === ''));
	// The captions keep all three modes, so that the button keeps its width.
	assert.deepEqual(state.captions, ['Off', 'Pixels', 'Smooth']);
});

test('Smooth chosen in a browser that cannot smooth shows the overlay as Pixels', () => {
	const state = resolve({ mode: 'smooth', smoothingSupported: false });

	assert.equal(state.mode, 'pixels');
	assert.equal(state.shown, true);
	assert.equal(state.caption, 'Pixels');
	assert.equal(menu(state), 'off+ pixels* smooth-');
});

test('the tooltip names the overlay the server declared', () => {
	assert.match(resolve({ name: 'Melt Pool' }).title, /melt pool/);
	assert.match(resolve({ name: '  ' }).title, /the overlay of the layer/);
});
