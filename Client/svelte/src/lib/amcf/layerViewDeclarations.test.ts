// @ts-nocheck -- run by `node --test` (npm test); the project has no @types/node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseValueSets, parseSteppers, stepperValueOf, StepperEventQueue } from './layerViewDeclarations.ts';

// Collects the warnings of a parser.
function collector () {
	const messages = [];
	return { messages, warn: (message) => messages.push(message) };
}

// The value sets of a viewer of laser recordings: the laser power at the target positions and a sensor value at
// the status positions.
const RECORDING_VALUE_SETS = JSON.stringify({
	valuesets: [
		{
			positions: 'target', caption: 'Watts', icon: 'mdi-lightning-bolt', channel: 'laser', column: 'power', valuecaption: 'Laser power',
			unit: 'W', look: 'circle', size: 6, maximumsize: 32, fill: true, scale: 'power', available: true
		},
		{
			positions: 'status', caption: 'Temperature', icon: 'mdi-thermometer', channel: 'oie', column: 'sensor1', valuecaption: 'OIE sensor 1',
			unit: '', look: 'glow', size: 16, maximumsize: 512, scale: 'overlay', available: false, unavailablehint: 'This layer has no OIE data'
		}
	]
});

test('value sets are read by the positions of their spots', () => {
	const log = collector();
	const valueSets = parseValueSets(RECORDING_VALUE_SETS, log.warn);

	assert.deepEqual(valueSets.target, {
		positions: 'target', caption: 'Watts', icon: 'mdi-lightning-bolt', channel: 'laser', column: 'power', valueCaption: 'Laser power',
		unit: 'W', look: 'circle', size: 6, maximumSize: 32, fill: true, scale: 'power', available: true, unavailableHint: ''
	});
	assert.deepEqual(valueSets.status, {
		positions: 'status', caption: 'Temperature', icon: 'mdi-thermometer', channel: 'oie', column: 'sensor1', valueCaption: 'OIE sensor 1',
		unit: '', look: 'glow', size: 16, maximumSize: 512, fill: true, scale: 'overlay', available: false, unavailableHint: 'This layer has no OIE data'
	});
	assert.deepEqual(log.messages, []);
});

test('a value set needs positions, a caption, a channel and a column; the rest has defaults', () => {
	const log = collector();
	const valueSets = parseValueSets(JSON.stringify({
		valuesets: [
			{ positions: 'Status', caption: ' Photodiode ', channel: 'sensors', column: 'pd_1' },
			{ positions: 'target', caption: 'Current', channel: 'drive', column: 'current', look: 'glow' }
		]
	}), log.warn);

	assert.deepEqual(valueSets.status, {
		positions: 'status', caption: 'Photodiode', icon: '', channel: 'sensors', column: 'pd_1', valueCaption: 'Photodiode',
		unit: '', look: 'circle', size: 6, maximumSize: 32, fill: true, scale: '', available: true, unavailableHint: ''
	});
	assert.equal(valueSets.target.look, 'glow');
	assert.equal(valueSets.target.size, 16);
	assert.equal(valueSets.target.maximumSize, 512);
	assert.deepEqual(log.messages, []);
});

test('no declaration means no value sets', () => {
	const log = collector();

	for (const text of ['', '   ', undefined, null, 42])
		assert.deepEqual(parseValueSets(text, log.warn), { target: null, status: null });
	assert.deepEqual(parseValueSets('{"valuesets": []}', log.warn), { target: null, status: null });
	assert.deepEqual(log.messages, []);
});

test('a declaration that cannot be read is reported and ignored', () => {
	for (const text of ['{"valuesets": [', '[]', '{"sets": []}', '"text"', '{"valuesets": {"positions": "target"}}']) {
		const log = collector();

		assert.deepEqual(parseValueSets(text, log.warn), { target: null, status: null });
		assert.equal(log.messages.length, 1, text);
	}
});

test('incomplete value sets are reported and ignored, the others are kept', () => {
	const log = collector();
	const valueSets = parseValueSets(JSON.stringify({
		valuesets: [
			null,
			{ positions: 'actual', caption: 'A', channel: 'laser', column: 'power' },
			{ positions: 'target', caption: '', channel: 'laser', column: 'power' },
			{ positions: 'target', caption: 'B', channel: 'la ser', column: 'power' },
			{ positions: 'target', caption: 'C', channel: 'laser', column: '../power' },
			{ positions: 'target', caption: 'D', channel: 'laser', column: 'power' },
			// One value set per kind of positions: the first one wins.
			{ positions: 'target', caption: 'E', channel: 'laser', column: 'time' }
		]
	}), log.warn);

	assert.equal(valueSets.target.caption, 'D');
	assert.equal(valueSets.status, null);
	assert.equal(log.messages.length, 6);
});

test('sizes, icons and scales of a value set are kept within what the viewer can draw', () => {
	const read = (fields) => parseValueSets(JSON.stringify({ valuesets: [{ positions: 'target', caption: 'A', channel: 'c', column: 'v', ...fields }] }), () => {}).target;

	assert.equal(read({ maximumsize: 5000 }).maximumSize, 64);
	assert.equal(read({ look: 'glow', maximumsize: 5000 }).maximumSize, 512);
	assert.equal(read({ maximumsize: 0 }).maximumSize, 1);
	assert.equal(read({ size: 100, maximumsize: 20 }).size, 20);
	assert.equal(read({ size: -3 }).size, 1);
	assert.equal(read({ size: '12' }).size, 12);
	assert.equal(read({ size: 'big' }).size, 6);
	assert.equal(read({ look: 'star' }).look, 'circle');
	assert.equal(read({ icon: 'mdi-flash' }).icon, 'mdi-flash');
	assert.equal(read({ icon: '<img src=x>' }).icon, '');
	assert.equal(read({ scale: 'Overlay' }).scale, 'overlay');
	assert.equal(read({ scale: 'time' }).scale, '');
	assert.equal(read({ fill: false }).fill, false);
	assert.equal(read({ fill: 0 }).fill, true);
	assert.equal(read({ available: false }).available, false);
	assert.equal(read({ available: 'no' }).available, true);
});

test('steppers are read with their bounds, step and event', () => {
	const log = collector();
	const steppers = parseSteppers(JSON.stringify({
		steppers: [
			{
				name: 'laserondelay', caption: 'LaserOn delay', unit: 'samples', note: '1.27 ms', hint: 'Rows by which LaserOn lags', value: 127,
				minimum: 0, maximum: 1000, step: 1, event: 'onsmclaserondelaychange', enabled: true
			},
			{ name: 'gain', caption: 'Gain', value: '0.5', event: 'ongainchange', step: 0.25, enabled: false, disabledhint: 'Not on this layer' }
		]
	}), log.warn);

	assert.deepEqual(steppers[0], {
		name: 'laserondelay', caption: 'LaserOn delay', value: 127, minimum: 0, maximum: 1000, step: 1, unit: 'samples', note: '1.27 ms',
		hint: 'Rows by which LaserOn lags', event: 'onsmclaserondelaychange', enabled: true, disabledHint: ''
	});
	assert.deepEqual(steppers[1], {
		name: 'gain', caption: 'Gain', value: 0.5, minimum: null, maximum: null, step: 0.25, unit: '', note: '', hint: '', event: 'ongainchange',
		enabled: false, disabledHint: 'Not on this layer'
	});
	assert.deepEqual(log.messages, []);
});

test('steppers without a name, a caption, an event or a value are reported and ignored', () => {
	const log = collector();
	const steppers = parseSteppers(JSON.stringify({
		steppers: [
			'text',
			{ caption: 'A', value: 1, event: 'e' },
			{ name: 'b', value: 1, event: 'e' },
			{ name: 'c', caption: 'C', value: 1 },
			{ name: 'd', caption: 'D', value: 'many', event: 'e' },
			{ name: 'e', caption: 'E', value: 1, event: 'on change' },
			{ name: 'f', caption: 'F', value: 1, event: 'e' },
			{ name: 'f', caption: 'F again', value: 2, event: 'e' }
		]
	}), log.warn);

	assert.deepEqual(steppers.map((stepper) => stepper.caption), ['F']);
	assert.equal(log.messages.length, 7);

	assert.deepEqual(parseSteppers('', log.warn), []);
	assert.deepEqual(parseSteppers('{"steppers": []}', log.warn), []);
	assert.equal(log.messages.length, 7);
	assert.deepEqual(parseSteppers('{"steppers": 3}', log.warn), []);
	assert.equal(log.messages.length, 8);
});

test('a stepper declaration is kept consistent and small', () => {
	const declare = (count) => JSON.stringify({ steppers: Array.from({ length: count }, (_, index) => ({ name: 'n' + index, caption: 'N', value: 0, event: 'e' })) });
	assert.equal(parseSteppers(declare(9), () => {}).length, 4);

	const stepper = parseSteppers(JSON.stringify({ steppers: [{ name: 'a', caption: 'A', value: 1, event: 'e', minimum: 10, maximum: 5, step: -2 }] }), () => {})[0];
	assert.equal(stepper.minimum, 10);
	assert.equal(stepper.maximum, 10);
	assert.equal(stepper.step, 1);
});

test('a typed stepper value is moved into the bounds and onto the grid of the step', () => {
	const delay = parseSteppers(JSON.stringify({ steppers: [{ name: 'd', caption: 'D', value: 127, minimum: 0, maximum: 1000, step: 1, event: 'e' }] }))[0];
	assert.equal(stepperValueOf(delay, '130'), 130);
	assert.equal(stepperValueOf(delay, ' 126.6 '), 127);
	assert.equal(stepperValueOf(delay, '-5'), 0);
	assert.equal(stepperValueOf(delay, '5000'), 1000);
	assert.equal(stepperValueOf(delay, ''), null);
	assert.equal(stepperValueOf(delay, 'abc'), null);
	assert.equal(stepperValueOf(delay, '1e2'), 100);

	const gain = parseSteppers(JSON.stringify({ steppers: [{ name: 'g', caption: 'G', value: 0.5, minimum: 0.1, maximum: 1, step: 0.25, event: 'e' }] }))[0];
	assert.equal(stepperValueOf(gain, '0.3'), 0.35);
	assert.equal(stepperValueOf(gain, '0.36'), 0.35);
	// 0.1 + 3 * 0.25 = 0.85 is the largest value on the grid below the maximum.
	assert.equal(stepperValueOf(gain, '0.99'), 0.85);
	assert.equal(stepperValueOf(gain, '7'), 0.85);
	assert.equal(stepperValueOf(gain, '0'), 0.1);

	const free = parseSteppers(JSON.stringify({ steppers: [{ name: 'f', caption: 'F', value: 0, step: 5, event: 'e' }] }))[0];
	assert.equal(stepperValueOf(free, '-12'), -10);
	assert.equal(stepperValueOf(free, '1000003'), 1000005);
});

// A queue whose events are answered by hand: sent lists what reached the server, finish answers the running event.
function createQueue () {
	const sent = [];
	const settled = [];
	let done = null;
	const queue = new StepperEventQueue(
		(name, value, onDone) => { sent.push([name, value]); done = onDone; },
		(name, value, succeeded) => settled.push([name, value, succeeded]),
		500
	);
	return { queue, sent, settled, finish: (succeeded = true) => { const answer = done; done = null; answer(succeeded); } };
}

test('a stepper value is sent when it has stopped changing, and only the latest one', (context) => {
	context.mock.timers.enable({ apis: ['setTimeout'] });
	const { queue, sent, settled, finish } = createQueue();

	queue.change('delay', 128);
	context.mock.timers.tick(300);
	queue.change('delay', 129);
	context.mock.timers.tick(300);
	queue.change('delay', 130);
	assert.deepEqual(sent, []);
	assert.equal(queue.isPending('delay'), true);

	context.mock.timers.tick(500);
	assert.deepEqual(sent, [['delay', 130]]);
	assert.equal(queue.isPending('delay'), true);

	finish();
	assert.deepEqual(settled, [['delay', 130, true]]);
	assert.equal(queue.isPending('delay'), false);
});

test('a value that changes while an event runs is sent when the event has ended', (context) => {
	context.mock.timers.enable({ apis: ['setTimeout'] });
	const { queue, sent, settled, finish } = createQueue();

	queue.change('delay', 130);
	context.mock.timers.tick(500);
	queue.change('delay', 131);
	queue.change('delay', 140);
	context.mock.timers.tick(500);
	// The first event is still running.
	assert.deepEqual(sent, [['delay', 130]]);

	finish();
	assert.deepEqual(sent, [['delay', 130], ['delay', 140]]);
	finish(false);
	assert.deepEqual(settled, [['delay', 130, true], ['delay', 140, false]]);
	assert.equal(queue.isPending('delay'), false);
});

test('a value that is still changing when an event ends waits for its delay', (context) => {
	context.mock.timers.enable({ apis: ['setTimeout'] });
	const { queue, sent, finish } = createQueue();

	queue.change('delay', 130);
	context.mock.timers.tick(500);
	queue.change('delay', 131);
	finish();
	assert.deepEqual(sent, [['delay', 130]]);

	context.mock.timers.tick(500);
	assert.deepEqual(sent, [['delay', 130], ['delay', 131]]);
});

test('the steppers of a view send their events one after the other', (context) => {
	context.mock.timers.enable({ apis: ['setTimeout'] });
	const { queue, sent, finish } = createQueue();

	queue.change('delay', 130);
	queue.change('gain', 2);
	context.mock.timers.tick(500);
	assert.deepEqual(sent, [['delay', 130]]);
	assert.equal(queue.isPending('gain'), true);

	finish();
	assert.deepEqual(sent, [['delay', 130], ['gain', 2]]);
	finish();
	assert.equal(queue.isPending('gain'), false);
});

test('a disposed queue sends nothing more', (context) => {
	context.mock.timers.enable({ apis: ['setTimeout'] });
	const { queue, sent, settled, finish } = createQueue();

	queue.change('delay', 130);
	context.mock.timers.tick(500);
	queue.change('delay', 131);
	queue.dispose();
	context.mock.timers.tick(1000);
	finish();
	queue.change('delay', 132);
	context.mock.timers.tick(1000);

	assert.deepEqual(sent, [['delay', 130]]);
	assert.deepEqual(settled, []);
});
