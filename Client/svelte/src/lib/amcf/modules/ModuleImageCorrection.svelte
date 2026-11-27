<script lang="ts">
	/*
	 * Image correction page: a menu of images, the view "Image Area Select" (the chosen image as it is stored, with the
	 * quadrilateral of four draggable corners), the view "Image Preview" (the platform with the corrected image, drawn
	 * by the picture overlay of the layer view, see LayerViewImpl.SetPictureOverlayImage) and the buttons Reset To Full
	 * Image, Reset To Defaults and Apply. A splitter sets the widths of the two views. See imageCorrection.ts for the
	 * declarations of the server.
	 */
	import { onDestroy, untrack } from 'svelte';
	import { useModuleTick } from '$lib/amcf/poll.svelte';
	import { theme } from '$lib/amcf/theme.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { NumericStepper } from '$lib/components/ui/numeric-stepper/index.js';
	// @ts-ignore
	import WebGLImpl from '@core/common/AMCImplementation_WebGL.js';
	// @ts-ignore
	import LayerViewImpl from '@core/common/AMCImplementation_LayerView.js';
	import {
		CORNERS, CORNER_KEYS, FULL_IMAGE_CORNERS, areaCorner, clampSplitWidth, cornerPoint, cornersAreValid, cornersEqual, fitTransform,
		imageMenuCaption, isFullImage, keepCentre, outwardDirection, parseCorners, parseCorrectionImages, pixelCornerText,
		platformCornerText, roundCorners, wheelZoomFactor, withCorner, zoomAround
	} from '$lib/amcf/imageCorrection';
	import type { CornerName, ImageCorners, Point, ViewTransform } from '$lib/amcf/imageCorrection';
	import {
		DEFAULT_OVERLAY_OPACITY, OVERLAY_OPACITY_MAX, OVERLAY_OPACITY_MIN, OVERLAY_OPACITY_STEP, clampOverlayOpacity, overlayOpacityFactor,
		parseOverlayOpacity
	} from '$lib/amcf/layerViewOverlayOpacity';

	let { module, app }: { module: any; app: any } = $props();
	const poll = useModuleTick(() => module);

	// Active elements of the corners: circles of 30 px.
	const VERTEX_RADIUS = 15;
	// Largest zoom of "Image Area Select": screen pixels per image pixel.
	const SELECT_MAX_SCALE = 16;
	// Largest zoom of the preview, as a multiple of the zoom that fits the platform into it.
	const PREVIEW_MAX_ZOOM = 32;
	// Narrowest view next to the splitter.
	const MINIMUM_VIEW_WIDTH = 200;
	const SPLITTER_WIDTH = 8;
	// Background of the preview, the default colors of the layer view (SMC Viewer).
	const PREVIEW_BACKGROUND_LIGHT = '#ffffff';
	const PREVIEW_BACKGROUND_DARK = '#1a1a2e';
	const NULL_UUID = '00000000-0000-0000-0000-000000000000';
	// Labels of the corners: the same font and box in both views.
	const LABEL_FONT = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
	const LABEL_HEIGHT = 20;
	const LABEL_PADDING = 5;

	let visible = $derived.by(() => { poll.v; return module.visible !== false; });
	let menuCaption = $derived.by(() => { poll.v; return String(module.menucaption ?? ''); });
	let selectCaption = $derived.by(() => { poll.v; return String(module.selectcaption ?? ''); });
	let previewCaption = $derived.by(() => { poll.v; return String(module.previewcaption ?? ''); });
	let pictureCaption = $derived.by(() => { poll.v; return String(module.picturecaption ?? ''); });
	let emptyNote = $derived.by(() => { poll.v; return String(module.emptynote ?? ''); });
	let errorNote = $derived.by(() => { poll.v; return String(module.errornote ?? ''); });
	let applyEvent = $derived.by(() => { poll.v; return String(module.applyevent ?? ''); });
	let platformSizeX = $derived.by(() => { poll.v; return Number(module.sizex) > 0 ? Number(module.sizex) : 300; });
	let platformSizeY = $derived.by(() => { poll.v; return Number(module.sizey) > 0 ? Number(module.sizey) : 300; });
	let platformOriginX = $derived.by(() => { poll.v; return Number(module.originx) || 0; });
	let platformOriginY = $derived.by(() => { poll.v; return Number(module.originy) || 0; });
	let buildPlateURL = $derived.by(() => {
		poll.v;
		if (!app) return '';
		const dark = String(module.dark_baseimageresource ?? '');
		const light = String(module.baseimageresource ?? '');
		const uuid = (theme.dark && dark && dark !== NULL_UUID) ? dark : light;
		return (uuid && uuid !== NULL_UUID) ? app.getImageURL(uuid) : '';
	});

	let imagesDeclaration = $derived.by(() => { poll.v; return String(module.images ?? ''); });
	let images = $derived(parseCorrectionImages(imagesDeclaration, (message) => console.warn(message)));
	let correctionDeclaration = $derived.by(() => { poll.v; return String(module.correction ?? ''); });
	let storedCorners = $derived(parseCorners(correctionDeclaration, (message) => console.warn(message)));

	// The image of the menu that is shown. A new list (the page opened again) starts with its first entry.
	let selectedIndex = $state(0);
	$effect(() => {
		images;
		untrack(() => { selectedIndex = 0; });
	});
	let selectedImage = $derived(images[selectedIndex] ?? null);
	let hasImages = $derived(images.length > 0);
	let menuItems = $derived(images.map((image, index) => ({ value: String(index), text: imageMenuCaption(image) })));

	// The corners being edited, and the stored ones they are compared with. After Apply the applied corners count as
	// stored until the server declares them. The corners follow the stored ones until the user moves or resets them.
	let corners = $state<ImageCorners>({ ...FULL_IMAGE_CORNERS });
	let cornersTouched = false;
	let appliedCorners = $state<ImageCorners | null>(null);
	let savedCorners = $derived(appliedCorners ?? storedCorners);
	let applying = $state(false);
	$effect(() => {
		const stored = storedCorners;
		untrack(() => {
			appliedCorners = null;
			if (!cornersTouched) corners = { ...stored };
		});
	});

	let canResetToFullImage = $derived(hasImages && !isFullImage(corners));
	let differsFromSaved = $derived(!cornersEqual(corners, savedCorners));
	let canResetToDefaults = $derived(hasImages && differsFromSaved && !applying);
	let canApply = $derived(hasImages && differsFromSaved && !applying && applyEvent !== '');

	// The chosen image as it is stored, for "Image Area Select" and the pixel coordinates of the corners.
	let loadedImage = $state<{ uuid: string; element: HTMLImageElement; width: number; height: number } | null>(null);
	let loadFailed = $state(false);
	$effect(() => {
		const image = selectedImage;
		if (!image || !app) {
			loadedImage = null;
			loadFailed = false;
			return;
		}

		const uuid = image.imageUUID;
		const element = new Image();
		let cancelled = false;
		loadFailed = false;
		element.onload = () => {
			if (cancelled) return;
			const width = element.naturalWidth || element.width;
			const height = element.naturalHeight || element.height;
			if (!(width > 0) || !(height > 0)) {
				loadedImage = null;
				loadFailed = true;
				return;
			}
			loadedImage = { uuid, element, width, height };
			fitSelectView();
		};
		element.onerror = () => {
			if (cancelled) return;
			console.warn(`[ImageCorrection] the image ${uuid} could not be loaded`);
			loadedImage = null;
			loadFailed = true;
		};
		element.src = app.getImageURL(uuid);
		return () => { cancelled = true; };
	});
	let imageShown = $derived(loadedImage !== null && selectedImage !== null && loadedImage.uuid === selectedImage.imageUUID);
	let selectNote = $derived(!hasImages ? emptyNote : (loadFailed ? errorNote : ''));

	/////////////////////////////////////////////////////////////////////////////////////
	// Layout: two views of equal width at first, the splitter keeps the fraction of the left one
	/////////////////////////////////////////////////////////////////////////////////////

	let bodyEl: HTMLDivElement | undefined = $state();
	let bodyWidth = $state(0);
	let splitFraction = $state(0.5);
	let splitDragging = $state(false);
	let leftWidth = $derived(clampSplitWidth((bodyWidth - SPLITTER_WIDTH) * splitFraction, bodyWidth - SPLITTER_WIDTH, MINIMUM_VIEW_WIDTH));

	$effect(() => {
		const element = bodyEl;
		if (!element) return;
		const observer = new ResizeObserver(() => { bodyWidth = element.clientWidth; });
		observer.observe(element);
		bodyWidth = element.clientWidth;
		return () => observer.disconnect();
	});

	function onSplitterPointerDown(event: PointerEvent) {
		if (event.button !== 0 || !bodyEl) return;
		event.preventDefault();
		splitDragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onSplitterPointerMove(event: PointerEvent) {
		if (!splitDragging || !bodyEl) return;
		const box = bodyEl.getBoundingClientRect();
		const available = box.width - SPLITTER_WIDTH;
		if (!(available > 0)) return;
		const left = clampSplitWidth(event.clientX - box.left - SPLITTER_WIDTH / 2, available, MINIMUM_VIEW_WIDTH);
		splitFraction = left / available;
	}

	function onSplitterPointerUp(event: PointerEvent) {
		if (!splitDragging) return;
		splitDragging = false;
		const target = event.currentTarget as HTMLElement;
		if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
	}

	/////////////////////////////////////////////////////////////////////////////////////
	// "Image Area Select": the stored image on a 2D canvas with the quadrilateral on top
	/////////////////////////////////////////////////////////////////////////////////////

	let selectEl: HTMLDivElement | undefined = $state();
	let selectCanvas: HTMLCanvasElement | undefined = $state();
	let selectSize = { width: 0, height: 0 };
	let selectView: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 };
	let selectFitScale = 1;
	let selectFitted = false;
	let activeCorner = $state<CornerName | null>(null);
	let hoverCorner = $state<CornerName | null>(null);
	let selectPanning = $state(false);
	let dragGrab: Point = { x: 0, y: 0 };
	let panStart: Point = { x: 0, y: 0 };
	let drawPending = false;

	function fitSelectView() {
		const image = loadedImage;
		if (!image || !(selectSize.width > 0) || !(selectSize.height > 0)) {
			selectFitted = false;
			return;
		}
		selectView = fitTransform(image.width, image.height, selectSize.width, selectSize.height);
		selectFitScale = selectView.scale;
		selectFitted = true;
		requestSelectDraw();
	}

	function cornerScreenPoint(name: CornerName): Point | null {
		const image = loadedImage;
		if (!image) return null;
		const point = cornerPoint(corners, name);
		return {
			x: selectView.offsetX + point.x * image.width * selectView.scale,
			y: selectView.offsetY + point.y * image.height * selectView.scale
		};
	}

	function requestSelectDraw() {
		if (drawPending) return;
		drawPending = true;
		requestAnimationFrame(() => {
			drawPending = false;
			drawSelect();
		});
	}

	let measureContext: CanvasRenderingContext2D | null = null;

	function labelWidth(text: string): number {
		if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
		if (!measureContext) return text.length * 7 + 2 * LABEL_PADDING;
		measureContext.font = LABEL_FONT;
		return Math.ceil(measureContext.measureText(text).width) + 2 * LABEL_PADDING;
	}

	// Box of the label of a corner: next to its circle on the side away from the quadrilateral, moved into the view
	// where the corner lies at its edge, so that it stays readable.
	function labelBox(text: string, point: Point, direction: Point, viewWidth: number, viewHeight: number) {
		const width = labelWidth(text);
		const anchor = { x: point.x + direction.x * (VERTEX_RADIUS + 4), y: point.y + direction.y * (VERTEX_RADIUS + 4) };
		const x = direction.x >= 0 ? anchor.x : anchor.x - width;
		const y = direction.y >= 0 ? anchor.y : anchor.y - LABEL_HEIGHT;
		return {
			x: Math.min(Math.max(x, 2), Math.max(2, viewWidth - width - 2)),
			y: Math.min(Math.max(y, 2), Math.max(2, viewHeight - LABEL_HEIGHT - 2)),
			width,
			height: LABEL_HEIGHT
		};
	}

	function drawLabel(context: CanvasRenderingContext2D, text: string, point: Point, direction: Point, width: number, height: number) {
		const box = labelBox(text, point, direction, width, height);
		context.font = LABEL_FONT;
		context.fillStyle = 'rgba(0, 0, 0, 0.72)';
		context.beginPath();
		context.roundRect(box.x, box.y, box.width, box.height, 4);
		context.fill();
		context.fillStyle = '#ffffff';
		context.textBaseline = 'middle';
		context.fillText(text, box.x + LABEL_PADDING, box.y + box.height / 2 + 0.5);
	}

	function drawSelect() {
		const canvas = selectCanvas;
		if (!canvas) return;
		const width = selectSize.width;
		const height = selectSize.height;
		const ratio = window.devicePixelRatio || 1;
		const pixelWidth = Math.max(1, Math.round(width * ratio));
		const pixelHeight = Math.max(1, Math.round(height * ratio));
		if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
		if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
		const context = canvas.getContext('2d');
		if (!context) return;
		// Zoom and position of the image, for tests and diagnostics.
		if (selectEl) selectEl.dataset.view = JSON.stringify(selectView);
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);

		const image = imageShown ? loadedImage : null;
		if (!image) return;

		// A reduced image is smoothed; a magnified one shows its pixels as they are stored.
		context.imageSmoothingEnabled = selectView.scale < 1;
		context.imageSmoothingQuality = 'high';
		context.drawImage(image.element, selectView.offsetX, selectView.offsetY, image.width * selectView.scale, image.height * selectView.scale);

		const points = CORNERS.map((corner) => cornerScreenPoint(corner.name) as Point);

		// Sides: dashed, light over a dark line, so that they show on light and dark images.
		context.setLineDash([8, 6]);
		for (const [color, lineWidth] of [['rgba(0, 0, 0, 0.7)', 4], ['#38bdf8', 2]] as const) {
			context.strokeStyle = color;
			context.lineWidth = lineWidth;
			context.beginPath();
			points.forEach((point, index) => (index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y)));
			context.closePath();
			context.stroke();
		}
		context.setLineDash([]);

		CORNERS.forEach((corner, index) => {
			const point = points[index];
			const highlighted = (activeCorner === corner.name) || (activeCorner === null && hoverCorner === corner.name);
			context.beginPath();
			context.arc(point.x, point.y, VERTEX_RADIUS, 0, Math.PI * 2);
			context.fillStyle = highlighted ? 'rgba(56, 189, 248, 0.45)' : 'rgba(56, 189, 248, 0.2)';
			context.fill();
			context.lineWidth = 3;
			context.strokeStyle = 'rgba(0, 0, 0, 0.7)';
			context.stroke();
			context.lineWidth = 1.5;
			context.strokeStyle = '#38bdf8';
			context.stroke();
			context.beginPath();
			context.arc(point.x, point.y, 2, 0, Math.PI * 2);
			context.fillStyle = '#38bdf8';
			context.fill();

			drawLabel(context, pixelCornerText(corner.name, corners, image.width, image.height), point, outwardDirection(points, index), width, height);
		});
	}

	// Redraws when the image, the corners or the note change.
	$effect(() => {
		corners;
		imageShown;
		loadedImage;
		activeCorner;
		hoverCorner;
		untrack(() => requestSelectDraw());
	});

	$effect(() => {
		const element = selectEl;
		if (!element) return;
		const observer = new ResizeObserver(() => {
			const width = element.clientWidth;
			const height = element.clientHeight;
			if (!(width > 0) || !(height > 0)) return;
			const old = selectSize;
			selectSize = { width, height };
			if (!selectFitted) fitSelectView();
			else if (old.width > 0 && old.height > 0) selectView = keepCentre(selectView, old.width, old.height, width, height);
			requestSelectDraw();
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	function localPoint(event: PointerEvent | WheelEvent, element: HTMLElement): Point {
		const box = element.getBoundingClientRect();
		return { x: event.clientX - box.left, y: event.clientY - box.top };
	}

	function cornerAt(point: Point): CornerName | null {
		let found: CornerName | null = null;
		let distance = VERTEX_RADIUS + 1;
		for (const corner of CORNERS) {
			const screen = cornerScreenPoint(corner.name);
			if (!screen) continue;
			const candidate = Math.hypot(screen.x - point.x, screen.y - point.y);
			if (candidate <= distance) {
				distance = candidate;
				found = corner.name;
			}
		}
		return found;
	}

	function onSelectPointerDown(event: PointerEvent) {
		if (event.button !== 0 || !selectEl || !imageShown) return;
		event.preventDefault();
		const point = localPoint(event, selectEl);
		const corner = cornerAt(point);
		selectEl.setPointerCapture(event.pointerId);
		if (corner) {
			const screen = cornerScreenPoint(corner) as Point;
			activeCorner = corner;
			dragGrab = { x: point.x - screen.x, y: point.y - screen.y };
		} else {
			selectPanning = true;
			panStart = point;
		}
	}

	function onSelectPointerMove(event: PointerEvent) {
		if (!selectEl) return;
		const point = localPoint(event, selectEl);
		const image = loadedImage;

		if (activeCorner && image) {
			// The corner stops at the edge of the image, and keeps its last position if the move would make the
			// quadrilateral concave, crossing or degenerate.
			const x = (point.x - dragGrab.x - selectView.offsetX) / (image.width * selectView.scale);
			const y = (point.y - dragGrab.y - selectView.offsetY) / (image.height * selectView.scale);
			const candidate = withCorner(corners, activeCorner, { x: Math.min(Math.max(x, 0), 1), y: Math.min(Math.max(y, 0), 1) });
			if (cornersAreValid(candidate) && !cornersEqual(candidate, corners)) {
				corners = candidate;
				cornersTouched = true;
			}
			return;
		}

		if (selectPanning) {
			selectView = { ...selectView, offsetX: selectView.offsetX + point.x - panStart.x, offsetY: selectView.offsetY + point.y - panStart.y };
			panStart = point;
			requestSelectDraw();
			return;
		}

		hoverCorner = imageShown ? cornerAt(point) : null;
	}

	function onSelectPointerUp(event: PointerEvent) {
		if (selectEl && selectEl.hasPointerCapture(event.pointerId)) selectEl.releasePointerCapture(event.pointerId);
		activeCorner = null;
		selectPanning = false;
	}

	function onSelectWheel(event: WheelEvent) {
		event.preventDefault();
		if (!selectEl || !imageShown) return;
		const point = localPoint(event, selectEl);
		// The smallest zoom shows the corners at the corners of the image completely.
		selectView = zoomAround(selectView, wheelZoomFactor(event.deltaY), point.x, point.y, selectFitScale / 2, Math.max(SELECT_MAX_SCALE, selectFitScale));
		requestSelectDraw();
	}

	let selectCursor = $derived(activeCorner ? 'grabbing' : (selectPanning ? 'grabbing' : (hoverCorner ? 'move' : (imageShown ? 'grab' : 'default'))));

	/////////////////////////////////////////////////////////////////////////////////////
	// "Image Preview": the platform with the corrected image, drawn like the SMC Viewer
	/////////////////////////////////////////////////////////////////////////////////////

	let previewEl: HTMLDivElement | undefined = $state();
	let glInstance: any = null;
	let previewViewer: any = null;
	let previewSize = { width: 0, height: 0 };
	let previewFitScale = 1;
	let previewReady = $state(false);
	let previewVersion = $state(0);
	let previewPanning = $state(false);
	let previewPanStart: Point = { x: 0, y: 0 };
	let previewPictureLoaded = $state(false);
	let previewPictureKey = '';
	let appliedPreviewTheme = '';
	let appliedPreviewPlate = '';

	let panelEl: HTMLDivElement | undefined = $state();
	let pictureOpacity = $state(DEFAULT_OVERLAY_OPACITY);
	let pictureOpacityText = $state<string | null>(null);

	function fitPreview() {
		if (!previewViewer || !(previewSize.width > 0) || !(previewSize.height > 0)) return;
		const fit = fitTransform(platformSizeX, platformSizeY, previewSize.width, previewSize.height);
		previewFitScale = fit.scale;
		// The plate spans 0..sizex and 0..sizey in plate coordinates; its lower left corner lies at (x, y) on screen.
		previewViewer.transform.scaling = fit.scale;
		previewViewer.transform.x = fit.offsetX;
		previewViewer.transform.y = fit.offsetY + platformSizeY * fit.scale;
		previewViewer.updateTransform();
		previewViewer.RenderScene(true);
	}

	function ensurePreview() {
		const element = previewEl;
		if (!element || !app) return;
		const width = element.clientWidth;
		const height = element.clientHeight;
		if (!(width > 0) || !(height > 0)) return;

		try {
			if (!glInstance) {
				glInstance = app.retrieveWebGLInstance(module.uuid);
				if (!glInstance) {
					glInstance = new WebGLImpl();
					app.storeWebGLInstance(module.uuid, glInstance);
				}
			}
			let first = false;
			if (!previewViewer) {
				// A stored instance still holds the picture of the last visit.
				glInstance.removeElement('pictureoverlay');
				previewViewer = new LayerViewImpl(glInstance, { grid: false });
				previewViewer.onTransformChanged = () => { previewVersion++; };
				first = true;
			}
			if (!element.contains(glInstance.renderer.domElement)) glInstance.setupDOMElement(element);
			previewSize = { width, height };
			previewViewer.updateSize(width, height);
			if (first) {
				previewViewer.setOrigin(platformOriginX, platformOriginY);
				previewViewer.setPictureOverlayOpacity(overlayOpacityFactor(pictureOpacity));
				fitPreview();
			}
			applyPreviewTheme();
			previewViewer.RenderScene(true);
			previewReady = true;
		} catch (error) {
			console.warn('[ImageCorrection] the preview could not be set up:', error);
		}
	}

	function applyPreviewTheme() {
		if (!previewViewer) return;
		const themeKey = theme.dark ? 'dark' : 'light';
		if (themeKey !== appliedPreviewTheme) {
			appliedPreviewTheme = themeKey;
			previewViewer.applyColors({ background: theme.dark ? PREVIEW_BACKGROUND_DARK : PREVIEW_BACKGROUND_LIGHT });
		}
		if (buildPlateURL !== appliedPreviewPlate) {
			appliedPreviewPlate = buildPlateURL;
			previewViewer.SetBuildPlateSVG(buildPlateURL || null);
			previewViewer.RenderScene(true);
		}
	}

	$effect(() => {
		theme.dark;
		buildPlateURL;
		if (!previewReady) return;
		untrack(() => applyPreviewTheme());
	});

	$effect(() => {
		const element = previewEl;
		if (!element) return;
		untrack(() => ensurePreview());
		const observer = new ResizeObserver(() => {
			const width = element.clientWidth;
			const height = element.clientHeight;
			if (!(width > 0) || !(height > 0)) return;
			if (!previewViewer || !glInstance?.renderer || !element.contains(glInstance.renderer.domElement)) {
				ensurePreview();
				return;
			}
			const old = previewSize;
			previewSize = { width, height };
			previewViewer.updateSize(width, height);
			if (old.width > 0 && old.height > 0) {
				// The point of the platform in the centre of the view stays there, at the same zoom.
				previewViewer.transform.x += (width - old.width) / 2;
				previewViewer.transform.y += (height - old.height) / 2;
				previewViewer.updateTransform();
			}
			previewViewer.RenderScene(true);
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	// The corrected picture of the chosen image; only the plate if there is none or it could not be loaded. A new image
	// loads its picture with the corners in force; moving the corners only moves them, see the next effect.
	$effect(() => {
		const image = selectedImage;
		const failed = loadFailed;
		if (!previewReady) return;
		untrack(() => {
			const key = (image && !failed) ? [image.imageUUID, image.area.sizeX, image.area.sizeY, image.area.originX, image.area.originY].join('|') : '';
			if (key === previewPictureKey) return;
			previewPictureKey = key;
			previewPictureLoaded = false;
			if (!image || failed) {
				previewViewer.SetPictureOverlayImage(null);
				return;
			}
			previewViewer.SetPictureOverlayImage(app.getImageURL(image.imageUUID), image.area.sizeX, image.area.sizeY, image.area.originX, image.area.originY,
				() => {
					if (previewPictureKey !== key) return;
					previewViewer.setPictureOverlayCorners({ ...corners });
					previewPictureLoaded = true;
				},
				(error: any) => {
					if (previewPictureKey !== key) return;
					console.warn(`[ImageCorrection] the preview of ${image.imageUUID} could not be loaded:`, error);
				},
				{ ...corners });
		});
	});

	$effect(() => {
		const current = { ...corners };
		if (!previewReady || !previewPictureLoaded) return;
		untrack(() => previewViewer.setPictureOverlayCorners(current));
	});

	$effect(() => {
		const opacity = overlayOpacityFactor(pictureOpacity);
		if (!previewReady) return;
		untrack(() => previewViewer.setPictureOverlayOpacity(opacity));
	});

	let pictureShown = $derived(previewPictureLoaded && imageShown);

	// Inactive markers in the corners of the area, with their toolpath coordinates.
	let previewMarkers = $derived.by(() => {
		previewVersion;
		const image = selectedImage;
		if (!pictureShown || !image || !previewViewer) return [];
		const points = CORNERS.map((corner) => {
			const point = areaCorner(image.area, corner.name);
			return previewViewer.machineToScreen(point.x + platformOriginX, point.y + platformOriginY) as Point;
		});
		// A label that the opacity panel would cover goes above the panel.
		const panel = panelEl ? { x: panelEl.offsetLeft, y: panelEl.offsetTop, width: panelEl.offsetWidth, height: panelEl.offsetHeight } : null;
		return CORNERS.map((corner, index) => {
			const text = platformCornerText(corner.name, image.area);
			const box = labelBox(text, points[index], outwardDirection(points, index), previewSize.width, previewSize.height);
			if (panel && box.x < panel.x + panel.width && box.x + box.width > panel.x && box.y < panel.y + panel.height && box.y + box.height > panel.y)
				box.y = Math.max(2, panel.y - box.height - 4);
			return { name: corner.name, x: points[index].x, y: points[index].y, labelX: box.x, labelY: box.y, text };
		});
	});

	function onPreviewPointerDown(event: PointerEvent) {
		if (event.button !== 0 || !previewEl || !previewViewer) return;
		event.preventDefault();
		previewEl.setPointerCapture(event.pointerId);
		previewPanning = true;
		previewPanStart = localPoint(event, previewEl);
	}

	function onPreviewPointerMove(event: PointerEvent) {
		if (!previewPanning || !previewEl || !previewViewer) return;
		const point = localPoint(event, previewEl);
		previewViewer.transform.x += point.x - previewPanStart.x;
		previewViewer.transform.y += point.y - previewPanStart.y;
		previewPanStart = point;
		previewViewer.updateTransform();
		previewViewer.RenderScene(true);
	}

	function onPreviewPointerUp(event: PointerEvent) {
		if (previewEl && previewEl.hasPointerCapture(event.pointerId)) previewEl.releasePointerCapture(event.pointerId);
		previewPanning = false;
	}

	function onPreviewWheel(event: WheelEvent) {
		event.preventDefault();
		if (!previewEl || !previewViewer) return;
		const point = localPoint(event, previewEl);
		const transform = previewViewer.transform;
		// The plate point under the mouse stays there; the zoom stays between half and 32 times the fitted one.
		const zoomed = zoomAround({ scale: transform.scaling, offsetX: transform.x, offsetY: transform.y }, wheelZoomFactor(event.deltaY), point.x, point.y,
			previewFitScale / 2, previewFitScale * PREVIEW_MAX_ZOOM);
		transform.scaling = zoomed.scale;
		transform.x = zoomed.offsetX;
		transform.y = zoomed.offsetY;
		previewViewer.updateTransform();
		previewViewer.RenderScene(true);
	}

	// The wheel zooms the views and does not scroll the page: the listeners must not be passive.
	$effect(() => {
		const select = selectEl;
		const preview = previewEl;
		select?.addEventListener('wheel', onSelectWheel, { passive: false });
		preview?.addEventListener('wheel', onPreviewWheel, { passive: false });
		return () => {
			select?.removeEventListener('wheel', onSelectWheel);
			preview?.removeEventListener('wheel', onPreviewWheel);
		};
	});

	function onPictureOpacitySliderInput(event: Event) {
		pictureOpacity = clampOverlayOpacity(Number((event.target as HTMLInputElement).value));
		pictureOpacityText = null;
	}

	function commitPictureOpacityText(text: string | null) {
		const value = text === null ? null : parseOverlayOpacity(text);
		if (value !== null) pictureOpacity = value;
		pictureOpacityText = null;
	}

	function onPictureOpacityKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitPictureOpacityText(pictureOpacityText);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			pictureOpacityText = null;
		}
	}

	/////////////////////////////////////////////////////////////////////////////////////
	// Buttons
	/////////////////////////////////////////////////////////////////////////////////////

	function onSelectImage(value: string) {
		const index = Number(value);
		if (Number.isInteger(index) && index >= 0 && index < images.length) selectedIndex = index;
	}

	function resetToFullImage() {
		corners = { ...FULL_IMAGE_CORNERS };
		cornersTouched = true;
	}

	function resetToDefaults() {
		corners = { ...savedCorners };
		cornersTouched = true;
	}

	// Sends the corners to the server, which checks and stores them. A failure is reported by the application; the
	// stored corners and the buttons stay as they were.
	function apply() {
		if (!canApply || !app) return;
		// The server keeps six decimals (a few thousandths of a pixel); the page goes on with what it stores.
		const applied = roundCorners(corners);
		if (!cornersAreValid(applied)) {
			app.showSnackBar('The corners cannot be saved: they lie too close together.', 'error', 8000);
			return;
		}
		const parameters: Record<string, number> = {};
		for (const key of CORNER_KEYS) parameters[key] = applied[key];
		applying = true;
		app.triggerUIEvent(applyEvent, String(module.platformuuid ?? ''), {},
			() => {
				applying = false;
				appliedCorners = applied;
				// Unless the corners were moved while the request ran, they become the stored ones.
				if (cornersEqual(roundCorners(corners), applied)) corners = { ...applied };
			},
			parameters,
			() => { applying = false; });
	}

	onDestroy(() => {
		if (previewViewer) {
			previewViewer.onTransformChanged = null;
			glInstance?.removeElement('pictureoverlay');
		}
		previewViewer = null;
	});
</script>

{#if visible}
	<!-- The data attributes report the state of the page, for tests and diagnostics. -->
	<div
		class="imagecorrection flex h-full min-h-0 w-full flex-col gap-3"
		data-image-correction={module.name ?? ''}
		data-corners={JSON.stringify(corners)}
		data-saved-corners={JSON.stringify(savedCorners)}
		data-image-size={imageShown && loadedImage ? `${loadedImage.width}x${loadedImage.height}` : ''}
		data-image-uuid={imageShown && loadedImage ? loadedImage.uuid : ''}
		data-picture-shown={pictureShown ? '1' : '0'}
	>
		<!-- Menu of the images, across the whole page -->
		<div class="flex w-full items-center gap-3">
			<Label class="shrink-0 whitespace-nowrap">{menuCaption}</Label>
			<Select.Root type="single" value={String(selectedIndex)} onValueChange={onSelectImage} disabled={!hasImages}>
				<Select.Trigger class="w-full min-w-0" data-image-menu>
					<span class="truncate">{hasImages ? (menuItems[selectedIndex]?.text ?? '') : ''}</span>
				</Select.Trigger>
				<Select.Content>
					{#each menuItems as item (item.value)}
						<Select.Item value={item.value}>{item.text}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<!-- The two views and the splitter between them -->
		<div class="flex min-h-0 w-full flex-1" bind:this={bodyEl} class:splitting={splitDragging}>
			<!-- The views appear once the width of the page is known, so that both fit their content at their final size. -->
			{#if bodyWidth > 0}
				<div
					class="imagecorrection-view relative h-full min-w-0 shrink-0 overflow-hidden rounded-md border bg-muted"
					style:width="{leftWidth}px"
					style:cursor={selectCursor}
					bind:this={selectEl}
					onpointerdown={onSelectPointerDown}
					onpointermove={onSelectPointerMove}
					onpointerup={onSelectPointerUp}
					onpointercancel={onSelectPointerUp}
					onpointerleave={() => { if (!activeCorner && !selectPanning) hoverCorner = null; }}
					role="application"
					aria-label={selectCaption}
					data-image-area-select
				>
					<canvas class="absolute inset-0 h-full w-full" bind:this={selectCanvas}></canvas>
					<div class="imagecorrection-title">{selectCaption}</div>
					{#if selectNote}
						<div class="imagecorrection-note" data-image-note>{selectNote}</div>
					{/if}
				</div>

				<div
					class="imagecorrection-splitter shrink-0"
					style:width="{SPLITTER_WIDTH}px"
					onpointerdown={onSplitterPointerDown}
					onpointermove={onSplitterPointerMove}
					onpointerup={onSplitterPointerUp}
					onpointercancel={onSplitterPointerUp}
					role="separator"
					aria-orientation="vertical"
					aria-label="Width of the views"
					data-image-splitter
				></div>

				<div class="relative h-full min-w-0 flex-1 overflow-hidden rounded-md border">
					<div
						class="imagecorrection-view absolute inset-0"
						style:cursor={previewPanning ? 'grabbing' : 'grab'}
						bind:this={previewEl}
						onpointerdown={onPreviewPointerDown}
						onpointermove={onPreviewPointerMove}
						onpointerup={onPreviewPointerUp}
						onpointercancel={onPreviewPointerUp}
						role="application"
						aria-label={previewCaption}
						data-image-preview
					></div>
					{#each previewMarkers as marker (marker.name)}
						<div class="imagecorrection-marker" style:left="{marker.x}px" style:top="{marker.y}px" data-preview-marker={marker.name}></div>
						<div
							class="imagecorrection-label"
							style:left="{marker.labelX}px"
							style:top="{marker.labelY}px"
						>{marker.text}</div>
					{/each}
					<div class="imagecorrection-title">{previewCaption}</div>
					{#if pictureShown}
						<div class="imagecorrection-panel" bind:this={panelEl}>
							<div class="layerview-legend" data-picture-panel role="group" aria-label={`${pictureCaption} picture`}>
								<div class="layerview-legend-header">
									<span class="layerview-legend-title">{pictureCaption}</span>
								</div>
								<div
									class="layerview-legend-opacity"
									role="group"
									aria-label={`Opacity of the ${pictureCaption.toLowerCase()} picture`}
									title={`Opacity of the ${pictureCaption.toLowerCase()} picture in this preview: at 100 % it is drawn as it is, at 0 % it cannot be seen and the platform shows`}
									data-picture-opacity
								>
									<span class="layerview-legend-opacity-label">Opacity</span>
									<input
										type="range"
										class="layerview-legend-opacity-slider"
										min={OVERLAY_OPACITY_MIN}
										max={OVERLAY_OPACITY_MAX}
										step={OVERLAY_OPACITY_STEP}
										value={pictureOpacity}
										oninput={onPictureOpacitySliderInput}
										aria-label={`Opacity of the ${pictureCaption.toLowerCase()} picture`}
										aria-valuetext={`${pictureOpacity} %`}
									/>
									<NumericStepper
										value={pictureOpacityText ?? String(pictureOpacity)}
										min={OVERLAY_OPACITY_MIN}
										max={OVERLAY_OPACITY_MAX}
										step={OVERLAY_OPACITY_STEP}
										ariaLabel={`Opacity of the ${pictureCaption.toLowerCase()} picture in percent`}
										class="h-6 w-14 shrink-0 text-foreground"
										oninput={(text: string) => (pictureOpacityText = text)}
										onvaluechange={(text: string) => commitPictureOpacityText(text)}
										onblur={() => commitPictureOpacityText(pictureOpacityText)}
										onkeydown={onPictureOpacityKeyDown}
									/>
									<span class="layerview-stepper-unit">%</span>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Buttons at the bottom right -->
		<div class="flex w-full justify-end gap-2">
			<Button variant="outline" disabled={!canResetToFullImage} onclick={resetToFullImage} data-reset-full-image>Reset To Full Image</Button>
			<Button variant="outline" disabled={!canResetToDefaults} onclick={resetToDefaults} data-reset-defaults>Reset To Defaults</Button>
			<Button disabled={!canApply} onclick={apply} data-apply>Apply</Button>
		</div>
	</div>
{/if}

<style>
	.imagecorrection-view {
		touch-action: none;
		user-select: none;
	}
	.imagecorrection-view :global(canvas) {
		display: block;
	}
	.imagecorrection-splitter {
		cursor: col-resize;
		touch-action: none;
		display: flex;
		align-items: stretch;
		justify-content: center;
	}
	.imagecorrection-splitter::after {
		content: '';
		width: 2px;
		margin: 8px 0;
		border-radius: 1px;
		background: var(--border, #d4d4d8);
	}
	.imagecorrection-splitter:hover::after,
	.splitting .imagecorrection-splitter::after {
		background: var(--primary, #2563eb);
	}
	.splitting {
		cursor: col-resize;
		user-select: none;
	}
	/* Name of the view in its top left corner. */
	.imagecorrection-title {
		position: absolute;
		left: 8px;
		top: 8px;
		padding: 2px 8px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.72);
		color: white;
		font-size: 12px;
		font-weight: 600;
		pointer-events: none;
		z-index: 2;
	}
	.imagecorrection-note {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		text-align: center;
		color: var(--muted-foreground, #71717a);
		font-size: 14px;
		pointer-events: none;
	}
	/* Inactive markers in the corners of the area of the preview, like the corners of "Image Area Select". */
	.imagecorrection-marker {
		position: absolute;
		width: 30px;
		height: 30px;
		margin: -15px 0 0 -15px;
		border-radius: 50%;
		border: 1.5px solid #38bdf8;
		background: rgba(56, 189, 248, 0.2);
		box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.7);
		pointer-events: none;
		z-index: 1;
	}
	.imagecorrection-label {
		position: absolute;
		box-sizing: border-box;
		height: 20px;
		padding: 2px 5px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.72);
		color: white;
		font: 12px system-ui, -apple-system, 'Segoe UI', sans-serif;
		line-height: 16px;
		white-space: nowrap;
		pointer-events: none;
		z-index: 1;
	}
	/* Opacity panel in the bottom left corner, like the Camera panel of the layer view. */
	.imagecorrection-panel {
		position: absolute;
		left: 8px;
		bottom: 8px;
		width: 260px;
		z-index: 3;
	}
	.layerview-legend {
		position: relative;
		padding: 6px 8px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.72);
		color: white;
		font-size: 11px;
	}
	.layerview-legend-header {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 0;
	}
	.layerview-legend-title {
		flex: 1;
		min-width: 0;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.layerview-legend-opacity {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 5px;
	}
	.layerview-legend-opacity-label {
		flex: none;
		font-weight: 600;
	}
	.layerview-legend-opacity-slider {
		flex: 1;
		min-width: 0;
		margin: 0;
		accent-color: var(--primary, #2563eb);
	}
	.layerview-stepper-unit {
		color: rgba(255, 255, 255, 0.75);
	}
	.layerview-legend-opacity :global([data-numeric-stepper] input) {
		padding: 0 6px;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
</style>
