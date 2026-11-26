/*
 * Picture overlay of the layer view: a PNG of the layer drawn as it is (no color map) over an area of the platform,
 * between the platform image and the scalar overlay, for example the camera image of a layer. The server declares it
 * in the client variable "imageoverlay" of the platform as a JSON object, '' for none:
 *   name            identifier of the overlay, for data attributes ("camera")
 *   caption         caption of its toolbar button and title of its panel ("Camera")
 *   icon            mdi icon of the button (optional)
 *   title           tooltip of the button (optional)
 *   initialmode     mode chosen when the layer view opens (optional, else Off)
 *   unavailablenote text shown next to the toolbar while the chosen mode has no image on the layer
 *   sizex, sizey    size of the area in mm (the platform size if missing)
 *   originx, originy lower left corner of the area in toolpath coordinates in mm (the lower left corner of the
 *                   platform if missing)
 *   modes           [{ name, caption, hint, imageuuid }]: the pictures the menu offers besides Off; imageuuid is the
 *                   storage stream of the PNG (served by /api/image) or the null UUID if the layer has none
 * The button opens a menu with Off and the modes and names the chosen mode below its caption, like the button of the
 * scalar overlay. The chosen mode is kept when the layer changes. This module works out the declaration, the menu
 * and the texts of the button; it draws nothing.
 */

export const PICTURE_OVERLAY_OFF = 'off';
export const PICTURE_OVERLAY_OFF_CAPTION = 'Off';
const NULL_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PictureOverlayArea {
	sizeX: number;
	sizeY: number;
	originX: number;
	originY: number;
}

export interface PictureOverlayModeDeclaration {
	name: string;
	caption: string;
	hint: string;
	// Lower-case UUID of the PNG, or the null UUID if the layer has none.
	imageUUID: string;
}

export interface PictureOverlay {
	name: string;
	caption: string;
	icon: string;
	title: string;
	initialMode: string;
	unavailableNote: string;
	// null: the area of the platform.
	area: PictureOverlayArea | null;
	modes: PictureOverlayModeDeclaration[];
}

// A mode in the menu of the button: Off or one of the declared pictures.
export interface PictureOverlayModeEntry {
	mode: string;
	caption: string;
	hint: string;
	// The picture is shown in this mode (the mode is the chosen one).
	shown: boolean;
	// The layer has a picture of this mode (always true for Off).
	available: boolean;
}

export interface PictureOverlayState {
	// Mode in force: the chosen one if it is declared, else the initial mode, else Off.
	mode: string;
	// A mode other than Off is chosen.
	shown: boolean;
	// The chosen mode has a picture on the layer.
	available: boolean;
	// UUID of the picture to draw, the null UUID if none.
	imageUUID: string;
	entries: PictureOverlayModeEntry[];
	// Captions of all modes (the button is as wide as the longest).
	captions: string[];
	caption: string;
	title: string;
}

function textMember(object: any, name: string): string {
	return (typeof object?.[name] === 'string') ? object[name].trim() : '';
}

function numberMember(object: any, name: string): number | null {
	const value = object?.[name];
	return (typeof value === 'number' && Number.isFinite(value)) ? value : null;
}

export function isPictureUUID(uuid: string): boolean {
	return UUID_PATTERN.test(uuid) && uuid !== NULL_UUID;
}

// Reads the declaration. An empty or unreadable declaration, or one without a caption or without modes, is no picture
// overlay; warn reports why.
export function parsePictureOverlay(declaration: string, warn: (message: string) => void = () => {}): PictureOverlay | null {
	const text = (declaration ?? '').trim();
	if (text === '') return null;

	let object: any;
	try {
		object = JSON.parse(text);
	} catch (error) {
		warn(`[LayerView] picture overlay ignored, the declaration is no JSON: ${(error as Error)?.message ?? error}`);
		return null;
	}
	if (!object || typeof object !== 'object' || Array.isArray(object)) {
		warn('[LayerView] picture overlay ignored, the declaration is no object');
		return null;
	}

	const caption = textMember(object, 'caption');
	if (caption === '') {
		warn('[LayerView] picture overlay ignored, it has no caption');
		return null;
	}

	const modes: PictureOverlayModeDeclaration[] = [];
	const names = new Set<string>([PICTURE_OVERLAY_OFF]);
	for (const mode of Array.isArray(object.modes) ? object.modes : []) {
		const name = textMember(mode, 'name');
		const modeCaption = textMember(mode, 'caption');
		if (name === '' || modeCaption === '' || names.has(name)) {
			warn(`[LayerView] picture overlay mode ignored: ${JSON.stringify(mode)}`);
			continue;
		}
		names.add(name);
		const uuid = textMember(mode, 'imageuuid').toLowerCase();
		modes.push({ name, caption: modeCaption, hint: textMember(mode, 'hint'), imageUUID: isPictureUUID(uuid) ? uuid : NULL_UUID });
	}
	if (modes.length === 0) {
		warn('[LayerView] picture overlay ignored, it declares no mode');
		return null;
	}

	const sizeX = numberMember(object, 'sizex');
	const sizeY = numberMember(object, 'sizey');
	const originX = numberMember(object, 'originx');
	const originY = numberMember(object, 'originy');
	let area: PictureOverlayArea | null = null;
	if (sizeX !== null && sizeY !== null && sizeX > 0 && sizeY > 0) area = { sizeX, sizeY, originX: originX ?? 0, originY: originY ?? 0 };
	else if (sizeX !== null || sizeY !== null) warn('[LayerView] picture overlay area ignored, it is empty; the platform is used');

	const initialMode = textMember(object, 'initialmode');
	return {
		name: textMember(object, 'name') || 'picture',
		caption,
		icon: textMember(object, 'icon'),
		title: textMember(object, 'title'),
		initialMode: names.has(initialMode) ? initialMode : PICTURE_OVERLAY_OFF,
		unavailableNote: textMember(object, 'unavailablenote') || `${caption} not available for this layer`,
		area,
		modes
	};
}

// The area the picture covers in toolpath coordinates: the declared one, or the platform (sizeX x sizeY mm whose lower
// left corner lies at -origin in toolpath coordinates).
export function pictureOverlayArea(overlay: PictureOverlay, platformSizeX: number, platformSizeY: number, platformOriginX: number, platformOriginY: number): PictureOverlayArea {
	if (overlay.area) return overlay.area;
	return { sizeX: platformSizeX, sizeY: platformSizeY, originX: -platformOriginX, originY: -platformOriginY };
}

// Menu and texts of the button. chosenMode null: nothing has been chosen yet, the initial mode of the declaration
// is in force; a chosen mode that the declaration no longer has falls back to it as well.
export function resolvePictureOverlayModes(overlay: PictureOverlay, chosenMode: string | null): PictureOverlayState {
	const declared = (mode: string | null) => mode === PICTURE_OVERLAY_OFF || overlay.modes.some((entry) => entry.name === mode);
	const mode = (chosenMode !== null && declared(chosenMode)) ? chosenMode : overlay.initialMode;
	const picture = overlay.modes.find((entry) => entry.name === mode) ?? null;

	const entries: PictureOverlayModeEntry[] = [
		{ mode: PICTURE_OVERLAY_OFF, caption: PICTURE_OVERLAY_OFF_CAPTION, hint: '', shown: mode === PICTURE_OVERLAY_OFF, available: true },
		...overlay.modes.map((entry) => ({
			mode: entry.name,
			caption: entry.caption,
			hint: entry.hint,
			shown: entry.name === mode,
			available: isPictureUUID(entry.imageUUID)
		}))
	];

	const available = picture !== null && isPictureUUID(picture.imageUUID);
	const caption = picture ? picture.caption : PICTURE_OVERLAY_OFF_CAPTION;
	const choose = `Click to choose ${entries.map((entry) => entry.caption).join(', ').replace(/, ([^,]*)$/, ' or $1')}`;
	const subject = overlay.caption.toLowerCase();
	let title: string;
	if (picture === null) title = `${overlay.title || `Show the ${subject} picture of the layer on the platform, below the other displays`}. ${choose}`;
	else if (available) title = `The ${subject} picture ${picture.caption.toLowerCase()} is shown below the other displays. ${choose}`;
	else title = `${overlay.unavailableNote}: there is no ${subject} picture ${picture.caption.toLowerCase()}. ${choose}`;

	return {
		mode,
		shown: picture !== null,
		available,
		imageUUID: available && picture ? picture.imageUUID : NULL_UUID,
		entries,
		captions: entries.map((entry) => entry.caption),
		caption,
		title
	};
}
