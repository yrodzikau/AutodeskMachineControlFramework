/*
 * Mode button of the layer view. Recorded points with two positions per sample (the target positions the scanner
 * was commanded to and the status positions it reported) are drawn as laser spots in the display modes Laser On and
 * Power, and the Mode button chooses what the spots show, separately for both display modes:
 * - Laser On: the spots at Target X/Y, at Status X/Y or at both;
 * - Power: the value sets that the server declares for the points (see layerViewDeclarations.ts), one for the spots
 *   at the target positions, one for those at the status positions, or both. A viewer of laser recordings declares
 *   for example the laser power at Target X/Y and a sensor value at Status X/Y.
 * What a layer offers decides which of these can be shown. The button opens a menu with all modes of the display
 * mode; a mode the layer cannot show is listed with the reason. This module works that out from what is loaded; it
 * draws nothing.
 */
export type SpotRole = 'target' | 'status';
export type SpotSetMode = 'target' | 'status' | 'both';
export type SpotDisplayMode = 'laseron' | 'power';

export const SPOT_ROLES: SpotRole[] = ['target', 'status'];
export const SPOT_ROLE_CAPTIONS: Record<SpotRole, string> = { target: 'Target X/Y', status: 'Status X/Y' };
export const SPOT_SET_MODES: SpotSetMode[] = ['target', 'status', 'both'];
const LASERON_MODE_CAPTIONS: Record<SpotSetMode, string> = { target: 'Target X/Y', status: 'Status X/Y', both: 'Target vs Status' };
// Display modes of the toolpath and the recorded points that draw the points as spots.
const SPOT_DISPLAY_MODES: Record<string, SpotDisplayMode> = { laseron: 'laseron', power: 'power' };

// What the Mode button needs to know of a value set that the server declared for the display mode Power.
export interface SpotValueSet {
	// Name of the mode, for example "Watts".
	caption: string;
	// The layer has the values.
	available: boolean;
	// Why it has not; may be empty.
	unavailableHint: string;
}

export interface SpotModeInput {
	// Display mode of the toolpath and the recorded points: 'color', 'time', 'power', 'laseron', 'off' ...
	displayMode: string;
	// Mode chosen with the Mode button in each of the display modes with spots.
	chosenModes: Record<SpotDisplayMode, SpotSetMode>;
	pointsLoaded: boolean;
	// False while the display mode hides the recorded points (Off).
	pointsEnabled: boolean;
	// Positions of the loaded points as the server named them; '' if it did not.
	primaryRole: SpotRole | '';
	// The layer offers the same samples at their other positions.
	secondaryAvailable: boolean;
	// Value sets of the display mode Power by the positions of their spots; null where the server declared none.
	valueSets: Record<SpotRole, SpotValueSet | null>;
}

// A mode in the menu of the Mode button.
export interface SpotModeEntry {
	mode: SpotSetMode;
	caption: string;
	// The layer can show the mode.
	available: boolean;
	// Why it cannot; '' if it can.
	hint: string;
	// The spots are drawn in this mode.
	shown: boolean;
}

export interface SpotModeState {
	// Null in a display mode without spots.
	displayMode: SpotDisplayMode | null;
	// Mode chosen for the display mode ('status' outside of the display modes with spots).
	mode: SpotSetMode;
	// Positions the layer has.
	positionsAvailable: Record<SpotRole, boolean>;
	// Spots the display mode can draw: in Power the spots at a kind of positions need a value set with values.
	available: Record<SpotRole, boolean>;
	// The points are drawn as spots.
	active: boolean;
	// Both kinds of spots can be drawn, so every mode can be chosen.
	choosable: boolean;
	// Spots that are drawn: the chosen ones, or the only ones the layer has.
	shown: Record<SpotRole, boolean>;
	shownRoles: SpotRole[];
	// Modes of the display mode for the menu of the button; empty where the button has no menu.
	entries: SpotModeEntry[];
	// Captions of all modes of the display mode (the button is as wide as the longest); empty without spots.
	captions: string[];
	// Caption of the mode that is shown; '' without spots.
	caption: string;
	// Display mode and mode that is shown, for example 'power-status'; '' without spots.
	icon: string;
	// Tooltip of the button: what it chooses, or why it has nothing to choose.
	title: string;
}

export function resolveSpotModes (input: SpotModeInput): SpotModeState {
	const displayMode = SPOT_DISPLAY_MODES[input.displayMode] ?? null;
	const mode: SpotSetMode = displayMode ? input.chosenModes[displayMode] : 'status';
	const secondaryRole: SpotRole | '' = input.primaryRole === 'target' ? 'status' : (input.primaryRole === 'status' ? 'target' : '');

	const hasPositions = (role: SpotRole) => input.pointsLoaded && (input.primaryRole === role || (secondaryRole === role && input.secondaryAvailable));
	const positionsAvailable = { target: hasPositions ('target'), status: hasPositions ('status') };

	// Spots at a kind of positions exist as a mode if the display mode has something to show there, and can be drawn
	// if the layer has the positions and, in Power, the values.
	const declared = (role: SpotRole) => displayMode === 'laseron' || (displayMode === 'power' && input.valueSets[role] !== null);
	const unavailableHint = (role: SpotRole): string => {
		if (!positionsAvailable[role]) return `This layer has no ${SPOT_ROLE_CAPTIONS[role]} positions`;
		const valueSet = displayMode === 'power' ? input.valueSets[role] : null;
		if (valueSet && !valueSet.available) return valueSet.unavailableHint || `This layer has no values for ${valueSet.caption}`;
		return '';
	};
	const hints = { target: unavailableHint ('target'), status: unavailableHint ('status') };
	const available = { target: declared ('target') && hints.target === '', status: declared ('status') && hints.status === '' };

	const spotsPossible = input.pointsLoaded && input.pointsEnabled && displayMode !== null && input.primaryRole !== '';
	const active = spotsPossible && (available.target || available.status);
	const choosable = active && available.target && available.status;
	const shown = {
		target: active && available.target && (mode !== 'status' || !available.status),
		status: active && available.status && (mode !== 'target' || !available.target)
	};
	const shownRoles = SPOT_ROLES.filter ((role) => shown[role]);
	const shownMode: SpotSetMode = choosable ? mode : (shownRoles.length === 1 ? shownRoles[0] : mode);

	const modeCaptions = captionsOf (displayMode, input.valueSets);
	const entries: SpotModeEntry[] = [];
	if (spotsPossible) {
		for (const entry of SPOT_SET_MODES) {
			const roles: SpotRole[] = entry === 'both' ? SPOT_ROLES : [entry];
			if (!roles.every (declared)) continue;
			entries.push ({
				mode: entry,
				caption: modeCaptions[entry],
				available: roles.every ((role) => available[role]),
				hint: roles.map ((role) => hints[role]).find ((hint) => hint !== '') ?? '',
				shown: active && entry === shownMode
			});
		}
	}

	return {
		displayMode,
		mode,
		positionsAvailable,
		available,
		active,
		choosable,
		shown,
		shownRoles,
		entries,
		captions: active ? entries.map ((entry) => entry.caption) : [],
		caption: (active && (choosable || shownRoles.length === 1)) ? modeCaptions[shownMode] : '',
		icon: (displayMode && active) ? `${displayMode}-${shownMode}` : '',
		title: describeSpotModes (input, displayMode, entries)
	};
}

// Captions of the modes of a display mode: fixed for Laser On, the captions of the declared value sets for Power.
function captionsOf (displayMode: SpotDisplayMode | null, valueSets: Record<SpotRole, SpotValueSet | null>): Record<SpotSetMode, string> {
	if (displayMode !== 'power') return LASERON_MODE_CAPTIONS;
	const target = valueSets.target?.caption ?? '';
	const status = valueSets.status?.caption ?? '';
	return { target, status, both: (target && status) ? `${target} + ${status}` : '' };
}

function describeSpotModes (input: SpotModeInput, displayMode: SpotDisplayMode | null, entries: SpotModeEntry[]): string {
	if (!input.pointsLoaded) return 'This layer has no recorded points';
	if (!input.pointsEnabled) return 'The laser spots are hidden by the display mode Off';
	if (!displayMode) return 'The mode of the laser spots is chosen in the display modes Laser On and Power';
	if (input.primaryRole === '') return 'This layer has no recorded points with known positions';
	if (displayMode === 'laseron')
		return 'Choose the positions the laser spots are drawn at: Target X/Y (commanded), Status X/Y (reported by the scanner) or both';
	if (entries.length === 0)
		return 'This layer has no values to show as laser spots in the display mode Power; the points are colored by the recorded power';

	const parts = SPOT_ROLES
		.filter ((role) => input.valueSets[role] !== null)
		.map ((role) => `${input.valueSets[role]?.caption} at ${SPOT_ROLE_CAPTIONS[role]}`);
	return 'Choose what the laser spots show: ' + (parts.length === 2 ? `${parts[0]}, ${parts[1]} or both` : parts[0]);
}
