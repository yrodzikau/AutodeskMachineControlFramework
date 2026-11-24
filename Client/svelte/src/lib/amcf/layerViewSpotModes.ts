/*
 * Mode button of the layer view. Recorded points with two positions per sample (the target positions the scanner
 * was commanded to and the status positions it reported) are drawn as laser spots in the display modes Laser On and
 * Power, and the Mode button chooses what the spots show, separately for both display modes:
 * - Laser On: the spots at Target X/Y, at Status X/Y or at both;
 * - Power: Watts (the laser power of the samples, at Target X/Y), Temperature (their OIE values, at Status X/Y) or
 *   both.
 * What a layer offers decides which of these exist: without one of the two the button has nothing to choose and
 * shows the only mode there is. This module works that out from what is loaded; it draws nothing.
 */
export type SpotRole = 'target' | 'status';
export type SpotSetMode = 'target' | 'status' | 'both';
export type SpotDisplayMode = 'laseron' | 'power';

export const SPOT_ROLES: SpotRole[] = ['target', 'status'];
export const SPOT_ROLE_CAPTIONS: Record<SpotRole, string> = { target: 'Target X/Y', status: 'Status X/Y' };
export const SPOT_SET_MODES: SpotSetMode[] = ['target', 'status', 'both'];
// In the display mode Power the target positions show the laser power (Watts) and the status positions the OIE
// temperature (Temperature).
export const SPOT_SET_MODE_CAPTIONS: Record<SpotDisplayMode, Record<SpotSetMode, string>> = {
	laseron: { target: 'Target X/Y', status: 'Status X/Y', both: 'Target vs Status' },
	power: { target: 'Watts', status: 'Temperature', both: 'Watts + Temperature' }
};
// Display modes of the toolpath and the recorded points that draw the points as spots.
const SPOT_DISPLAY_MODES: Record<string, SpotDisplayMode> = { laseron: 'laseron', power: 'power' };

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
	// The points carry the laser power of their samples.
	hasPower: boolean;
	// The points have OIE values (sensor 1).
	hasOIE: boolean;
}

export interface SpotModeState {
	// Null in a display mode without spots.
	displayMode: SpotDisplayMode | null;
	// Mode chosen for the display mode ('status' outside of the display modes with spots).
	mode: SpotSetMode;
	// Positions the layer has.
	positionsAvailable: Record<SpotRole, boolean>;
	// Spots the display mode can draw: in Power, Watts needs the target positions and the laser power, Temperature
	// the status positions and the OIE values.
	available: Record<SpotRole, boolean>;
	// The points are drawn as spots.
	active: boolean;
	// The Mode button has something to choose: both kinds of spots can be drawn.
	choosable: boolean;
	// Spots that are drawn: the chosen ones, or the only ones the layer has.
	shown: Record<SpotRole, boolean>;
	shownRoles: SpotRole[];
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
	const available = displayMode === 'power'
		? { target: positionsAvailable.target && input.hasPower, status: positionsAvailable.status && input.hasOIE }
		: positionsAvailable;

	const active = input.pointsLoaded && input.pointsEnabled && displayMode !== null && input.primaryRole !== '' && (available.target || available.status);
	const choosable = active && available.target && available.status;
	const shown = {
		target: active && available.target && (mode !== 'status' || !available.status),
		status: active && available.status && (mode !== 'target' || !available.target)
	};
	const shownRoles = SPOT_ROLES.filter ((role) => shown[role]);
	const shownMode: SpotSetMode = choosable ? mode : (shownRoles.length === 1 ? shownRoles[0] : mode);

	return {
		displayMode,
		mode,
		positionsAvailable,
		available,
		active,
		choosable,
		shown,
		shownRoles,
		captions: (displayMode && active) ? SPOT_SET_MODES.map ((entry) => SPOT_SET_MODE_CAPTIONS[displayMode][entry]) : [],
		caption: (displayMode && active && (choosable || shownRoles.length === 1)) ? SPOT_SET_MODE_CAPTIONS[displayMode][shownMode] : '',
		icon: (displayMode && active) ? `${displayMode}-${shownMode}` : '',
		title: describeSpotModes (input, displayMode, positionsAvailable, available, choosable, shownRoles)
	};
}

function describeSpotModes (input: SpotModeInput, displayMode: SpotDisplayMode | null, positionsAvailable: Record<SpotRole, boolean>,
	available: Record<SpotRole, boolean>, choosable: boolean, shownRoles: SpotRole[]): string {
	if (choosable && displayMode === 'power')
		return 'Choose what the laser spots show: Watts (the laser power of the samples at Target X/Y), Temperature (the OIE temperature, sensor 1, of the samples at Status X/Y) or both. Click steps through them';
	if (choosable)
		return 'Choose the positions the laser spots are drawn at: Target X/Y (commanded), Status X/Y (reported by the scanner) or both. Click steps through them';
	if (!input.pointsLoaded) return 'This layer has no recorded points';
	if (!input.pointsEnabled) return 'The laser spots are hidden by the display mode Off';
	if (!displayMode) return 'The mode of the laser spots is chosen in the display modes Laser On and Power';
	if (input.primaryRole === '') return 'This layer has no recorded points with known positions';
	if (displayMode === 'power') {
		if (available.target && !available.status)
			return positionsAvailable.status
				? 'Watts only: this layer has no OIE data (sensor 1), so Temperature and Watts + Temperature are not available'
				: 'Watts only: this layer has no Status X/Y positions, so Temperature and Watts + Temperature are not available';
		if (available.status && !available.target)
			return 'Temperature only: this layer has no Target X/Y positions with a laser power, so Watts and Watts + Temperature are not available';
		return 'This layer has neither the laser power at Target X/Y nor OIE data at Status X/Y; the points are colored by the recorded power';
	}
	if (shownRoles.length === 1) return `This layer has only ${SPOT_ROLE_CAPTIONS[shownRoles[0]]} positions`;
	return 'This layer has no recorded points with known positions';
}

// The mode a click on the Mode button steps to.
export function nextSpotSetMode (mode: SpotSetMode): SpotSetMode {
	return SPOT_SET_MODES[(SPOT_SET_MODES.indexOf (mode) + 1) % SPOT_SET_MODES.length];
}
