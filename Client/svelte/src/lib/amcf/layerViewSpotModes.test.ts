// @ts-nocheck -- run by `node --test` (npm test); the project has no @types/node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSpotModes } from './layerViewSpotModes.ts';

// Value sets as a viewer of laser recordings declares them: the laser power at the target positions and a sensor
// value at the status positions.
const WATTS = { caption: 'Watts', available: true, unavailableHint: '' };
const TEMPERATURE = { caption: 'Temperature', available: true, unavailableHint: '' };
const NO_OIE = { caption: 'Temperature', available: false, unavailableHint: 'This layer has no OIE data' };

// A layer recorded with the scanner and the OIE: the points are the status positions, the target positions are
// offered as the secondary points, and both value sets have values.
const FULL_LAYER = {
	displayMode: 'laseron',
	chosenModes: { laseron: 'status', power: 'target' },
	pointsLoaded: true,
	pointsEnabled: true,
	primaryRole: 'status',
	secondaryAvailable: true,
	valueSets: { target: WATTS, status: TEMPERATURE }
};

function resolve (overrides = {}) {
	return resolveSpotModes({ ...FULL_LAYER, ...overrides });
}

// Mode, availability and shown flag of the menu entries, for example 'target+ status* both-': + available,
// - not available, * shown.
function menu (state) {
	return state.entries.map((entry) => entry.mode + (entry.shown ? '*' : (entry.available ? '+' : '-'))).join(' ');
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
	assert.equal(menu(state), 'target+ status* both+');
	assert.match(state.title, /Choose the positions/);

	assert.deepEqual(resolve({ chosenModes: { laseron: 'target', power: 'target' } }).shownRoles, ['target']);
	const both = resolve({ chosenModes: { laseron: 'both', power: 'target' } });
	assert.deepEqual(both.shownRoles, ['target', 'status']);
	assert.equal(both.caption, 'Target vs Status');
	assert.equal(menu(both), 'target+ status+ both*');
});

test('Power offers the declared value sets: one at the target positions, one at the status positions, and both', () => {
	const state = resolve({ displayMode: 'power' });

	assert.equal(state.displayMode, 'power');
	assert.equal(state.choosable, true);
	assert.deepEqual(state.captions, ['Watts', 'Temperature', 'Watts + Temperature']);
	assert.equal(state.caption, 'Watts');
	assert.equal(state.icon, 'power-target');
	assert.deepEqual(state.shownRoles, ['target']);
	assert.equal(menu(state), 'target* status+ both+');
	assert.equal(state.title, 'Choose what the laser spots show: Watts at Target X/Y, Temperature at Status X/Y or both');

	const temperature = resolve({ displayMode: 'power', chosenModes: { laseron: 'status', power: 'status' } });
	assert.equal(temperature.caption, 'Temperature');
	assert.deepEqual(temperature.shownRoles, ['status']);

	const both = resolve({ displayMode: 'power', chosenModes: { laseron: 'status', power: 'both' } });
	assert.equal(both.caption, 'Watts + Temperature');
	assert.deepEqual(both.shownRoles, ['target', 'status']);
});

test('the captions of the Power modes are those of the declaration', () => {
	const state = resolve({
		displayMode: 'power',
		valueSets: { target: { ...WATTS, caption: 'Current' }, status: { ...TEMPERATURE, caption: 'Photodiode' } }
	});

	assert.deepEqual(state.captions, ['Current', 'Photodiode', 'Current + Photodiode']);
	assert.equal(state.title, 'Choose what the laser spots show: Current at Target X/Y, Photodiode at Status X/Y or both');
});

test('the mode is chosen separately for Laser On and Power', () => {
	const chosenModes = { laseron: 'both', power: 'status' };

	assert.equal(resolve({ displayMode: 'laseron', chosenModes }).mode, 'both');
	assert.equal(resolve({ displayMode: 'power', chosenModes }).mode, 'status');
});

test('a value set without values is listed with the reason and the other one is shown', () => {
	// Whatever was chosen before, on a layer with OIE data.
	for (const chosen of ['target', 'status', 'both']) {
		const state = resolve({ displayMode: 'power', valueSets: { target: WATTS, status: NO_OIE }, chosenModes: { laseron: 'status', power: chosen } });

		assert.equal(state.active, true);
		assert.equal(state.choosable, false);
		assert.equal(state.caption, 'Watts');
		assert.equal(state.icon, 'power-target');
		assert.deepEqual(state.shownRoles, ['target']);
		assert.equal(menu(state), 'target* status- both-');
		assert.deepEqual(state.entries.map((entry) => entry.hint), ['', 'This layer has no OIE data', 'This layer has no OIE data']);
	}
});

test('a value set without values and without a reason gets a general one', () => {
	const state = resolve({ displayMode: 'power', valueSets: { target: WATTS, status: { ...NO_OIE, unavailableHint: '' } } });

	assert.equal(state.entries[1].hint, 'This layer has no values for Temperature');
});

test('without target positions Power shows the value set of the status positions only', () => {
	// OIE tables of the first layout: the points are the status positions and there are no others.
	const state = resolve({ displayMode: 'power', secondaryAvailable: false });

	assert.equal(state.choosable, false);
	assert.equal(state.caption, 'Temperature');
	assert.deepEqual(state.shownRoles, ['status']);
	assert.equal(menu(state), 'target- status* both-');
	assert.equal(state.entries[0].hint, 'This layer has no Target X/Y positions');
	assert.equal(state.entries[2].hint, 'This layer has no Target X/Y positions');
});

test('a simulated layer has target positions only', () => {
	const simulated = { primaryRole: 'target', secondaryAvailable: false, valueSets: { target: WATTS, status: NO_OIE } };

	const laserOn = resolve({ ...simulated, chosenModes: { laseron: 'status', power: 'target' } });
	assert.equal(laserOn.choosable, false);
	assert.equal(laserOn.caption, 'Target X/Y');
	assert.deepEqual(laserOn.shownRoles, ['target']);
	assert.equal(menu(laserOn), 'target* status- both-');
	assert.equal(laserOn.entries[1].hint, 'This layer has no Status X/Y positions');

	const power = resolve({ ...simulated, displayMode: 'power' });
	assert.equal(power.caption, 'Watts');
	// The missing positions come before the missing values.
	assert.equal(power.entries[1].hint, 'This layer has no Status X/Y positions');
});

test('a server that declares one value set gets one mode', () => {
	const state = resolve({ displayMode: 'power', valueSets: { target: WATTS, status: null } });

	assert.equal(state.active, true);
	assert.equal(state.choosable, false);
	assert.equal(menu(state), 'target*');
	assert.deepEqual(state.captions, ['Watts']);
	assert.equal(state.caption, 'Watts');
	assert.equal(state.title, 'Choose what the laser spots show: Watts at Target X/Y');
});

test('without declared value sets Power draws no spots', () => {
	const state = resolve({ displayMode: 'power', valueSets: { target: null, status: null } });

	assert.equal(state.active, false);
	assert.deepEqual(state.shownRoles, []);
	assert.deepEqual(state.entries, []);
	assert.deepEqual(state.captions, []);
	assert.equal(state.caption, '');
	assert.equal(state.icon, '');
	assert.match(state.title, /no values to show as laser spots/);
});

test('value sets without values are all listed, and Power draws no spots', () => {
	const state = resolve({ displayMode: 'power', valueSets: { target: { ...WATTS, available: false, unavailableHint: 'No laser power' }, status: NO_OIE } });

	assert.equal(state.active, false);
	assert.equal(menu(state), 'target- status- both-');
	assert.deepEqual(state.entries.map((entry) => entry.hint), ['No laser power', 'This layer has no OIE data', 'No laser power']);
	assert.deepEqual(state.captions, []);
	assert.equal(state.caption, '');
});

test('the other display modes have no spots', () => {
	for (const displayMode of ['color', 'type', 'time', 'velocity']) {
		const state = resolve({ displayMode });

		assert.equal(state.displayMode, null);
		assert.equal(state.active, false);
		assert.equal(state.choosable, false);
		assert.deepEqual(state.shownRoles, []);
		assert.deepEqual(state.entries, []);
		assert.equal(state.caption, '');
		assert.equal(state.title, 'The mode of the laser spots is chosen in the display modes Laser On and Power');
	}
});

test('no spots without points, in the display mode Off and without known positions', () => {
	const noPoints = resolve({ pointsLoaded: false });
	assert.equal(noPoints.active, false);
	assert.deepEqual(noPoints.entries, []);
	assert.equal(noPoints.title, 'This layer has no recorded points');

	const off = resolve({ displayMode: 'off', pointsEnabled: false });
	assert.equal(off.active, false);
	assert.deepEqual(off.entries, []);
	assert.equal(off.title, 'The laser spots are hidden by the display mode Off');

	// A server that does not name the positions of its points: they are drawn as before.
	const unnamed = resolve({ primaryRole: '', secondaryAvailable: false });
	assert.equal(unnamed.active, false);
	assert.deepEqual(unnamed.entries, []);
	assert.equal(unnamed.title, 'This layer has no recorded points with known positions');
});
