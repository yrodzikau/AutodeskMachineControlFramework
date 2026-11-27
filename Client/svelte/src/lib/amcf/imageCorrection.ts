/*
 * Image correction: a quadrilateral of an image (for example the build plate in a camera image taken at an angle) that
 * is drawn with perspective correction over a rectangle of the platform. The quadrilateral is given by its corners as
 * fractions of the width and the height of the image from its top left corner (x to the right, y down), so that one
 * correction fits images of every resolution:
 *   topleftx, toplefty, toprightx, toprighty, bottomrightx, bottomrighty, bottomleftx, bottomlefty
 * The top left corner goes to the top left corner of the rectangle as the layer view shows it (the corner with the
 * smallest x and the largest y in toolpath coordinates), and so on; placing the corners therefore also compensates a
 * rotated or mirrored image. A valid quadrilateral lies within the image, is convex, does not cross itself and is not
 * degenerate.
 *
 * The image correction page module gets, as JSON texts set by the UI plugin:
 *   images      {"images": [{ caption, timestamp, imageuuid, sizex, sizey, originx, originy }]}: the images to choose
 *               from; caption names the image, timestamp (ISO 8601 UTC, optional) is when it was stored and is shown
 *               after the caption in local time, imageuuid is the storage stream of the PNG (served by /api/image),
 *               sizex, sizey, originx and originy the area of the platform in toolpath coordinates in mm (lower left
 *               corner originx, originy) that the image is corrected onto.
 *   correction  the stored corners, '' for the corners of the image.
 * This module works out these declarations, the geometry and the texts; it draws nothing.
 */

export type CornerName = 'topleft' | 'topright' | 'bottomright' | 'bottomleft';

export interface ImageCorners {
	topleftx: number;
	toplefty: number;
	toprightx: number;
	toprighty: number;
	bottomrightx: number;
	bottomrighty: number;
	bottomleftx: number;
	bottomlefty: number;
}

export interface Point {
	x: number;
	y: number;
}

export interface PlatformArea {
	sizeX: number;
	sizeY: number;
	originX: number;
	originY: number;
}

export interface CorrectionImage {
	caption: string;
	// ISO 8601 UTC, '' if unknown.
	timestamp: string;
	// Lower-case UUID of the storage stream of the PNG.
	imageUUID: string;
	area: PlatformArea;
}

// The corners in the order of the quadrilateral, with the labels the views show.
export const CORNERS: ReadonlyArray<{ name: CornerName; label: string }> = [
	{ name: 'topleft', label: 'TL' },
	{ name: 'topright', label: 'TR' },
	{ name: 'bottomright', label: 'BR' },
	{ name: 'bottomleft', label: 'BL' }
];

export const CORNER_KEYS: ReadonlyArray<keyof ImageCorners> = [
	'topleftx', 'toplefty', 'toprightx', 'toprighty', 'bottomrightx', 'bottomrighty', 'bottomleftx', 'bottomlefty'
];

export const FULL_IMAGE_CORNERS: Readonly<ImageCorners> = Object.freeze({
	topleftx: 0, toplefty: 0, toprightx: 1, toprighty: 0, bottomrightx: 1, bottomrighty: 1, bottomleftx: 0, bottomlefty: 1
});

// Smallest turn (cross product of two consecutive sides, in squared image fractions) of a corner that still counts as
// a corner, the same as on the server (Shared/smc_cameraimages.hpp).
export const MINIMUM_CORNER_TURN = 1e-9;

// Corners that differ by less than this are the same (fractions of the image).
const CORNER_TOLERANCE = 1e-9;

const NULL_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function cornerPoint (corners: ImageCorners, name: CornerName): Point {
	return { x: corners[`${name}x`], y: corners[`${name}y`] };
}

export function withCorner (corners: ImageCorners, name: CornerName, point: Point): ImageCorners {
	return { ...corners, [`${name}x`]: point.x, [`${name}y`]: point.y };
}

// Why the corners are no valid quadrilateral, or null if they are one.
export function quadrilateralProblem (corners: ImageCorners): string | null {
	for (const key of CORNER_KEYS) {
		const value = corners[key];
		if (typeof value !== 'number' || !Number.isFinite(value)) return `${key} is no number`;
		if (value < 0 || value > 1) return `${key} lies outside of the image`;
	}

	const points = CORNERS.map((corner) => cornerPoint(corners, corner.name));
	let positive = 0;
	let negative = 0;
	for (let index = 0; index < 4; index++) {
		const a = points[index];
		const b = points[(index + 1) % 4];
		const c = points[(index + 2) % 4];
		const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
		if (turn > MINIMUM_CORNER_TURN) positive++;
		else if (turn < -MINIMUM_CORNER_TURN) negative++;
		else return 'three corners lie on a line';
	}
	// Four turns of the same sense: a convex quadrilateral. Mixed senses: it is concave or crosses itself.
	if (positive !== 4 && negative !== 4) return 'the quadrilateral is not convex or crosses itself';
	return null;
}

export function cornersAreValid (corners: ImageCorners): boolean {
	return quadrilateralProblem(corners) === null;
}

// Decimals that the server keeps of a corner: its machine parameters store doubles with six decimals.
export const STORED_CORNER_DECIMALS = 6;

// The corners as the server stores them, so that the applied corners and the stored ones are the same.
export function roundCorners (corners: ImageCorners, decimals: number = STORED_CORNER_DECIMALS): ImageCorners {
	const factor = Math.pow(10, decimals);
	const rounded = { ...corners };
	for (const key of CORNER_KEYS) rounded[key] = Math.round(corners[key] * factor) / factor;
	return rounded;
}

export function cornersEqual (a: ImageCorners, b: ImageCorners): boolean {
	return CORNER_KEYS.every((key) => Math.abs(a[key] - b[key]) <= CORNER_TOLERANCE);
}

export function isFullImage (corners: ImageCorners): boolean {
	return cornersEqual(corners, FULL_IMAGE_CORNERS);
}

// The corners of a declaration: a JSON text or an object with the eight numbers. '' or a missing declaration is the
// full image; an unreadable or invalid one is the full image as well, and warn says why.
export function parseCorners (declaration: unknown, warn: (message: string) => void = () => {}): ImageCorners {
	let object: any = declaration;
	if (typeof declaration === 'string') {
		const text = declaration.trim();
		if (text === '') return { ...FULL_IMAGE_CORNERS };
		try {
			object = JSON.parse(text);
		} catch (error) {
			warn(`[ImageCorrection] corners ignored, the declaration is no JSON: ${(error as Error)?.message ?? error}`);
			return { ...FULL_IMAGE_CORNERS };
		}
	}
	if (object === null || object === undefined) return { ...FULL_IMAGE_CORNERS };
	if (typeof object !== 'object' || Array.isArray(object)) {
		warn('[ImageCorrection] corners ignored, the declaration is no object');
		return { ...FULL_IMAGE_CORNERS };
	}

	const corners = { ...FULL_IMAGE_CORNERS } as ImageCorners;
	for (const key of CORNER_KEYS) {
		const value = object[key];
		if (typeof value !== 'number') {
			warn(`[ImageCorrection] corners ignored, ${key} is no number`);
			return { ...FULL_IMAGE_CORNERS };
		}
		corners[key] = value;
	}
	const problem = quadrilateralProblem(corners);
	if (problem !== null) {
		warn(`[ImageCorrection] corners ignored, ${problem}`);
		return { ...FULL_IMAGE_CORNERS };
	}
	return corners;
}

// Like parseCorners, but null for a missing or empty declaration (the whole image without correction).
export function parseOptionalCorners (declaration: unknown, warn: (message: string) => void = () => {}): ImageCorners | null {
	if (declaration === undefined || declaration === null) return null;
	if (typeof declaration === 'string' && declaration.trim() === '') return null;
	return parseCorners(declaration, warn);
}

function numberMember (object: any, name: string): number | null {
	const value = object?.[name];
	return (typeof value === 'number' && Number.isFinite(value)) ? value : null;
}

// The images of the images declaration, in its order. Entries without caption, without image or with an empty area are
// left out; warn says why.
export function parseCorrectionImages (declaration: string, warn: (message: string) => void = () => {}): CorrectionImage[] {
	const text = (declaration ?? '').trim();
	if (text === '') return [];

	let object: any;
	try {
		object = JSON.parse(text);
	} catch (error) {
		warn(`[ImageCorrection] images ignored, the declaration is no JSON: ${(error as Error)?.message ?? error}`);
		return [];
	}

	const images: CorrectionImage[] = [];
	for (const entry of Array.isArray(object?.images) ? object.images : []) {
		const caption = (typeof entry?.caption === 'string') ? entry.caption.trim() : '';
		const uuid = (typeof entry?.imageuuid === 'string') ? entry.imageuuid.trim().toLowerCase() : '';
		const sizeX = numberMember(entry, 'sizex');
		const sizeY = numberMember(entry, 'sizey');
		const originX = numberMember(entry, 'originx');
		const originY = numberMember(entry, 'originy');
		if (caption === '' || !UUID_PATTERN.test(uuid) || uuid === NULL_UUID || sizeX === null || sizeY === null || sizeX <= 0 || sizeY <= 0
			|| originX === null || originY === null) {
			warn(`[ImageCorrection] image ignored: ${JSON.stringify(entry)}`);
			continue;
		}
		images.push({
			caption,
			timestamp: (typeof entry.timestamp === 'string') ? entry.timestamp.trim() : '',
			imageUUID: uuid,
			area: { sizeX, sizeY, originX, originY }
		});
	}
	return images;
}

function twoDigits (value: number): string {
	return String(value).padStart(2, '0');
}

// "2026-11-25 14:03:12" in the local time of the browser, '' for a time stamp that cannot be read.
export function formatTimestamp (timestamp: string): string {
	if (!timestamp) return '';
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return '';
	return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} `
		+ `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`;
}

// Text of the menu entry of an image: its caption and the time it was stored.
export function imageMenuCaption (image: CorrectionImage): string {
	const time = formatTimestamp(image.timestamp);
	return time ? `${image.caption} - ${time}` : image.caption;
}

export function cornerLabel (name: CornerName): string {
	return CORNERS.find((corner) => corner.name === name)?.label ?? name;
}

// "TL (412, 388)": a corner in whole pixels of the image from its top left corner.
export function pixelCornerText (name: CornerName, corners: ImageCorners, imageWidth: number, imageHeight: number): string {
	const point = cornerPoint(corners, name);
	return `${cornerLabel(name)} (${Math.round(point.x * imageWidth)}, ${Math.round(point.y * imageHeight)})`;
}

// The corner of an area of the platform in toolpath coordinates (mm, y up): the top left corner has the smallest x and
// the largest y.
export function areaCorner (area: PlatformArea, name: CornerName): Point {
	const left = area.originX;
	const right = area.originX + area.sizeX;
	const bottom = area.originY;
	const top = area.originY + area.sizeY;
	switch (name) {
	case 'topleft': return { x: left, y: top };
	case 'topright': return { x: right, y: top };
	case 'bottomright': return { x: right, y: bottom };
	default: return { x: left, y: bottom };
	}
}

function formatMillimetres (value: number): string {
	const text = value.toFixed(1);
	return (text === '-0.0') ? '0.0' : text;
}

// "TL (-150.0, 150.0)": a corner of the area in toolpath coordinates in mm with one decimal.
export function platformCornerText (name: CornerName, area: PlatformArea): string {
	const point = areaCorner(area, name);
	return `${cornerLabel(name)} (${formatMillimetres(point.x)}, ${formatMillimetres(point.y)})`;
}

// Unit vector from the centre of the four points to the point of a corner, for a label outside of the quadrilateral.
// Screen coordinates (y down). Points that coincide with the centre point up and to the left.
export function outwardDirection (points: ReadonlyArray<Point>, index: number): Point {
	const centre = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
	const dx = points[index].x - centre.x;
	const dy = points[index].y - centre.y;
	const length = Math.hypot(dx, dy);
	if (!(length > 1e-9)) return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
	return { x: dx / length, y: dy / length };
}

// Pan and zoom of a view: a point p of the content is drawn at offset + p * scale (screen pixels).
export interface ViewTransform {
	scale: number;
	offsetX: number;
	offsetY: number;
}

// The content (width x height in its units) fitted into the view and centred, keeping its proportions.
export function fitTransform (contentWidth: number, contentHeight: number, viewWidth: number, viewHeight: number): ViewTransform {
	if (!(contentWidth > 0) || !(contentHeight > 0) || !(viewWidth > 0) || !(viewHeight > 0)) return { scale: 1, offsetX: 0, offsetY: 0 };
	const scale = Math.min(viewWidth / contentWidth, viewHeight / contentHeight);
	return { scale, offsetX: (viewWidth - contentWidth * scale) / 2, offsetY: (viewHeight - contentHeight * scale) / 2 };
}

// Zoom by factor around the screen point (x, y), which keeps the content point under it; the scale stays within
// minScale and maxScale.
export function zoomAround (transform: ViewTransform, factor: number, x: number, y: number, minScale: number, maxScale: number): ViewTransform {
	const scale = Math.min(Math.max(transform.scale * factor, minScale), Math.max(minScale, maxScale));
	const applied = scale / transform.scale;
	return { scale, offsetX: x - (x - transform.offsetX) * applied, offsetY: y - (y - transform.offsetY) * applied };
}

// After the view changed its size the content point that was in its centre is in its centre again, at the same scale.
export function keepCentre (transform: ViewTransform, oldWidth: number, oldHeight: number, newWidth: number, newHeight: number): ViewTransform {
	return { scale: transform.scale, offsetX: transform.offsetX + (newWidth - oldWidth) / 2, offsetY: transform.offsetY + (newHeight - oldHeight) / 2 };
}

// Zoom factor of one wheel event, like the layer view: away from the user zooms in.
export function wheelZoomFactor (deltaY: number): number {
	const delta = Math.min(5, Math.max(-5, Number(deltaY) || 0));
	return Math.pow(1.03, -delta * 1.5);
}

// Width of the left of two views next to each other, so that both are at least minimumWidth wide where the room allows
// it; with less room both get half of it.
export function clampSplitWidth (leftWidth: number, totalWidth: number, minimumWidth: number): number {
	if (!(totalWidth > 0)) return 0;
	if (totalWidth < 2 * minimumWidth) return totalWidth / 2;
	return Math.min(Math.max(leftWidth, minimumWidth), totalWidth - minimumWidth);
}
