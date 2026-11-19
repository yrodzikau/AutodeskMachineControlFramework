<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { useModuleTick } from '$lib/amcf/poll.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import Square from '@lucide/svelte/icons/square';
	import Shapes from '@lucide/svelte/icons/shapes';
	import ZoomIn from '@lucide/svelte/icons/zoom-in';
	import Axis3d from '@lucide/svelte/icons/axis-3d';
	import Tags from '@lucide/svelte/icons/tags';
	import Info from '@lucide/svelte/icons/info';
	import ZapOff from '@lucide/svelte/icons/zap-off';
	import Route from '@lucide/svelte/icons/route';
	import SkipBack from '@lucide/svelte/icons/skip-back';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import Play from '@lucide/svelte/icons/play';
	import Paintbrush from '@lucide/svelte/icons/paintbrush';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Spline from '@lucide/svelte/icons/spline';
	import Layers from '@lucide/svelte/icons/layers';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Crosshair from '@lucide/svelte/icons/crosshair';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import Target from '@lucide/svelte/icons/target';
	import MdiIcon from '$lib/amcf/MdiIcon.svelte';
	// @ts-ignore — core JS has no type declarations yet
	import WebGLImpl from '@core/common/AMCImplementation_WebGL.js';
	// @ts-ignore
	import LayerViewImpl from '@core/common/AMCImplementation_LayerView.js';
	// @ts-ignore
	import { COLORMAP_PRESETS, DEFAULT_COLORMAP, colorMapCSSGradient } from '@core/common/AMCImplementation_ColorMaps.js';

	const ZOOM_MARGIN = 10;
	// Smaller selections are treated as accidental clicks and do not zoom.
	const MIN_ZOOM_SELECTION_PX = 5;
	const PART_MARKER_PX = 5;
	const NULL_UUID = '00000000-0000-0000-0000-000000000000';
	const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	// Scatter plot channel and its columns: laseron and power can be coloured by, the others feed
	// the point inspector and the time slider.
	const POINT_CHANNEL = 'laser';
	const POINT_CHANNEL_COLUMNS = ['laseron', 'power', 'time', 'targetx', 'targety', 'actualx', 'actualy'];
	const POINT_PICK_TOLERANCE_PX = 4;
	const SUPPORT_POINT_PICK_TOLERANCE_PX = 3;
	const POPUP_PART_NAME_MAX_CHARACTERS = 28;
	const POWER_MODE_CAPTIONS: Record<string, string> = {
		'': 'Nominal',
		constant: 'Constant',
		linear: 'Linear',
		nonlinear: 'Non-linear'
	};
	const TIME_SLIDER_STEPS = 1000;
	const TIMING_SOURCE_CAPTIONS: Record<string, string> = {
		recording: 'aligned to recording',
		'recording-approximate': 'approx. aligned to recording',
		estimate: 'estimated from laser speed'
	};
	// Display modes of the toolpath; the recorded points follow the same mode. Off hides the recorded points and
	// draws the toolpath in its profile colors.
	const TOOLPATH_COLOR_MODES = [
		{ mode: 'color', caption: 'Color' },
		{ mode: 'type', caption: 'Type' },
		{ mode: 'time', caption: 'Time' },
		{ mode: 'power', caption: 'Power' },
		{ mode: 'velocity', caption: 'Velocity' },
		{ mode: 'laseron', caption: 'Laser On' },
		{ mode: 'off', caption: 'Off' }
	];
	const POINTS_OFF_MODE = 'off';
	const LASER_ON_MODE = 'laseron';
	// Recorded points with two positions per sample (platform.scatterplotpositions and secondaryscatterplotuuid):
	// the target positions the scanner was commanded to and the status positions it reported. In the display mode
	// Laser On each is drawn as a circle in the color of the laser state of its sample, filled with the same color
	// if fill is on; the other display modes draw the points as before.
	type SpotRole = 'target' | 'status';
	type SpotStyle = { onColor: string; offColor: string; size: number; fill: boolean };
	type SpotColorKey = 'onColor' | 'offColor';
	type SpotSetMode = 'target' | 'status' | 'both';
	const SPOT_ROLES: SpotRole[] = ['target', 'status'];
	const SPOT_ROLE_CAPTIONS: Record<SpotRole, string> = { target: 'Target X/Y', status: 'Status X/Y' };
	const SPOT_ROLE_DESCRIPTIONS: Record<SpotRole, string> = {
		target: 'positions the scanner was commanded to',
		status: 'positions the scanner reported'
	};
	const SPOT_SET_MODES: { mode: SpotSetMode; caption: string }[] = [
		{ mode: 'target', caption: 'Target X/Y' },
		{ mode: 'status', caption: 'Status X/Y' },
		{ mode: 'both', caption: 'Target vs Status' }
	];
	const SPOT_SIZE_MIN = 1;
	const SPOT_SIZE_MAX = 32;
	// Red and blue are the colors the display mode Laser On has always used for laser on and off.
	const SPOT_LASER_ON_COLOR = '#e53935';
	const SPOT_LASER_OFF_COLOR = '#1e88e5';
	const SPOT_DEFAULT_STYLES: Record<SpotRole, SpotStyle> = {
		target: { onColor: SPOT_LASER_ON_COLOR, offColor: SPOT_LASER_OFF_COLOR, size: 10, fill: false },
		status: { onColor: SPOT_LASER_ON_COLOR, offColor: SPOT_LASER_OFF_COLOR, size: 6, fill: true }
	};
	const SPOT_COLOR_KEYS: SpotColorKey[] = ['onColor', 'offColor'];
	const SPOT_COLOR_CAPTIONS: Record<SpotColorKey, string> = { onColor: 'Laser on', offColor: 'Laser off' };
	const SPOT_COLOR_PRESETS: { color: string; caption: string }[] = [
		{ color: SPOT_LASER_ON_COLOR, caption: 'Red' },
		{ color: SPOT_LASER_OFF_COLOR, caption: 'Blue' },
		{ color: '#00d0ff', caption: 'Cyan' },
		{ color: '#ff9100', caption: 'Orange' },
		{ color: '#ff00ff', caption: 'Magenta' },
		{ color: '#ffd600', caption: 'Yellow' },
		{ color: '#00e676', caption: 'Green' },
		{ color: '#ffffff', caption: 'White' },
		{ color: '#000000', caption: 'Black' }
	];
	type LegendMode = 'time' | 'power' | 'velocity';
	const LEGEND_MODES: Record<LegendMode, { title: string; unit: string; resetTitle: string }> = {
		time: { title: 'Start time', unit: 'ms', resetTitle: 'Reset the range to the layer timeline' },
		power: { title: 'Laser power', unit: 'W', resetTitle: 'Reset the range to the configured or build laser power range' },
		velocity: { title: 'Velocity', unit: 'mm/s', resetTitle: 'Reset the range to the laser speeds of the layer' }
	};
	type ColorRange = { min: number; max: number };
	type ColorMapPreset = { name: string; caption: string };

	let { module, app }: { module: any; app: any } = $props();
	const poll = useModuleTick(() => module);

	let visible = $derived.by(() => { poll.v; return module.visible !== false; });
	let cardstyle = $derived.by(() => { poll.v; return module.cardstyle || 'none'; });
	let isCard = $derived(cardstyle === 'elevated' || cardstyle === 'outlined' || cardstyle === 'tinted');
	let cardTitle = $derived.by(() => { poll.v; return module.title || ''; });
	let cardSubtitle = $derived.by(() => { poll.v; return module.subtitle || ''; });
	let containerEl: HTMLDivElement | undefined = $state(undefined);
	let glInstance: any = $state(null);
	let layerViewer: any = $state(null);
	let initialized = $state(false);

	type CoordinateTransform = readonly [
		angleDegrees: number,
		rotationCenterX: number,
		rotationCenterY: number,
		translationX: number,
		translationY: number
	];
	let platform = $derived.by(() => { poll.v; return module.platform || null; });
	let layerCount = $derived.by(() => { poll.v; return platform?.layercount || 0; });
	let transformAngle = $derived.by(() => { poll.v; return Number(platform?.transformangle) || 0; });
	let rotationCenterX = $derived.by(() => { poll.v; return Number(platform?.rotationcenterx) || 0; });
	let rotationCenterY = $derived.by(() => { poll.v; return Number(platform?.rotationcentery) || 0; });
	let translationX = $derived.by(() => { poll.v; return Number(platform?.translationx) || 0; });
	let translationY = $derived.by(() => { poll.v; return Number(platform?.translationy) || 0; });
	let coordinateTransform = $derived([
		transformAngle,
		rotationCenterX,
		rotationCenterY,
		translationX,
		translationY
	] as CoordinateTransform);
	let labelCaption = $derived.by(() => {
		poll.v;
		return platform?.labelvisible ? String(platform.labelcaption || '') : '';
	});
	let labelIcon = $derived.by(() => {
		poll.v;
		return platform?.labelvisible ? String(platform.labelicon || '') : '';
	});
	let sliderFixed = $derived.by(() => { poll.v; return !!platform?.sliderfixed; });

	// Scatter plot (platform.scatterplotuuid) drawn as points on top of the toolpath.
	let pointsLoaded = $state(false);
	let pointColumns = $state.raw<string[]>([]);
	let showLaserOffPoints = $state(false);
	let toolpathVisible = $state(true);
	let pointLoadCounter = 0;

	// Display mode of the toolpath and the recorded points. Power, time and velocity are mapped onto
	// a color map; the legend in the bottom left corner selects the map and the value range.
	let toolpathColorMode = $state('color');
	let toolpathColorCaption = $derived(
		TOOLPATH_COLOR_MODES.find((entry) => entry.mode === toolpathColorMode)?.caption ?? 'Color'
	);
	let pointsEnabled = $derived(toolpathColorMode !== POINTS_OFF_MODE);
	let pointsShown = $derived(pointsLoaded && pointsEnabled);

	// Positions of the loaded scatter plot as the server reported them with it (empty: not specified, the points are
	// drawn as before), and the scatter plot of the same samples at the other positions, which is only downloaded
	// when the spot mode shows them.
	let primaryRole = $state<SpotRole | ''>('');
	let secondaryRole = $derived<SpotRole | ''>(primaryRole === 'target' ? 'status' : (primaryRole === 'status' ? 'target' : ''));
	let secondaryUUID = $state(NULL_UUID);
	let secondaryPointsLoaded = $state(false);
	let loadingSecondaryPoints = $state(false);
	let requestedSecondaryUUID = NULL_UUID;
	let spotSetMode = $state<SpotSetMode>('status');
	let spotStyles = $state<Record<SpotRole, SpotStyle>>({
		target: { ...SPOT_DEFAULT_STYLES.target },
		status: { ...SPOT_DEFAULT_STYLES.status }
	});
	let spotColorMenu = $state<{ role: SpotRole; key: SpotColorKey } | null>(null);
	// Target and Status spots exist in the display mode Laser On, for points whose positions the server named.
	let spotsActive = $derived(pointsShown && toolpathColorMode === LASER_ON_MODE && primaryRole !== '');
	// Positions this layer has: the loaded points and the offered secondary points, loaded or not.
	let spotRoleAvailable = $derived<Record<SpotRole, boolean>>({
		target: pointsLoaded && (primaryRole === 'target' || (secondaryRole === 'target' && isValidUUID(secondaryUUID))),
		status: pointsLoaded && (primaryRole === 'status' || (secondaryRole === 'status' && isValidUUID(secondaryUUID)))
	});
	let spotSetChoosable = $derived(spotsActive && spotRoleAvailable.target && spotRoleAvailable.status);
	// Positions the spots are drawn at: the chosen ones, or the only ones the layer has.
	let spotRoleShown = $derived<Record<SpotRole, boolean>>({
		target: spotsActive && spotRoleAvailable.target && (spotSetMode !== 'status' || !spotRoleAvailable.status),
		status: spotsActive && spotRoleAvailable.status && (spotSetMode !== 'target' || !spotRoleAvailable.target)
	});
	let shownSpotRoles = $derived(SPOT_ROLES.filter((role) => spotRoleShown[role]));
	let secondaryPointsWanted = $derived(secondaryRole !== '' && spotRoleShown[secondaryRole]);
	// The spot button keeps its place in a toolbar that does not move (see toolbarFixed) and is shown while the
	// layer has points with known positions otherwise.
	let spotSetButtonCaption = $derived.by(() => {
		if (spotSetChoosable || !spotsActive) return SPOT_SET_MODES.find((entry) => entry.mode === spotSetMode)?.caption ?? '';
		return shownSpotRoles.length === 1 ? SPOT_ROLE_CAPTIONS[shownSpotRoles[0]] : '';
	});
	let spotSetButtonIconMode = $derived<SpotSetMode>(
		spotSetChoosable || !spotsActive ? spotSetMode : (shownSpotRoles.length === 1 ? shownSpotRoles[0] : spotSetMode)
	);
	let spotSetButtonTitle = $derived.by(() => {
		if (spotSetChoosable)
			return 'Choose the positions the laser spots are drawn at: Target X/Y (commanded), Status X/Y (reported by the scanner) or both. Click steps through them';
		if (!pointsLoaded) return 'This layer has no recorded points';
		if (!pointsEnabled) return 'The laser spots are hidden by the display mode Off';
		if (toolpathColorMode !== LASER_ON_MODE) return 'Target X/Y and Status X/Y are chosen in the display mode Laser On';
		if (shownSpotRoles.length === 1) return `This layer has only ${SPOT_ROLE_CAPTIONS[shownSpotRoles[0]]} positions`;
		return 'This layer has no recorded points with known positions';
	});
	let endPointsVisible = $state(false);
	let colorMapName = $state(DEFAULT_COLORMAP);
	let colorMapInverted = $state(false);
	let colorMapMenuOpen = $state(false);
	let colorMapPresets = COLORMAP_PRESETS as ColorMapPreset[];
	// Laser power range of the build profiles, sent with every toolpath layer.
	let buildPowerRange = $state.raw<ColorRange | null>(null);
	let layerPowerRange = $state.raw<ColorRange | null>(null);
	let layerVelocityRange = $state.raw<ColorRange | null>(null);
	// Ranges edited in the legend; null follows the default range.
	let editedPowerRange = $state.raw<ColorRange | null>(null);
	let editedTimeRange = $state.raw<ColorRange | null>(null);
	let editedVelocityRange = $state.raw<ColorRange | null>(null);
	let configuredPowerRange = $derived.by((): ColorRange | null => {
		poll.v;
		if (!platform) return null;
		const minText = String(platform.powerrangemin ?? '').trim();
		const maxText = String(platform.powerrangemax ?? '').trim();
		const minimum = Number(minText);
		const maximum = Number(maxText);
		if (minText === '' || maxText === '' || !Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return null;
		return { min: minimum, max: maximum };
	});
	let defaultPowerRange = $derived.by((): ColorRange => {
		if (configuredPowerRange) return configuredPowerRange;
		return rangeFromZeroIfSingle(buildPowerRange ?? layerPowerRange);
	});
	let defaultTimeRange = $derived<ColorRange>({ min: 0, max: timelineDuration > 0 ? timelineDuration : 1 });
	let defaultVelocityRange = $derived(rangeFromZeroIfSingle(layerVelocityRange));
	let colorRanges = $derived<Record<LegendMode, ColorRange>>({
		power: editedPowerRange ?? defaultPowerRange,
		time: editedTimeRange ?? defaultTimeRange,
		velocity: editedVelocityRange ?? defaultVelocityRange
	});
	let editedRanges = $derived<Record<LegendMode, ColorRange | null>>({
		power: editedPowerRange,
		time: editedTimeRange,
		velocity: editedVelocityRange
	});
	let legendMode = $derived(toolpathColorMode in LEGEND_MODES ? (toolpathColorMode as LegendMode) : null);

	// Overlay: a scalar field image over the platform (for example a heat map of the layer), drawn through a color
	// map by the GPU, see WebGLScalarImageElement. The toolbar button named by platform.overlayname shows it below
	// the toolpath and the recorded points; a legend of its own then edits the color map and the value range of the
	// overlay. The button has three states that a click steps through: off, pixels (every pixel of the image is a
	// sharp square when the view is zoomed in) and smooth (the view interpolates between the pixels).
	let overlayName = $derived.by(() => { poll.v; return String(platform?.overlayname || '').trim(); });
	let overlayIcon = $derived.by(() => { poll.v; return String(platform?.overlayicon || '').trim(); });
	let overlayCaption = $derived.by(() => { poll.v; return String(platform?.overlaycaption || '').trim(); });
	let overlayNote = $derived.by(() => { poll.v; return String(platform?.overlaynote || '').trim(); });
	// Values of the codes 0 and 65535 of the overlay image, also the default range of its legend.
	let overlayValueRange = $derived.by((): ColorRange => { poll.v; return readOverlayValueRange(platform); });
	type OverlayState = 'off' | 'pixels' | 'smooth';
	let overlayState = $state<OverlayState>('off');
	let overlayMode = $derived(overlayState !== 'off');
	// False if the browser cannot filter the overlay texture; the button then has the states off and pixels only.
	let overlaySmoothingSupported = $state(false);
	let overlayStateCaption = $derived(overlayState === 'smooth' ? 'Smooth' : (overlayState === 'pixels' ? 'Pixels' : ''));
	let overlayButtonTitle = $derived.by(() => {
		const name = overlayName.toLowerCase();
		const steps = overlaySmoothingSupported ? 'off, pixels, smooth' : 'off, pixels (this browser cannot smooth the image)';
		if (overlayState === 'off') return `Show the ${name} of the layer on the platform, below the toolpath and the recorded points. Click steps through ${steps}`;
		if (overlayState === 'pixels') return `The ${name} is shown with every pixel as a square. Click steps through ${steps}`;
		return `The ${name} is shown smoothed between its pixels. Click steps through ${steps}`;
	});
	// Overlay image of the current layer as the server reports it; the null UUID means none.
	let overlayUUID = $state(NULL_UUID);
	let overlayAvailable = $derived(isValidUUID(overlayUUID));
	let overlayShown = $derived(overlayMode && overlayAvailable);
	let loadingOverlay = $state(false);
	let editedOverlayRange = $state.raw<ColorRange | null>(null);
	let overlayRange = $derived(editedOverlayRange ?? overlayValueRange);
	let overlayColorMapName = $state(DEFAULT_COLORMAP);
	let overlayColorMapInverted = $state(false);

	// A layer view with an overlay button keeps the buttons of its toolbar in place: a button that has nothing to
	// act on is disabled and grey instead of removed, so the toolbar does not move under the pointer while the
	// overlay button is clicked through its states.
	let toolbarFixed = $derived(overlayName !== '');
	let laserOffPresent = $derived(pointsLoaded && pointColumns.includes('laseron'));
	let laserOffAvailable = $derived(laserOffPresent && pointsEnabled);
	// A hidden toolpath can always be shown again, also where there is nothing else to see.
	let toolpathToggleAvailable = $derived(pointsShown || overlayShown || !toolpathVisible);

	// Legends in the bottom left corner: one of the overlay while it is shown and one of the color map display modes
	// of the toolpath and the recorded points, which are drawn over the overlay. Spot panels stand above them.
	type LegendKind = 'toolpath' | 'overlay';
	type LegendInfo = {
		title: string;
		// Lower-case description of the value for the labels of the range fields.
		valueLabel: string;
		colorMapName: string;
		colorMapInverted: boolean;
		colorMapCaption: string;
		gradient: string;
		range: ColorRange;
		rangeEdited: boolean;
		resetTitle: string;
		note: string;
	};
	let shownLegends = $derived<LegendKind[]>([
		...((legendMode !== null && (toolpathVisible || pointsShown)) ? ['toolpath' as const] : []),
		...(overlayShown ? ['overlay' as const] : [])
	]);
	let colorMapMenuKind = $state<LegendKind | null>(null);
	let bottomLeftVisible = $derived(shownLegends.length > 0 || shownSpotRoles.length > 0);

	function describeLegend(kind: LegendKind): LegendInfo {
		if (kind === 'overlay') {
			const caption = overlayCaption || overlayName;
			return {
				title: caption,
				valueLabel: caption.toLowerCase(),
				colorMapName: overlayColorMapName,
				colorMapInverted: overlayColorMapInverted,
				colorMapCaption: colorMapPresets.find((preset) => preset.name === overlayColorMapName)?.caption ?? '',
				gradient: colorMapCSSGradient(overlayColorMapName, overlayColorMapInverted),
				range: overlayRange,
				rangeEdited: editedOverlayRange !== null,
				resetTitle: 'Reset the range to the value range of the image',
				note: overlayNote
			};
		}
		const mode = legendMode;
		return {
			title: mode ? `${LEGEND_MODES[mode].title} [${LEGEND_MODES[mode].unit}]` : '',
			valueLabel: mode ? `${LEGEND_MODES[mode].title.toLowerCase()} in ${LEGEND_MODES[mode].unit}` : '',
			colorMapName: colorMapName,
			colorMapInverted: colorMapInverted,
			colorMapCaption: colorMapPresets.find((preset) => preset.name === colorMapName)?.caption ?? '',
			gradient: colorMapCSSGradient(colorMapName, colorMapInverted),
			range: mode ? colorRanges[mode] : { min: 0, max: 1 },
			rangeEdited: mode ? editedRanges[mode] !== null : false,
			resetTitle: mode ? LEGEND_MODES[mode].resetTitle : '',
			note: (mode === 'power' && pointsShown && pointColumns.includes('power')) ? 'Recorded points: raw power, layer minimum to maximum' : ''
		};
	}
	// Compared as a string so the calibration is only re-applied when a value changes.
	let pointSizeCalibrationKey = $derived.by(() => {
		poll.v;
		if (!platform) return '';
		return [platform.pointsizebase, platform.pointsizefactor, platform.pointsizemin, platform.pointsizemax].join('|');
	});

	// Time slider: caps toolpath and points at a fraction of the layer timeline.
	let showTimeSlider = $derived.by(() => { poll.v; return Boolean(platform?.showtimeslider); });
	let timeSliderValue = $state(TIME_SLIDER_STEPS);
	let timelineDuration = $state(0);
	let timingSource = $state('none');
	let timingMatchRatio = $state(0);
	let timingSourceCaption = $derived.by(() => {
		const caption = TIMING_SOURCE_CAPTIONS[timingSource] ?? '';
		if (timingSource !== 'recording') return caption;
		return `${caption} (${(timingMatchRatio * 100).toFixed(0)}% of vectors matched, rest interpolated)`;
	});
	let timeCapCaption = $derived.by(() => {
		const capTime = (timeSliderValue / TIME_SLIDER_STEPS) * timelineDuration;
		const percent = (timeSliderValue / TIME_SLIDER_STEPS) * 100;
		return `${capTime.toFixed(1)} / ${timelineDuration.toFixed(1)} ms (${percent.toFixed(1)}%)`;
	});

	let sliderValue = $state(0);
	// Written by the follow-server effect; only a changed server layer moves the slider.
	let lastServerLayer: number | null = null;
	let draggingSlider = false;
	let loadingLayer = $state(false);
	let loadingPoints = $state(false);
	// Plain tooltip with the point or toolpath segment under the mouse. Always on, unlike the
	// "Properties" inspector, which replaces it while active.
	let hoverInfo = $state({ visible: false, text: '', x: 0, y: 0, flipX: false, flipY: false });
	let appliedColorTheme = $state('');
	let coordinateSystemOverride: boolean | null = $state(null);
	let coordinateSystemVisible = $derived.by(() => {
		poll.v;
		return coordinateSystemOverride ?? Boolean(platform?.showcoordinatesystem);
	});
	let appliedCoordinateTransform: CoordinateTransform | null = null;
	// While true, the view keeps framing the platform whenever the viewport or the
	// platform geometry changes. Cleared once the user pans or zooms; set again by
	// the "Zoom to Platform" button.
	let autoFrame = true;
	let platformFrameKey = $derived.by(() => {
		poll.v;
		return platform
			? [platform.sizex, platform.sizey, platform.originx, platform.originy, platform.paddingx, platform.paddingy].join('|')
			: '';
	});

	$effect(() => {
		platformFrameKey;
		if (!initialized || !autoFrame) return;
		untrack(() => resetView());
	});

	// Follow the layer of the server, unless the slider is being dragged. Only a changed server value
	// is applied, so the slider does not jump back while a layer change is still being processed.
	$effect(() => {
		poll.v;
		if (!platform) return;
		const serverLayer = platform.currentlayer || 0;
		if (serverLayer !== lastServerLayer) {
			lastServerLayer = serverLayer;
			if (!draggingSlider)
				sliderValue = serverLayer;
		}
	});

	function isValidUUID (uuid: string): boolean {
		return !!uuid && (uuid !== NULL_UUID);
	}

	function getCurrentColorSet(): Record<string, string> | null {
		if (!platform) return null;
		const isDark = document.documentElement.classList.contains('dark');
		return isDark ? platform.darkcolors : platform.colors;
	}

	function getBuildPlateURL(): string | null {
		if (!platform || !app) return null;
		const isDark = document.documentElement.classList.contains('dark');
		if (isDark && isValidUUID(platform.dark_baseimageresource))
			return app.getImageURL(platform.dark_baseimageresource);
		if (isValidUUID(platform.baseimageresource))
			return app.getImageURL(platform.baseimageresource);
		return null;
	}

	$effect(() => {
		poll.v;
		if (!layerViewer || !platform || !initialized) return;
		const isDark = document.documentElement.classList.contains('dark');
		const themeKey = isDark ? 'dark' : 'light';
		if (themeKey !== appliedColorTheme) {
			appliedColorTheme = themeKey;
			const cs = getCurrentColorSet();
			if (cs) layerViewer.applyColors(cs);
			const plateURL = getBuildPlateURL();
			layerViewer.SetBuildPlateSVG(plateURL);
			layerViewer.RenderScene(true);
		}
	});

	$effect(() => {
		poll.v;
		if (!layerViewer || !initialized) return;

		if (coordinateTransform === appliedCoordinateTransform) return;

		layerViewer.setCoordinateTransform(...coordinateTransform);
		appliedCoordinateTransform = coordinateTransform;
		layerViewer.RenderScene(true);
	});

	$effect(() => {
		const [base, factor, minimum, maximum] = pointSizeCalibrationKey.split('|');
		if (!layerViewer || !initialized || !pointSizeCalibrationKey) return;
		untrack(() => layerViewer.setPointSizeCalibration(base, factor, minimum, maximum));
	});

	// A mode change also changes the visibility and the spot styles of the points; the viewer rebuilds them once.
	$effect(() => {
		const mode = toolpathColorMode;
		if (!layerViewer || !initialized) return;
		untrack(() => layerViewer.batchPointsUpdate(() => {
			const hidden = mode === POINTS_OFF_MODE;
			layerViewer.setPointsVisible(!hidden);
			layerViewer.setPointSetStyles(rendererPointSetStyles.primary, rendererPointSetStyles.secondary);
			layerViewer.setToolpathColorMode(hidden ? 'color' : mode);
		}));
	});

	// Spot styles of the drawn points in the display mode Laser On: the loaded points take the style of their
	// positions, the secondary points (once loaded) the style of theirs. Otherwise the points are drawn as before.
	let rendererPointSetStyles = $derived.by(() => {
		if (primaryRole === '' || toolpathColorMode !== LASER_ON_MODE) return { primary: null, secondary: null };
		const toRendererStyle = (role: SpotRole) => ({
			visible: spotRoleShown[role],
			onColor: parseInt(spotStyles[role].onColor.slice(1), 16),
			offColor: parseInt(spotStyles[role].offColor.slice(1), 16),
			size: spotStyles[role].size,
			fill: spotStyles[role].fill
		});
		return {
			primary: toRendererStyle(primaryRole),
			secondary: (secondaryRole !== '' && secondaryPointsLoaded) ? toRendererStyle(secondaryRole) : null
		};
	});

	$effect(() => {
		const styles = rendererPointSetStyles;
		if (!layerViewer || !initialized) return;
		untrack(() => layerViewer.setPointSetStyles(styles.primary, styles.secondary));
	});

	// The secondary points are downloaded the first time the spot mode shows them and kept until the points change.
	$effect(() => {
		const wanted = secondaryPointsWanted ? secondaryUUID : NULL_UUID;
		if (!layerViewer || !initialized || !isValidUUID(wanted)) return;
		untrack(() => loadSecondaryScatterPlot(wanted));
	});

	$effect(() => {
		const visible = endPointsVisible;
		if (!layerViewer || !initialized) return;
		untrack(() => layerViewer.setEndPointsVisible(visible));
	});

	$effect(() => {
		const name = colorMapName;
		const inverted = colorMapInverted;
		if (!layerViewer || !initialized) return;
		untrack(() => layerViewer.setColorMap(name, inverted));
	});

	$effect(() => {
		const ranges = colorRanges;
		if (!layerViewer || !initialized) return;
		untrack(() => {
			for (const mode of Object.keys(LEGEND_MODES) as LegendMode[])
				layerViewer.setColorRange(mode, ranges[mode].min, ranges[mode].max);
		});
	});

	$effect(() => {
		const name = overlayColorMapName;
		const inverted = overlayColorMapInverted;
		if (!layerViewer || !initialized) return;
		untrack(() => layerViewer.setOverlayColorMap(name, inverted));
	});

	$effect(() => {
		const range = overlayRange;
		if (!layerViewer || !initialized) return;
		untrack(() => layerViewer.setOverlayRange(range.min, range.max));
	});

	$effect(() => {
		const smoothing = overlayState === 'smooth';
		if (!layerViewer || !initialized) return;
		untrack(() => layerViewer.setOverlaySmoothing(smoothing));
	});

	// Values of the codes 0 and 65535 of the overlay image; a missing or empty range reads as 0..1.
	function readOverlayValueRange(currentPlatform: any): ColorRange {
		const minimum = Number(currentPlatform?.overlayvaluemin);
		const maximum = Number(currentPlatform?.overlayvaluemax);
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return { min: 0, max: 1 };
		return { min: minimum, max: maximum };
	}

	// A single value (for example one nominal power or speed) is shown from zero.
	function rangeFromZeroIfSingle(range: ColorRange | null): ColorRange {
		if (!range) return { min: 0, max: 1 };
		if (range.max > range.min) return range;
		return { min: 0, max: range.max > 0 ? range.max : 1 };
	}

	function setEditedRange(mode: LegendMode, range: ColorRange | null) {
		if (mode === 'time') editedTimeRange = range;
		else if (mode === 'velocity') editedVelocityRange = range;
		else editedPowerRange = range;
	}

	function cycleToolpathColorMode() {
		const index = TOOLPATH_COLOR_MODES.findIndex((entry) => entry.mode === toolpathColorMode);
		toolpathColorMode = TOOLPATH_COLOR_MODES[(index + 1) % TOOLPATH_COLOR_MODES.length].mode;
		colorMapMenuKind = null;
		spotColorMenu = null;
		hideHoverInfo();
		clearHover();
	}

	function cycleSpotSetMode() {
		const index = SPOT_SET_MODES.findIndex((entry) => entry.mode === spotSetMode);
		spotSetMode = SPOT_SET_MODES[(index + 1) % SPOT_SET_MODES.length].mode;
		spotColorMenu = null;
		hideHoverInfo();
		clearHover();
	}

	function spotColorCaption(color: string): string {
		return SPOT_COLOR_PRESETS.find((preset) => preset.color === color)?.caption ?? color;
	}

	function setSpotColor(role: SpotRole, key: SpotColorKey, color: string) {
		if (!/^#[0-9a-f]{6}$/i.test(color)) return;
		spotStyles[role][key] = color.toLowerCase();
	}

	function selectSpotColor(role: SpotRole, key: SpotColorKey, color: string) {
		setSpotColor(role, key, color);
		spotColorMenu = null;
	}

	function isSpotColorMenuOpen(role: SpotRole, key: SpotColorKey): boolean {
		return spotColorMenu !== null && spotColorMenu.role === role && spotColorMenu.key === key;
	}

	// Applies a typed size right away if it is valid; leaving the field puts an invalid or out-of-range value
	// back into the range.
	function onSpotSizeInput(role: SpotRole, event: Event) {
		const value = Number((event.target as HTMLInputElement).value);
		if (Number.isInteger(value) && value >= SPOT_SIZE_MIN && value <= SPOT_SIZE_MAX) spotStyles[role].size = value;
	}

	function onSpotSizeChange(role: SpotRole, event: Event) {
		const input = event.target as HTMLInputElement;
		const value = Number(input.value);
		const size = Number.isFinite(value) && input.value.trim() !== ''
			? Math.min(Math.max(Math.round(value), SPOT_SIZE_MIN), SPOT_SIZE_MAX)
			: spotStyles[role].size;
		spotStyles[role].size = size;
		input.value = String(size);
	}

	function toggleSpotFill(role: SpotRole) {
		spotStyles[role].fill = !spotStyles[role].fill;
	}

	function formatRangeValue(value: number): number {
		return Number(value.toPrecision(6));
	}

	function onLegendRangeChange(kind: LegendKind, bound: 'min' | 'max', event: Event) {
		const value = Number((event.target as HTMLInputElement).value);
		if (!Number.isFinite(value)) return;
		const current = describeLegend(kind).range;
		const range = bound === 'min' ? { min: value, max: current.max } : { min: current.min, max: value };
		if (kind === 'overlay') editedOverlayRange = range;
		else if (legendMode) setEditedRange(legendMode, range);
	}

	function resetLegendRange(kind: LegendKind) {
		if (kind === 'overlay') editedOverlayRange = null;
		else if (legendMode) setEditedRange(legendMode, null);
	}

	function selectColorMap(kind: LegendKind, name: string) {
		if (kind === 'overlay') overlayColorMapName = name;
		else colorMapName = name;
		colorMapMenuKind = null;
	}

	function toggleColorMapInverted(kind: LegendKind) {
		if (kind === 'overlay') overlayColorMapInverted = !overlayColorMapInverted;
		else colorMapInverted = !colorMapInverted;
	}

	function toggleColorMapMenu(kind: LegendKind) {
		colorMapMenuKind = colorMapMenuKind === kind ? null : kind;
		spotColorMenu = null;
	}

	function toggleSpotColorMenu(role: SpotRole, key: SpotColorKey) {
		spotColorMenu = isSpotColorMenuOpen(role, key) ? null : { role, key };
		colorMapMenuKind = null;
	}

	function readPowerRange(data: any): ColorRange | null {
		const minimum = Number(data?.powerrangemin);
		const maximum = Number(data?.powerrangemax);
		if (data?.powerrangemin === undefined || data?.powerrangemax === undefined) return null;
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return null;
		return { min: minimum, max: maximum };
	}

	function refreshTimeline() {
		if (!layerViewer) return;
		timelineDuration = Number(layerViewer.getTimelineDuration()) || 0;
		timingSource = String(layerViewer.getTimingSource());
		timingMatchRatio = Number(layerViewer.getTimingMatchRatio()) || 0;
	}

	function setTimeSliderValue(value: number) {
		timeSliderValue = Math.min(Math.max(value, 0), TIME_SLIDER_STEPS);
		if (layerViewer) layerViewer.setTimeCapFraction(timeSliderValue / TIME_SLIDER_STEPS);
	}

	function onTimeSliderInput(event: Event) {
		stopPlayback();
		clearHover();
		setTimeSliderValue(parseInt((event.target as HTMLInputElement).value));
	}

	function moveToStart() {
		stopPlayback();
		clearHover();
		setTimeSliderValue(0);
	}

	function moveToEnd() {
		stopPlayback();
		clearHover();
		setTimeSliderValue(TIME_SLIDER_STEPS);
	}

	// Plays the layer in real time; starts over if the slider is already at the end.
	let playing = $state(false);
	let playbackFrame = 0;
	let playbackLastStamp = 0;

	function startPlayback() {
		if (playing || !layerViewer || timelineDuration <= 0) return;
		clearHover();
		if (timeSliderValue >= TIME_SLIDER_STEPS) setTimeSliderValue(0);
		playing = true;
		playbackLastStamp = performance.now();
		playbackFrame = requestAnimationFrame(stepPlayback);
	}

	function stepPlayback(stamp: number) {
		if (!playing) return;
		const elapsed = Math.max(stamp - playbackLastStamp, 0);
		playbackLastStamp = stamp;
		const next = timelineDuration > 0 ? timeSliderValue + (elapsed / timelineDuration) * TIME_SLIDER_STEPS : TIME_SLIDER_STEPS;
		setTimeSliderValue(next);
		if (next >= TIME_SLIDER_STEPS) {
			stopPlayback();
			return;
		}
		playbackFrame = requestAnimationFrame(stepPlayback);
	}

	function stopPlayback() {
		playing = false;
		if (playbackFrame) cancelAnimationFrame(playbackFrame);
		playbackFrame = 0;
	}

	// Runs on mount and whenever the container reappears: hiding the module destroys the container
	// together with the canvas that three.js appended to it.
	function ensureInit() {
		if (!containerEl || !app) return;
		const w = containerEl.clientWidth, h = containerEl.clientHeight;
		if (w === 0 || h === 0) return;

		let firstInit = false;

		try {
			if (!glInstance) {
				glInstance = app.retrieveWebGLInstance(module.uuid);
				if (!glInstance) {
					glInstance = new WebGLImpl();
					app.storeWebGLInstance(module.uuid, glInstance);
				}
			}

			if (!layerViewer) {
				layerViewer = new LayerViewImpl(glInstance);
				// Write-only, so effects that pan or zoom do not subscribe to viewVersion.
				layerViewer.onTransformChanged = () => { viewVersion = ++transformChangeCount; };
				layerViewer.toolpathVisible = toolpathVisible;
				layerViewer.showLaserOffPoints = showLaserOffPoints;
				layerViewer.setTimeCapFraction(timeSliderValue / TIME_SLIDER_STEPS);
				firstInit = true;
			}
			overlaySmoothingSupported = layerViewer.supportsOverlaySmoothing();

			// Re-attach the canvas when the container has been recreated
			if (!containerEl.contains(glInstance.renderer.domElement))
				glInstance.setupDOMElement(containerEl);
			layerViewer.updateSize(w, h);
			layerViewer.setCoordinateTransform(...coordinateTransform);
			appliedCoordinateTransform = coordinateTransform;

			if (firstInit && platform) {
				const plateURL = getBuildPlateURL();
				if (plateURL) {
					layerViewer.SetBuildPlateSVG(plateURL);
				}
				layerViewer.setOrigin(platform.originx || 0, platform.originy || 0);
				centerOnPlatform();

				platform.displayed_layer = 0;
				platform.displayed_build = 0;
				platform.displayed_scatterplot = '';
				platform.displayed_overlayimage = '';
			} else if (autoFrame) {
				centerOnPlatform();
			}

			const cs = getCurrentColorSet();
			if (cs) {
				layerViewer.applyColors(cs);
				const isDark = document.documentElement.classList.contains('dark');
				appliedColorTheme = isDark ? 'dark' : 'light';
			}

			layerViewer.RenderScene(true);
			initialized = true;
		} catch (e) {
			console.warn('[LayerView] init failed:', e);
			return;
		}

		// Load the current layer right away instead of waiting for the next poll
		if (firstInit)
			onDataChanged(module);
	}

	function onDataChanged(sender: any) {
		const currentPlatform = module.platform;
		if (!layerViewer || !currentPlatform || !sender) return;
		if (!module.isActive || !module.isActive()) return;
		if (sender.uuid !== module.uuid) return;

		if (currentPlatform.displayed_layer !== currentPlatform.currentlayer ||
			currentPlatform.displayed_build !== currentPlatform.builduuid ||
			currentPlatform.displayed_partstateversion !== currentPlatform.partstateversion) {

			if (currentPlatform.displayed_layer !== currentPlatform.currentlayer || currentPlatform.displayed_build !== currentPlatform.builduuid) {
				stopPlayback();
				setTimeSliderValue(TIME_SLIDER_STEPS);
				editedTimeRange = null;
			}
			if (currentPlatform.displayed_build !== currentPlatform.builduuid) {
				editedPowerRange = null;
				editedVelocityRange = null;
				editedOverlayRange = null;
			}
			currentPlatform.displayed_layer = currentPlatform.currentlayer;
			currentPlatform.displayed_build = currentPlatform.builduuid;
			currentPlatform.displayed_partstateversion = currentPlatform.partstateversion;
			loadToolpath(currentPlatform.builduuid, currentPlatform.currentlayer);
		}

		// Recorded points and overlay of the layer: the overlay is only loaded while the overlay button is on (see
		// cycleOverlayState), the recorded points always, since they are drawn over the overlay.
		overlayUUID = typeof currentPlatform.overlayimageuuid === 'string' ? currentPlatform.overlayimageuuid.toLowerCase() : NULL_UUID;
		syncScatterPlot();
		syncOverlay();
	}

	// Loads or clears the scatter plot of the layer.
	function syncScatterPlot() {
		const currentPlatform = module.platform;
		if (!layerViewer || !currentPlatform) return;
		const wanted = typeof currentPlatform.scatterplotuuid === 'string' ? currentPlatform.scatterplotuuid.toLowerCase() : NULL_UUID;
		if (currentPlatform.displayed_scatterplot === wanted) return;
		currentPlatform.displayed_scatterplot = wanted;
		loadScatterPlot(wanted);
	}

	// Loads or removes the overlay image of the layer, which is shown while the overlay button is on.
	function syncOverlay() {
		const currentPlatform = module.platform;
		if (!layerViewer || !currentPlatform) return;
		const wanted = overlayMode && isValidUUID(overlayUUID) ? overlayUUID : NULL_UUID;
		if (currentPlatform.displayed_overlayimage === wanted) return;
		currentPlatform.displayed_overlayimage = wanted;

		if (!isValidUUID(wanted)) {
			loadingOverlay = false;
			layerViewer.SetOverlayImage(null);
			return;
		}

		const valueRange = readOverlayValueRange(currentPlatform);
		loadingOverlay = true;
		layerViewer.SetOverlayImage(
			app.getImageURL(wanted),
			currentPlatform.sizex || 300,
			currentPlatform.sizey || 300,
			valueRange.min,
			valueRange.max,
			() => {
				if (currentPlatform.displayed_overlayimage === wanted) loadingOverlay = false;
			},
			(error: any) => {
				// Another overlay has been requested in the meantime
				if (currentPlatform.displayed_overlayimage !== wanted) return;
				loadingOverlay = false;
				app.showSnackBar(`Loading the ${(overlayName || 'overlay').toLowerCase()} failed: ${error?.message ?? error}`, 'error', 8000);
			}
		);
	}

	// Steps the overlay button: off, pixels, smooth, off. Between pixels and smooth only the drawing changes
	// (see the effect on overlayState); the other steps load or remove the overlay image.
	function cycleOverlayState() {
		const wasShown = overlayState !== 'off';
		if (overlayState === 'off') overlayState = 'pixels';
		else if (overlayState === 'pixels' && overlaySmoothingSupported) overlayState = 'smooth';
		else overlayState = 'off';
		if (wasShown === (overlayState !== 'off')) return;
		colorMapMenuKind = null;
		syncOverlay();
	}

	function isDisplayedToolpath(buildUUID: string, layerIndex: number): boolean {
		const currentPlatform = module.platform;
		return !!currentPlatform && (currentPlatform.displayed_build === buildUUID) && (currentPlatform.displayed_layer === layerIndex);
	}

	function loadToolpath(buildUUID: string, layerIndex: number) {
		if (!layerViewer) return;
		hideHoverInfo();
		clearHover();

		// The null UUID means "no build": show the empty platform
		if (!isValidUUID(buildUUID)) {
			loadingLayer = false;
			buildPowerRange = null;
			layerViewer.loadLayer(null, null);
			layerPowerRange = layerViewer.getLayerPowerRange();
			layerVelocityRange = layerViewer.getLayerVelocityRange();
			refreshTimeline();
			return;
		}

		loadingLayer = true;
		app.axiosPostRequest('/build/toolpath', {
			builduuid: buildUUID,
			layerindex: layerIndex
		})
		.then((layerJSON: any) => {
			// A newer layer has been requested in the meantime
			if (!layerViewer || !isDisplayedToolpath(buildUUID, layerIndex)) return;
			clearHover();
			buildPowerRange = readPowerRange(layerJSON.data);
			layerViewer.loadLayer(layerJSON.data.segments, layerJSON.data.parts);
			layerPowerRange = layerViewer.getLayerPowerRange();
			layerVelocityRange = layerViewer.getLayerVelocityRange();
			refreshTimeline();
			layerViewer.RenderScene(true);
		})
		.catch((err: any) => {
			console.warn('[LayerView] layer load error:', err?.response || err);
			if (layerViewer) layerViewer.RenderScene(true);
		})
		.finally(() => {
			if (isDisplayedToolpath(buildUUID, layerIndex)) loadingLayer = false;
		});
	}

	function clearScatterPlot() {
		pointsLoaded = false;
		pointColumns = [];
		primaryRole = '';
		secondaryUUID = NULL_UUID;
		secondaryPointsLoaded = false;
		loadingSecondaryPoints = false;
		requestedSecondaryUUID = NULL_UUID;
		hoverPoint = null;
		hideHoverInfo();
		if (!layerViewer) return;
		layerViewer.clearPointsChannelData(POINT_CHANNEL);
		layerViewer.clearPoints();
		layerVelocityRange = layerViewer.getLayerVelocityRange();
		refreshTimeline();
		layerViewer.RenderScene(true);
	}

	// Returns the colourable columns of a /pointchanneldata response; header fields are skipped.
	function parsePointChannelData(response: any): [string, Float32Array][] {
		const contentType = String(response?.headers?.['content-type'] || '');
		if (!contentType.includes('application/json')) return [];

		const parsed = JSON.parse(new TextDecoder().decode(response.data));
		if (!parsed || typeof parsed !== 'object') return [];

		const columns: [string, Float32Array][] = [];
		for (const column of POINT_CHANNEL_COLUMNS) {
			const values = parsed[column];
			if (Array.isArray(values) && values.every((value) => typeof value === 'number')) {
				columns.push([column, new Float32Array(values)]);
			}
		}
		return columns;
	}

	function readSpotRole(value: unknown): SpotRole | '' {
		const role = String(value ?? '').trim().toLowerCase();
		return role === 'target' || role === 'status' ? role : '';
	}

	async function loadScatterPlot(scatterPlotUUID: string) {
		const loadIndex = ++pointLoadCounter;
		clearScatterPlot();
		loadingPoints = false;
		if (!layerViewer || scatterPlotUUID === NULL_UUID || !UUID_PATTERN.test(scatterPlotUUID)) return;

		// The server sets the positions and the secondary scatter plot together with the scatter plot.
		const currentPlatform = module.platform;
		const role = readSpotRole(currentPlatform?.scatterplotpositions);
		const serverSecondaryUUID = typeof currentPlatform?.secondaryscatterplotuuid === 'string' ? currentPlatform.secondaryscatterplotuuid.toLowerCase() : NULL_UUID;

		loadingPoints = true;
		try {
			const pointsResponse = await app.axiosGetArrayBufferRequest('/pointcloud/' + scatterPlotUUID);
			let channelColumns: [string, Float32Array][] = [];
			try {
				const channelResponse = await app.axiosGetArrayBufferRequest('/pointchanneldata/' + scatterPlotUUID + '/' + POINT_CHANNEL);
				channelColumns = parsePointChannelData(channelResponse);
			} catch (err: any) {
				console.warn('[LayerView] point channel data error:', err?.response || err);
			}

			if (loadIndex !== pointLoadCounter || !layerViewer) return;

			pointColumns = channelColumns.map(([column]) => column);
			primaryRole = role;
			secondaryUUID = (role !== '' && UUID_PATTERN.test(serverSecondaryUUID)) ? serverSecondaryUUID : NULL_UUID;
			pointsLoaded = true;
			// The spot styles go to the viewer before the points, so the points are built once, by setColorMode.
			layerViewer.setPointSetStyles(rendererPointSetStyles.primary, rendererPointSetStyles.secondary);

			layerViewer.loadPoints(new Float32Array(pointsResponse.data));
			for (const [column, values] of channelColumns) {
				layerViewer.loadPointsChannelData(POINT_CHANNEL, column, values);
			}
			layerViewer.updateTiming();
			refreshTimeline();
			layerVelocityRange = layerViewer.getLayerVelocityRange();

			layerViewer.showLaserOffPoints = showLaserOffPoints;
			layerViewer.setColorMode('toolpath');
		} catch (err: any) {
			console.warn('[LayerView] point cloud error:', err?.response || err);
			if (layerViewer) layerViewer.RenderScene(true);
		} finally {
			// Another scatter plot may have been requested in the meantime
			if (loadIndex === pointLoadCounter) loadingPoints = false;
		}
	}

	// Downloads the secondary points of the loaded scatter plot: the same samples at their other positions.
	async function loadSecondaryScatterPlot(scatterPlotUUID: string) {
		if (requestedSecondaryUUID === scatterPlotUUID || !layerViewer || !UUID_PATTERN.test(scatterPlotUUID)) return;
		const loadIndex = pointLoadCounter;
		const role = secondaryRole;
		requestedSecondaryUUID = scatterPlotUUID;
		loadingSecondaryPoints = true;
		const isCurrent = () => loadIndex === pointLoadCounter && requestedSecondaryUUID === scatterPlotUUID && !!layerViewer;
		try {
			const response = await app.axiosGetArrayBufferRequest('/pointcloud/' + scatterPlotUUID);
			if (!isCurrent()) return;
			const positions = new Float32Array(response.data);
			const expected = layerViewer.getPointPositions(false)?.length ?? -1;
			if (positions.length !== expected) {
				console.warn(`[LayerView] secondary points: ${positions.length / 2} instead of ${expected / 2} points, not shown`);
				app.showSnackBar(`The ${role ? SPOT_ROLE_CAPTIONS[role] : 'secondary'} positions do not match the recorded points and are not shown`, 'error', 8000);
				return;
			}
			layerViewer.loadSecondaryPoints(positions);
			secondaryPointsLoaded = true;
		} catch (err: any) {
			console.warn('[LayerView] secondary point cloud error:', err?.response || err);
			if (isCurrent())
				app.showSnackBar(`Loading the ${role ? SPOT_ROLE_CAPTIONS[role] : 'secondary'} positions failed: ${app.extractErrorMessage(err)}`, 'error', 8000);
		} finally {
			if (loadIndex === pointLoadCounter && requestedSecondaryUUID === scatterPlotUUID) loadingSecondaryPoints = false;
		}
	}

	function toggleLaserOffPoints() {
		showLaserOffPoints = !showLaserOffPoints;
		hideHoverInfo();
		if (!layerViewer) return;
		layerViewer.showLaserOffPoints = showLaserOffPoints;
		layerViewer.updateLayerPoints();
		layerViewer.RenderScene(true);
	}

	function toggleToolpath() {
		toolpathVisible = !toolpathVisible;
		hideHoverInfo();
		if (!layerViewer) return;
		clearHover();
		layerViewer.toolpathVisible = toolpathVisible;
		layerViewer.updateLoadedLayer();
		layerViewer.updateTransform();
		layerViewer.RenderScene(true);
	}

	function changeLayerTo(targetLayer: number) {
		if (!app || !platform || sliderFixed) return;
		if (isNaN(targetLayer) || (targetLayer < 0) || (targetLayer >= layerCount)) return;

		sliderValue = targetLayer;
		if (targetLayer !== platform.currentlayer) {
			// The slider moves optimistically. If the request fails, the server keeps its layer and the
			// follow-server effect will not fire (the value did not change), so roll back here.
			app.triggerWidgetRequest(platform.uuid, 'changelayer', { targetlayer: targetLayer }, undefined, (err: any) => {
				if (!draggingSlider && (sliderValue === targetLayer))
					sliderValue = module.platform?.currentlayer || 0;
				app.showSnackBar('Layer change to ' + targetLayer + ' failed: ' + app.extractErrorMessage(err), 'error', 8000);
			});
		}
	}

	// Every layer change recomputes the scatter plot on the server, so the layer is only sent when
	// the slider is released and not for every intermediate position.
	function onSliderInput(e: Event) {
		draggingSlider = true;
		sliderValue = parseInt((e.target as HTMLInputElement).value);
	}

	function onSliderChange(e: Event) {
		draggingSlider = false;
		changeLayerTo(parseInt((e.target as HTMLInputElement).value));
	}

	function onSliderRelease() {
		draggingSlider = false;
	}

	// Clicking the "Layer x / n" badge swaps it for a number field; Enter jumps to the typed
	// layer (clamped to the slider range), Escape or leaving the field cancels.
	let layerJumpOpen = $state(false);
	let layerJumpValue = $state<number | null>(null);

	function openLayerJump() {
		if (sliderFixed) return;
		layerJumpValue = sliderValue;
		layerJumpOpen = true;
	}

	function commitLayerJump() {
		if (!layerJumpOpen) return;
		layerJumpOpen = false;
		if (typeof layerJumpValue !== 'number' || !Number.isFinite(layerJumpValue)) return;
		changeLayerTo(Math.min(Math.max(Math.round(layerJumpValue), 0), Math.max(layerCount - 1, 0)));
	}

	function onLayerJumpKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitLayerJump();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			layerJumpOpen = false;
		}
	}

	function focusAndSelect(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function hideHoverInfo() {
		// A hover update that is already scheduled would show the tooltip again
		pendingHover = null;
		if (hoverRAF) {
			cancelAnimationFrame(hoverRAF);
			hoverRAF = 0;
		}
		if (hoverInfo.visible)
			hoverInfo.visible = false;
	}

	// Position of a recorded sample at the given positions, if they are loaded.
	function spotRolePosition(role: SpotRole, pointIndex: number): { x: number; y: number } | null {
		if (!layerViewer) return null;
		if (role === primaryRole) return layerViewer.getPointPosition(pointIndex, false);
		if (role === secondaryRole) return layerViewer.getPointPosition(pointIndex, true);
		return null;
	}

	// Velocity, acceleration and jerk are taken along the positions the point was picked at.
	function describePoint(mouseX: number, mouseY: number): string {
		if (!pointsShown) return '';
		const hit: { index: number; secondary: boolean } | null = layerViewer.pickPoint(mouseX, mouseY, 2);
		if (!hit) return '';
		const pointIndex = hit.index;
		const secondary = hit.secondary;

		let text = `Point ID = ${pointIndex}`;
		if (primaryRole !== '') {
			for (const role of SPOT_ROLES) {
				const position = spotRolePosition(role, pointIndex);
				if (position) text += `\n${SPOT_ROLE_CAPTIONS[role]}: ${position.x.toFixed(4)} / ${position.y.toFixed(4)} mm`;
			}
		} else {
			const position = layerViewer.getPointPosition(pointIndex);
			if (position) text += `\nPosition: ${position.x.toFixed(4)} / ${position.y.toFixed(4)} mm`;
		}
		const velocity = layerViewer.getPointVelocity(pointIndex, secondary);
		if (velocity > 0) text += `\nVelocity: ${velocity.toFixed(4)} mm/s`;
		const acceleration = layerViewer.getPointAcceleration(pointIndex, secondary);
		if (acceleration) text += `\nAcceleration: ${(acceleration.a / 1000).toFixed(4)} m/s²`;
		const jerk = layerViewer.getPointJerk(pointIndex, secondary);
		if (jerk) text += `\nJerk: ${(jerk.j / 1000000).toFixed(4)} km/s³`;
		const power = layerViewer.getPointPower(pointIndex);
		if (power !== null) text += `\nPower: ${power.toFixed(4)} W`;
		return text;
	}

	function describeSegment(mouseX: number, mouseY: number): string {
		if (!toolpathVisible) return '';
		const lineIndex = glInstance.getRaycasterCollisions('layerdata_lines', mouseX, mouseY);
		const coordinates = layerViewer.linesCoordinates;
		if ((lineIndex < 0) || !coordinates || (lineIndex * 4 + 3 >= coordinates.length)) return '';

		const [x1, y1, x2, y2] = coordinates.slice(lineIndex * 4, lineIndex * 4 + 4);
		let text = `Line ID = ${lineIndex}\n${x1.toFixed(3)} / ${y1.toFixed(3)} - ${x2.toFixed(3)} / ${y2.toFixed(3)} mm`;
		const properties = layerViewer.segmentProperties?.[lineIndex];
		if (properties) {
			if ((typeof properties.laserpower === 'number') && (typeof properties.laserspeed === 'number'))
				text += `\n${properties.laserpower.toFixed(0)} W / ${properties.laserspeed.toFixed(1)} mm/s`;
			if (properties.profilename)
				text += `\nProfile: ${properties.profilename}`;
		}
		return text;
	}

	// Runs once per animation frame, see scheduleHoverUpdate ()
	function updateHover(clientX: number, clientY: number) {
		if (dragging) return;

		if (propertiesMode) {
			// The "Properties" inspector replaces the plain tooltip while it is active
			if (hoverInfo.visible) hoverInfo.visible = false;
			updateHoverSegment(clientX, clientY);
			return;
		}

		updateHoverInfo(clientX, clientY);
	}

	function updateHoverInfo(clientX: number, clientY: number) {
		if (!glInstance?.renderer || !layerViewer || !containerEl) return;

		const canvasBox = glInstance.renderer.domElement.getBoundingClientRect();
		const mouseX = clientX - canvasBox.left;
		const mouseY = clientY - canvasBox.top;
		const text = describePoint(mouseX, mouseY) || describeSegment(mouseX, mouseY);
		if (!text) {
			hideHoverInfo();
			return;
		}

		const containerBox = containerEl.getBoundingClientRect();
		const x = clientX - containerBox.left;
		const y = clientY - containerBox.top;
		hoverInfo.text = text;
		hoverInfo.x = x;
		hoverInfo.y = y;
		hoverInfo.flipX = x > containerBox.width / 2;
		hoverInfo.flipY = y > containerBox.height / 2;
		hoverInfo.visible = true;
	}

	function onWheel(event: WheelEvent) {
		if (!containerEl || !layerViewer) return;
		event.preventDefault();
		hideHoverInfo();
		clearHover();

		let delta = event.deltaY;
		if (delta > 5) delta = 5;
		if (delta < -5) delta = -5;

		const box = containerEl.getBoundingClientRect();
		const localX = event.clientX - box.left;
		const localY = event.clientY - box.top;

		autoFrame = false;
		layerViewer.ScaleRelative(Math.pow(1.03, -delta * 1.5), localX, localY);
		layerViewer.RenderScene(true);
	}

	let dragging = false;
	let dragX = 0, dragY = 0;

	// "Custom Zoom": while active, a left-button drag draws a selection rectangle
	// (viewport pixels) instead of panning; releasing it frames that rectangle.
	let zoomSelectMode = $state(false);
	let zoomSelection = $state<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
	let zoomRect = $derived(zoomSelection ? {
		left: Math.min(zoomSelection.startX, zoomSelection.endX),
		top: Math.min(zoomSelection.startY, zoomSelection.endY),
		width: Math.abs(zoomSelection.endX - zoomSelection.startX),
		height: Math.abs(zoomSelection.endY - zoomSelection.startY)
	} : null);
	// Live machine/build-plate coordinates under the cursor (mm), shown bottom-right.
	let mousePosition = $state<{ x: number; y: number } | null>(null);

	// "Properties" hover inspector: when enabled, hovering a hatch/polyline shows
	// a popup with that segment's laser power, speed, profile, etc.
	type SegmentProperties = {
		type?: string;
		laserpower?: number;
		laserspeed?: number;
		profilename?: string;
		partid?: number;
		partname?: string;
		partdisabled?: boolean;
		laserindex?: number;
		lineIndex?: number;
		powermode?: string;
		power1?: number | null;
		power2?: number | null;
		supportpoints?: { t: number; power: number }[] | null;
	};
	// A support point of the highlighted nonlinear power ramp, including both line end points.
	type RampKnot = { t: number; power: number | null; distance: number };
	type SupportPointInfo = RampKnot & {
		lineIndex: number;
		index: number;
		count: number;
		x: number;
		y: number;
		length: number;
		previous: RampKnot | null;
		next: RampKnot | null;
	};
	type PointInfo = {
		index: number;
		// True if the point was picked at its secondary position; x and y are the picked position.
		secondary: boolean;
		x: number;
		y: number;
		primaryx: number | null;
		primaryy: number | null;
		secondaryx: number | null;
		secondaryy: number | null;
		time: number | null;
		scannerx: number | null;
		scannery: number | null;
		laseron: number | null;
		power: number | null;
		velocity: number;
	};
	let propertiesMode = $state(false);
	let hoverSegment = $state<SegmentProperties | null>(null);
	let hoverPoint = $state<PointInfo | null>(null);
	let hoverSupportPoint = $state<SupportPointInfo | null>(null);
	let hoverScreen = $state<{ x: number; y: number }>({ x: 0, y: 0 });
	let pendingHover: { x: number; y: number } | null = null;
	let hoverRAF = 0;

	// "Names": outlines every part of the current layer with its name. The part
	// given by the per-session platform property highlightpartuuid is always
	// outlined and emphasized, even while the toggle is off.
	type PartOverlay = {
		key: string;
		label: string;
		left: number;
		top: number;
		width: number;
		height: number;
		labelY: number;
		markers: { x: number; y: number }[];
		highlighted: boolean;
		disabled: boolean;
	};
	let namesMode = $state(false);
	let viewVersion = $state(0);
	let transformChangeCount = 0;
	// Viewport position of the hovered point, for the marker ring; follows pan and zoom.
	let hoverPointScreen = $derived.by((): { x: number; y: number } | null => {
		viewVersion;
		if (!hoverPoint || !layerViewer) return null;
		const machine = layerViewer.toolpathPointToMachine(hoverPoint.x, hoverPoint.y);
		return layerViewer.machineToScreen(machine.x, machine.y);
	});
	let hoverSupportPointScreen = $derived.by((): { x: number; y: number } | null => {
		viewVersion;
		if (!hoverSupportPoint || !layerViewer) return null;
		const machine = layerViewer.toolpathPointToMachine(hoverSupportPoint.x, hoverSupportPoint.y);
		return layerViewer.machineToScreen(machine.x, machine.y);
	});
	let hoverSegmentPower = $derived.by(() => {
		if (!hoverSegment) return null;
		const nominal = Number(hoverSegment.laserpower ?? 0);
		const power1 = hoverSegment.power1 ?? null;
		const power2 = hoverSegment.power2 ?? null;
		const modulated = power1 !== null && power2 !== null;
		const knots = hoverSegment.supportpoints ?? [];
		const values = modulated ? [power1, power2, ...knots.map((knot) => knot.power)] : [nominal];
		return {
			mode: POWER_MODE_CAPTIONS[hoverSegment.powermode ?? ''] ?? hoverSegment.powermode ?? '',
			nominalOnly: !modulated && (hoverSegment.powermode ?? '') !== '',
			start: modulated ? power1 : nominal,
			end: modulated ? power2 : nominal,
			minimum: Math.min(...values),
			maximum: Math.max(...values),
			supportPointCount: knots.length
		};
	});
	let highlightPartUUID = $derived.by(() => {
		poll.v;
		const uuid = typeof platform?.highlightpartuuid === 'string' ? platform.highlightpartuuid.toLowerCase() : '';
		return uuid === NULL_UUID ? '' : uuid;
	});
	let partOverlays = $derived.by((): PartOverlay[] => {
		viewVersion;
		if (!layerViewer || (!namesMode && !highlightPartUUID)) return [];

		const overlays: PartOverlay[] = [];
		for (const box of layerViewer.getPartBoundingBoxes()) {
			const highlighted = highlightPartUUID !== '' && box.uuid === highlightPartUUID;
			if (!namesMode && !highlighted) continue;

			const topLeft = layerViewer.machineToScreen(box.minx, box.maxy);
			const bottomRight = layerViewer.machineToScreen(box.maxx, box.miny);
			if (!topLeft || !bottomRight) continue;

			const left = topLeft.x;
			const top = topLeft.y;
			const right = bottomRight.x;
			const bottom = bottomRight.y;
			const name = box.name || box.uuid.slice(0, 8);
			overlays.push({
				key: box.key,
				label: box.disabled ? `${name} (disabled)` : name,
				left,
				top,
				width: Math.max(right - left, 1),
				height: Math.max(bottom - top, 1),
				// Keep the label readable when the box touches the top edge.
				labelY: top > 14 ? top - 5 : top + 12,
				markers: [
					{ x: left, y: top },
					{ x: right, y: top },
					{ x: left, y: bottom },
					{ x: right, y: bottom },
					{ x: (left + right) / 2, y: (top + bottom) / 2 }
				],
				highlighted,
				disabled: box.disabled === true
			});
		}
		// Draw the highlighted part last so it stays on top of overlapping boxes.
		return overlays.sort((a, b) => Number(a.highlighted) - Number(b.highlighted));
	});

	function updateMousePosition(event: PointerEvent) {
		if (!containerEl || !layerViewer || typeof layerViewer.screenToMachine !== 'function') return;
		const box = containerEl.getBoundingClientRect();
		mousePosition = layerViewer.screenToMachine(event.clientX - box.left, event.clientY - box.top);
	}

	// A recorded point within a few pixels wins over the toolpath segment below it.
	function updateHoverSegment(clientX: number, clientY: number) {
		if (!propertiesMode || dragging || !containerEl || !layerViewer ||
			typeof layerViewer.pickSegmentAtScreenPoint !== 'function') {
			hoverSegment = null;
			hoverPoint = null;
			hoverSupportPoint = null;
			return;
		}
		const box = containerEl.getBoundingClientRect();
		const localX = clientX - box.left;
		const localY = clientY - box.top;
		hoverScreen = { x: localX, y: localY };

		// Support points of the highlighted ramp are drawn on top, so they win over everything;
		// the highlight and the hovered segment stay as they are.
		const supportPoint: SupportPointInfo | null =
			typeof layerViewer.pickHighlightSupportPoint === 'function'
				? layerViewer.pickHighlightSupportPoint(localX, localY, SUPPORT_POINT_PICK_TOLERANCE_PX)
				: null;
		hoverSupportPoint = supportPoint;
		if (supportPoint) {
			hoverPoint = null;
			return;
		}

		const pointHit: { index: number; secondary: boolean } | null = pointsShown ? layerViewer.pickPoint(localX, localY, POINT_PICK_TOLERANCE_PX) : null;
		const pointInfo: PointInfo | null = pointHit ? layerViewer.getPointInfo(pointHit.index, pointHit.secondary) : null;
		if (pointInfo) {
			hoverPoint = pointInfo;
			hoverSegment = null;
			layerViewer.setHighlightLine(-1);
			return;
		}

		hoverPoint = null;
		const result: SegmentProperties | null = layerViewer.pickSegmentAtScreenPoint(localX, localY, 6) ?? null;
		hoverSegment = result;

		if (typeof layerViewer.setHighlightLine === 'function') {
			layerViewer.setHighlightLine(result ? (result.lineIndex ?? -1) : -1);
		}
	}

	function formatMillimeters(x: number | null, y: number | null): string {
		if (x === null || y === null) return '–';
		return `${x.toFixed(3)}, ${y.toFixed(3)} mm`;
	}

	function formatPowerValue(power: number): string {
		return power.toLocaleString(undefined, { maximumFractionDigits: 1 });
	}

	function formatWatts(power: number | null): string {
		if (power === null || !Number.isFinite(power)) return '–';
		return `${formatPowerValue(power)} W`;
	}

	function formatPowerRange(start: number | null, end: number | null): string {
		if (start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end) ||
			formatPowerValue(start) === formatPowerValue(end))
			return formatWatts(start);
		return `${formatPowerValue(start)} → ${formatPowerValue(end)} W`;
	}

	// One piece of the piecewise linear ramp between two support points.
	function formatRampPiece(from: RampKnot | null, to: RampKnot | null): string {
		if (!from || !to) return '–';
		return `${formatPowerRange(from.power, to.power)} over ${(to.distance - from.distance).toFixed(3)} mm`;
	}

	function formatRampGradient(from: RampKnot | null, to: RampKnot | null): string {
		if (!from || !to || from.power === null || to.power === null) return '–';
		const distance = to.distance - from.distance;
		if (!(distance > 0)) return '–';
		const gradient = (to.power - from.power) / distance;
		return `${gradient >= 0 ? '+' : ''}${gradient.toLocaleString(undefined, { maximumFractionDigits: 1 })} W/mm`;
	}

	function clipText(text: string, maxCharacters: number): string {
		const characters = Array.from(text);
		if (characters.length <= maxCharacters) return text;
		return `${characters.slice(0, maxCharacters - 1).join('').trimEnd()}…`;
	}

	// Segment and point picking scan every line and point of the layer, so throttle it to one
	// hit test per animation frame regardless of how fast pointer events arrive.
	function scheduleHoverUpdate(clientX: number, clientY: number) {
		pendingHover = { x: clientX, y: clientY };
		if (hoverRAF) return;
		hoverRAF = requestAnimationFrame(() => {
			hoverRAF = 0;
			if (pendingHover) updateHover(pendingHover.x, pendingHover.y);
		});
	}

	function clearHover() {
		pendingHover = null;
		if (hoverRAF) {
			cancelAnimationFrame(hoverRAF);
			hoverRAF = 0;
		}
		hoverSegment = null;
		hoverPoint = null;
		hoverSupportPoint = null;
		if (layerViewer && typeof layerViewer.clearHighlight === 'function') {
			layerViewer.clearHighlight();
		}
	}

	function togglePropertiesMode() {
		propertiesMode = !propertiesMode;
		hideHoverInfo();
		if (!propertiesMode) clearHover();
	}

	function toggleZoomSelectMode() {
		zoomSelectMode = !zoomSelectMode;
		zoomSelection = null;
		if (zoomSelectMode) {
			hideHoverInfo();
			clearHover();
		}
	}

	function localViewportPoint(event: PointerEvent): { x: number; y: number } | null {
		if (!containerEl) return null;
		const box = containerEl.getBoundingClientRect();
		// Pointer capture keeps delivering events outside the canvas, so clamp to its bounds.
		return {
			x: Math.min(Math.max(event.clientX - box.left, 0), box.width),
			y: Math.min(Math.max(event.clientY - box.top, 0), box.height)
		};
	}

	function finishZoomSelection() {
		const rect = zoomRect;
		zoomSelection = null;
		if (!rect || !layerViewer) return;
		if (rect.width < MIN_ZOOM_SELECTION_PX || rect.height < MIN_ZOOM_SELECTION_PX) return;

		const corner1 = layerViewer.screenToMachine(rect.left, rect.top);
		const corner2 = layerViewer.screenToMachine(rect.left + rect.width, rect.top + rect.height);
		if (!corner1 || !corner2) return;

		autoFrame = false;
		layerViewer.CenterOnRectangle(
			Math.min(corner1.x, corner2.x), Math.min(corner1.y, corner2.y),
			Math.max(corner1.x, corner2.x), Math.max(corner1.y, corner2.y)
		);
		layerViewer.RenderScene(true);
		zoomSelectMode = false;
	}

	function onWindowKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && zoomSelectMode) {
			zoomSelectMode = false;
			zoomSelection = null;
		}
	}

	function onPointerDown(event: PointerEvent) {
		if (zoomSelectMode && event.button === 0) {
			const point = localViewportPoint(event);
			if (!point) return;
			hideHoverInfo();
			clearHover();
			zoomSelection = { startX: point.x, startY: point.y, endX: point.x, endY: point.y };
			(event.target as HTMLElement).setPointerCapture(event.pointerId);
			return;
		}

		if (event.button === 0 || event.button === 1) {
			dragging = true;
			hideHoverInfo();
			clearHover();
			dragX = event.clientX;
			dragY = event.clientY;
			(event.target as HTMLElement).setPointerCapture(event.pointerId);
		}
	}

	function onPointerMove(event: PointerEvent) {
		updateMousePosition(event);

		if (zoomSelection) {
			const point = localViewportPoint(event);
			if (point) zoomSelection = { ...zoomSelection, endX: point.x, endY: point.y };
			return;
		}

		if (dragging && layerViewer) {
			const dx = event.clientX - dragX;
			const dy = event.clientY - dragY;
			dragX = event.clientX;
			dragY = event.clientY;
			if (dx !== 0 || dy !== 0) autoFrame = false;
			layerViewer.Drag(dx, dy);
			layerViewer.RenderScene(true);
			return;
		}

		if (!zoomSelectMode) scheduleHoverUpdate(event.clientX, event.clientY);
	}

	function onPointerUp() {
		if (zoomSelection) {
			finishZoomSelection();
			return;
		}
		dragging = false;
	}

	function onPointerCancel() {
		zoomSelection = null;
		dragging = false;
	}

	function onPointerLeave() {
		mousePosition = null;
		hideHoverInfo();
		clearHover();
	}

	// Frames the build-area rectangle. CenterOnRectangle() works in plate coordinates:
	// the build plate image is drawn from (0, 0) to (sizex, sizey) and the toolpath is
	// shifted by the origin (see LayerViewImpl.setOrigin / updateTransform), so the
	// frame is the plate itself, not "-origin .. size - origin". Framing with the origin
	// subtracted (as the Vue 2 client does since "Layer Viewer updates") puts the plate
	// corner into the view center for origin = (sizex/2, sizey/2).
	function centerOnPlatform() {
		if (!layerViewer || !platform) return;
		const sx = platform.sizex || 300;
		const sy = platform.sizey || 300;
		// Optional per-axis padding (in mm) that enlarges the reset zoom window,
		// added on top of the fixed ZOOM_MARGIN on every side.
		const px = platform.paddingx || 0;
		const py = platform.paddingy || 0;
		layerViewer.CenterOnRectangle(
			-ZOOM_MARGIN - px, -ZOOM_MARGIN - py,
			sx + ZOOM_MARGIN + px, sy + ZOOM_MARGIN + py
		);
	}

	function resetView() {
		if (!layerViewer || !platform) return;
		autoFrame = true;
		centerOnPlatform();
		layerViewer.RenderScene(true);
	}

	function fitToPath() {
		if (!layerViewer) return;
		try {
			const bounds = layerViewer.getPathBoundaries?.();
			if (bounds && bounds.radius > 0 && platform) {
				const left = bounds.center.x - bounds.radius + (platform.originx || 0);
				const right = bounds.center.x + bounds.radius + (platform.originx || 0);
				const top = bounds.center.y - bounds.radius + (platform.originy || 0);
				const bottom = bounds.center.y + bounds.radius + (platform.originy || 0);
				autoFrame = false;
				layerViewer.CenterOnRectangle(left, top, right, bottom);
			} else {
				resetView();
			}
			layerViewer.RenderScene(true);
		} catch { resetView(); }
	}

	// The container is recreated whenever the module is hidden and shown again, so the canvas has to be
	// re-attached and the resize observer re-registered. ensureInit () reads and writes state that must
	// not become a dependency of this effect.
	$effect(() => {
		const element = containerEl;
		if (!element) return;

		untrack(() => ensureInit());

		const observer = new ResizeObserver(() => {
			const w = element.clientWidth, h = element.clientHeight;
			if ((w === 0) || (h === 0)) return;

			if (!layerViewer || !glInstance?.renderer || !element.contains(glInstance.renderer.domElement)) {
				ensureInit();
				return;
			}

			layerViewer.updateSize(w, h);
			if (autoFrame) centerOnPlatform();
			layerViewer.RenderScene(true);
		});
		observer.observe(element);

		return () => observer.disconnect();
	});

	onMount(() => {
		module.onDataHasChanged = onDataChanged;

		if (platform) {
			platform.displayed_layer = 0;
			platform.displayed_build = 0;
			platform.displayed_scatterplot = '';
			platform.displayed_overlayimage = '';
		}
	});

	onDestroy(() => {
		module.onDataHasChanged = null;
		stopPlayback();
		hideHoverInfo();
		clearHover();
		pointLoadCounter++;
		if (platform) {
			platform.displayed_layer = 0;
			platform.displayed_build = 0;
			platform.displayed_scatterplot = '';
			platform.displayed_overlayimage = '';
		}
	});
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<!-- Color map legend of the overlay or of the power, time and velocity display modes -->
{#snippet legendPanel(kind: LegendKind)}
	{@const legend = describeLegend(kind)}
	<div class="layerview-legend" data-legend={kind}>
		<div class="layerview-legend-header">
			<span class="layerview-legend-title">{legend.title}</span>
			<button
				type="button"
				class="layerview-legend-btn layerview-legend-preset"
				onclick={() => toggleColorMapMenu(kind)}
				title="Choose a color map"
				aria-label={`Color map: ${legend.colorMapCaption}. Click to choose`}
				aria-expanded={colorMapMenuKind === kind}
			>
				<span>{legend.colorMapCaption}</span>
				<ChevronDown size={12} />
			</button>
			<button
				type="button"
				class="layerview-legend-btn"
				onclick={() => toggleColorMapInverted(kind)}
				title="Invert the color map"
				aria-label="Invert the color map"
				aria-pressed={legend.colorMapInverted}
			>
				<ArrowLeftRight size={12} />
			</button>
			<button
				type="button"
				class="layerview-legend-btn"
				onclick={() => resetLegendRange(kind)}
				disabled={!legend.rangeEdited}
				title={legend.resetTitle}
				aria-label="Reset the range"
			>
				<RotateCcw size={12} />
			</button>
		</div>

		{#if colorMapMenuKind === kind}
			<div class="layerview-legend-menu" role="listbox" aria-label="Color maps">
				{#each colorMapPresets as preset (preset.name)}
					<button
						type="button"
						class="layerview-legend-menu-item"
						class:selected={preset.name === legend.colorMapName}
						role="option"
						aria-selected={preset.name === legend.colorMapName}
						onclick={() => selectColorMap(kind, preset.name)}
					>
						<span class="layerview-legend-menu-preview" style:background={colorMapCSSGradient(preset.name, legend.colorMapInverted)}></span>
						<span>{preset.caption}</span>
					</button>
				{/each}
			</div>
		{/if}

		<div class="layerview-legend-bar" style:background={legend.gradient}></div>
		<div class="layerview-legend-range">
			<input
				type="number"
				step="any"
				value={formatRangeValue(legend.range.min)}
				onchange={(event) => onLegendRangeChange(kind, 'min', event)}
				aria-label={`Minimum ${legend.valueLabel}`}
			/>
			<span class="layerview-legend-mid">{formatRangeValue((legend.range.min + legend.range.max) / 2)}</span>
			<input
				type="number"
				step="any"
				value={formatRangeValue(legend.range.max)}
				onchange={(event) => onLegendRangeChange(kind, 'max', event)}
				aria-label={`Maximum ${legend.valueLabel}`}
			/>
		</div>
		{#if legend.note}
			<div class="layerview-legend-note">{legend.note}</div>
		{/if}
	</div>
{/snippet}

<!-- Look of the laser spots at one kind of positions: diameter in pixels, fill and the colors of laser on and off -->
{#snippet spotPanel(role: SpotRole)}
	{@const style = spotStyles[role]}
	{@const caption = SPOT_ROLE_CAPTIONS[role]}
	<div class="layerview-legend layerview-spots" data-spot-role={role} role="group" aria-label={`${caption} laser spots`}>
		<div class="layerview-legend-header layerview-spots-row">
			<span class="layerview-spots-preview" class:filled={style.fill} style:--spot-color={style.onColor} aria-hidden="true"></span>
			<span class="layerview-legend-title" title={`Laser spots at the ${SPOT_ROLE_DESCRIPTIONS[role]}`}>{caption}</span>
			<span class="layerview-spots-size" title={`Diameter of the ${caption} spots in screen pixels (${SPOT_SIZE_MIN} to ${SPOT_SIZE_MAX})`}>
				<input
					type="number"
					min={SPOT_SIZE_MIN}
					max={SPOT_SIZE_MAX}
					step="1"
					value={style.size}
					oninput={(event) => onSpotSizeInput(role, event)}
					onchange={(event) => onSpotSizeChange(role, event)}
					aria-label={`Diameter of the ${caption} spots in pixels`}
				/>
				<span>px</span>
			</span>
			<button
				type="button"
				class="layerview-legend-btn"
				onclick={() => toggleSpotFill(role)}
				title={`Fill the ${caption} spots with the color of their circle`}
				aria-label={`Fill the ${caption} spots`}
				aria-pressed={style.fill}
			>
				Fill
			</button>
		</div>
		<div class="layerview-spots-colors">
			{#each SPOT_COLOR_KEYS as key (key)}
				<span class="layerview-spots-color">
					<span>{SPOT_COLOR_CAPTIONS[key]}</span>
					<button
						type="button"
						class="layerview-legend-btn"
						onclick={() => toggleSpotColorMenu(role, key)}
						title={`Choose the color of the ${caption} spots recorded with the ${SPOT_COLOR_CAPTIONS[key].toLowerCase()}`}
						aria-label={`${SPOT_COLOR_CAPTIONS[key]} color of the ${caption} spots: ${spotColorCaption(style[key])}. Click to choose`}
						aria-expanded={isSpotColorMenuOpen(role, key)}
						data-spot-color={key}
					>
						<span class="layerview-spots-swatch" style:background={style[key]}></span>
						<ChevronDown size={12} />
					</button>
				</span>
			{/each}
		</div>

		{#if spotColorMenu !== null && spotColorMenu.role === role}
			{@const key = spotColorMenu.key}
			<div class="layerview-legend-menu">
				<div class="layerview-spots-menu-title">{SPOT_COLOR_CAPTIONS[key]}</div>
				<div class="layerview-spots-menu" role="listbox" aria-label={`${SPOT_COLOR_CAPTIONS[key]} colors of the ${caption} spots`}>
					{#each SPOT_COLOR_PRESETS as preset (preset.color)}
						<button
							type="button"
							class="layerview-legend-menu-item"
							class:selected={preset.color === style[key]}
							role="option"
							aria-selected={preset.color === style[key]}
							onclick={() => selectSpotColor(role, key, preset.color)}
						>
							<span class="layerview-spots-swatch" style:background={preset.color}></span>
							<span>{preset.caption}</span>
						</button>
					{/each}
				</div>
				<label class="layerview-legend-menu-item layerview-spots-custom">
					<input
						type="color"
						value={style[key]}
						oninput={(event) => setSpotColor(role, key, (event.target as HTMLInputElement).value)}
					/>
					<span>Other color…</span>
				</label>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet layerViewBody()}
	<div class="layerview-container">
		<!-- WebGL render target — setupDOMElement sets position:relative on this -->
		<div
			bind:this={containerEl}
			class="layerview-canvas"
			class:zoom-select={zoomSelectMode}
			role="img"
			onwheel={onWheel}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerCancel}
			onpointerleave={onPointerLeave}
		></div>

		{#if partOverlays.length > 0}
			<svg class="layerview-part-overlay" aria-hidden="true">
				{#each partOverlays as part (part.key)}
					<g
						class="layerview-part"
						class:highlighted={part.highlighted}
						class:dimmed={highlightPartUUID !== '' && !part.highlighted}
						class:disabled={part.disabled}
					>
						<rect class="layerview-part-box" x={part.left} y={part.top} width={part.width} height={part.height} />
						{#each part.markers as marker, markerIndex (markerIndex)}
							<rect
								class="layerview-part-marker"
								x={marker.x - PART_MARKER_PX / 2}
								y={marker.y - PART_MARKER_PX / 2}
								width={PART_MARKER_PX}
								height={PART_MARKER_PX}
							/>
						{/each}
						<text class="layerview-part-label" x={part.left} y={part.labelY}>{part.label}</text>
					</g>
				{/each}
			</svg>
		{/if}

		{#if zoomRect}
			<div
				class="layerview-zoom-selection"
				style={`left: ${zoomRect.left}px; top: ${zoomRect.top}px; width: ${zoomRect.width}px; height: ${zoomRect.height}px;`}
			></div>
		{/if}

		<!-- Overlaid toolbar, with the platform label and the loading indicator below it -->
		<div class="layerview-top-left">
			<div class="layerview-toolbar">
				<button class="layerview-btn" onclick={resetView} title="Frame the build platform" aria-label="Zoom to platform">
					<Square size={16} />
					<span>Zoom to Platform</span>
				</button>
				<button class="layerview-btn" onclick={fitToPath} title="Frame the parts" aria-label="Zoom to parts">
					<Shapes size={16} />
					<span>Zoom to Parts</span>
				</button>
				<button
					class="layerview-btn"
					onclick={toggleZoomSelectMode}
					title="Drag a rectangle to zoom into it (Esc to cancel)"
					aria-label="Custom zoom: select a rectangle"
					aria-pressed={zoomSelectMode}
				>
					<ZoomIn size={16} />
					<span>Custom Zoom</span>
				</button>
				<button
					class="layerview-btn"
					onclick={() => coordinateSystemOverride = !coordinateSystemVisible}
					title="Toggle coordinate axes"
					aria-label="Toggle coordinate axes"
					aria-pressed={coordinateSystemVisible}
				>
					<Axis3d size={16} />
					<span>Axes</span>
				</button>
				<button
					class="layerview-btn"
					onclick={() => namesMode = !namesMode}
					title="Show part outlines and names"
					aria-label="Toggle part outlines and names"
					aria-pressed={namesMode}
				>
					<Tags size={16} />
					<span>Names</span>
				</button>
				<button
					class="layerview-btn"
					onclick={togglePropertiesMode}
					title="Show segment and recorded point properties on hover"
					aria-label="Toggle segment and point properties inspector"
					aria-pressed={propertiesMode}
				>
					<Info size={16} />
					<span>Properties</span>
				</button>
				<button
					class="layerview-btn"
					onclick={cycleToolpathColorMode}
					title="Change how the toolpath and the recorded points are coloured: profile color, segment type, start time, laser power, velocity or laser on/off. Off hides the recorded points"
					aria-label={`Display mode: ${toolpathColorCaption}. Click to change`}
				>
					<Paintbrush size={16} />
					<span>{toolpathColorCaption}</span>
				</button>
				<button
					class="layerview-btn"
					onclick={() => (endPointsVisible = !endPointsVisible)}
					title="Show the start and end points of the toolpath lines"
					aria-label="Toggle toolpath end points"
					aria-pressed={endPointsVisible}
				>
					<Spline size={16} />
					<span>End Points</span>
				</button>
				{#if toolbarFixed || laserOffPresent}
					<button
						class="layerview-btn"
						onclick={toggleLaserOffPoints}
						disabled={!laserOffAvailable}
						title={laserOffAvailable
							? 'Also show points recorded while the laser was off'
							: (laserOffPresent ? 'The recorded points are hidden by the display mode Off' : 'This layer has no recorded points with the laser state')}
						aria-label="Toggle points with laser off"
						aria-pressed={showLaserOffPoints}
					>
						<ZapOff size={16} />
						<span>Laser Off</span>
					</button>
				{/if}
				{#if toolbarFixed || pointsLoaded || overlayShown}
					<button
						class="layerview-btn"
						onclick={toggleToolpath}
						disabled={!toolpathToggleAvailable}
						title={!toolpathToggleAvailable
							? 'The toolpath is all there is to see on this layer'
							: (overlayShown ? `Show or hide the toolpath above the ${overlayName.toLowerCase()}` : 'Show or hide the toolpath below the recorded points')}
						aria-label="Toggle toolpath"
						aria-pressed={toolpathVisible}
					>
						<Route size={16} />
						<span>Toolpath</span>
					</button>
				{/if}
				{#if overlayName}
					<button
						class="layerview-btn"
						onclick={cycleOverlayState}
						title={overlayButtonTitle}
						aria-label={`${overlayName}: ${overlayState}. Click to change`}
						aria-pressed={overlayMode}
						data-overlay-state={overlayState}
					>
						{#if overlayIcon}
							<MdiIcon icon={overlayIcon} class="h-4 w-4" />
						{:else}
							<Layers size={16} />
						{/if}
						<span>{overlayName}{#if overlayStateCaption}<br />{overlayStateCaption}{/if}</span>
					</button>
				{/if}
				{#if toolbarFixed || (pointsLoaded && primaryRole !== '')}
					<button
						class="layerview-btn"
						onclick={cycleSpotSetMode}
						disabled={!spotSetChoosable}
						title={spotSetButtonTitle}
						aria-label={`Laser spots: ${spotSetButtonCaption || 'none'}. Click to change`}
						data-spot-set={spotSetMode}
					>
						{#if spotSetButtonIconMode === 'target'}
							<Crosshair size={16} />
						{:else if spotSetButtonIconMode === 'status'}
							<CircleDot size={16} />
						{:else}
							<Target size={16} />
						{/if}
						<span>{spotSetButtonCaption || 'Spots'}</span>
					</button>
				{/if}
			</div>

			<!-- Platform label and loading indicator -->
			{#if labelCaption || labelIcon || loadingLayer || loadingPoints || loadingSecondaryPoints || loadingOverlay || (overlayMode && !overlayAvailable)}
				<div class="layerview-status">
					{#if labelCaption || labelIcon}
						<div class="layerview-label">
							{#if labelIcon}<MdiIcon icon={labelIcon} class="h-3.5 w-3.5" />{/if}
							<span>{labelCaption}</span>
						</div>
					{/if}
					{#if overlayMode && !overlayAvailable}
						<div class="layerview-label">
							<MdiIcon icon="mdi-alert-circle-outline" class="h-3.5 w-3.5" />
							<span>{overlayName} not available for this layer</span>
						</div>
					{/if}
					{#if loadingLayer || loadingPoints || loadingSecondaryPoints || loadingOverlay}
						<div class="layerview-label">
							<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
							<span>Loading layer data</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Layer info overlay -->
		{#if layerCount > 0}
			{#if layerJumpOpen}
				<div class="layerview-layer-info layerview-layer-jump">
					<label for="layerjump-{module.uuid}">Layer</label>
					<input
						id="layerjump-{module.uuid}"
						type="number"
						inputmode="numeric"
						min="0"
						max={layerCount - 1}
						step="1"
						bind:value={layerJumpValue}
						onkeydown={onLayerJumpKeyDown}
						onblur={() => (layerJumpOpen = false)}
						{@attach focusAndSelect}
					/>
					<span>/ {layerCount}</span>
				</div>
			{:else}
				<button
					type="button"
					class="layerview-layer-info layerview-layer-info-button"
					onclick={openLayerJump}
					title={sliderFixed ? 'Layer' : 'Click to jump to a layer'}
					aria-label={`Layer ${sliderValue} of ${layerCount}. Click to jump to a layer`}
				>
					Layer {sliderValue} / {layerCount}
				</button>
			{/if}
		{/if}

		{#if coordinateSystemVisible}
			<svg
				class="layerview-coordinate-indicator"
				viewBox="0 0 64 64"
				role="img"
				aria-label={`Machine coordinate axes, rotated ${transformAngle} degrees`}
			>
				<g transform={`translate(32 32) rotate(${-transformAngle})`}>
					<line class="coordinate-axis-x" x1="0" y1="0" x2="24" y2="0" />
					<polygon class="coordinate-axis-x" points="24,0 18,-3 18,3" />
					<text
						class="coordinate-label-x"
						x="27"
						y="4"
						transform={`rotate(${transformAngle} 27 4)`}
					>X</text>

					<line class="coordinate-axis-y" x1="0" y1="0" x2="0" y2="-24" />
					<polygon class="coordinate-axis-y" points="0,-24 -3,-18 3,-18" />
					<text
						class="coordinate-label-y"
						x="4"
						y="-24"
						transform={`rotate(${transformAngle} 4 -24)`}
					>Y</text>
				</g>
			</svg>
		{/if}

		<!-- Spot panels of the shown positions, above the color map legends of the display mode and of the overlay -->
		{#if bottomLeftVisible}
			<div
				class="layerview-bottom-left"
				class:above-coordinates={coordinateSystemVisible}
				class:above-time-slider={!coordinateSystemVisible && showTimeSlider && timelineDuration > 0}
			>
				{#each shownSpotRoles as role (role)}
					{@render spotPanel(role)}
				{/each}
				{#each shownLegends as kind (kind)}
					{@render legendPanel(kind)}
				{/each}
			</div>
		{/if}

		<!-- Live cursor position readout (machine coordinates, mm) -->
		{#if mousePosition}
			<div class="layerview-mouse-pos" class:above-time-slider={showTimeSlider && timelineDuration > 0}>
				X: {mousePosition.x.toFixed(2)} &middot; Y: {mousePosition.y.toFixed(2)} mm
			</div>
		{/if}

		<!-- Info about the point or toolpath segment under the mouse -->
		{#if hoverInfo.visible && !propertiesMode}
			<div
				class="layerview-hover-info"
				style="left: {hoverInfo.x}px; top: {hoverInfo.y}px; transform: translate({hoverInfo.flipX ? 'calc(-100% - 12px)' : '12px'}, {hoverInfo.flipY ? 'calc(-100% - 12px)' : '12px'});"
			>{hoverInfo.text}</div>
		{/if}

		<!-- Recorded point inspector popup (Properties toggle) -->
		{#if propertiesMode && hoverPoint}
			{#if hoverPointScreen}
				<div
					class="layerview-point-marker"
					style={`left: ${hoverPointScreen.x}px; top: ${hoverPointScreen.y}px;`}
				></div>
			{/if}
			<div
				class="layerview-segment-popup"
				style={`left: ${hoverScreen.x + 14}px; top: ${hoverScreen.y + 14}px;`}
			>
				<div class="layerview-segment-popup-title">
					Sample #{hoverPoint.index}{primaryRole !== '' ? ` · ${SPOT_ROLE_CAPTIONS[hoverPoint.secondary && secondaryRole !== '' ? secondaryRole : primaryRole]}` : ''}
				</div>
				<dl class="layerview-segment-popup-list">
					{#if hoverPoint.time !== null}
						<dt>Time</dt>
						<dd>{hoverPoint.time.toFixed(2)} ms</dd>
					{/if}
					{#if primaryRole !== ''}
						{#each SPOT_ROLES as role (role)}
							{@const positionX = role === primaryRole ? hoverPoint.primaryx : (role === secondaryRole ? hoverPoint.secondaryx : null)}
							{@const positionY = role === primaryRole ? hoverPoint.primaryy : (role === secondaryRole ? hoverPoint.secondaryy : null)}
							{#if positionX !== null && positionY !== null}
								<dt>{SPOT_ROLE_CAPTIONS[role]}</dt>
								<dd>{formatMillimeters(positionX, positionY)}</dd>
							{/if}
						{/each}
					{:else}
						<dt>Build X/Y</dt>
						<dd>{formatMillimeters(hoverPoint.x, hoverPoint.y)}</dd>
					{/if}
					{#if hoverPoint.scannerx !== null && hoverPoint.scannery !== null}
						<dt>Scanner X/Y</dt>
						<dd>{formatMillimeters(hoverPoint.scannerx, hoverPoint.scannery)}</dd>
					{/if}
					{#if hoverPoint.laseron !== null}
						<dt>Laser</dt>
						<dd>{hoverPoint.laseron !== 0 ? 'On' : 'Off'}</dd>
					{/if}
					{#if hoverPoint.power !== null}
						<dt>Power (raw)</dt>
						<dd>{Math.round(hoverPoint.power).toLocaleString()}</dd>
					{/if}
					<dt>Velocity</dt>
					<dd>{Math.round(hoverPoint.velocity).toLocaleString()} mm/s</dd>
				</dl>
			</div>
		{/if}

		<!-- Support point of the highlighted nonlinear power ramp (Properties toggle) -->
		{#if propertiesMode && hoverSupportPoint}
			{#if hoverSupportPointScreen}
				<div
					class="layerview-point-marker layerview-support-point-marker"
					style={`left: ${hoverSupportPointScreen.x}px; top: ${hoverSupportPointScreen.y}px;`}
				></div>
			{/if}
			<div
				class="layerview-segment-popup"
				style={`left: ${hoverScreen.x + 14}px; top: ${hoverScreen.y + 14}px;`}
			>
				<div class="layerview-segment-popup-title">
					{#if hoverSupportPoint.index === 0}
						Start point
					{:else if hoverSupportPoint.index === hoverSupportPoint.count - 1}
						End point
					{:else}
						Support point {hoverSupportPoint.index} of {hoverSupportPoint.count - 2}
					{/if}
				</div>
				<dl class="layerview-segment-popup-list">
					<dt>Laser power</dt>
					<dd>{formatWatts(hoverSupportPoint.power)}</dd>
					<dt>Parameter t</dt>
					<dd>{hoverSupportPoint.t.toFixed(3)}</dd>
					<dt>Distance</dt>
					<dd>{hoverSupportPoint.distance.toFixed(3)} / {hoverSupportPoint.length.toFixed(3)} mm</dd>
					{#if hoverSupportPoint.previous}
						<dt>Incoming</dt>
						<dd>{formatRampPiece(hoverSupportPoint.previous, hoverSupportPoint)}</dd>
						<dt>Slope</dt>
						<dd>{formatRampGradient(hoverSupportPoint.previous, hoverSupportPoint)}</dd>
					{/if}
					{#if hoverSupportPoint.next}
						<dt>Outgoing</dt>
						<dd>{formatRampPiece(hoverSupportPoint, hoverSupportPoint.next)}</dd>
						<dt>Slope</dt>
						<dd>{formatRampGradient(hoverSupportPoint, hoverSupportPoint.next)}</dd>
					{/if}
				</dl>
			</div>
		{:else if propertiesMode && hoverSegment}
			<!-- Segment property inspector popup (Properties toggle) -->
			<div
				class="layerview-segment-popup"
				style={`left: ${hoverScreen.x + 14}px; top: ${hoverScreen.y + 14}px;`}
			>
				{#if hoverSegment.profilename}
					<div class="layerview-segment-popup-title">{hoverSegment.profilename}</div>
				{/if}
				<dl class="layerview-segment-popup-list">
					{#if hoverSegmentPower}
						<dt>Power mode</dt>
						<dd>{hoverSegmentPower.mode}{hoverSegmentPower.nominalOnly ? ' (no factors)' : ''}</dd>
						<dt>Laser power</dt>
						<dd>{formatPowerRange(hoverSegmentPower.start, hoverSegmentPower.end)}</dd>
						{#if hoverSegmentPower.supportPointCount > 0}
							<dt>Power range</dt>
							<dd>{formatPowerRange(hoverSegmentPower.minimum, hoverSegmentPower.maximum)}</dd>
							<dt>Support points</dt>
							<dd>{hoverSegmentPower.supportPointCount}</dd>
						{/if}
					{/if}
					<dt>Laser speed</dt>
					<dd>{Number(hoverSegment.laserspeed ?? 0).toLocaleString()} mm/s</dd>
					{#if hoverSegment.type}
						<dt>Type</dt>
						<dd>{hoverSegment.type}</dd>
					{/if}
					{#if hoverSegment.laserindex !== undefined && hoverSegment.laserindex !== null}
						<dt>Laser</dt>
						<dd>#{hoverSegment.laserindex}</dd>
					{/if}
					{#if hoverSegment.partname}
						<dt>Part</dt>
						<dd>{clipText(hoverSegment.partname, POPUP_PART_NAME_MAX_CHARACTERS)}{hoverSegment.partdisabled ? ' (disabled)' : ''}</dd>
					{/if}
					{#if hoverSegment.partid !== undefined && hoverSegment.partid !== null}
						<dt>Part ID</dt>
						<dd>{hoverSegment.partid}</dd>
					{/if}
				</dl>
			</div>
		{/if}

		<!-- Time slider (horizontal): caps toolpath and recorded points at a fraction of the layer time -->
		{#if showTimeSlider && timelineDuration > 0}
			<div class="layerview-time-wrap">
				<span class="layerview-time-label" title={timingSourceCaption}>
					t = {timeCapCaption}
				</span>
				<input
					type="range"
					class="layerview-time-slider"
					min="0"
					max={TIME_SLIDER_STEPS}
					value={timeSliderValue}
					oninput={onTimeSliderInput}
					aria-label="Layer time"
					aria-valuetext={timeCapCaption}
				/>
				<div class="layerview-time-buttons">
					<button class="layerview-time-btn" onclick={moveToStart} title="Move to the start of the layer" aria-label="Move to start">
						<SkipBack size={14} />
					</button>
					<button class="layerview-time-btn" onclick={moveToEnd} title="Move to the end of the layer" aria-label="Move to end">
						<SkipForward size={14} />
					</button>
					<button class="layerview-time-btn" onclick={startPlayback} disabled={playing} title="Play the layer in real time" aria-label="Start playing">
						<Play size={14} />
					</button>
					<button class="layerview-time-btn" onclick={stopPlayback} disabled={!playing} title="Stop playing" aria-label="Stop playing">
						<Square size={14} />
					</button>
				</div>
			</div>
		{/if}

		<!-- Layer slider (vertical) with -/+ step buttons -->
		{#if layerCount > 0}
			<div class="layerview-slider-wrap">
				{#if !sliderFixed}
					<button class="layerview-btn layerview-step" onclick={() => changeLayerTo(sliderValue + 1)} disabled={sliderValue >= layerCount - 1} title="Next layer" aria-label="Next layer">
						<Plus size={14} />
					</button>
				{/if}
				<input
					type="range"
					class="layerview-slider"
					min="0"
					max={layerCount - 1}
					value={sliderValue}
					disabled={sliderFixed}
					oninput={onSliderInput}
					onchange={onSliderChange}
					onpointerup={onSliderRelease}
					aria-label="Layer"
					aria-orientation="vertical"
				/>
				{#if !sliderFixed}
					<button class="layerview-btn layerview-step" onclick={() => changeLayerTo(sliderValue - 1)} disabled={sliderValue <= 0} title="Previous layer" aria-label="Previous layer">
						<Minus size={14} />
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

{#if visible}
	{#if isCard}
		<Card.Root class="flex flex-col h-full min-h-0">
			{#if cardTitle}
				<Card.Header class="pb-1">
					<Card.Title>{cardTitle}</Card.Title>
					{#if cardSubtitle}
						<Card.Description>{cardSubtitle}</Card.Description>
					{/if}
				</Card.Header>
			{/if}
			<Card.Content class="flex-1 min-h-0 overflow-hidden flex flex-col">
				{@render layerViewBody()}
			</Card.Content>
		</Card.Root>
	{:else}
		{@render layerViewBody()}
	{/if}
{/if}

<style>
	.layerview-container {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
	.layerview-canvas {
		width: 100%;
		height: 100%;
		cursor: crosshair;
	}
	.layerview-canvas.zoom-select {
		cursor: zoom-in;
	}
	.layerview-zoom-selection {
		position: absolute;
		border: 1px dashed var(--primary, #2563eb);
		background: color-mix(in srgb, var(--primary, #2563eb) 15%, transparent);
		pointer-events: none;
		z-index: 9;
	}
	.layerview-part-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
		pointer-events: none;
		z-index: 8;
	}
	.layerview-part-box {
		fill: none;
		stroke: var(--foreground, #333333);
		stroke-width: 1;
		stroke-dasharray: 4 3;
	}
	.layerview-part-marker {
		fill: #ef4444;
	}
	.layerview-part-label {
		font-size: 10px;
		font-weight: 600;
		fill: var(--foreground, #333333);
		/* Halo keeps the label legible on top of dense hatching. */
		paint-order: stroke;
		stroke: var(--background, #ffffff);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.layerview-part.highlighted .layerview-part-box {
		stroke: var(--primary, #2563eb);
		stroke-width: 2;
		stroke-dasharray: none;
		fill: color-mix(in srgb, var(--primary, #2563eb) 12%, transparent);
	}
	.layerview-part.highlighted .layerview-part-marker {
		fill: var(--primary, #2563eb);
	}
	.layerview-part.highlighted .layerview-part-label {
		fill: var(--primary, #2563eb);
		font-size: 11px;
	}
	.layerview-part.dimmed {
		opacity: 0.45;
	}
	.layerview-part.disabled .layerview-part-box {
		stroke: var(--muted-foreground, #888888);
	}
	.layerview-part.disabled .layerview-part-marker {
		fill: var(--muted-foreground, #888888);
	}
	.layerview-part.disabled .layerview-part-label {
		fill: var(--destructive, #dc2626);
		text-decoration: line-through;
	}
	.layerview-top-left {
		position: absolute;
		top: 8px;
		left: 8px;
		/* Leave room for the layer-info badge in the top-right corner */
		max-width: calc(100% - 140px);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		z-index: 10;
		pointer-events: none;
	}
	.layerview-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		pointer-events: auto;
	}
	.layerview-btn {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		width: 64px;
		height: 56px;
		padding: 6px 4px;
		border: none;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.65);
		color: white;
		font-size: 11px;
		cursor: pointer;
		transition: background-color 0.2s;
	}
	/* Two-word captions such as "Zoom to Platform" wrap onto two centered lines. */
	.layerview-btn span {
		line-height: 1.15;
		text-align: center;
	}
	.layerview-btn:hover:not(:disabled) {
		background-color: rgba(0, 0, 0, 0.85);
	}
	.layerview-btn[aria-pressed='true'] {
		background-color: var(--primary, #2563eb);
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.65);
	}
	/* A button with nothing to act on stays in its place, grey and without a reaction. */
	.layerview-btn:disabled {
		filter: grayscale(1);
		opacity: 0.4;
		cursor: default;
	}
	.layerview-step {
		width: 24px;
		height: 24px;
		padding: 0;
	}
	.layerview-status {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		max-width: 100%;
	}
	.layerview-label {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		max-width: 100%;
		padding: 4px 10px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.65);
		color: white;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.layerview-label span {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.layerview-layer-info {
		position: absolute;
		top: 8px;
		right: 8px;
		padding: 4px 10px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.65);
		color: white;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		z-index: 10;
	}
	.layerview-layer-info-button {
		border: none;
		cursor: pointer;
	}
	.layerview-layer-info-button:hover {
		background: rgba(0, 0, 0, 0.85);
	}
	.layerview-layer-jump {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 6px 2px 10px;
	}
	.layerview-layer-jump input {
		width: 64px;
		padding: 1px 4px;
		border: 1px solid rgba(255, 255, 255, 0.5);
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.95);
		color: #111111;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.layerview-coordinate-indicator {
		position: absolute;
		left: 8px;
		bottom: 8px;
		width: 64px;
		height: 64px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.35);
		pointer-events: none;
		z-index: 9;
	}
	.coordinate-axis-x {
		fill: #ef4444;
		stroke: #ef4444;
		stroke-width: 2;
	}
	.coordinate-axis-y {
		fill: #22c55e;
		stroke: #22c55e;
		stroke-width: 2;
	}
	.coordinate-label-x,
	.coordinate-label-y {
		font-size: 11px;
		font-weight: 600;
		text-anchor: middle;
		stroke: none;
	}
	.coordinate-label-x {
		fill: #ef4444;
	}
	.coordinate-label-y {
		fill: #22c55e;
	}
	/* Spot panels and legends, stacked upwards from the bottom left corner. */
	.layerview-bottom-left {
		position: absolute;
		left: 8px;
		bottom: 8px;
		width: 260px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		z-index: 11;
	}
	/* Above the coordinate indicator (bottom 8px + 64px) or the time slider. */
	.layerview-bottom-left.above-coordinates {
		bottom: 80px;
	}
	.layerview-bottom-left.above-time-slider {
		bottom: 44px;
	}
	.layerview-legend {
		position: relative;
		padding: 6px 8px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.72);
		color: white;
		font-size: 11px;
	}
	.layerview-spots-row {
		margin-bottom: 0;
	}
	.layerview-spots-preview {
		flex: none;
		box-sizing: border-box;
		width: 12px;
		height: 12px;
		border: 2px solid var(--spot-color);
		border-radius: 50%;
	}
	.layerview-spots-preview.filled {
		background: color-mix(in srgb, var(--spot-color) 55%, transparent);
	}
	.layerview-spots-swatch {
		flex: none;
		display: inline-block;
		width: 14px;
		height: 10px;
		border-radius: 2px;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
	}
	.layerview-spots-size {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: rgba(255, 255, 255, 0.75);
	}
	.layerview-spots-size input {
		width: 44px;
		padding: 1px 4px;
		border: 1px solid rgba(255, 255, 255, 0.35);
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.95);
		color: #111111;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.layerview-spots-colors {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 4px;
		/* Lines up with the caption after the preview circle (12px + 4px gap). */
		padding-left: 16px;
	}
	.layerview-spots-color {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: rgba(255, 255, 255, 0.75);
	}
	.layerview-spots-menu-title {
		padding: 0 6px 3px;
		color: rgba(255, 255, 255, 0.75);
		font-size: 10px;
	}
	.layerview-spots-menu {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 2px;
	}
	.layerview-spots-custom {
		margin-top: 2px;
	}
	.layerview-spots-custom input {
		flex: none;
		width: 22px;
		height: 16px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
	}
	.layerview-legend-header {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 5px;
	}
	.layerview-legend-title {
		flex: 1;
		min-width: 0;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.layerview-legend-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 3px;
		height: 20px;
		min-width: 22px;
		padding: 0 5px;
		border: 1px solid rgba(255, 255, 255, 0.25);
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.08);
		color: white;
		font-size: 11px;
		cursor: pointer;
	}
	.layerview-legend-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
	}
	.layerview-legend-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.layerview-legend-btn[aria-pressed='true'] {
		background-color: var(--primary, #2563eb);
	}
	.layerview-legend-preset span {
		max-width: 110px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.layerview-legend-menu {
		position: absolute;
		left: 0;
		bottom: calc(100% + 4px);
		width: 100%;
		padding: 4px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.88);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
	}
	.layerview-legend-menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 4px 6px;
		border: none;
		border-radius: 3px;
		background: transparent;
		color: white;
		font-size: 11px;
		text-align: left;
		cursor: pointer;
	}
	.layerview-legend-menu-item:hover,
	.layerview-legend-menu-item.selected {
		background: rgba(255, 255, 255, 0.15);
	}
	.layerview-legend-menu-preview {
		flex: none;
		width: 90px;
		height: 10px;
		border-radius: 2px;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
	}
	.layerview-legend-bar {
		height: 12px;
		border-radius: 2px;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
	}
	.layerview-legend-range {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		margin-top: 4px;
	}
	.layerview-legend-range input {
		width: 72px;
		padding: 1px 4px;
		border: 1px solid rgba(255, 255, 255, 0.35);
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.95);
		color: #111111;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.layerview-legend-range input:last-child {
		text-align: right;
	}
	.layerview-legend-mid {
		color: rgba(255, 255, 255, 0.75);
		font-variant-numeric: tabular-nums;
	}
	.layerview-legend-note {
		margin-top: 4px;
		color: rgba(255, 255, 255, 0.75);
		font-size: 10px;
	}
	.layerview-mouse-pos {
		position: absolute;
		/* Shifted left so it clears the vertical layer slider on the right edge. */
		right: 40px;
		bottom: 8px;
		padding: 4px 10px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.65);
		color: white;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		pointer-events: none;
		z-index: 10;
	}
	.layerview-mouse-pos.above-time-slider {
		bottom: 48px;
	}
	.layerview-time-wrap {
		position: absolute;
		/* Between the coordinate indicator (bottom-left) and the layer slider (right edge). */
		left: 80px;
		right: 40px;
		bottom: 8px;
		display: flex;
		align-items: center;
		gap: 10px;
		z-index: 10;
	}
	.layerview-time-label {
		flex: none;
		min-width: 190px;
		padding: 4px 10px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.65);
		color: white;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.layerview-time-slider {
		flex: 1;
		min-width: 0;
		accent-color: var(--primary, #2563eb);
	}
	.layerview-time-buttons {
		flex: none;
		display: flex;
		gap: 4px;
	}
	.layerview-time-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 24px;
		border: none;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.65);
		color: white;
		cursor: pointer;
	}
	.layerview-time-btn:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.85);
	}
	.layerview-time-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.layerview-hover-info {
		position: absolute;
		z-index: 20;
		padding: 5px 8px;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.75);
		color: white;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		white-space: pre-line;
		pointer-events: none;
	}
	.layerview-point-marker {
		position: absolute;
		width: 14px;
		height: 14px;
		margin: -7px 0 0 -7px;
		border: 2px solid #00e5ff;
		border-radius: 50%;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
		pointer-events: none;
		z-index: 15;
	}
	.layerview-support-point-marker {
		border-color: #ffb300;
	}
	.layerview-segment-popup {
		position: absolute;
		min-width: 150px;
		max-width: 280px;
		padding: 8px 10px;
		border-radius: 6px;
		background: rgba(0, 0, 0, 0.82);
		color: white;
		font-size: 11px;
		line-height: 1.35;
		pointer-events: none;
		z-index: 20;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
	}
	.layerview-segment-popup-title {
		font-weight: 600;
		margin-bottom: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.layerview-segment-popup-list {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 2px 12px;
		margin: 0;
	}
	.layerview-segment-popup-list dt {
		color: rgba(255, 255, 255, 0.65);
		white-space: nowrap;
	}
	.layerview-segment-popup-list dd {
		margin: 0;
		min-width: 0;
		overflow: hidden;
		text-align: right;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.layerview-slider-wrap {
		position: absolute;
		right: 8px;
		/* Anchor between the layer-info badge (top-right) and the bottom edge
		   so the slider spans nearly the full height of the view. */
		top: 44px;
		bottom: 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		z-index: 10;
	}
	.layerview-slider {
		writing-mode: vertical-lr;
		direction: rtl;
		flex: 1;
		min-height: 0;
		width: 20px;
		accent-color: var(--primary, #2563eb);
	}
</style>
