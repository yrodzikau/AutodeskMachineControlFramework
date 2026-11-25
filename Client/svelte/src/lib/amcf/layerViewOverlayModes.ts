/*
 * Overlay button of the layer view. The overlay is a scalar field image over the platform (for example the heat map
 * of a layer), named by the server. The button opens a menu with the modes of the overlay:
 * - Off: the overlay is not shown;
 * - Pixels: every pixel of the image is a sharp square when the view is zoomed in;
 * - Smooth: the view interpolates between the pixels; a browser that cannot filter the image cannot choose it, the
 *   menu then lists the mode with the reason.
 * The button names the chosen mode below its caption. This module works out the menu and the texts of the button; it
 * draws nothing.
 */
export type OverlayMode = 'off' | 'pixels' | 'smooth';

export const OVERLAY_MODES: OverlayMode[] = ['off', 'pixels', 'smooth'];
export const OVERLAY_MODE_CAPTIONS: Record<OverlayMode, string> = { off: 'Off', pixels: 'Pixels', smooth: 'Smooth' };
// Mode of the overlay when the layer view opens.
export const DEFAULT_OVERLAY_MODE: OverlayMode = 'off';
export const OVERLAY_SMOOTHING_UNSUPPORTED_HINT = 'This browser cannot smooth the image between its pixels';

export interface OverlayModeInput {
	// Name of the overlay as the server declared it, for example "Heat Map".
	name: string;
	// Mode chosen in the menu.
	mode: OverlayMode;
	// The browser can interpolate the image between its pixels.
	smoothingSupported: boolean;
}

// A mode in the menu of the overlay button.
export interface OverlayModeEntry {
	mode: OverlayMode;
	caption: string;
	// The mode can be chosen.
	available: boolean;
	// Why it cannot; '' if it can.
	hint: string;
	// The overlay is drawn in this mode.
	shown: boolean;
}

export interface OverlayModeState {
	// Mode the overlay is drawn in: the chosen one, or Pixels for Smooth where the browser cannot smooth.
	mode: OverlayMode;
	// The overlay is shown (Pixels or Smooth).
	shown: boolean;
	// Modes for the menu of the button, in the order Off, Pixels, Smooth.
	entries: OverlayModeEntry[];
	// Captions of all modes (the button is as wide as the longest).
	captions: string[];
	// Caption of the mode that is shown.
	caption: string;
	// Tooltip of the button.
	title: string;
}

export function isOverlayModeAvailable (mode: OverlayMode, smoothingSupported: boolean): boolean {
	return mode !== 'smooth' || smoothingSupported;
}

export function resolveOverlayModes (input: OverlayModeInput): OverlayModeState {
	const mode: OverlayMode = isOverlayModeAvailable (input.mode, input.smoothingSupported) ? input.mode : 'pixels';
	const entries = OVERLAY_MODES.map ((entry): OverlayModeEntry => {
		const available = isOverlayModeAvailable (entry, input.smoothingSupported);
		return {
			mode: entry,
			caption: OVERLAY_MODE_CAPTIONS[entry],
			available,
			hint: available ? '' : OVERLAY_SMOOTHING_UNSUPPORTED_HINT,
			shown: entry === mode
		};
	});

	return {
		mode,
		shown: mode !== 'off',
		entries,
		captions: entries.map ((entry) => entry.caption),
		caption: OVERLAY_MODE_CAPTIONS[mode],
		title: describeOverlayMode (input.name, mode)
	};
}

function describeOverlayMode (name: string, mode: OverlayMode): string {
	const overlay = (name.trim () || 'overlay').toLowerCase ();
	const choose = 'Click to choose Off, Pixels or Smooth';
	if (mode === 'pixels') return `The ${overlay} is shown with every pixel as a square. ${choose}`;
	if (mode === 'smooth') return `The ${overlay} is shown smoothed between its pixels. ${choose}`;
	return `Show the ${overlay} of the layer on the platform, below the toolpath and the recorded points. ${choose}`;
}
