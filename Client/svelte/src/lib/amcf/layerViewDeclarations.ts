/*
 * Declarations of a UI plugin for the layer view. The plugin sets them as JSON texts in two properties of the
 * platform item, so the layer view itself knows nothing about what a machine records.
 *
 * scatterplotvaluesets: {"valuesets": [ ... ]} - values of the recorded points that the display mode Power shows as
 * laser spots, at most one value set for the spots at the target positions and one for those at the status
 * positions. Members of a value set (strings unless noted):
 *   positions        "target" or "status": the positions the spots are drawn at
 *   caption          name of the mode in the Mode menu and title of the legend, for example "Watts"
 *   channel, column  data channel of the scatter plot and its column with one value per sample
 *   valuecaption     what a value is, for the legend and the point inspector (default: the caption)
 *   unit             unit of the values (default: none)
 *   icon             mdi icon of the mode, for example "mdi-thermometer" (default: none)
 *   look             "circle" (default) or "glow", a spot of light with a soft edge
 *   size             diameter of the spots in screen pixels (number; default 6, glow 16)
 *   maximumsize      largest diameter the legend offers (number; default 32, glow 512)
 *   fill             circles are filled (boolean; default true)
 *   scale            default color scale: "power" takes the range of the laser power legend, "overlay" follows the
 *                    legend of the overlay (color map, inversion and range) while the user leaves that switched on,
 *                    anything else takes the range of the values of the layer
 *   available        false if the layer has no such values (boolean; default true); the mode is then listed as
 *                    not available
 *   unavailablehint  why the layer has no such values
 *
 * steppers: {"steppers": [ ... ]} - numeric steppers in the top right corner of the view. Members of a stepper:
 *   name             identifier of the stepper
 *   caption          label in front of the field
 *   value            current value (number)
 *   minimum, maximum bounds of the value (numbers; default: none)
 *   step             step of the arrows (number; default 1); values lie on the grid of the step
 *   unit             unit behind the field (default: none)
 *   note             line below the field, for example the value in another unit (default: none)
 *   hint             tooltip (default: none)
 *   event            UI event that a changed value triggers, with the platform item as its sender and the event
 *                    parameters "stepper" (the name) and "value" (number). The plugin answers by declaring the
 *                    steppers again with the value it accepted.
 *   enabled          false shows the stepper without letting the user change it (boolean; default true)
 *   disabledhint     tooltip of a stepper that is not enabled
 */
import type { SpotRole } from './layerViewSpotModes';

export type ValueSetLook = 'circle' | 'glow';
export type ValueSetScale = 'power' | 'overlay' | '';

export interface PointValueSet {
	positions: SpotRole;
	caption: string;
	icon: string;
	channel: string;
	column: string;
	valueCaption: string;
	unit: string;
	look: ValueSetLook;
	size: number;
	maximumSize: number;
	fill: boolean;
	scale: ValueSetScale;
	available: boolean;
	unavailableHint: string;
}

export type PointValueSets = Record<SpotRole, PointValueSet | null>;

export interface ViewStepper {
	name: string;
	caption: string;
	value: number;
	minimum: number | null;
	maximum: number | null;
	step: number;
	unit: string;
	note: string;
	hint: string;
	event: string;
	enabled: boolean;
	disabledHint: string;
}

// Largest diameter a declaration may offer: spots of light may be large, the viewer draws them smaller where they
// would load the graphics card too much.
export const VALUE_SET_SIZE_LIMIT: Record<ValueSetLook, number> = { circle: 64, glow: 512 };
const VALUE_SET_DEFAULT_SIZE: Record<ValueSetLook, number> = { circle: 6, glow: 16 };
const VALUE_SET_DEFAULT_MAXIMUM_SIZE: Record<ValueSetLook, number> = { circle: 32, glow: 512 };
const STEPPER_LIMIT = 4;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;
const ICON_PATTERN = /^mdi-[a-z0-9-]+$/;

type Warn = (message: string) => void;
const warnOnConsole: Warn = (message) => console.warn ('[LayerView] ' + message);

function textOf (value: unknown): string {
	return typeof value === 'string' ? value.trim () : '';
}

function numberOf (value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite (value) ? value : null;
	if (typeof value === 'string' && value.trim () !== '') {
		const number = Number (value);
		return Number.isFinite (number) ? number : null;
	}
	return null;
}

// The array member of a declaration text; null if the text is empty or no such declaration.
function readDeclaration (text: unknown, member: string, warn: Warn): unknown[] | null {
	if (typeof text !== 'string' || text.trim () === '') return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse (text);
	} catch (error) {
		warn (`the declaration of the ${member} is no JSON: ${error instanceof Error ? error.message : error}`);
		return null;
	}

	const list = (parsed && typeof parsed === 'object') ? (parsed as Record<string, unknown>)[member] : undefined;
	if (!Array.isArray (list)) {
		warn (`the declaration of the ${member} has no array "${member}"`);
		return null;
	}
	return list;
}

export function parseValueSets (text: unknown, warn: Warn = warnOnConsole): PointValueSets {
	const valueSets: PointValueSets = { target: null, status: null };

	for (const entry of readDeclaration (text, 'valuesets', warn) ?? []) {
		if (!entry || typeof entry !== 'object') {
			warn ('a value set is no object and is ignored');
			continue;
		}
		const fields = entry as Record<string, unknown>;

		const positions = textOf (fields.positions).toLowerCase ();
		const caption = textOf (fields.caption);
		const channel = textOf (fields.channel);
		const column = textOf (fields.column);
		if (positions !== 'target' && positions !== 'status') {
			warn (`the value set "${caption}" names no positions (target or status) and is ignored`);
			continue;
		}
		if (caption === '' || !IDENTIFIER_PATTERN.test (channel) || !IDENTIFIER_PATTERN.test (column)) {
			warn (`the value set "${caption}" at the ${positions} positions needs a caption, a channel and a column and is ignored`);
			continue;
		}
		if (valueSets[positions]) {
			warn (`the value set "${caption}" is ignored: the ${positions} positions already show "${valueSets[positions]?.caption}"`);
			continue;
		}

		const look: ValueSetLook = textOf (fields.look).toLowerCase () === 'glow' ? 'glow' : 'circle';
		const maximumSize = clampSize (numberOf (fields.maximumsize) ?? VALUE_SET_DEFAULT_MAXIMUM_SIZE[look], VALUE_SET_SIZE_LIMIT[look]);
		const scale = textOf (fields.scale).toLowerCase ();
		const icon = textOf (fields.icon);

		valueSets[positions] = {
			positions,
			caption,
			icon: ICON_PATTERN.test (icon) ? icon : '',
			channel,
			column,
			valueCaption: textOf (fields.valuecaption) || caption,
			unit: textOf (fields.unit),
			look,
			size: clampSize (numberOf (fields.size) ?? VALUE_SET_DEFAULT_SIZE[look], maximumSize),
			maximumSize,
			fill: fields.fill !== false,
			scale: (scale === 'power' || scale === 'overlay') ? scale : '',
			available: fields.available !== false,
			unavailableHint: textOf (fields.unavailablehint)
		};
	}

	return valueSets;
}

function clampSize (size: number, maximum: number): number {
	return Math.min (Math.max (Math.round (size), 1), maximum);
}

export function parseSteppers (text: unknown, warn: Warn = warnOnConsole): ViewStepper[] {
	const steppers: ViewStepper[] = [];

	for (const entry of readDeclaration (text, 'steppers', warn) ?? []) {
		if (!entry || typeof entry !== 'object') {
			warn ('a stepper is no object and is ignored');
			continue;
		}
		const fields = entry as Record<string, unknown>;

		const name = textOf (fields.name);
		const caption = textOf (fields.caption);
		const event = textOf (fields.event);
		const value = numberOf (fields.value);
		if (!IDENTIFIER_PATTERN.test (name) || caption === '' || !IDENTIFIER_PATTERN.test (event) || value === null) {
			warn (`the stepper "${name || caption}" needs a name, a caption, an event and a value and is ignored`);
			continue;
		}
		if (steppers.some ((stepper) => stepper.name === name)) {
			warn (`the stepper "${name}" is declared twice, the second one is ignored`);
			continue;
		}
		if (steppers.length >= STEPPER_LIMIT) {
			warn (`the stepper "${name}" is ignored: a layer view shows at most ${STEPPER_LIMIT} steppers`);
			continue;
		}

		const minimum = numberOf (fields.minimum);
		let maximum = numberOf (fields.maximum);
		if (minimum !== null && maximum !== null && maximum < minimum) maximum = minimum;
		const step = numberOf (fields.step);

		steppers.push ({
			name,
			caption,
			value,
			minimum,
			maximum,
			step: (step !== null && step > 0) ? step : 1,
			unit: textOf (fields.unit),
			note: textOf (fields.note),
			hint: textOf (fields.hint),
			event,
			enabled: fields.enabled !== false,
			disabledHint: textOf (fields.disabledhint)
		});
	}

	return steppers;
}

// The value that a text typed into a stepper stands for: the number, moved into the bounds and onto the grid of the
// step; null if the text is no number.
export function stepperValueOf (stepper: ViewStepper, text: string): number | null {
	const typed = numberOf (text);
	if (typed === null) return null;

	const origin = stepper.minimum ?? 0;
	const decimals = Math.max (decimalsOf (stepper.step), decimalsOf (origin));
	let value = origin + Math.round ((typed - origin) / stepper.step) * stepper.step;
	if (stepper.maximum !== null && value > stepper.maximum) {
		// The largest value on the grid that does not exceed the maximum.
		value = origin + Math.floor ((stepper.maximum - origin) / stepper.step + 1e-9) * stepper.step;
	}
	if (stepper.minimum !== null && value < stepper.minimum) value = stepper.minimum;

	// No floating point noise from fractional steps.
	return Number (value.toFixed (decimals));
}

function decimalsOf (value: number): number {
	return (String (value).split ('.')[1] || '').length;
}

type TimerHandle = ReturnType<typeof setTimeout>;

/*
 * Sends the changed values of the steppers of a layer view to the server, one event at a time: every value makes
 * the server work (it rebuilds what the view shows), and the application drops an event whose sender still has an
 * event running. A value is sent when it has not changed for the delay; a value that changes while an event runs
 * is sent when that event has ended, and only the latest value of a stepper is sent.
 */
export class StepperEventQueue {
	private send: (name: string, value: number, done: (succeeded: boolean) => void) => void;
	private settled: (name: string, value: number, succeeded: boolean) => void;
	private delay: number;
	// Changed values that are not sent yet, with the timer of those that may still change.
	private waiting = new Map<string, number> ();
	private timers = new Map<string, TimerHandle> ();
	private sending: string | null = null;
	private disposed = false;

	constructor (send: (name: string, value: number, done: (succeeded: boolean) => void) => void,
		settled: (name: string, value: number, succeeded: boolean) => void, delay: number) {
		this.send = send;
		this.settled = settled;
		this.delay = delay;
	}

	// The user changed the value of a stepper.
	change (name: string, value: number) {
		if (this.disposed) return;
		this.waiting.set (name, value);

		const timer = this.timers.get (name);
		if (timer !== undefined) clearTimeout (timer);
		this.timers.set (name, setTimeout (() => {
			this.timers.delete (name);
			this.sendNext ();
		}, this.delay));
	}

	// A changed value of the stepper is waiting or on its way to the server.
	isPending (name: string): boolean {
		return this.waiting.has (name) || this.sending === name;
	}

	// Drops what is not sent yet, for example when the view goes away.
	dispose () {
		this.disposed = true;
		for (const timer of this.timers.values ()) clearTimeout (timer);
		this.timers.clear ();
		this.waiting.clear ();
	}

	private sendNext () {
		if (this.disposed || this.sending !== null) return;

		// The first stepper whose value has stopped changing.
		const name = [...this.waiting.keys ()].find ((candidate) => !this.timers.has (candidate));
		if (name === undefined) return;

		const value = this.waiting.get (name) as number;
		this.waiting.delete (name);
		this.sending = name;
		this.send (name, value, (succeeded) => {
			this.sending = null;
			if (this.disposed) return;
			this.settled (name, value, succeeded);
			this.sendNext ();
		});
	}
}
