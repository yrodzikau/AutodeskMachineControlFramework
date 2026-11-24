// @ts-nocheck -- run by `node --test` (npm test); the project has no @types/node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSpotModes, nextSpotSetMode } from './layerViewSpotModes.ts';

// A layer recorded with the scanner and the OIE: the points are the status positions, the target positions are
// offered as the secondary points, and the samples carry the laser power and the OIE values.
const FULL_LAYER = {
	displayMode: 'laseron',
	chosenModes: { laseron: 'status', power: 'target' },
	pointsLoaded: true,
	pointsEnabled: true,
	primaryRole: 'status',
	secondaryAvailable: true,
	hasPower: true,
	hasOIE: true
};

function resolve (overrides = {}) {
	return resolveSpotModes({ ...FULL_LAYER, ...overrides });
}

test('Laser On offers Target X/Y, Status X/Y and both', () => {
	const state = resolve();

	assert.equal(state.displayMode, 'laseron');
	assert.equal(state.active, true);
	assert.equal(state.choosable, true);
	assert.deepEqual(state.captions, ['Target X/Y', 'Status X/Y', 'Target vs Status']);
	assert.equal(state.caption, 'Status X/Y');
	assert.equal(state.icon, 'laseron-status');
	assert.deepEqual(state.shownRoles, ['status']);

	assert.deepEqual(resolve({ chosenModes: { laseron: 'target', power: 'target' } }).shownRoles, ['target']);
	const both = resolve({ chosenModes: { laseron: 'both', power: 'target' } });
	assert.deepEqual(both.shownRoles, ['target', 'status']);
	assert.equal(both.caption, 'Target vs Status');
});

test('Power offers Watts at the target positions, Temperature at the status positions and both', () => {
	const state = resolve({ displayMode: 'power' });

	assert.equal(state.displayMode, 'power');
	assert.equal(state.choosable, true);
	assert.deepEqual(state.captions, ['Watts', 'Temperature', 'Watts + Temperature']);
	assert.equal(state.caption, 'Watts');
	assert.equal(state.icon, 'power-target');
	assert.deepEqual(state.shownRoles, ['target']);

	const temperature = resolve({ displayMode: 'power', chosenModes: { laseron: 'status', power: 'status' } });
	assert.equal(temperature.caption, 'Temperature');
	assert.deepEqual(temperature.shownRoles, ['status']);

	const both = resolve({ displayMode: 'power', chosenModes: { laseron: 'status', power: 'both' } });
	assert.equal(both.caption, 'Watts + Temperature');
	assert.deepEqual(both.shownRoles, ['target', 'status']);
});

test('the mode is chosen separately for Laser On and Power', () => {
	const chosenModes = { laseron: 'both', power: 'status' };

	assert.equal(resolve({ displayMode: 'laseron', chosenModes }).mode, 'both');
	assert.equal(resolve({ displayMode: 'power', chosenModes }).mode, 'status');
});

test('without OIE data Power shows Watts only and the button has nothing to choose', () => {
	// Whatever was chosen before, on a layer with OIE data.
	for (const chosen of ['target', 'status', 'both']) {
		const state = resolve({ displayMode: 'power', hasOIE: false, chosenModes: { laseron: 'status', power: chosen } });

		assert.equal(state.active, true);
		assert.equal(state.choosable, false);
		assert.equal(state.caption, 'Watts');
		assert.equal(state.icon, 'power-target');
		assert.deepEqual(state.shownRoles, ['target']);
		assert.match(state.title, /no OIE data/);
	}
});

test('without target positions Power shows Temperature only', () => {
	// OIE tables of the first layout: the points are the status positions and there are no others.
	const state = resolve({ displayMode: 'power', secondaryAvailable: false });

	assert.equal(state.choosable, false);
	assert.equal(state.caption, 'Temperature');
	assert.deepEqual(state.shownRoles, ['status']);
	assert.match(state.title, /Temperature only/);

	// The same without the laser power of the samples.
	assert.equal(resolve({ displayMode: 'power', hasPower: false }).caption, 'Temperature');
});

test('a simulated layer has target positions only', () => {
	const simulated = { primaryRole: 'target', secondaryAvailable: false, hasOIE: false };

	const laserOn = resolve({ ...simulated, chosenModes: { laseron: 'status', power: 'target' } });
	assert.equal(laserOn.choosable, false);
	assert.equal(laserOn.caption, 'Target X/Y');
	assert.deepEqual(laserOn.shownRoles, ['target']);
	assert.equal(laserOn.title, 'This layer has only Target X/Y positions');

	const power = resolve({ ...simulated, displayMode: 'power' });
	assert.equal(power.caption, 'Watts');
	assert.match(power.title, /no Status X\/Y positions/);
});

test('without the laser power and without OIE data Power draws no spots', () => {
	const state = resolve({ displayMode: 'power', hasPower: false, hasOIE: false });

	assert.equal(state.active, false);
	assert.deepEqual(state.shownRoles, []);
	assert.deepEqual(state.captions, []);
	assert.equal(state.caption, '');
	assert.equal(state.icon, '');
	assert.match(state.title, /neither the laser power/);
});

test('the other display modes have no spots', () => {
	for (const displayMode of ['color', 'type', 'time', 'velocity']) {
		const state = resolve({ displayMode });

		assert.equal(state.displayMode, null);
		assert.equal(state.active, false);
		assert.equal(state.choosable, false);
		assert.deepEqual(state.shownRoles, []);
		assert.equal(state.caption, '');
		assert.equal(state.title, 'The mode of the laser spots is chosen in the display modes Laser On and Power');
	}
});

test('no spots without points, in the display mode Off and without known positions', () => {
	const noPoints = resolve({ pointsLoaded: false });
	assert.equal(noPoints.active, false);
	assert.equal(noPoints.title, 'This layer has no recorded points');

	const off = resolve({ displayMode: 'off', pointsEnabled: false });
	assert.equal(off.active, false);
	assert.equal(off.title, 'The laser spots are hidden by the display mode Off');

	// A server that does not name the positions of its points: they are drawn as before.
	const unnamed = resolve({ primaryRole: '', secondaryAvailable: false });
	assert.equal(unnamed.active, false);
	assert.equal(unnamed.title, 'This layer has no recorded points with known positions');
});

test('a click steps through the three modes', () => {
	assert.equal(nextSpotSetMode('target'), 'status');
	assert.equal(nextSpotSetMode('status'), 'both');
	assert.equal(nextSpotSetMode('both'), 'target');
});
