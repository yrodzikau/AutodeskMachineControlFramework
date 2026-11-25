/*
 * Opacity of the overlay of the layer view (for example the heat map), set in the legend of the overlay with a slider
 * and a numeric stepper. The value is an integer percentage: 100 draws the overlay as it is (the default), 0 hides it.
 * It only applies to the overlay itself, lives while the layer view is open and is not stored anywhere. This module
 * works out the value from what the user typed or stepped to; it draws nothing.
 */
export const OVERLAY_OPACITY_MIN = 0;
export const OVERLAY_OPACITY_MAX = 100;
export const OVERLAY_OPACITY_STEP = 1;
// Opacity of the overlay when the layer view opens.
export const DEFAULT_OVERLAY_OPACITY = 100;

// A decimal number with an optional sign and fraction; the fraction may follow a comma. A trailing "%" is allowed.
const OPACITY_TEXT = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*%?$/;

// The opacity moved into 0 to 100 and rounded to an integer; a value that is no number gives the default.
export function clampOverlayOpacity (value: number): number {
	if (!Number.isFinite (value)) return DEFAULT_OVERLAY_OPACITY;
	return Math.min (OVERLAY_OPACITY_MAX, Math.max (OVERLAY_OPACITY_MIN, Math.round (value)));
}

// The opacity that a typed or stepped text stands for: a number outside of 0 to 100 is replaced by the nearest bound,
// a fraction is rounded. null if the text is no number, so that the field shows the value in force again.
export function parseOverlayOpacity (text: string | null | undefined): number | null {
	const match = OPACITY_TEXT.exec (String (text ?? '').trim ());
	if (!match) return null;
	const value = Number (match[1].replace (',', '.'));
	return Number.isFinite (value) ? clampOverlayOpacity (value) : null;
}

// Factor of the alpha that the overlay is drawn with: 0 to 1.
export function overlayOpacityFactor (percent: number): number {
	return clampOverlayOpacity (percent) / 100;
}
