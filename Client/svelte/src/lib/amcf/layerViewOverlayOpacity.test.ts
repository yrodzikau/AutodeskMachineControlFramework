// @ts-nocheck -- run by `node --test` (npm test); the project has no @types/node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	DEFAULT_OVERLAY_OPACITY,
	OVERLAY_OPACITY_MAX,
	OVERLAY_OPACITY_MIN,
	OVERLAY_OPACITY_STEP,
	clampOverlayOpacity,
	overlayOpacityFactor,
	parseOverlayOpacity
} from './layerViewOverlayOpacity.ts';

test('the opacity starts at 100 % and takes the integers from 0 to 100', () => {
	assert.equal(DEFAULT_OVERLAY_OPACITY, 100);
	assert.equal(OVERLAY_OPACITY_MIN, 0);
	assert.equal(OVERLAY_OPACITY_MAX, 100);
	assert.equal(OVERLAY_OPACITY_STEP, 1);
	for (const value of [0, 1, 37, 99, 100]) assert.equal(parseOverlayOpacity(String(value)), value);
});

test('a typed number outside of the range is replaced by the nearest bound', () => {
	assert.equal(parseOverlayOpacity('150'), 100);
	assert.equal(parseOverlayOpacity('101'), 100);
	assert.equal(parseOverlayOpacity('-5'), 0);
	assert.equal(parseOverlayOpacity('-0'), 0);
	assert.ok(Object.is(parseOverlayOpacity('-0.2'), 0));
});

test('a typed fraction is rounded to an integer', () => {
	assert.equal(parseOverlayOpacity('42.4'), 42);
	assert.equal(parseOverlayOpacity('42,6'), 43);
	assert.equal(parseOverlayOpacity('.5'), 1);
	assert.equal(parseOverlayOpacity(' 75 % '), 75);
	assert.equal(parseOverlayOpacity('+20'), 20);
});

test('a text that is no number is not taken', () => {
	for (const text of ['', '   ', 'abc', '50abc', '1e2', '0x10', '5 5', '%', '--5', 'NaN', 'Infinity', null, undefined])
		assert.equal(parseOverlayOpacity(text), null, `text ${JSON.stringify(text)}`);
});

test('the opacity scales the alpha of the overlay from 0 to 1', () => {
	assert.equal(overlayOpacityFactor(100), 1);
	assert.equal(overlayOpacityFactor(0), 0);
	assert.equal(overlayOpacityFactor(25), 0.25);
	assert.equal(overlayOpacityFactor(250), 1);
	assert.equal(clampOverlayOpacity(Number.NaN), DEFAULT_OVERLAY_OPACITY);
	assert.equal(clampOverlayOpacity(-3), 0);
});
