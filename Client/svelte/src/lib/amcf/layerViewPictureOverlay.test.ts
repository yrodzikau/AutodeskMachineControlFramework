// @ts-nocheck -- run by `node --test` (npm test); the project has no @types/node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PICTURE_OVERLAY_OFF, parsePictureOverlay, pictureOverlayArea, resolvePictureOverlayModes } from './layerViewPictureOverlay.ts';

const RECOAT_UUID = '11111111-2222-3333-4444-555555555555';
const EXPOSURE_UUID = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
const NULL_UUID = '00000000-0000-0000-0000-000000000000';

function declaration (overrides = {}) {
	return JSON.stringify({
		name: 'camera',
		caption: 'Camera',
		icon: 'mdi-camera',
		initialmode: 'afterexposure',
		unavailablenote: 'Camera not available for this layer',
		sizex: 300, sizey: 300, originx: -150, originy: -150,
		modes: [
			{ name: 'afterrecoating', caption: 'After Recoating', hint: 'after the recoating', imageuuid: RECOAT_UUID },
			{ name: 'afterexposure', caption: 'After Exposure', hint: 'after the exposure', imageuuid: EXPOSURE_UUID }
		],
		...overrides
	});
}

// Mode, availability and shown flag of the menu entries: + available, - no picture on the layer, * shown.
function menu (state) {
	return state.entries.map((entry) => entry.mode + (entry.shown ? '*' : '') + (entry.available ? '+' : '-')).join(' ');
}

test('an empty or broken declaration is no picture overlay', () => {
	const warnings = [];
	const warn = (message) => warnings.push(message);
	assert.equal(parsePictureOverlay('', warn), null);
	assert.equal(parsePictureOverlay('   ', warn), null);
	assert.equal(warnings.length, 0);
	assert.equal(parsePictureOverlay('{', warn), null);
	assert.equal(parsePictureOverlay('[1]', warn), null);
	assert.equal(parsePictureOverlay(declaration({ caption: '' }), warn), null);
	assert.equal(parsePictureOverlay(declaration({ modes: [] }), warn), null);
	assert.equal(warnings.length, 4);
});

test('the declaration is read with its modes, the area and the lower-case UUIDs', () => {
	const overlay = parsePictureOverlay(declaration());
	assert.equal(overlay.name, 'camera');
	assert.equal(overlay.caption, 'Camera');
	assert.equal(overlay.initialMode, 'afterexposure');
	assert.deepEqual(overlay.area, { sizeX: 300, sizeY: 300, originX: -150, originY: -150 });
	assert.deepEqual(overlay.modes.map((mode) => mode.name), ['afterrecoating', 'afterexposure']);
	assert.equal(overlay.modes[1].imageUUID, EXPOSURE_UUID.toLowerCase());
});

test('modes without a name or a caption, duplicates and Off are left out; an unknown initial mode is Off', () => {
	const warnings = [];
	const overlay = parsePictureOverlay(declaration({
		initialmode: 'nonsense',
		modes: [
			{ name: 'off', caption: 'Off again', imageuuid: RECOAT_UUID },
			{ name: '', caption: 'No name', imageuuid: RECOAT_UUID },
			{ name: 'a', caption: '', imageuuid: RECOAT_UUID },
			{ name: 'b', caption: 'B', imageuuid: 'not a uuid' },
			{ name: 'b', caption: 'B twice', imageuuid: RECOAT_UUID }
		]
	}), (message) => warnings.push(message));
	assert.deepEqual(overlay.modes.map((mode) => mode.name), ['b']);
	assert.equal(overlay.modes[0].imageUUID, NULL_UUID);
	assert.equal(overlay.initialMode, PICTURE_OVERLAY_OFF);
	assert.equal(warnings.length, 4);
});

test('the layer view opens in the initial mode and shows its picture', () => {
	const state = resolvePictureOverlayModes(parsePictureOverlay(declaration()), null);
	assert.equal(state.mode, 'afterexposure');
	assert.equal(state.shown, true);
	assert.equal(state.available, true);
	assert.equal(state.imageUUID, EXPOSURE_UUID.toLowerCase());
	assert.equal(state.caption, 'After Exposure');
	assert.deepEqual(state.captions, ['Off', 'After Recoating', 'After Exposure']);
	assert.equal(menu(state), 'off+ afterrecoating+ afterexposure*+');
	assert.match(state.title, /Click to choose Off, After Recoating or After Exposure$/);
});

test('a chosen mode is kept; Off shows no picture', () => {
	const overlay = parsePictureOverlay(declaration());
	const recoat = resolvePictureOverlayModes(overlay, 'afterrecoating');
	assert.equal(recoat.imageUUID, RECOAT_UUID);
	assert.equal(recoat.caption, 'After Recoating');

	const off = resolvePictureOverlayModes(overlay, PICTURE_OVERLAY_OFF);
	assert.equal(off.shown, false);
	assert.equal(off.available, false);
	assert.equal(off.imageUUID, NULL_UUID);
	assert.equal(off.caption, 'Off');
	assert.equal(menu(off), 'off*+ afterrecoating+ afterexposure+');
});

test('a layer without the picture of the chosen mode keeps the mode and reports it as not available', () => {
	const overlay = parsePictureOverlay(declaration({
		modes: [
			{ name: 'afterrecoating', caption: 'After Recoating', imageuuid: RECOAT_UUID },
			{ name: 'afterexposure', caption: 'After Exposure', imageuuid: NULL_UUID }
		]
	}));
	const state = resolvePictureOverlayModes(overlay, 'afterexposure');
	assert.equal(state.mode, 'afterexposure');
	assert.equal(state.shown, true);
	assert.equal(state.available, false);
	assert.equal(state.imageUUID, NULL_UUID);
	assert.equal(menu(state), 'off+ afterrecoating+ afterexposure*-');
	assert.match(state.title, /^Camera not available for this layer/);
});

test('a chosen mode that the declaration no longer has falls back to the initial mode', () => {
	const state = resolvePictureOverlayModes(parsePictureOverlay(declaration()), 'gone');
	assert.equal(state.mode, 'afterexposure');
});

test('without an area the picture covers the platform', () => {
	const overlay = parsePictureOverlay(declaration({ sizex: undefined, sizey: undefined, originx: undefined, originy: undefined }));
	assert.equal(overlay.area, null);
	assert.deepEqual(pictureOverlayArea(overlay, 300, 300, 150, 150), { sizeX: 300, sizeY: 300, originX: -150, originY: -150 });

	const declared = parsePictureOverlay(declaration({ sizex: 200, sizey: 100, originx: -50, originy: 10 }));
	assert.deepEqual(pictureOverlayArea(declared, 300, 300, 150, 150), { sizeX: 200, sizeY: 100, originX: -50, originY: 10 });
});

test('the correction of the pictures is optional, invalid corners are ignored', () => {
	assert.equal(parsePictureOverlay(declaration()).correction, null);
	const corners = { topleftx: 0.1, toplefty: 0.2, toprightx: 0.8, toprighty: 0.15, bottomrightx: 0.95, bottomrighty: 0.9, bottomleftx: 0.05, bottomlefty: 0.7 };
	assert.deepEqual(parsePictureOverlay(declaration({ correction: corners })).correction, corners);

	const warnings = [];
	const crossing = { ...corners, toprightx: 0.95, toprighty: 0.9, bottomrightx: 0.8, bottomrighty: 0.15 };
	const overlay = parsePictureOverlay(declaration({ correction: crossing }), (message) => warnings.push(message));
	assert.deepEqual(overlay.correction, { topleftx: 0, toplefty: 0, toprightx: 1, toprighty: 0, bottomrightx: 1, bottomrighty: 1, bottomleftx: 0, bottomlefty: 1 });
	assert.equal(warnings.length, 1);
});
