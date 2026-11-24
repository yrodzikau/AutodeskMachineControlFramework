// Run with: cd Client/tests && npm test   (or from the repository root: node --test 'Client/tests/*.test.mjs')
//
// Recorded points of the layer view (LayerViewImpl): the point sets with a spot style. The viewer decides here what
// is drawn and when the buffers of the points have to be built anew, which is the expensive part on layers with
// millions of samples:
// - a spot style colors its points by their laser state or by the values of a data channel; only a change of what a
//   set shows (visibility, color source, channel, column) builds new points, a change of its look (colors, color
//   map, value range, size, fill) only updates the drawn ones;
// - points drawn with a spot style do not take the colors of the display mode, so a change of the display mode, of
//   its color map or of its value range neither computes those colors nor rebuilds the points;
// - where the points lie closer on the screen than their look needs, only every 2nd, 4th, 8th ... is drawn; spots
//   of light are drawn smaller where they would overload the graphics card.
// The WebGL side is replaced by a stand-in that records what the viewer asks it to draw.

import { test } from "node:test";
import assert from "node:assert/strict";

import { importCore } from "./support/coreLoader.mjs";

const LayerViewImpl = await importCore ("common/AMCImplementation_LayerView.js");

const POINTS = "layerdata_points";
const SECONDARY_POINTS = "layerdata_secondarypoints";

class FakePointsElement {

	constructor (pointsData, zValue, pointPixelSize, pointsColor, vertexColors, spotStyle, pointStates, pointValues) {
		this.pointsData = pointsData;
		this.pointCount = Math.floor (pointsData.length / 2);
		this.pointPixelSize = pointPixelSize;
		this.vertexColors = vertexColors || null;
		this.pointStates = pointStates || null;
		this.pointValues = pointValues || null;
		this.spotStyles = spotStyle ? [spotStyle] : [];
		this.stride = 1;
		this.drawCount = this.pointCount;
		this.position = { x: 0, y: 0, z: 0 };
		// Points the viewer is told to have in view; all of them unless a test says otherwise.
		this.pointsInView = this.pointCount;
	}

	get spotStyle () { return this.spotStyles[this.spotStyles.length - 1] || null; }

	setPointPixelSize (pointPixelSize) { this.pointPixelSize = pointPixelSize; }
	setStride (stride) { this.stride = stride; }
	getStride () { return this.stride; }
	setSpotStyle (spotStyle) { this.spotStyles.push (spotStyle); }
	setDrawCount (drawCount) { this.drawCount = drawCount; }
	setPosition (x, y, z) { this.position = { x, y, z }; }
	setPositionXY (x, y) { this.position.x = x; this.position.y = y; }
	setScaleXY () {}
	setRotationZ () {}
	countPointsInScreenRectangle () { return this.pointsInView; }
	findNearestPointWithDistance () { return null; }

}

class FakeWebGL {

	constructor () {
		this.elements = new Map ();
		// Identifiers of the point elements in the order they were built.
		this.built = [];
		this.pixelRatio = 1.0;
		this.maxPointPixelSize = 1024.0;
	}

	findElement (identifier) { return this.elements.get (identifier) || null; }
	removeElement (identifier) { this.elements.delete (identifier); }

	add2DScreenPointsGeometry (identifier, ...parameters) {
		const element = new FakePointsElement (...parameters);
		this.elements.set (identifier, element);
		this.built.push (identifier);
		return element;
	}

	add2DGridGeometry () {}
	add2DLineGeometry () {}
	getPixelRatio () { return this.pixelRatio; }
	getMaxPointPixelSize () { return this.maxPointPixelSize; }
	renderScene () {}
	resizeTo () {}
	setup2DView () {}
	setBackgroundColor () {}

}

// Samples along one straight line, step apart: positions the scanner reported (the points of the viewer) and the
// positions it was commanded to (the secondary points), with the laser state, the laser power and an OIE value.
function createViewer (options = {}) {
	const count = options.count ?? 8;
	const step = options.step ?? 0.01;
	const laserOn = options.laserOn ?? new Array (count).fill (1);
	const status = new Float32Array (count * 2);
	const target = new Float32Array (count * 2);
	const power = new Float32Array (count);
	const sensor = new Float32Array (count);
	for (let index = 0; index < count; index++) {
		status[index * 2] = index * step;
		target[index * 2] = index * step;
		target[index * 2 + 1] = 0.05;
		power[index] = 100 + index;
		sensor[index] = 1000 + 10 * index;
	}

	const gl = new FakeWebGL ();
	const viewer = new LayerViewImpl (gl);
	viewer.updateSize (1000, 800);
	viewer.loadPoints (status);
	viewer.loadPointsChannelData ("laser", "laseron", new Float32Array (laserOn));
	viewer.loadPointsChannelData ("laser", "power", power);
	viewer.updateTiming ();
	viewer.setColorMode ("toolpath");
	viewer.loadSecondaryPoints (target);
	if (options.withoutOIE !== true)
		viewer.loadPointsChannelData ("oie", "sensor1", sensor);
	return { gl, viewer, power, sensor };
}

// Sets the zoom: pixels on the screen per unit of the positions.
function setScaling (viewer, scaling) {
	viewer.transform.scaling = scaling;
	viewer.updateTransform ();
}

const laserStateStyle = (extra) => ({ visible: true, onColor: 0xe53935, offColor: 0x1e88e5, size: 6, fill: true, ...extra });
const powerStyle = (extra) => ({
	visible: true, colorSource: "values", valueChannel: "laser", valueColumn: "power",
	colorMap: "cooltowarm", valueMin: 100, valueMax: 300, size: 6, fill: true, ...extra
});
const temperatureStyle = (extra) => ({
	visible: true, look: "glow", colorSource: "values", valueChannel: "oie", valueColumn: "sensor1",
	colorMap: "cooltowarm", valueMin: 1000, valueMax: 3000, size: 16, fill: true, ...extra
});

test ("a spot style is completed with defaults", () => {
	assert.equal (LayerViewImpl.normalizePointSetStyle (null), null);

	const laserState = LayerViewImpl.normalizePointSetStyle ({ onColor: 0xff0000, offColor: 0x0000ff, size: 10 });
	assert.equal (laserState.visible, true);
	assert.equal (laserState.look, "circle");
	assert.equal (laserState.colorSource, "laserstate");
	assert.equal (laserState.fill, false);
	// A channel only means something for a style that colors by values.
	assert.equal (LayerViewImpl.normalizePointSetStyle (laserStateStyle ({ valueChannel: "laser", valueColumn: "power" })).valueChannel, "");

	const values = LayerViewImpl.normalizePointSetStyle (temperatureStyle ({ valueMin: "x" }));
	assert.equal (values.look, "glow");
	assert.equal (values.colorSource, "values");
	assert.equal (values.valueChannel, "oie");
	assert.equal (values.valueColumn, "sensor1");
	assert.equal (values.valueMin, 0.0);
	assert.equal (values.valueMax, 3000);
});

test ("points with a spot style are colored by their laser state or by the values of a channel", () => {
	const { gl, viewer, power } = createViewer ({ laserOn: [1, 0, 1, 1, 0, 1, 1, 1] });

	viewer.setPointSetStyles (laserStateStyle (), powerStyle ());
	const statusPoints = gl.findElement (POINTS);
	const targetPoints = gl.findElement (SECONDARY_POINTS);

	// The points recorded with the laser off are hidden: six of eight are left, in both sets.
	assert.equal (statusPoints.pointCount, 6);
	assert.equal (targetPoints.pointCount, 6);
	assert.deepEqual (Array.from (statusPoints.pointStates), [1, 1, 1, 1, 1, 1]);
	assert.equal (statusPoints.pointValues, null);
	// The values follow the same selection as the positions.
	assert.deepEqual (Array.from (targetPoints.pointValues), [power[0], power[2], power[3], power[5], power[6], power[7]]);
	assert.equal (targetPoints.pointStates, null);
	assert.equal (targetPoints.spotStyle.valueMin, 100);
	assert.equal (targetPoints.spotStyle.valueMax, 300);
	assert.equal (targetPoints.spotStyle.colorTable.length, 256 * 4);

	viewer.showLaserOffPoints = true;
	viewer.updateLayerPoints ();
	assert.equal (gl.findElement (POINTS).pointCount, 8);
	assert.deepEqual (Array.from (gl.findElement (POINTS).pointStates), [1, 0, 1, 1, 0, 1, 1, 1]);
	assert.deepEqual (Array.from (gl.findElement (SECONDARY_POINTS).pointValues), Array.from (power));
});

test ("a set colored by values is drawn once its values are loaded", () => {
	const { gl, viewer, sensor } = createViewer ({ withoutOIE: true });

	viewer.setPointSetStyles (temperatureStyle (), powerStyle ());
	assert.equal (gl.findElement (POINTS), null);
	assert.notEqual (gl.findElement (SECONDARY_POINTS), null);

	viewer.loadPointsChannelData ("oie", "sensor1", sensor);
	viewer.updateLayerPoints ();
	assert.deepEqual (Array.from (gl.findElement (POINTS).pointValues), Array.from (sensor));
	// Spots of light lie below the other spots and are picked close to their centre only.
	assert.equal (gl.findElement (POINTS).spotStyle.glow, true);
	assert.equal (gl.findElement (POINTS).spotStyle.pickRadius, 8);
	assert.ok (gl.findElement (POINTS).position.z < gl.findElement (SECONDARY_POINTS).position.z);
});

test ("a change of the look updates the drawn points, a change of what a set shows builds new ones", () => {
	const { gl, viewer } = createViewer ();
	viewer.setPointSetStyles (temperatureStyle (), powerStyle ());
	const builtBefore = gl.built.length;
	const temperaturePoints = gl.findElement (POINTS);
	const powerPoints = gl.findElement (SECONDARY_POINTS);

	viewer.setPointSetStyles (temperatureStyle ({ size: 40, colorMap: "jet", colorMapInverted: true, valueMin: 1500, valueMax: 2500 }),
		powerStyle ({ fill: false, size: 12, valueMax: 400 }));
	assert.equal (gl.built.length, builtBefore);
	assert.equal (gl.findElement (POINTS), temperaturePoints);
	assert.equal (temperaturePoints.spotStyle.valueMin, 1500);
	assert.equal (temperaturePoints.spotStyle.valueMax, 2500);
	assert.equal (temperaturePoints.spotStyle.colorTableKey, "jet|inverted");
	assert.equal (temperaturePoints.pointPixelSize, 40);
	assert.equal (powerPoints.spotStyle.valueMax, 400);
	// A circle without fill is drawn as a ring.
	assert.ok (powerPoints.spotStyle.ringWidth > 0);

	// The same style again does nothing at all.
	const updatesBefore = temperaturePoints.spotStyles.length;
	viewer.setPointSetStyles (temperatureStyle ({ size: 40, colorMap: "jet", colorMapInverted: true, valueMin: 1500, valueMax: 2500 }),
		powerStyle ({ fill: false, size: 12, valueMax: 400 }));
	assert.equal (temperaturePoints.spotStyles.length, updatesBefore);

	// Another column, another color source or the visibility need new points.
	viewer.setPointSetStyles (temperatureStyle ({ valueChannel: "laser", valueColumn: "power" }), powerStyle ());
	assert.ok (gl.built.length > builtBefore);
	const builtAfterColumn = gl.built.length;
	viewer.setPointSetStyles (laserStateStyle (), powerStyle ());
	assert.ok (gl.built.length > builtAfterColumn);
	const builtAfterSource = gl.built.length;
	viewer.setPointSetStyles (laserStateStyle (), powerStyle ({ visible: false }));
	assert.ok (gl.built.length > builtAfterSource);
	assert.equal (gl.findElement (SECONDARY_POINTS), null);
});

test ("points with a spot style ignore the colors of the display mode", () => {
	const { gl, viewer } = createViewer ();
	viewer.setToolpathColorMode ("power");
	viewer.setPointSetStyles (temperatureStyle (), powerStyle ());
	const builtBefore = gl.built.length;

	// What the legend of the display mode changes: color map, value range and the mode itself.
	viewer.setColorMap ("jet", true);
	viewer.setColorRange ("power", 0, 400);
	viewer.setToolpathColorMode ("time");
	viewer.setToolpathColorMode ("power");
	assert.equal (gl.built.length, builtBefore);
	assert.equal (viewer.layerPointsColorArray, null);

	// Without the spot styles the points take the colors of the display mode again, computed when they are built.
	viewer.setPointSetStyles (null, null);
	const plainPoints = gl.findElement (POINTS);
	assert.equal (plainPoints.vertexColors.length, 8);
	assert.equal (gl.findElement (SECONDARY_POINTS), null);

	// And for them a change of the display mode does build new points, as before.
	const builtPlain = gl.built.length;
	viewer.setColorMap ("cooltowarm", false);
	assert.equal (gl.built.length, builtPlain + 1);
	assert.notDeepEqual (gl.findElement (POINTS).vertexColors, plainPoints.vertexColors);
});

test ("the value range of a channel column can be limited to the points recorded with the laser on", () => {
	const { viewer } = createViewer ({ laserOn: [0, 1, 1, 1, 1, 1, 1, 0] });

	assert.deepEqual (viewer.getPointChannelRange ("laser", "power", false), { min: 100, max: 107 });
	assert.deepEqual (viewer.getPointChannelRange ("laser", "power", true), { min: 101, max: 106 });
	assert.equal (viewer.getPointChannelRange ("laser", "nosuchcolumn", true), null);
	assert.equal (viewer.getPointChannelRange ("nosuchchannel", "power", true), null);

	// A layer without a single point with the laser on falls back to all of its points.
	const dark = createViewer ({ laserOn: new Array (8).fill (0) }).viewer;
	assert.deepEqual (dark.getPointChannelRange ("oie", "sensor1", true), { min: 1000, max: 1070 });
});

test ("the value of a point is read from the channel that is asked for", () => {
	const { viewer } = createViewer ();

	assert.equal (viewer.getPointChannelValue ("power", 3), 103);
	assert.equal (viewer.getPointChannelValue ("sensor1", 3, "oie"), 1030);
	assert.equal (viewer.getPointChannelValue ("sensor1", 3), null);
	assert.equal (viewer.getPointChannelValue ("sensor1", 99, "oie"), null);
	assert.equal (viewer.getPointChannelValue ("sensor1", 3, "nosuchchannel"), null);
});

test ("a data channel can not take the name of a member of the viewer", () => {
	const { viewer, power } = createViewer ();
	const columnOf = (channel) => viewer.getPointChannelValue ("power", 2, channel);

	// The channel names come from the server; a channel is a property of the viewer with its name.
	for (const name of ["glInstance", "layerPointsArray", "pointSetStyles", "loadPoints", "constructor", "toString", "__proto__", ""]) {
		const member = viewer[name];
		assert.equal (viewer.loadPointsChannelData (name, "power", power), false, name);
		assert.equal (viewer[name], member, name);
		assert.equal (columnOf (name), null, name);
		assert.equal (viewer.getPointChannelRange (name, "power", false), null, name);
		viewer.clearPointsChannelData (name);
		assert.equal (viewer[name], member, name);
	}
	assert.equal (typeof viewer.loadPoints, "function");

	// Any other name is a channel, which can be loaded again and cleared.
	assert.equal (viewer.loadPointsChannelData ("sensors", "power", power), true);
	assert.equal (columnOf ("sensors"), 102);
	assert.equal (viewer.loadPointsChannelData ("sensors", "other", power), true);
	viewer.clearPointsChannelData ("sensors");
	assert.equal (columnOf ("sensors"), null);
	assert.equal (viewer.loadPointsChannelData ("sensors", "power", power), true);
	assert.equal (columnOf ("laser"), 102);
});

test ("the distance between consecutive points is measured along the path", () => {
	const line = new Float32Array ([0, 0, 1, 0, 2, 0, 3, 0, 13, 0, 14, 0, 15, 0, 16, 0]);

	// Half of the steps are 1 apart or less; the long step is the largest.
	assert.equal (LayerViewImpl.computePointSpacing (line, null, 0.5), 1);
	assert.equal (LayerViewImpl.computePointSpacing (line, null, 1.0), 10);
	assert.equal (LayerViewImpl.computePointSpacing (new Float32Array ([5, 5]), null, 0.5), 0);

	// Of selected points only consecutive samples count: the step from sample 3 to sample 6 is not a distance
	// along the path, and neither is the gap between the two stretches.
	assert.equal (LayerViewImpl.computePointSpacing (line, new Uint32Array ([0, 1, 2, 3, 6, 7]), 1.0), 1);
	assert.equal (LayerViewImpl.computePointSpacing (line, new Uint32Array ([0, 2, 4, 6]), 1.0), 0);
});

test ("points that lie closer on the screen than their look needs are drawn every 2nd, 4th, 8th ...", () => {
	const { gl, viewer } = createViewer ({ count: 64, step: 0.01 });
	viewer.setPointSetStyles (laserStateStyle ({ size: 6 }), laserStateStyle ({ size: 10, fill: false }));
	const discs = gl.findElement (POINTS);
	const rings = gl.findElement (SECONDARY_POINTS);
	const builtBefore = gl.built.length;

	// Discs may lie a third of their diameter apart (2 pixels), rings the width of their line (10 / 6 pixels).
	const strides = [];
	for (const scaling of [400, 90, 45, 22, 11, 5.5]) {
		setScaling (viewer, scaling);
		strides.push ([scaling, discs.stride, rings.stride]);
	}
	assert.deepEqual (strides, [
		[400, 1, 1],		// 4 pixels from point to point: every point
		[90, 2, 1],			// 0.9 pixels: every 2nd disc is 1.8 pixels on, every 2nd ring would be too far
		[45, 4, 2],
		[22, 8, 4],
		[11, 16, 8],
		[5.5, 32, 16]
	]);
	// Zooming only changes what is drawn of the points that are there.
	assert.equal (gl.built.length, builtBefore);

	// The stride is a power of two, so the points of a coarser step are among those of a finer one.
	setScaling (viewer, 37);
	assert.equal (discs.stride, 4);

	// Points without a spot style follow the same rule with the size the zoom gives them.
	viewer.setPointSetStyles (null, null);
	setScaling (viewer, 25);
	const plain = gl.findElement (POINTS);
	assert.ok (Math.abs (plain.pointPixelSize - 4) < 1e-9);
	assert.equal (plain.stride, 4);
});

test ("the faster stretches of a layer decide how many points can be skipped", () => {
	// 90 samples at marking speed, then 10 at ten times that speed (a jump), all shown.
	const count = 100;
	const { gl, viewer } = createViewer ({ count, step: 0.01 });
	const positions = new Float32Array (count * 2);
	let x = 0;
	for (let index = 0; index < count; index++) {
		positions[index * 2] = x;
		x += (index < 90) ? 0.01 : 0.1;
	}
	viewer.loadPoints (positions);
	viewer.setPointSetStyles (laserStateStyle ({ size: 6 }), null);

	// At 25 pixels per unit the marking steps are a quarter of a pixel, but the jump steps 2.5 pixels: skipping
	// points there would leave single dots, so none are skipped.
	setScaling (viewer, 25);
	assert.equal (gl.findElement (POINTS).stride, 1);
});

test ("spots of light are drawn smaller where they would overload the graphics card", () => {
	const { gl, viewer } = createViewer ({ count: 64, step: 0.01 });
	viewer.setPointSetStyles (temperatureStyle ({ size: 512 }), null);
	const spots = gl.findElement (POINTS);

	// A few points in view: the full size, drawn a sixteenth of the diameter apart at most (32 pixels).
	setScaling (viewer, 90);
	assert.equal (viewer.getPointSetPixelSize (false), 512);
	assert.equal (spots.pointPixelSize, 512);
	assert.equal (spots.stride, 32);

	// Millions of points in view: smaller, so that one pass over the drawn points stays within the budget.
	spots.pointsInView = 4000000;
	setScaling (viewer, 90);
	const drawnSize = viewer.getPointSetPixelSize (false);
	assert.ok (drawnSize < 512);
	assert.ok ((spots.pointsInView / spots.stride) * drawnSize * drawnSize <= 256 * 1024 * 1024);
	// Not smaller than needed: one step up would exceed the budget.
	const larger = drawnSize / 0.9;
	assert.ok ((spots.pointsInView / viewer.computePointStride (0.01, larger / 16)) * larger * larger > 256 * 1024 * 1024);

	// The graphics card limits the size of a point, in device pixels.
	spots.pointsInView = 10;
	gl.maxPointPixelSize = 256;
	gl.pixelRatio = 2;
	setScaling (viewer, 90);
	assert.equal (viewer.getPointSetPixelSize (false), 128);
	assert.equal (spots.pointPixelSize, 256);

	// The other looks keep the size of their style.
	viewer.setPointSetStyles (laserStateStyle ({ size: 6 }), null);
	assert.equal (viewer.getPointSetPixelSize (false), 6);
	assert.equal (viewer.getPointSetPixelSize (true), null);
});
