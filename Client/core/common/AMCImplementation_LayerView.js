/*++

Copyright (C) 2020 Autodesk Inc.

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.
 * Neither the name of the Autodesk Inc. nor the
names of its contributors may be used to endorse or promote products
derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL AUTODESK INC. BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

 */

import { ColorMapSampler, DEFAULT_COLORMAP, colorMapLookupTable } from "./AMCImplementation_ColorMaps.js";

const LAYERVIEW_MINSCALING = 0.4;
const LAYERVIEW_MAXSCALING = 4000.0;
const LAYERVIEW_MINVELOCITYRANGE = 1.0;

// Default scatter point size calibration (pixels = base + factor * pixels per mm, clamped).
const LAYERVIEW_POINTSIZE_BASE = 2.0;
const LAYERVIEW_POINTSIZE_FACTOR = 0.08;
const LAYERVIEW_POINTSIZE_MIN = 2.0;
const LAYERVIEW_POINTSIZE_MAX = 16.0;

// Fallback marking speed for segments without a laser speed, in mm/s.
const LAYERVIEW_DEFAULTMARKSPEED = 1000.0;

// Aligning toolpath vectors with a recording: a laser-on run belongs to a vector if its first
// sample lies within the tolerance (mm) of one of the vector's lines. Runs are searched this
// far ahead, and only this many lines of long polylines are tested.
const LAYERVIEW_TIMING_MATCHTOLERANCE = 0.05;
const LAYERVIEW_TIMING_RUNLOOKAHEAD = 200;
const LAYERVIEW_TIMING_MAXGROUPLINES = 64;

// Segments of parts that have been disabled are still drawn, but in this neutral gray.
const LAYERVIEW_DISABLEDPARTCOLOR = 0xB4B4B4;

// Toolpath display modes: profile colors, segment type, start time on the layer timeline,
// laser power (ramps drawn as color gradients) and laser on (marks) / off (jumps).
export const TOOLPATH_COLOR_MODES = ["color", "type", "time", "power", "velocity", "laseron"];
const LAYERVIEW_COLORMAPMODES = ["time", "power", "velocity"];
const LAYERVIEW_UNIFORMPOINTCOLOR = 0x00d0ff;
// Recorded points with a spot style (see setPointSetStyles): diameter limits in CSS pixels, and the line width of
// spots without fill in CSS pixels as a fraction of the diameter within limits. Spots without fill are drawn above
// filled ones, spots of light below them, the secondary positions above the primary ones.
const LAYERVIEW_SPOTSIZE_MIN = 1.0;
const LAYERVIEW_SPOTSIZE_MAX = 64.0;
// Recorded points are sampled far more densely than the screen can show (a sample every 10 micrometers of path), so
// where consecutive points lie closer on the screen than their look needs, only every 2nd, 4th, 8th ... of them is
// drawn: a power of two, so that the points of a coarser step are among those of the finer one and nothing jumps
// while zooming. How far apart the drawn points may lie depends on the look (see computePointSetMaxSpacing): a
// fraction of the diameter for discs (LAYERVIEW_DISCSPACING_FRACTION) and for spots of light (LAYERVIEW_GLOWTHINNING),
// the line width for circles. The distance of consecutive points is the one that LAYERVIEW_POINTSPACING_QUANTILE of
// the consecutive samples stay below (see computePointSpacing), so that the faster stretches of a layer, like the
// jumps, are not thinned out into dots.
const LAYERVIEW_POINTSPACING_QUANTILE = 0.98;
const LAYERVIEW_POINTSPACING_SAMPLES = 4096;
const LAYERVIEW_POINTSTRIDE_MAX = 4096;
const LAYERVIEW_DISCSPACING_FRACTION = 1.0 / 3.0;
// Spots of light (look "glow") fade out towards their edge and may be much larger. Where they overlap, only the one
// nearest to a pixel shows. If one pass over the drawn points would still shade more fragments than
// LAYERVIEW_GLOWFRAGMENTBUDGET (each point covers its square of pixels; with the depth pass there are two), they are
// drawn smaller at that zoom: large spots on millions of points would stall the GPU for seconds and make the browser
// drop the WebGL context. Spots of light are picked within LAYERVIEW_GLOWPICKRADIUS of their centre.
const LAYERVIEW_GLOWSIZE_MAX = 512.0;
const LAYERVIEW_GLOWTHINNING = 16.0;
const LAYERVIEW_GLOWFRAGMENTBUDGET = 256.0 * 1024.0 * 1024.0;
const LAYERVIEW_GLOWPICKRADIUS = 16.0;
const LAYERVIEW_SPOTOUTLINE_FRACTION = 1.0 / 6.0;
const LAYERVIEW_SPOTOUTLINE_MIN = 1.0;
const LAYERVIEW_SPOTOUTLINE_MAX = 2.0;
const LAYERVIEW_POINTS_Z = 61.0;
const LAYERVIEW_POINTS_SECONDARY_DZ = 0.2;
const LAYERVIEW_POINTS_UNFILLED_DZ = 0.4;
const LAYERVIEW_POINTS_GLOW_DZ = -0.4;
const LAYERVIEW_LASERONCOLOR = 0xE53935;
const LAYERVIEW_DEFAULTHATCHCOLOR = 0xCC88CC;
const LAYERVIEW_DEFAULTCONTOURCOLOR = 0x00AA88;
const LAYERVIEW_DEFAULTTRAVELCOLOR = 0x1E88E5;
// Jump lines are thinner than marks.
const LAYERVIEW_JUMPTHICKNESSFACTOR = 0.5;
// Start and end points of the toolpath lines (diameter in CSS pixels). The color contrasts with the background.
const LAYERVIEW_ENDPOINTPIXELS = 4.0;
const LAYERVIEW_ENDPOINTCOLOR_LIGHT = 0x111111;
const LAYERVIEW_ENDPOINTCOLOR_DARK = 0xf5f5f5;

// Hovered line overlay: color, arrow head at the end point (minimum length in CSS pixels and
// in line thicknesses, wing thickness relative to the line, half opening angle) and the
// support points of nonlinear power ramps (diameter in CSS pixels).
const LAYERVIEW_HIGHLIGHTCOLOR = 0x00e5ff;
const LAYERVIEW_HIGHLIGHTARROWPIXELS = 10.0;
const LAYERVIEW_HIGHLIGHTARROWTHICKNESSFACTOR = 2.0;
const LAYERVIEW_HIGHLIGHTARROWWINGFACTOR = 0.6;
const LAYERVIEW_HIGHLIGHTARROWANGLE = 28.0 * Math.PI / 180.0;
const LAYERVIEW_SUPPORTPOINTPIXELS = 9.0;
const LAYERVIEW_SUPPORTPOINTCOLOR = 0xffb300;
const LAYERVIEW_SUPPORTENDPOINTCOLOR = 0xffffff;

// Grid level-of-detail switch band. The grid geometry is self-similar every 5
// subdivisions, so the lower/upper bounds MUST keep a 5x ratio for the wrap to
// stay seamless (LOWER * GRID_LOD_RECURSION === UPPER). Lowering the band
// compared to the previous 0.5..2.5 keeps the on-screen grid finer and avoids
// the coarse, "clunky" cells that appeared at the top of the old band right
// after a zoom step crossed a threshold.
const LAYERVIEW_GRIDLOD_LOWER = 0.25;
const LAYERVIEW_GRIDLOD_UPPER = 1.25;
const LAYERVIEW_GRIDLOD_RECURSION = 5.0;

// The grid mesh is (re)generated only on viewport resize, but at render time it
// is scaled by gridScale, which can drop as low as LAYERVIEW_GRIDLOD_LOWER. The
// mesh must therefore span (viewport / LOWER) model units so it still fills the
// screen at the coarsest LOD. Deriving it from LOWER keeps the two in sync if
// the LOD band is ever retuned (e.g. 1 / 0.25 => a 4x-viewport mesh).
const LAYERVIEW_GRIDMESH_VIEWPORTFACTOR = Math.ceil (1.0 / LAYERVIEW_GRIDLOD_LOWER);

class LayerViewImpl {

    constructor(glInstance) {

        this.glInstance = glInstance;

        this.currentSize = {
            gridWidth: 0,
            gridHeight: 0,
            viewPortWidth: 0,
            viewPortHeight: 0
        }
        this.transform = {
            x: 0,
            y: 0,
            scaling: 1.0
        }
        this.origin = {
            x: 0,
            y: 0
        }
        this.transformAngleDegrees = 0.0;
        this.rotationCenter = {
            x: 0,
            y: 0
        };
        this.translation = {
            x: 0,
            y: 0
        };
		
		this.lineScaleLevel = 0;
		this.renderNeedsUpdate = true;

		this.layerSegmentsArray = null;
		this.layerPartNames = new Map ();
		this.layerDisabledParts = new Set ();
		this.partBoundsCache = null;
		this.partBoundsCacheKey = "";

		// Invoked after every pan/zoom/placement change so screen-space overlays can follow.
		this.onTransformChanged = null;
		
		this.layerPointsMode = "unicolor";
		this.layerPointsArray = null;
		// Names of the loaded data channels of the points, see loadPointsChannelData.
		this.pointChannelNames = new Set ();
		this.layerPointsColorArray = null;
		this.layerPointsVelocities = [];
		this.layerPointsMaxVelocity = LAYERVIEW_MINVELOCITYRANGE;
		this.layerPointsMinVelocity = LAYERVIEW_MINVELOCITYRANGE;
		this.pointSizeBase = LAYERVIEW_POINTSIZE_BASE;
		this.pointSizeFactor = LAYERVIEW_POINTSIZE_FACTOR;
		this.pointSizeMin = LAYERVIEW_POINTSIZE_MIN;
		this.pointSizeMax = LAYERVIEW_POINTSIZE_MAX;
		
        this.linesCoordinates = [];
		this.segmentProperties = [];
		this.lineGroupIDs = null;
		this.lineDurations = null;
		// Modulated laser power (W) at the start and end of every line, NaN for the nominal power,
		// and the inner support points {t, power} of nonlinear ramps by line index.
		this.linePowers = [];
		this.lineSupportPoints = new Map ();
		this.lineProfileColors = [];

		this.toolpathColorMode = "color";
		this.colorMapName = DEFAULT_COLORMAP;
		this.colorMapInverted = false;
		// Value range mapped onto the color map: watts in power mode, milliseconds in time mode,
		// mm/s in velocity mode. Null takes the range of the loaded layer.
		this.colorRanges = { power: null, time: null, velocity: null };
		this.typeColors = { hatch: LAYERVIEW_DEFAULTHATCHCOLOR, polyline: LAYERVIEW_DEFAULTCONTOURCOLOR, travel: LAYERVIEW_DEFAULTTRAVELCOLOR };
		// Index of the line that each jump leads to, ascending.
		this.jumpTargetLines = null;
		this.endPointsVisible = false;
		this.endPointColor = LAYERVIEW_ENDPOINTCOLOR_LIGHT;

		this.highlightLineIndex = -1;
		this.highlightScaling = 0.0;
		this.highlightSupportPoints = null;

		// Start time (ms) of every toolpath line on the layer timeline, see updateTiming.
		this.lineStartTimes = null;
		this.timelineDuration = 0.0;
		this.timingSource = "none";
		this.timingMatchRatio = 0.0;
		// Fraction (0..1) of the layer timeline that is drawn; 1 shows everything.
		this.timeCapFraction = 1.0;
		this.visibleLineCount = 0;
		this.visiblePointCount = 0;
		
		this.toolpathVisible = true;
		this.pointsVisible = true;
		this.showLaserOffPoints = false;
		this.filteredToOriginalIndexMap = null;

		// The same recorded samples at their other positions (for example the target positions if the loaded points
		// are the status positions), see loadSecondaryPoints. Drawn with the filter, colors and time cap of the points.
		this.secondaryPointsArray = null;
		// Spot style of the points and of the secondary points, see setPointSetStyles: null draws the points as
		// filled discs that grow with the zoom (setPointSizeCalibration) and hides the secondary points.
		this.pointSetStyles = { primary: null, secondary: null };
		// Diameter in CSS pixels the points and the secondary points are drawn with at the current zoom (null if not
		// drawn), see getPointSetPixelSize.
		this.pointSetPixelSizes = { primary: null, secondary: null };
		// Distance between consecutive drawn points of both sets in their own units, see computePointSpacing.
		this.pointSetSpacings = { primary: 0.0, secondary: 0.0 };
		// True while layerPointsColorArray does not hold the colors of the display mode, because the points are drawn
		// with a spot style and do not use them, see updateColors.
		this.pointColorsOutdated = false;

		// Overlay (scalar field over the platform, for example a heat map): its own color map, value range, smoothing and
		// opacity, applied to the overlay element whenever it is (re)loaded, see SetOverlayImage.
		this.overlayColorMapName = DEFAULT_COLORMAP;
		this.overlayColorMapInverted = false;
		this.overlayRange = { min: 0.0, max: 1.0 };
		this.overlaySmoothing = false;
		this.overlayOpacity = 1.0;
		// Picture overlay (for example the camera image of the layer), see SetPictureOverlayImage.
		this.pictureOverlayOpacity = 1.0;

		this.gridColor = undefined;
        
		this.updateTransform ();

    }

    applyColors(colorSet) {
        if (!colorSet) return;
        if (colorSet.background && this.glInstance)
            this.glInstance.setBackgroundColor(colorSet.background);
        if (colorSet.grid !== undefined)
            this.gridColor = colorSet.grid;

		const typeColors = {
			hatch: LayerViewImpl.parseHexColor (colorSet.hatch, LAYERVIEW_DEFAULTHATCHCOLOR),
			polyline: LayerViewImpl.parseHexColor (colorSet.contour, LAYERVIEW_DEFAULTCONTOURCOLOR),
			travel: LayerViewImpl.parseHexColor (colorSet.travel, LAYERVIEW_DEFAULTTRAVELCOLOR)
		};
		const typeColorsChanged = (typeColors.hatch !== this.typeColors.hatch) || (typeColors.polyline !== this.typeColors.polyline) || (typeColors.travel !== this.typeColors.travel);
		this.typeColors = typeColors;

		const background = LayerViewImpl.parseHexColor (colorSet.background, 0xffffff);
		const luminance = 0.299 * ((background >> 16) & 255) + 0.587 * ((background >> 8) & 255) + 0.114 * (background & 255);
		const endPointColor = (luminance < 128) ? LAYERVIEW_ENDPOINTCOLOR_DARK : LAYERVIEW_ENDPOINTCOLOR_LIGHT;
		const endPointColorChanged = endPointColor !== this.endPointColor;
		this.endPointColor = endPointColor;

		if ((typeColorsChanged && ((this.toolpathColorMode === "type") || (this.toolpathColorMode === "laseron"))) ||
			(endPointColorChanged && this.endPointsVisible))
			this.refreshToolpathColors ();
		if (typeColorsChanged && (this.toolpathColorMode === "laseron"))
			this.refreshPointColors ();

        this.rebuildGrid();
        this.RenderScene(true);
    }

	// "#rrggbb" or "#rgb" to 0xRRGGBB.
	static parseHexColor (value, fallback)
	{
		if (typeof value !== "string")
			return fallback;
		let hex = value.trim ();
		if (/^#[0-9a-f]{3}$/i.test (hex))
			hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
		if (!/^#[0-9a-f]{6}$/i.test (hex))
			return fallback;
		return parseInt (hex.substring (1), 16);
	}

    rebuildGrid() {
        if (!this.glInstance) return;
        if (this.currentSize.gridWidth <= 0 || this.currentSize.gridHeight <= 0) return;
        this.glInstance.removeElement("grid");
        this.glInstance.add2DGridGeometry("grid", this.currentSize.gridWidth, this.currentSize.gridHeight, 50, 5, this.gridColor);
        this.updateTransform();
        this.renderNeedsUpdate = true;
    }

    updateSize(width, height) {
        if ((width > 0) && (height > 0)) {

            this.currentSize.viewPortWidth = width;
            this.currentSize.viewPortHeight = height;

            if (this.glInstance) {
                this.glInstance.resizeTo(width, height);
                this.glInstance.setup2DView(width, height, 0.1, 100);
            }

            var newWidth = width * LAYERVIEW_GRIDMESH_VIEWPORTFACTOR + 50;
            var newHeight = height * LAYERVIEW_GRIDMESH_VIEWPORTFACTOR + 50;

            if ((this.currentSize.gridWidth < newWidth) || (this.currentSize.gridHeight < newHeight)) {
                this.currentSize.gridWidth = newWidth;
                this.currentSize.gridHeight = newHeight;

                this.createGrid(newWidth, newHeight);

            }

        }

		this.renderNeedsUpdate = true;
    }

    createGrid(width, height) {
        if (!this.glInstance)
            return;

        this.glInstance.removeElement("grid");

        this.glInstance.add2DGridGeometry("grid", width, height, 50, 5, this.gridColor);
		this.updateTransform ();
		
		this.renderNeedsUpdate = true;
		

    }

    transformToolpathPoint(x, y) {
        const angleInRadians = this.transformAngleDegrees * Math.PI / 180.0;
        const cosine = Math.cos(angleInRadians);
        const sine = Math.sin(angleInRadians);
        const relativeX = x - this.rotationCenter.x;
        const relativeY = y - this.rotationCenter.y;

        return {
            x: relativeX * cosine - relativeY * sine + this.rotationCenter.x + this.translation.x,
            y: relativeX * sine + relativeY * cosine + this.rotationCenter.y + this.translation.y
        };
    }

    updateTransform() {

        if (!this.glInstance)
            return;

        const placementOffset = this.transformToolpathPoint(0, 0);
        const toolpathPositionX = this.transform.x + (this.origin.x + placementOffset.x) * this.transform.scaling;
        const toolpathPositionY = this.transform.y - (this.origin.y + placementOffset.y) * this.transform.scaling;

        var gridgeometry = this.glInstance.findElement("grid");
        if (gridgeometry) {
            var gridScale = this.transform.scaling;
			var lineScaleLevel = 1;

            if (gridScale < LAYERVIEW_GRIDLOD_LOWER) {
                gridScale = gridScale * LAYERVIEW_GRIDLOD_RECURSION;
				lineScaleLevel = 0.8;
            }

            if (gridScale > LAYERVIEW_GRIDLOD_UPPER) {
                gridScale = gridScale / LAYERVIEW_GRIDLOD_RECURSION;
				lineScaleLevel = 0.4;
            }

            if (gridScale > LAYERVIEW_GRIDLOD_UPPER) {
                gridScale = gridScale / LAYERVIEW_GRIDLOD_RECURSION;
				lineScaleLevel = 0.25;
            }

            if (gridScale > LAYERVIEW_GRIDLOD_UPPER) {
                gridScale = gridScale / LAYERVIEW_GRIDLOD_RECURSION;
				lineScaleLevel = 0.125;
            }

            if (gridScale > LAYERVIEW_GRIDLOD_UPPER) {
                gridScale = gridScale / LAYERVIEW_GRIDLOD_RECURSION;
				lineScaleLevel = 0.06;
            }

            if (gridScale > LAYERVIEW_GRIDLOD_UPPER) {
                gridScale = gridScale / LAYERVIEW_GRIDLOD_RECURSION;
				lineScaleLevel = 0.02;
            }
						
            if (gridScale > LAYERVIEW_GRIDLOD_UPPER) {
                gridScale = gridScale / LAYERVIEW_GRIDLOD_RECURSION;
				lineScaleLevel = 0.01;
            }

			this.updateLineScaleLevel (lineScaleLevel);

            var fullGridSize = gridScale * 25.0 * 5;
            var gridTranslationX = this.transform.x - Math.ceil((this.transform.x / fullGridSize)) * fullGridSize;
            var gridTranslationY = this.transform.y - Math.ceil((this.transform.y / fullGridSize)) * fullGridSize;

            gridgeometry.setPositionXY(gridTranslationX, gridTranslationY);
            gridgeometry.setScaleXY(gridScale, gridScale);
        }

        for (const identifier of ["layerdata_lines", "layerdata_jumps", "layerdata_endpoints"]) {
            var layerlinesgeometry = this.glInstance.findElement(identifier);
            if (layerlinesgeometry) {
                layerlinesgeometry.setPositionXY(toolpathPositionX, toolpathPositionY);
                layerlinesgeometry.setScaleXY(this.transform.scaling,  - this.transform.scaling);
                // Three.js composes rotation before the screen-space Y inversion from
                // setScaleXY. Negating the angle therefore produces a positive
                // counter-clockwise rotation in machine coordinates.
                layerlinesgeometry.setRotationZ(-this.transformAngleDegrees * Math.PI / 180.0);
            }
        }

        // The arrow head is sized in screen pixels, so rebuild the overlay when the zoom changes.
        if ((this.highlightLineIndex >= 0) && (this.highlightScaling !== this.transform.scaling))
            this.buildHighlightGeometry ();
        this.positionHighlightGeometry ();

        for (const [identifier, style, set] of [["layerdata_points", this.pointSetStyles.primary, "primary"], ["layerdata_secondarypoints", this.pointSetStyles.secondary, "secondary"]]) {
            var layerpointsgeometry = this.glInstance.findElement(identifier);
            this.pointSetPixelSizes[set] = null;
            if (layerpointsgeometry) {
                // Spots without fill are lifted above the filled ones, so their circles stay visible; spots of light
                // lie below both.
                layerpointsgeometry.setPosition(toolpathPositionX, toolpathPositionY, LayerViewImpl.computePointSetDepthOffset(style));
                layerpointsgeometry.setScaleXY(this.transform.scaling,  - this.transform.scaling);
                layerpointsgeometry.setRotationZ(-this.transformAngleDegrees * Math.PI / 180.0);
                if (typeof layerpointsgeometry.setPointPixelSize === "function") {
                    const fit = this.fitPointSet(layerpointsgeometry, style, this.pointSetSpacings[set]);
                    layerpointsgeometry.setPointPixelSize(fit.size * this.glInstance.getPixelRatio());
                    if (typeof layerpointsgeometry.setStride === "function")
                        layerpointsgeometry.setStride(fit.stride);
                    this.pointSetPixelSizes[set] = fit.size;
                }
            }
        }

        var buildplategeometry = this.glInstance.findElement("buildplate");
        if (buildplategeometry) {
            buildplategeometry.setPositionXY(this.transform.x, this.transform.y, buildplategeometry);
            buildplategeometry.setScaleXY(this.transform.scaling,  - this.transform.scaling);
        }

        // The overlay image covers the platform rectangle, so it follows the build plate and not the toolpath
        // (which is shifted by the origin and may be rotated and translated). The picture overlay is placed in
        // platform coordinates as well, see SetPictureOverlayImage.
        for (const identifier of ["overlayimage", "pictureoverlay"]) {
            var overlaygeometry = this.glInstance.findElement(identifier);
            if (overlaygeometry) {
                overlaygeometry.setPositionXY(this.transform.x, this.transform.y);
                overlaygeometry.setScaleXY(this.transform.scaling,  - this.transform.scaling);
            }
        }
		
		this.renderNeedsUpdate = true;

		if (typeof this.onTransformChanged === "function")
			this.onTransformChanged ();
    }
	
	updateLineScaleLevel (newLineScaleLevel)
	{
		if (newLineScaleLevel != this.lineScaleLevel) {
			
			this.lineScaleLevel = newLineScaleLevel;
			
			this.updateLoadedLayer ();
			this.updateLayerPoints ();

			this.updateTransform();
			this.RenderScene(true);		
			
			
		}
	}
	
	
	



	getPathBoundaries() {
		let layerLines = this.glInstance.findElement("layerdata_lines");
		if (layerLines) {
			const pathBoundaries = layerLines.glelement.geometry.boundingSphere;
			if (!pathBoundaries)
				return null;

			const transformedCenter = this.transformToolpathPoint(pathBoundaries.center.x, pathBoundaries.center.y);

			return {
				center: {
					x: transformedCenter.x,
					y: transformedCenter.y,
					z: pathBoundaries.center.z
				},
				radius: pathBoundaries.radius
			};
		} else {
			return null;
		}
	}


    loadLayer(segmentsArray, partsArray) {
		this.layerSegmentsArray = segmentsArray;
		this.layerPartNames = new Map ();
		this.layerDisabledParts = new Set ();
		if (Array.isArray (partsArray)) {
			for (let part of partsArray) {
				if (part && (typeof part.uuid === "string")) {
					let partUUID = part.uuid.toLowerCase ();
					this.layerPartNames.set (partUUID, (typeof part.name === "string") ? part.name : "");
					if (part.disabled === true)
						this.layerDisabledParts.add (partUUID);
				}
			}
		}
		this.partBoundsCache = null;
		this.updateLoadedLayer ();

		this.updateTransform();
		this.RenderScene(true);		
		
	}
	
	computeVelocities ()
	{
		if (this.layerPointsArray) {
			let pointCount = this.layerPointsArray.length / 2;
			
			if (pointCount > 0) {
				let velocities = [];
				let maxVelocity = LAYERVIEW_MINVELOCITYRANGE;
				let minVelocity = LAYERVIEW_MINVELOCITYRANGE;
				
				for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
					let velocity = this.getPointVelocity (pointIndex);					
					if (velocity > 0.0) {						
						if (velocity > LAYERVIEW_MINVELOCITYRANGE) {

							if (maxVelocity < velocity)
								maxVelocity = velocity;
							
							if (minVelocity < LAYERVIEW_MINVELOCITYRANGE) {
								minVelocity = velocity;
							}
							if (minVelocity > velocity) {
								minVelocity = velocity;							
							}
							
						}
													
						velocities.push (velocity);									
					} else {
						velocities.push (0.0);
					}
					

				}
				
				if (maxVelocity < LAYERVIEW_MINVELOCITYRANGE)
					maxVelocity = LAYERVIEW_MINVELOCITYRANGE;
				if (minVelocity < LAYERVIEW_MINVELOCITYRANGE)
					minVelocity = LAYERVIEW_MINVELOCITYRANGE;
				
				this.layerPointsVelocities = velocities;
				this.layerPointsMaxVelocity = maxVelocity;
				this.layerPointsMinVelocity = minVelocity;
			
			}
			
			
		} else {
			this.layerPointsVelocities = null;
			this.layerPointsMaxVelocity = LAYERVIEW_MINVELOCITYRANGE;
			this.layerPointsMinVelocity = LAYERVIEW_MINVELOCITYRANGE;
		}
	}
	
	makeVelocityColors ()
	{
		this.layerPointsColorArray = null;

		if (this.layerPointsVelocities && this.layerPointsArray) {

			const velocityRange = (this.layerPointsMaxVelocity - this.layerPointsMinVelocity);
			if (velocityRange > LAYERVIEW_MINVELOCITYRANGE) {

				let pointCount = this.layerPointsArray.length / 2;
				let colors = [];
				
				for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
					let velocity = this.layerPointsVelocities[pointIndex];
					let fraction = (velocity - this.layerPointsMinVelocity) / velocityRange;
					if (fraction >= 0.0) {
						if (fraction > 1.0)
							fraction = 1.0;
					} else {
						fraction = 0.0;
					}
					
					const hue = (1 - fraction) * 240 / 360;
					
					colors.push (this.hslToRgb (hue, 1.0, 0.5));				
					
				}
				
				this.layerPointsColorArray = colors;
			}

		}

	}

	computeChannelColumnRange (pointsChannelName, pointsColumnName)
	{
		if (this[pointsChannelName] && this[pointsChannelName][pointsColumnName]) {
			let dataArray = this[pointsChannelName][pointsColumnName];

			let maxValue = Number.NEGATIVE_INFINITY;
			let minValue = Number.POSITIVE_INFINITY;

			for (let i = 0; i < dataArray.length; i++) {
				let value = dataArray[i];
				if (value > maxValue) {
					maxValue = value;
				}
				if (value < minValue) {
					minValue = value;
				}
			}
			this[pointsChannelName][pointsColumnName].max = maxValue;
			this[pointsChannelName][pointsColumnName].min = minValue;
		}
	}

	makeLaserOnColors ()
	{		
		this.laserOnPointsColorArray = null;

		if (this.laser && this.laser.laseron && this.layerPointsArray) {

			let pointCount = this.layerPointsArray.length / 2;
			let colors = [];
			
			for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {

				let laseron = this.laser.laseron[pointIndex];

				// laseron = 0 => Blue
				// laseron = 1 => Red
				const hue = laseron * 240 / 360;
				
				colors.push (this.hslToRgb (hue, 1.0, 0.5));				
			}
			
			this.layerPointsColorArray = colors;
		}
		
	}
	
	makeLaserPowerColors ()
	{
		this.layerPointsColorArray = null;

		if (this.laser && this.laser.power && this.layerPointsArray) {
			const powerRange = (this.laser.power.max - this.laser.power.min);
			if (powerRange > 0) {

				let pointCount = this.laser.power.length;
				let colors = [];
				
				for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
					let power = this.laser.power[pointIndex];
					let fraction = (power - this.laser.power.min) / powerRange;
					if (fraction >= 0.0) {
						if (fraction > 1.0)
							fraction = 1.0;
					} else {
						fraction = 0.0;
					}
					
					const hue = (fraction) * 240 / 360;
					colors.push (this.hslToRgb (hue, 1.0, 0.5));				
				}
				
				this.layerPointsColorArray = colors;
			}
		}
	}
	
	
	hslToRgb(h, s, l) {
		// Ensure h, s, l are in the range [0, 1]
		h = h % 1; // Wrap around if h is greater than 1
		s = Math.min(Math.max(s, 0), 1);
		l = Math.min(Math.max(l, 0), 1);

		if (s === 0) {
			// Achromatic (gray)
			const value = Math.round(l * 255);
			return [value, value, value];
		}

		const hueToRgb = (p, q, t) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};

		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;

		const r = hueToRgb(p, q, h + 1 / 3);
		const g = hueToRgb(p, q, h);
		const b = hueToRgb(p, q, h - 1 / 3);

		return Math.round(r * 255) + Math.round(g * 255) * 256 + Math.round(b * 255) * 65536;
			
	}


	makeTimeColors ()
	{
		this.layerPointsColorArray = null;

		if (this.layerPointsVelocities && this.layerPointsArray) {

			let pointCount = this.layerPointsArray.length / 2;
			let colors = [];
			
			for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {

				let t = pointIndex / pointCount;
				
				const hue = (1 - t) * 240 / 360;
				
				colors.push (this.hslToRgb (hue, 1.0, 0.5));				
				
			}
			
			this.layerPointsColorArray = colors;

		}

	}

	
    loadPoints(pointsArray) {
		this.layerPointsArray = pointsArray;
		this.layerPointsColorArray = null;
		this.layerPointsVelocities = null;
		this.layerPointsMaxVelocity = LAYERVIEW_MINVELOCITYRANGE;
		this.layerPointsMinVelocity = LAYERVIEW_MINVELOCITYRANGE;
		
		this.computeVelocities ();		
	}

	// A data channel of the points is a property of the viewer with the name of the channel (this.laser, ...), so a
	// channel can not take the name of another member of the viewer. The names come from the server.
	isPointChannelName (pointsChannelName)
	{
		if (this.pointChannelNames.has (pointsChannelName))
			return true;
		return (typeof pointsChannelName === "string") && (pointsChannelName !== "") && !(pointsChannelName in this);
	}

	// Returns false if the channel can not be loaded because of its name.
	loadPointsChannelData(pointsChannelName, pointsColumnName, pointsChannelDataArray) {
		
		if (!this.isPointChannelName (pointsChannelName)) {
			console.warn ("[LayerView] the data channel " + pointsChannelName + " has the name of a member of the viewer and is not loaded");
			return false;
		}

		// Ensure the channel-level object exists
  		if (!this.pointChannelNames.has (pointsChannelName)) {
    		this[pointsChannelName] = {};
    		this.pointChannelNames.add (pointsChannelName);
  		}

  		// Assign the data array to the corresponding column
  		this[pointsChannelName][pointsColumnName] = pointsChannelDataArray;

		this.computeChannelColumnRange (pointsChannelName, pointsColumnName);
		return true;
	}
	
	// Positions of the loaded points at their other positions, in the same order (null removes them). They are only
	// drawn if they are as many as the points and setPointSetStyles makes them visible; the points are only rebuilt
	// if that changes what is drawn.
	loadSecondaryPoints (pointsArray)
	{
		this.secondaryPointsArray = pointsArray || null;
		const style = this.pointSetStyles.secondary;
		const drawn = !!this.glInstance && !!this.glInstance.findElement ("layerdata_secondarypoints");
		if (drawn || (style && style.visible)) {
			this.updateLayerPoints ();
			this.RenderScene (true);
		}
	}

	hasSecondaryPoints ()
	{
		return !!this.secondaryPointsArray && !!this.layerPointsArray && (this.secondaryPointsArray.length === this.layerPointsArray.length);
	}

	clearPoints ()
	{
		this.layerPointsArray = null;
		this.secondaryPointsArray = null;
		this.layerPointsColorArray = null;
		this.layerPointsVelocities = null;
		this.layerPointsMaxVelocity = LAYERVIEW_MINVELOCITYRANGE;
		this.layerPointsMinVelocity = LAYERVIEW_MINVELOCITYRANGE;
		
		this.computeVelocities ();		
		this.updateColors ();			
		this.updateLayerPoints ();		
		this.updateTiming ();
	}
	
	clearPointsChannelData (pointsChannelName)
	{
		// Ensure the channel-level object exists
  		if (this.pointChannelNames.has (pointsChannelName)) {
    		this[pointsChannelName] = {};
  		}
	
		this.layerPointsColorArray = null;
	}

	// Point colors of the "toolpath" point mode: the recorded points follow the toolpath display mode,
	// color map and value ranges. Recorded power is raw scanner units and uses its own min/max.
	makeToolpathModeColors ()
	{
		this.layerPointsColorArray = null;
		if (!this.layerPointsArray)
			return;

		const pointCount = this.layerPointsArray.length / 2;
		const mode = this.toolpathColorMode;

		if (mode === "laseron") {
			const laserOn = this.laser ? this.laser.laseron : null;
			if (!laserOn || (laserOn.length < pointCount))
				return;
			const colors = new Array (pointCount);
			for (let pointIndex = 0; pointIndex < pointCount; pointIndex++)
				colors[pointIndex] = (laserOn[pointIndex] !== 0) ? LAYERVIEW_LASERONCOLOR : this.typeColors.travel;
			this.layerPointsColorArray = colors;
			return;
		}

		let values = null;
		let range = null;
		if (mode === "time") {
			values = this.laser ? this.laser.time : null;
			range = this.getEffectiveColorRange ("time");
		} else if (mode === "velocity") {
			values = this.layerPointsVelocities;
			range = this.getEffectiveColorRange ("velocity");
		} else if (mode === "power") {
			values = this.laser ? this.laser.power : null;
			if (values)
				range = { min: values.min, max: values.max };
		}
		if (!values || !range || (values.length < pointCount))
			return;

		const sampler = new ColorMapSampler (this.colorMapName, this.colorMapInverted);
		const normalize = LayerViewImpl.makeColorRangeNormalizer (range);
		const colors = new Array (pointCount);
		for (let pointIndex = 0; pointIndex < pointCount; pointIndex++)
			colors[pointIndex] = sampler.colorAt (normalize (values[pointIndex]));
		this.layerPointsColorArray = colors;
	}

	// Called when the display mode, its color map or its value range have changed. Points drawn with a spot style
	// take their colors from the style, so there is nothing to compute or to rebuild for them.
	refreshPointColors ()
	{
		if ((this.layerPointsMode !== "toolpath") || !this.layerPointsArray)
			return;
		this.updateColors ();
		if (!this.pointColorsOutdated)
			this.updateLayerPoints ();
	}

	// Colors of the points in the display mode. They are left out while the points are drawn with a spot style:
	// updateLayerPoints computes them when the points are drawn without one again.
	updateColors ()
	{
		this.layerPointsColorArray = null;
		this.pointColorsOutdated = !!this.pointSetStyles.primary;
		if (this.pointColorsOutdated)
			return;

		if (this.layerPointsMode === "toolpath") {
			this.makeToolpathModeColors ();
		}

		if (this.layerPointsMode == "time") {
			this.makeTimeColors ();
		} 

		if (this.layerPointsMode == "velocity") {
			this.makeVelocityColors ();
		} 

		if (this.layerPointsMode == "laseron") {
			this.makeLaserOnColors ();
		}

		if (this.layerPointsMode == "powerramp") {
			this.makeLaserPowerColors ();
		}
	}
	
	setColorMode (newColorMode) {
		this.layerPointsMode = newColorMode;
		this.updateColors ();
		this.updateLayerPoints ();
		this.updateTransform();
		this.RenderScene(true);		
	}
	
	pointDataIsAvailable ()
	{
		if (this.layerPointsArray) {
			return true;
		}
		
		return false;
	}
	
	// Point diameter in CSS pixels for the current zoom (transform.scaling = pixels per mm).
	computePointPixelSize ()
	{
		const scaling = this.transform.scaling > 0 ? this.transform.scaling : 1.0;
		const pixelSize = this.pointSizeBase + this.pointSizeFactor * scaling;
		return Math.min (Math.max (pixelSize, this.pointSizeMin), this.pointSizeMax);
	}

	setPointSizeCalibration (base, factor, minimum, maximum)
	{
		const values = [base, factor, minimum, maximum].map (Number);
		if (values.some ((value) => !Number.isFinite (value)))
			return;

		this.pointSizeBase = values[0];
		this.pointSizeFactor = values[1];
		this.pointSizeMin = Math.max (values[2], 0.5);
		this.pointSizeMax = Math.max (values[3], this.pointSizeMin);
		this.updateTransform ();
		this.RenderScene (true);
	}

	// Diameter in CSS pixels of the points drawn with the given spot style; without a style the diameter follows
	// the zoom, see computePointPixelSize.
	computePointSetPixelSize (style)
	{
		if (!style)
			return this.computePointPixelSize ();
		const size = Number (style.size);
		const maximum = (style.look === "glow") ? LAYERVIEW_GLOWSIZE_MAX : LAYERVIEW_SPOTSIZE_MAX;
		return Number.isFinite (size) ? Math.min (Math.max (size, LAYERVIEW_SPOTSIZE_MIN), maximum) : LAYERVIEW_SPOTSIZE_MIN;
	}

	// Distance between consecutive points, in the units of the positions, that the given share of the consecutive
	// samples stays below (0.5 is the median), measured on at most LAYERVIEW_POINTSPACING_SAMPLES evenly spread pairs.
	// positions holds x and y of every sample. With indexMap (ascending sample indices, see updateLayerPoints) only its
	// samples count, and only pairs that are consecutive samples: the step from the end of one stretch to the start of
	// the next is no distance along a path. 0 if there is no such pair.
	/**
	 * @param {Float32Array | number[]} positions
	 * @param {Uint32Array | null} [indexMap]
	 * @param {number} [quantile]
	 */
	static computePointSpacing (positions, indexMap = null, quantile = LAYERVIEW_POINTSPACING_QUANTILE)
	{
		const count = indexMap ? indexMap.length : Math.floor (positions.length / 2);
		const pairCount = count - 1;
		if (pairCount < 1)
			return 0.0;

		const sampleCount = Math.min (pairCount, LAYERVIEW_POINTSPACING_SAMPLES);
		const distances = new Float64Array (sampleCount);
		let found = 0;
		for (let sample = 0; sample < sampleCount; sample++) {
			const entry = Math.floor (sample * pairCount / sampleCount);
			const index = indexMap ? indexMap[entry] : entry;
			if (indexMap && (indexMap[entry + 1] !== index + 1))
				continue;
			distances[found++] = Math.hypot (positions[index * 2 + 2] - positions[index * 2], positions[index * 2 + 3] - positions[index * 2 + 1]);
		}
		if (found === 0)
			return 0.0;

		const sorted = distances.subarray (0, found).sort ();
		const share = Math.min (Math.max (Number (quantile), 0.0), 1.0);
		return sorted[Math.min (Math.floor (found * share), found - 1)];
	}

	// Distance in CSS pixels the drawn points of a set of the given diameter may lie apart along their path without
	// a visible difference to drawing every point: discs a third of their diameter, circles the width of their line
	// (so that they still close up to a band), spots of light a sixteenth of their diameter.
	computePointSetMaxSpacing (style, size)
	{
		if (style && (style.look === "glow"))
			return size / LAYERVIEW_GLOWTHINNING;
		if (style && !style.fill)
			return LayerViewImpl.computeSpotOutlinePixels (size);
		return size * LAYERVIEW_DISCSPACING_FRACTION;
	}

	// Stride of a point set (every stride-th point is drawn; a power of two, 1 draws all) at the current zoom, for
	// points that lie pointSpacing apart in their own units and may lie maxSpacing CSS pixels apart on the screen.
	computePointStride (pointSpacing, maxSpacing)
	{
		const spacing = Number (pointSpacing) * Math.abs (this.transform.scaling);
		if (!(spacing > 0.0) || !(maxSpacing >= 2.0 * spacing))
			return 1;
		return Math.min (Math.pow (2, Math.floor (Math.log2 (maxSpacing / spacing))), LAYERVIEW_POINTSTRIDE_MAX);
	}

	// Diameter in CSS pixels and stride (every stride-th point is drawn) of the drawn points of a set at the current
	// zoom. pointSpacing is the distance between its consecutive points, see computePointSpacing. Spots of light are
	// drawn smaller than their style asks for where that would load the graphics card too much, see
	// LAYERVIEW_GLOWFRAGMENTBUDGET; for them the element must have its placement already.
	fitPointSet (element, style, pointSpacing)
	{
		let size = this.computePointSetPixelSize (style);
		const strideOf = (diameter) => this.computePointStride (pointSpacing, this.computePointSetMaxSpacing (style, diameter));
		if (!style || (style.look !== "glow"))
			return { size: size, stride: strideOf (size) };

		const pixelRatio = this.glInstance.getPixelRatio ();
		size = Math.min (size, this.glInstance.getMaxPointPixelSize () / pixelRatio);
		// Points whose spot reaches into the viewport; an upper bound by the cells of the spatial grid.
		const margin = size * 0.5;
		const visibleCount = element.countPointsInScreenRectangle (-margin, -margin,
			this.currentSize.viewPortWidth + margin, this.currentSize.viewPortHeight + margin);

		let stride = strideOf (size);
		while ((size > LAYERVIEW_SPOTSIZE_MIN) && ((visibleCount / stride) * Math.pow (size * pixelRatio, 2) > LAYERVIEW_GLOWFRAGMENTBUDGET)) {
			size = Math.max (size * 0.9, LAYERVIEW_SPOTSIZE_MIN);
			stride = strideOf (size);
		}
		return { size: size, stride: stride };
	}

	// Diameter in CSS pixels the points (secondary: the secondary points) are drawn with at the current zoom, or null if
	// they are not drawn. Spots of light may be drawn smaller than their style asks for, see fitPointSet.
	getPointSetPixelSize (secondary = false)
	{
		return this.pointSetPixelSizes[secondary ? "secondary" : "primary"];
	}

	static computeSpotOutlinePixels (size)
	{
		return Math.min (Math.max (size * LAYERVIEW_SPOTOUTLINE_FRACTION, LAYERVIEW_SPOTOUTLINE_MIN), LAYERVIEW_SPOTOUTLINE_MAX);
	}

	// Depth of the points drawn with the given spot style relative to the other point sets, see LAYERVIEW_POINTS_Z.
	static computePointSetDepthOffset (style)
	{
		if (!style)
			return 0.0;
		if (style.look === "glow")
			return LAYERVIEW_POINTS_GLOW_DZ;
		return style.fill ? 0.0 : LAYERVIEW_POINTS_UNFILLED_DZ;
	}

	// Uniforms of a points element for a spot style (null: filled discs in the point colors), see
	// WebGLScreenPointsElement.setSpotStyle: state 0 is laser off, state 1 laser on.
	makeSpotStyle (style)
	{
		if (!style)
			return null;
		const pixelRatio = this.glInstance ? this.glInstance.getPixelRatio () : 1.0;
		const glow = style.look === "glow";
		const spotStyle = {
			ringWidth: (style.fill || glow) ? 0.0 : LayerViewImpl.computeSpotOutlinePixels (this.computePointSetPixelSize (style)) * pixelRatio,
			glow: glow,
			stateColors: [style.offColor, style.onColor],
			pickRadius: glow ? Math.min (this.computePointSetPixelSize (style) * 0.5, LAYERVIEW_GLOWPICKRADIUS) * pixelRatio : null
		};
		if (style.colorSource === "values") {
			spotStyle.colorTableKey = style.colorMap + (style.colorMapInverted ? "|inverted" : "");
			spotStyle.colorTable = colorMapLookupTable (style.colorMap, style.colorMapInverted);
			spotStyle.valueMin = style.valueMin;
			spotStyle.valueMax = style.valueMax;
		}
		return spotStyle;
	}

	static normalizePointSetStyle (style)
	{
		if (!style || (typeof style !== "object"))
			return null;
		const size = Number (style.size);
		const valueMin = Number (style.valueMin);
		const valueMax = Number (style.valueMax);
		const colorSource = (style.colorSource === "values") ? "values" : "laserstate";
		return {
			visible: style.visible !== false,
			look: (style.look === "glow") ? "glow" : "circle",
			colorSource: colorSource,
			onColor: (Number (style.onColor) || 0) & 0xffffff,
			offColor: (Number (style.offColor) || 0) & 0xffffff,
			valueChannel: (colorSource === "values") ? String (style.valueChannel || "") : "",
			valueColumn: (colorSource === "values") ? String (style.valueColumn || "") : "",
			colorMap: (typeof style.colorMap === "string") && style.colorMap ? style.colorMap : DEFAULT_COLORMAP,
			colorMapInverted: style.colorMapInverted === true,
			valueMin: Number.isFinite (valueMin) ? valueMin : 0.0,
			valueMax: Number.isFinite (valueMax) ? valueMax : 1.0,
			size: Number.isFinite (size) ? size : LAYERVIEW_POINTSIZE_MIN,
			fill: style.fill === true
		};
	}

	// Values a spot style colors its points by: the column valueColumn of the data channel valueChannel, one value per
	// point. Null if the style colors by the laser state or the column is not loaded.
	getPointSetValues (style)
	{
		if (!style || (style.colorSource !== "values") || !this.layerPointsArray)
			return null;
		const channel = this.pointChannelNames.has (style.valueChannel) ? this[style.valueChannel] : null;
		const values = (channel && Object.prototype.hasOwnProperty.call (channel, style.valueColumn)) ? channel[style.valueColumn] : null;
		const pointCount = Math.floor (this.layerPointsArray.length / 2);
		return (values && (values.length >= pointCount)) ? values : null;
	}

	// Smallest and largest value of a column of a data channel of the points, or null if the column is not loaded.
	// With laserOnOnly, only the points recorded with the laser on count, if the points have a laser state and any
	// of them was on.
	getPointChannelRange (pointsChannelName, pointsColumnName, laserOnOnly)
	{
		const channel = this.pointChannelNames.has (pointsChannelName) ? this[pointsChannelName] : null;
		const values = (channel && Object.prototype.hasOwnProperty.call (channel, pointsColumnName)) ? channel[pointsColumnName] : null;
		if (!values || (values.length === 0))
			return null;
		const laserOn = (laserOnOnly && this.laser && this.laser.laseron && (this.laser.laseron.length >= values.length)) ? this.laser.laseron : null;

		let minimum = Infinity;
		let maximum = -Infinity;
		for (let index = 0; index < values.length; index++) {
			if (laserOn && (laserOn[index] === 0))
				continue;
			const value = values[index];
			if (Number.isFinite (value)) {
				if (value < minimum)
					minimum = value;
				if (value > maximum)
					maximum = value;
			}
		}
		if ((minimum > maximum) && laserOn)
			return this.getPointChannelRange (pointsChannelName, pointsColumnName, false);
		return (minimum <= maximum) ? { min: minimum, max: maximum } : null;
	}

	// Spot styles of the points (primary) and of the secondary points: { visible, size: diameter in CSS pixels, fill,
	// look, colorSource and its colors }. A spot is a circle (look "circle"), filled with its color if fill is set, or
	// a spot of light that fades out towards its edge (look "glow"). colorSource "laserstate" (the default) colors it
	// by the laser state of its sample, onColor and offColor: 0xRRGGBB of the points recorded with the laser on and
	// off; "values" by the value of its sample in the column valueColumn of the data channel valueChannel, in the
	// color map colorMap (colorMapInverted) that spans the values valueMin to valueMax. A set whose values are not
	// loaded is not drawn. A null primary style draws the points as before (filled discs in the colors of the display
	// mode, size from the zoom), a null secondary style hides the secondary points. Changes of colors, color map,
	// value range, size, fill or look only update the drawn elements.
	setPointSetStyles (primaryStyle, secondaryStyle)
	{
		const styles = {
			primary: LayerViewImpl.normalizePointSetStyle (primaryStyle),
			secondary: LayerViewImpl.normalizePointSetStyle (secondaryStyle)
		};
		const previous = this.pointSetStyles;
		if (JSON.stringify (styles) === JSON.stringify (previous))
			return;
		this.pointSetStyles = styles;

		// Visibility, the presence of a style and the values the points are colored by need new elements.
		const layout = (style) => style ? [style.visible, style.colorSource, style.valueChannel, style.valueColumn] : null;
		const rebuild = (JSON.stringify (layout (styles.primary)) !== JSON.stringify (layout (previous.primary))) ||
			(JSON.stringify (layout (styles.secondary)) !== JSON.stringify (layout (previous.secondary)));
		if (rebuild) {
			this.updateLayerPoints ();
		} else if (this.glInstance) {
			for (const [identifier, style] of [["layerdata_points", styles.primary], ["layerdata_secondarypoints", styles.secondary]]) {
				const element = this.glInstance.findElement (identifier);
				if (element && style && (typeof element.setSpotStyle === "function"))
					element.setSpotStyle (this.makeSpotStyle (style));
			}
			this.updateTransform ();
		}
		this.RenderScene (true);
	}

	// False hides all recorded points (the display mode Off).
	setPointsVisible (visible)
	{
		const newVisible = visible !== false;
		if (newVisible === this.pointsVisible)
			return;
		this.pointsVisible = newVisible;
		this.updateLayerPoints ();
		this.RenderScene (true);
	}

	// Calls update (), which may change several settings of the points, and rebuilds the points once at the end
	// instead of after every change.
	batchPointsUpdate (update)
	{
		if (this.pointsUpdateDeferred) {
			update ();
			return;
		}
		this.pointsUpdateDeferred = true;
		this.pointsUpdatePending = false;
		try {
			update ();
		} finally {
			this.pointsUpdateDeferred = false;
		}
		if (this.pointsUpdatePending) {
			this.pointsUpdatePending = false;
			this.updateLayerPoints ();
		}
		this.RenderScene (true);
	}

	updateLayerPoints () {
		if (!this.glInstance)
			return;
		if (this.pointsUpdateDeferred) {
			this.pointsUpdatePending = true;
			return;
		}

		this.glInstance.removeElement("layerdata_points");
		this.glInstance.removeElement("layerdata_secondarypoints");
		this.filteredToOriginalIndexMap = null;
		this.pointSetSpacings = { primary: 0.0, secondary: 0.0 };

		if (!this.layerPointsArray || !this.pointsVisible)
			return;

		const primaryStyle = this.pointSetStyles.primary;
		const secondaryStyle = this.pointSetStyles.secondary;
		// A set colored by values needs them loaded.
		const drawable = (style) => style.visible && ((style.colorSource !== "values") || !!this.getPointSetValues (style));
		const drawPrimary = !primaryStyle || drawable (primaryStyle);
		const drawSecondary = !!secondaryStyle && drawable (secondaryStyle) && this.hasSecondaryPoints ();
		if (!drawPrimary && !drawSecondary)
			return;

		// Points without a spot style take the colors of the display mode, which were left out while they had one.
		if (!primaryStyle && this.pointColorsOutdated)
			this.updateColors ();

		const pointCount = Math.floor (this.layerPointsArray.length / 2);
		let colorsToRender = this.layerPointsColorArray;
		let indexMap = null;
		const laserOnStates = (this.laser && this.laser.laseron && (this.laser.laseron.length >= pointCount)) ? this.laser.laseron : null;

		if (!this.showLaserOffPoints && this.laser && this.laser.laseron) {
			const laserOn = this.laser.laseron;
			let shownCount = 0;
			for (let i = 0; i < pointCount; i++) {
				if (laserOn[i] !== 0)
					shownCount++;
			}
			indexMap = new Uint32Array (shownCount);
			let entry = 0;
			for (let i = 0; i < pointCount; i++) {
				if (laserOn[i] !== 0)
					indexMap[entry++] = i;
			}
			if (colorsToRender) {
				const filteredColors = new Array (shownCount);
				for (let entry = 0; entry < shownCount; entry++)
					filteredColors[entry] = colorsToRender[indexMap[entry]];
				colorsToRender = filteredColors;
			}
			this.filteredToOriginalIndexMap = indexMap;
		}

		// Positions of the shown points, in the order of indexMap.
		const selectPoints = (positions) => {
			if (!indexMap)
				return positions;
			const selected = new Float32Array (indexMap.length * 2);
			for (let entry = 0; entry < indexMap.length; entry++) {
				const index = indexMap[entry];
				selected[entry * 2] = positions[index * 2];
				selected[entry * 2 + 1] = positions[index * 2 + 1];
			}
			return selected;
		};

		// Values of the shown points, in the order of indexMap.
		const selectValues = (values) => {
			if (!indexMap)
				return values;
			const selected = new Float32Array (indexMap.length);
			for (let entry = 0; entry < indexMap.length; entry++)
				selected[entry] = values[indexMap[entry]];
			return selected;
		};

		// Laser state of the shown points for the spot styles that color by it; without it every spot takes the laser
		// on color.
		const usesLaserState = (style, drawn) => drawn && !!style && (style.colorSource === "laserstate");
		let shownStates = null;
		if (laserOnStates && (usesLaserState (primaryStyle, drawPrimary) || usesLaserState (secondaryStyle, drawSecondary))) {
			if (indexMap) {
				shownStates = new Uint8Array (indexMap.length);
				for (let entry = 0; entry < indexMap.length; entry++)
					shownStates[entry] = (laserOnStates[indexMap[entry]] !== 0) ? 1 : 0;
			} else {
				shownStates = laserOnStates;
			}
		}

		const pixelRatio = this.glInstance.getPixelRatio ();
		// The fill and the look move the element in updateTransform, see computePointSetDepthOffset; the distance
		// between the drawn points decides there how many of them are skipped, see fitPointSet.
		const addPoints = (identifier, positions, style, secondary) => {
			const zValue = LAYERVIEW_POINTS_Z + (secondary ? LAYERVIEW_POINTS_SECONDARY_DZ : 0.0);
			const pixelSize = this.computePointSetPixelSize (style) * pixelRatio;
			this.pointSetSpacings[secondary ? "secondary" : "primary"] = LayerViewImpl.computePointSpacing (positions, indexMap);
			if (style && (style.colorSource === "values"))
				this.glInstance.add2DScreenPointsGeometry (identifier, selectPoints (positions), zValue, pixelSize, style.onColor,
					null, this.makeSpotStyle (style), null, selectValues (this.getPointSetValues (style)));
			else if (style)
				this.glInstance.add2DScreenPointsGeometry (identifier, selectPoints (positions), zValue, pixelSize, style.onColor,
					null, this.makeSpotStyle (style), shownStates);
			else
				this.glInstance.add2DScreenPointsGeometry (identifier, selectPoints (positions), zValue, pixelSize, LAYERVIEW_UNIFORMPOINTCOLOR,
					colorsToRender);
		};

		if (drawPrimary)
			addPoints ("layerdata_points", this.layerPointsArray, primaryStyle, false);
		if (drawSecondary)
			addPoints ("layerdata_secondarypoints", this.secondaryPointsArray, secondaryStyle, true);

		this.applyTimeCap ();
		this.updateTransform ();
		this.RenderScene (true);
	}

	// The drawn point closest to the viewport position within pixelTolerance, among the points and the secondary
	// points: { index into the full point array, secondary: true if it is one of the secondary points }, or null.
	// Hidden and time-capped points are not picked.
	/**
	 * @param {number} screenX
	 * @param {number} screenY
	 * @param {number} [pixelTolerance]
	 */
	pickPoint (screenX, screenY, pixelTolerance = 4)
	{
		if (!this.glInstance || !this.layerPointsArray || !this.pointsVisible)
			return null;

		let best = null;
		for (const [identifier, secondary] of [["layerdata_secondarypoints", true], ["layerdata_points", false]]) {
			const pointsElement = this.glInstance.findElement (identifier);
			if (!pointsElement || (typeof pointsElement.findNearestPointWithDistance !== "function"))
				continue;
			const hit = pointsElement.findNearestPointWithDistance (screenX, screenY, pixelTolerance);
			if (hit && (!best || (hit.distanceSq < best.distanceSq)))
				best = { renderedIndex: hit.index, distanceSq: hit.distanceSq, secondary: secondary };
		}
		if (!best)
			return null;

		return { index: this.resolvePointIndex (best.renderedIndex), secondary: best.secondary };
	}

	// Index of the drawn point closest to the viewport position within pixelTolerance, as an
	// index into the full point array, or -1. See pickPoint.
	/**
	 * @param {number} screenX
	 * @param {number} screenY
	 * @param {number} [pixelTolerance]
	 */
	pickPointAtScreenPoint (screenX, screenY, pixelTolerance = 4)
	{
		const hit = this.pickPoint (screenX, screenY, pixelTolerance);
		return hit ? hit.index : -1;
	}

	// Value of a point in a column of a data channel ("laser" by default), or null if it is not loaded.
	getPointChannelValue (columnName, pointIndex, pointsChannelName = "laser")
	{
		const channel = this.pointChannelNames.has (pointsChannelName) ? this[pointsChannelName] : null;
		if (channel && channel[columnName] && (pointIndex >= 0) && (pointIndex < channel[columnName].length))
			return channel[columnName][pointIndex];
		return null;
	}

	// Measurement values of one recorded point for the hover inspector. x and y are the position of the point as
	// picked (secondary: at its secondary position), primaryx/y and secondaryx/y both positions of the sample (null
	// if the secondary points are not loaded), velocity is taken along the picked positions.
	getPointInfo (pointIndex, secondary = false)
	{
		const position = this.getPointPosition (pointIndex, secondary);
		if (!position)
			return null;
		const primaryPosition = this.getPointPosition (pointIndex, false);
		const secondaryPosition = this.getPointPosition (pointIndex, true);

		const scannerXColumn = (this.laser && this.laser.targetx) ? "targetx" : "actualx";
		const scannerYColumn = (this.laser && this.laser.targety) ? "targety" : "actualy";

		return {
			index: pointIndex,
			secondary: secondary === true,
			x: position.x,
			y: position.y,
			primaryx: primaryPosition ? primaryPosition.x : null,
			primaryy: primaryPosition ? primaryPosition.y : null,
			secondaryx: secondaryPosition ? secondaryPosition.x : null,
			secondaryy: secondaryPosition ? secondaryPosition.y : null,
			time: this.getPointChannelValue ("time", pointIndex),
			scannerx: this.getPointChannelValue (scannerXColumn, pointIndex),
			scannery: this.getPointChannelValue (scannerYColumn, pointIndex),
			laseron: this.getPointChannelValue ("laseron", pointIndex),
			power: this.getPointChannelValue ("power", pointIndex),
			velocity: this.getPointVelocity (pointIndex, secondary === true)
		};
	}

	// Number of entries in a sorted array that are smaller than (or equal to, if inclusive) value.
	static countSortedBelow (sortedArray, value, inclusive)
	{
		let low = 0;
		let high = sortedArray.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			const entry = sortedArray[middle];
			if ((entry < value) || (inclusive && (entry === value)))
				low = middle + 1;
			else
				high = middle;
		}
		return low;
	}

	// Assigns a start time to every toolpath line on the layer timeline:
	// - with a recording, the marking vectors are matched to its laser-on runs (alignLinesToRecording);
	// - if nothing matches, the estimated marking time (length / laser speed) is mapped onto the
	//   accumulated laser-on time of the recording;
	// - without a recording, the estimated marking time is used directly (jumps are ignored).
	updateTiming ()
	{
		this.computeTiming ();
		if (this.toolpathColorMode === "time") {
			this.refreshToolpathColors ();
			this.refreshPointColors ();
		}
	}

	computeTiming ()
	{
		this.timingMatchRatio = 0.0;
		const lineCount = this.lineDurations ? this.lineDurations.length : 0;
		const lineStartTimes = new Float64Array (lineCount);

		let estimatedTotal = 0.0;
		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			lineStartTimes[lineIndex] = estimatedTotal;
			estimatedTotal += this.lineDurations[lineIndex];
		}

		const times = this.laser ? this.laser.time : null;
		const laserOn = this.laser ? this.laser.laseron : null;
		const hasRecording = times && (times.length > 1) && this.layerPointsArray;

		if (!hasRecording) {
			this.lineStartTimes = lineStartTimes;
			this.timelineDuration = estimatedTotal;
			this.timingSource = (lineCount > 0) ? "estimate" : "none";
			this.applyTimeCap ();
			return;
		}

		const sampleCount = times.length;
		this.timelineDuration = times[sampleCount - 1];
		this.timingSource = "recording";

		if ((lineCount > 0) && laserOn && (laserOn.length === sampleCount) && (this.layerPointsArray.length >= sampleCount * 2)) {

			const alignedStartTimes = this.alignLinesToRecording (times, laserOn);
			if (alignedStartTimes) {
				this.lineStartTimes = alignedStartTimes;
				this.applyTimeCap ();
				return;
			}

			// Accumulated laser-on time up to each sample.
			const onTime = new Float64Array (sampleCount);
			for (let i = 1; i < sampleCount; i++)
				onTime[i] = onTime[i - 1] + ((laserOn[i - 1] !== 0) ? (times[i] - times[i - 1]) : 0);

			const totalOnTime = onTime[sampleCount - 1];
			if ((totalOnTime > 0) && (estimatedTotal > 0)) {
				for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
					const targetOnTime = lineStartTimes[lineIndex] / estimatedTotal * totalOnTime;
					const sampleIndex = Math.min (LayerViewImpl.countSortedBelow (onTime, targetOnTime, false), sampleCount - 1);
					lineStartTimes[lineIndex] = times[sampleIndex];
				}
				this.timingSource = "recording-approximate";
				this.lineStartTimes = lineStartTimes;
				this.applyTimeCap ();
				return;
			}
		}

		// Recording without laser state: stretch the estimate over the recorded duration.
		const stretch = estimatedTotal > 0 ? this.timelineDuration / estimatedTotal : 0;
		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++)
			lineStartTimes[lineIndex] *= stretch;
		this.timingSource = "recording-approximate";
		this.lineStartTimes = lineStartTimes;
		this.applyTimeCap ();
	}

	// Matches the marking vectors (hatch lines and polylines, in toolpath order) to the laser-on
	// runs of the recording. A matched vector starts at the first sample of its run and ends with
	// the last run that still lies on it (vectors can be split into several runs, e.g. at
	// corners). Vectors without a run (too short to be sampled) are interpolated between their
	// matched neighbours by estimated duration. Returns the line start times, or null if no
	// vector could be matched.
	alignLinesToRecording (times, laserOn)
	{
		const lineCount = this.lineDurations.length;
		const sampleCount = times.length;
		const points = this.layerPointsArray;
		const coords = this.linesCoordinates;
		const tolerance = LAYERVIEW_TIMING_MATCHTOLERANCE;
		const toleranceSq = tolerance * tolerance;

		const runStartSamples = [];
		const runEndSamples = [];
		for (let i = 0; i < sampleCount; i++) {
			if ((laserOn[i] !== 0) && ((i === 0) || (laserOn[i - 1] === 0)))
				runStartSamples.push (i);
			if ((laserOn[i] !== 0) && ((i === sampleCount - 1) || (laserOn[i + 1] === 0)))
				runEndSamples.push (i);
		}
		const runCount = runStartSamples.length;
		if (runCount === 0)
			return null;

		const groupFirstLines = [];
		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			if ((lineIndex === 0) || (this.lineGroupIDs[lineIndex] !== this.lineGroupIDs[lineIndex - 1]))
				groupFirstLines.push (lineIndex);
		}
		const groupCount = groupFirstLines.length;
		groupFirstLines.push (lineCount);

		const groupDurations = new Float64Array (groupCount);
		for (let group = 0; group < groupCount; group++) {
			for (let lineIndex = groupFirstLines[group]; lineIndex < groupFirstLines[group + 1]; lineIndex++)
				groupDurations[group] += this.lineDurations[lineIndex];
		}

		let bounds = null;
		let boundsGroup = -1;
		const runLiesOnGroup = (run, group) => {
			const sample = runStartSamples[run];
			const px = points[sample * 2];
			const py = points[sample * 2 + 1];
			const firstLine = groupFirstLines[group];
			const lastLine = Math.min (groupFirstLines[group + 1], firstLine + LAYERVIEW_TIMING_MAXGROUPLINES);

			if (boundsGroup !== group) {
				bounds = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
				for (let lineIndex = firstLine; lineIndex < lastLine; lineIndex++) {
					for (let corner = 0; corner < 2; corner++) {
						const x = coords[lineIndex * 4 + corner * 2];
						const y = coords[lineIndex * 4 + corner * 2 + 1];
						bounds.minx = Math.min (bounds.minx, x);
						bounds.maxx = Math.max (bounds.maxx, x);
						bounds.miny = Math.min (bounds.miny, y);
						bounds.maxy = Math.max (bounds.maxy, y);
					}
				}
				boundsGroup = group;
			}
			if ((px < bounds.minx - tolerance) || (px > bounds.maxx + tolerance) || (py < bounds.miny - tolerance) || (py > bounds.maxy + tolerance))
				return false;

			for (let lineIndex = firstLine; lineIndex < lastLine; lineIndex++) {
				const arrayIndex = lineIndex * 4;
				if (LayerViewImpl.pointSegmentDistanceSq (px, py, coords[arrayIndex], coords[arrayIndex + 1], coords[arrayIndex + 2], coords[arrayIndex + 3]) < toleranceSq)
					return true;
			}
			return false;
		};

		const groupStarts = new Float64Array (groupCount).fill (NaN);
		const groupEnds = new Float64Array (groupCount).fill (NaN);
		let matchedGroups = 0;
		let nextRun = 0;
		for (let group = 0; (group < groupCount) && (nextRun < runCount); group++) {
			const lastCandidate = Math.min (nextRun + LAYERVIEW_TIMING_RUNLOOKAHEAD, runCount);
			for (let run = nextRun; run < lastCandidate; run++) {
				if (!runLiesOnGroup (run, group))
					continue;

				let lastRun = run;
				while ((lastRun + 1 < runCount) && runLiesOnGroup (lastRun + 1, group))
					lastRun++;

				groupStarts[group] = times[runStartSamples[run]];
				groupEnds[group] = times[runEndSamples[lastRun]];
				nextRun = lastRun + 1;
				matchedGroups++;
				break;
			}
		}

		if (matchedGroups === 0)
			return null;

		// Unmatched vectors share the time between the surrounding matched ones.
		let previousEnd = times[0];
		let group = 0;
		while (group < groupCount) {
			if (!Number.isNaN (groupStarts[group])) {
				previousEnd = Math.max (groupEnds[group], previousEnd);
				group++;
				continue;
			}

			let stretchEnd = group;
			let stretchDuration = 0.0;
			while ((stretchEnd < groupCount) && Number.isNaN (groupStarts[stretchEnd])) {
				stretchDuration += groupDurations[stretchEnd];
				stretchEnd++;
			}
			const nextStart = (stretchEnd < groupCount) ? groupStarts[stretchEnd] : times[sampleCount - 1];
			const available = Math.max (nextStart - previousEnd, 0.0);

			let currentTime = previousEnd;
			for (let stretchGroup = group; stretchGroup < stretchEnd; stretchGroup++) {
				const share = (stretchDuration > 0) ? groupDurations[stretchGroup] / stretchDuration : 1.0 / (stretchEnd - group);
				groupStarts[stretchGroup] = currentTime;
				currentTime += share * available;
				groupEnds[stretchGroup] = currentTime;
			}
			group = stretchEnd;
		}

		const lineStartTimes = new Float64Array (lineCount);
		let latestTime = -Infinity;
		for (let currentGroup = 0; currentGroup < groupCount; currentGroup++) {
			const groupDuration = groupDurations[currentGroup];
			const span = groupEnds[currentGroup] - groupStarts[currentGroup];
			let elapsed = 0.0;
			for (let lineIndex = groupFirstLines[currentGroup]; lineIndex < groupFirstLines[currentGroup + 1]; lineIndex++) {
				const startTime = groupStarts[currentGroup] + ((groupDuration > 0) ? (elapsed / groupDuration) * span : 0.0);
				// Keep the start times sorted for the binary search in applyTimeCap.
				latestTime = Math.max (latestTime, startTime);
				lineStartTimes[lineIndex] = latestTime;
				elapsed += this.lineDurations[lineIndex];
			}
		}

		this.timingMatchRatio = matchedGroups / groupCount;
		return lineStartTimes;
	}

	getTimelineDuration ()
	{
		return this.timelineDuration;
	}

	// Share (0..1) of marking vectors that were matched to the recording by updateTiming.
	getTimingMatchRatio ()
	{
		return this.timingMatchRatio;
	}

	getTimingSource ()
	{
		return this.timingSource;
	}

	// Draws only what happened up to fraction (0..1) of the layer timeline.
	setTimeCapFraction (fraction)
	{
		const value = Number (fraction);
		this.timeCapFraction = Number.isFinite (value) ? Math.min (Math.max (value, 0.0), 1.0) : 1.0;
		this.applyTimeCap ();

		if ((this.highlightLineIndex >= 0) && (this.highlightLineIndex >= this.visibleLineCount))
			this.clearHighlight ();
		this.RenderScene (true);
	}

	applyTimeCap ()
	{
		if (!this.glInstance)
			return;

		const capped = this.timeCapFraction < 1.0;
		const capTime = this.timeCapFraction * this.timelineDuration;

		const lineCount = Math.floor (this.linesCoordinates.length / 4);
		this.visibleLineCount = lineCount;
		if (capped && this.lineStartTimes && (this.lineStartTimes.length === lineCount))
			this.visibleLineCount = LayerViewImpl.countSortedBelow (this.lineStartTimes, capTime, true);

		const linesElement = this.glInstance.findElement ("layerdata_lines");
		if (linesElement && (typeof linesElement.setVisibleLineCount === "function"))
			linesElement.setVisibleLineCount (this.visibleLineCount);

		const endPointsElement = this.glInstance.findElement ("layerdata_endpoints");
		if (endPointsElement && (typeof endPointsElement.setDrawCount === "function"))
			endPointsElement.setDrawCount (this.visibleLineCount * 2);

		const jumpsElement = this.glInstance.findElement ("layerdata_jumps");
		if (jumpsElement && this.jumpTargetLines && (typeof jumpsElement.setVisibleLineCount === "function"))
			jumpsElement.setVisibleLineCount (LayerViewImpl.countSortedBelow (this.jumpTargetLines, this.visibleLineCount, false));

		const pointCount = this.layerPointsArray ? Math.floor (this.layerPointsArray.length / 2) : 0;
		let visibleOriginalPoints = pointCount;
		if (capped && (pointCount > 0)) {
			const times = this.laser ? this.laser.time : null;
			if (times && (times.length === pointCount))
				visibleOriginalPoints = LayerViewImpl.countSortedBelow (times, capTime, true);
			else
				visibleOriginalPoints = Math.round (pointCount * this.timeCapFraction);
		}

		this.visiblePointCount = this.filteredToOriginalIndexMap
			? LayerViewImpl.countSortedBelow (this.filteredToOriginalIndexMap, visibleOriginalPoints, false)
			: visibleOriginalPoints;

		for (const identifier of ["layerdata_points", "layerdata_secondarypoints"]) {
			const pointsElement = this.glInstance.findElement (identifier);
			if (pointsElement && (typeof pointsElement.setDrawCount === "function"))
				pointsElement.setDrawCount (this.visiblePointCount);
		}

		this.renderNeedsUpdate = true;
	}

	resolvePointIndex (filteredIndex)
	{
		if (this.filteredToOriginalIndexMap && filteredIndex >= 0
			&& filteredIndex < this.filteredToOriginalIndexMap.length) {
			return this.filteredToOriginalIndexMap[filteredIndex];
		}
		return filteredIndex;
	}

	// Positions of the points, or of the secondary points if secondary is true (null if not loaded).
	getPointPositions (secondary = false)
	{
		return secondary ? (this.hasSecondaryPoints () ? this.secondaryPointsArray : null) : this.layerPointsArray;
	}

	getPointPosition (pointIndex, secondary = false)
	{
		const positions = this.getPointPositions (secondary);
		if (positions) {
			if (pointIndex >= 0) {
				let arrayIndex = pointIndex * 2;
				if (arrayIndex + 1 < positions.length) {
					let xPosition = positions[arrayIndex];
					let yPosition = positions[arrayIndex + 1];
					return { x: xPosition, y: yPosition }
				}
			}

		}

		return null;

	}

	// Velocity in mm/s from the neighbouring samples. Uses the recorded "time" channel (ms)
	// when present, otherwise a fixed sample period of 10 microseconds.
	getPointVelocity (pointIndex, secondary = false)
	{
		let dT = 1 / 100000;
		const positions = this.getPointPositions (secondary);

		if (positions) {
			if (pointIndex > 0) {
				let arrayIndex = pointIndex * 2;
				if (arrayIndex + 3 < positions.length) {
					const times = this.laser ? this.laser.time : null;
					if (times && (pointIndex + 1 < times.length)) {
						const sampleSpan = (times[pointIndex + 1] - times[pointIndex - 1]) * 0.001;
						if (sampleSpan > 0)
							dT = sampleSpan * 0.5;
					}
					let vX = (positions[arrayIndex + 2] - positions[arrayIndex - 2]) / (2 * dT);
					let vY = (positions[arrayIndex + 3] - positions[arrayIndex - 1]) / (2 * dT);
					let velocity = Math.sqrt (vX * vX + vY * vY);
					return velocity;
				}
			}

		}

		return 0.0;

	}

	getPointAcceleration (pointIndex, secondary = false)
	{
		let dT = 1 / 100000;
		const positions = this.getPointPositions (secondary);

		if (positions) {
			if (pointIndex > 0) {
				let arrayIndex = pointIndex * 2;
				if (arrayIndex + 3 < positions.length) {
					let aX = (positions[arrayIndex + 2] - 2 * positions[arrayIndex] + positions[arrayIndex - 2]) / (dT * dT);
					let aY = (positions[arrayIndex + 3] - 2 * positions[arrayIndex + 1] + positions[arrayIndex - 1]) / (dT * dT);
					let accel = Math.sqrt (aX * aX + aY * aY);
					return { ax: aX,  ay: aY, a: accel }
				}
			}

		}

		return null;

	}


	getPointJerk (pointIndex, secondary = false)
	{
		let dT = 1 / 100000;
		const positions = this.getPointPositions (secondary);

		if (positions) {
			if (pointIndex > 1) {
				let arrayIndex = pointIndex * 2;
				if (arrayIndex + 5 < positions.length) {
					let aXPrev = (positions[arrayIndex] - 2 * positions[arrayIndex - 2] + positions[arrayIndex - 4]) / (dT * dT);
					let aYPrev = (positions[arrayIndex + 1] - 2 * positions[arrayIndex - 1] + positions[arrayIndex - 3]) / (dT * dT);
					let aXNext = (positions[arrayIndex + 2] - 2 * positions[arrayIndex] + positions[arrayIndex - 2]) / (dT * dT);
					let aYNext = (positions[arrayIndex + 3] - 2 * positions[arrayIndex + 1] + positions[arrayIndex - 1]) / (dT * dT);
					let jX = (aXNext - aXPrev) / (2 * dT);
					let jY = (aYNext - aYPrev) / (2 * dT);
					let jerk = Math.sqrt (jX * jX + jY * jY);
					return { jx: jX,  jy: jY, j: jerk }
				}
			}

		}

		return null;

	}

	getPointPower (pointIndex)
	{
		if (this.laser && this.laser.power) {
			if (pointIndex >= 0 && pointIndex < this.laser.power.length) {
				return this.laser.power[pointIndex];				
			}
		}
		return null;
	}

	updateLoadedLayer () {
		if (!this.glInstance) 
			return;
		
        this.glInstance.removeElement("layerdata_lines");
        this.glInstance.removeElement("layerdata_jumps");
        // The highlighted line references indices into linesCoordinates, which are
        // about to be regenerated, so drop any stale highlight overlay.
        this.removeHighlightGeometry ();
        this.highlightLineIndex = -1;
		
		this.linesCoordinates = [];
		this.segmentProperties = [];
		this.lineGroupIDs = null;
		this.lineDurations = null;
		this.linePowers = [];
		this.lineSupportPoints = new Map ();
		this.lineProfileColors = [];
		this.jumpTargetLines = null;

		if (this.layerSegmentsArray) {
				
			let segmentsArray = this.layerSegmentsArray;
			var segmentCount = segmentsArray.length;
			var segmentIndex;
			
			let vertexcolors = [];
			// One group per polyline and per hatch line: each is marked with one laser-on run.
			let lineGroupIDs = [];
			let lineDurations = [];
			let groupID = 0;
			let pushLine = (x1, y1, x2, y2, segmentData, segmentColor, markSpeed, power1, power2, supportPoints) => {
				if (supportPoints && (supportPoints.length > 0))
					this.lineSupportPoints.set (this.segmentProperties.length, supportPoints);
				this.linesCoordinates.push(x1, y1, x2, y2);
				this.segmentProperties.push (segmentData);
				this.linePowers.push (power1, power2);
				vertexcolors.push (segmentColor);
				lineGroupIDs.push (groupID);
				lineDurations.push (Math.hypot (x2 - x1, y2 - y1) / markSpeed * 1000.0);
			};
			let pointPower = (powers, pointIndex) => {
				return (powers && (pointIndex < powers.length)) ? Number (powers[pointIndex]) : NaN;
			};
			// Support points of one ramp, read from the flat [t, power, ...] list of the segment.
			let readSupportPoints = (subValues, subOffset, subCount) => {
				if ((subCount <= 0) || !subValues || ((subOffset + subCount) * 2 > subValues.length))
					return null;
				let supportPoints = [];
				for (let subIndex = 0; subIndex < subCount; subIndex++) {
					let valueIndex = (subOffset + subIndex) * 2;
					supportPoints.push ({ t: Number (subValues[valueIndex]), power: Number (subValues[valueIndex + 1]) });
				}
				return supportPoints;
			};

			for (segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
				var segment = segmentsArray[segmentIndex];
				let partUUID = (typeof segment.partuuid === "string") ? segment.partuuid.toLowerCase () : "";
				let partDisabled = this.layerDisabledParts.has (partUUID);
				let segmentColor = partDisabled ? LAYERVIEW_DISABLEDPARTCOLOR : segment.color;
				let segmentData = {
					type: segment.type,
					laserpower: segment.laserpower,
					laserspeed: segment.laserspeed,
					profilename: segment.profilename,
					partid: segment.partid,
					partuuid: partUUID,
					partname: this.layerPartNames.get (partUUID) || "",
					partdisabled: partDisabled,
					laserindex: segment.laserindex,
					powermode: (typeof segment.powermode === "string") ? segment.powermode : ""
				}
				let markSpeed = (Number (segment.laserspeed) > 0) ? Number (segment.laserspeed) : LAYERVIEW_DEFAULTMARKSPEED;
				let powers = Array.isArray (segment.powers) ? segment.powers : null;
				let subCounts = Array.isArray (segment.powersubcounts) ? segment.powersubcounts : null;
				let subValues = Array.isArray (segment.powersubs) ? segment.powersubs : null;
				let subCountAt = (index) => (subCounts && (index < subCounts.length)) ? Number (subCounts[index]) : 0;

				if ((segment.type === "loop") || (segment.type === "polyline")) {
					var pointCount = segment.points.length;
					var pointIndex;
					// Power at the start of the line that ends in a point; constant factors have no start list.
					let powerStarts = Array.isArray (segment.powerstarts) ? segment.powerstarts : powers;
					// Power ramps are given per point, for the line that ends in it. The entry of the first point is unused.
					let subOffset = subCountAt (0);
					
					var oldx = segment.points[0].x;
					var oldy = segment.points[0].y;
					groupID++;

					for (pointIndex = 1; pointIndex < pointCount; pointIndex++) {
						var x = segment.points[pointIndex].x;
						var y = segment.points[pointIndex].y;

						let subCount = subCountAt (pointIndex);
						let supportPoints = readSupportPoints (subValues, subOffset, subCount);
						subOffset += subCount;

						if ((oldx === x) && (oldy === y)) {
							oldx = x;
							oldy = y;
							continue;
						}

						pushLine (oldx, oldy, x, y, segmentData, segmentColor, markSpeed,
							pointPower (powerStarts, pointIndex), pointPower (powers, pointIndex), supportPoints);

						oldx = x;
						oldy = y;
					}
				}

				if (segment.type === "hatch") {
					var lineCount = segment.points.length / 2;
					var lineIndex;
					let subOffset = 0;

					for (lineIndex = 0; lineIndex < lineCount; lineIndex++) {
						var x1 = segment.points[lineIndex * 2].x;
						var y1 = segment.points[lineIndex * 2].y;
						var x2 = segment.points[lineIndex * 2 + 1].x;
						var y2 = segment.points[lineIndex * 2 + 1].y;

						let subCount = subCountAt (lineIndex);
						let supportPoints = readSupportPoints (subValues, subOffset, subCount);
						subOffset += subCount;

						if ((x1 === x2) && (y1 === y2)) {
							continue;
						}

						groupID++;
						pushLine (x1, y1, x2, y2, segmentData, segmentColor, markSpeed,
							pointPower (powers, lineIndex * 2), pointPower (powers, lineIndex * 2 + 1), supportPoints);
					}

				}
			}

			this.lineGroupIDs = lineGroupIDs;
			this.lineDurations = lineDurations;
			this.lineProfileColors = vertexcolors;
		}

		this.computeTiming ();
		this.buildLinesGeometry ();
		this.applyTimeCap ();

		this.updateTransform();
		this.RenderScene(true);		

    }

	setToolpathColorMode (mode)
	{
		const newMode = TOOLPATH_COLOR_MODES.includes (mode) ? mode : "color";
		if (newMode === this.toolpathColorMode)
			return;
		this.toolpathColorMode = newMode;
		this.refreshToolpathColors ();
		this.refreshPointColors ();
	}

	getToolpathColorMode ()
	{
		return this.toolpathColorMode;
	}

	setColorMap (name, inverted)
	{
		this.colorMapName = name;
		this.colorMapInverted = inverted === true;
		if (LAYERVIEW_COLORMAPMODES.includes (this.toolpathColorMode)) {
			this.refreshToolpathColors ();
			this.refreshPointColors ();
		}
	}

	// Value range of the power (W), time (ms) or velocity (mm/s) mode. Pass null to use the range of the loaded layer.
	setColorRange (mode, minValue, maxValue)
	{
		if (!(mode in this.colorRanges))
			return;
		const minimum = Number (minValue);
		const maximum = Number (maxValue);
		const range = ((minValue !== null) && (maxValue !== null) && Number.isFinite (minimum) && Number.isFinite (maximum))
			? { min: minimum, max: maximum } : null;
		const previous = this.colorRanges[mode];
		if ((range === previous) || (range && previous && (range.min === previous.min) && (range.max === previous.max)))
			return;
		this.colorRanges[mode] = range;
		if (this.toolpathColorMode === mode) {
			this.refreshToolpathColors ();
			this.refreshPointColors ();
		}
	}

	// Range of the laser speeds (mm/s) of the loaded layer, or of the recorded point velocities if the
	// toolpath has no speeds.
	getLayerVelocityRange ()
	{
		let minimum = Infinity;
		let maximum = -Infinity;
		for (const properties of this.segmentProperties) {
			const speed = Number (properties.laserspeed);
			if (Number.isFinite (speed) && (speed > 0)) {
				minimum = Math.min (minimum, speed);
				maximum = Math.max (maximum, speed);
			}
		}
		if (minimum <= maximum)
			return { min: minimum, max: maximum };
		if (this.layerPointsArray && this.layerPointsVelocities && (this.layerPointsVelocities.length > 0))
			return { min: this.layerPointsMinVelocity, max: this.layerPointsMaxVelocity };
		return null;
	}

	static makeColorRangeNormalizer (range)
	{
		const span = range.max - range.min;
		return (value) => (span !== 0) ? (value - range.min) / span : ((value >= range.max) ? 1.0 : 0.0);
	}

	// Range of the effective laser power (W) over all lines of the loaded layer, including ramp support points.
	getLayerPowerRange ()
	{
		let minimum = Infinity;
		let maximum = -Infinity;
		const include = (value) => {
			if (Number.isFinite (value)) {
				minimum = Math.min (minimum, value);
				maximum = Math.max (maximum, value);
			}
		};
		const lineCount = this.segmentProperties.length;
		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			const nominal = Number (this.segmentProperties[lineIndex].laserpower);
			for (const power of [this.linePowers[lineIndex * 2], this.linePowers[lineIndex * 2 + 1]])
				include (Number.isFinite (power) ? power : nominal);
		}
		for (const supportPoints of this.lineSupportPoints.values ())
			for (const supportPoint of supportPoints)
				include (supportPoint.power);

		return (minimum <= maximum) ? { min: minimum, max: maximum } : null;
	}

	getEffectiveColorRange (mode)
	{
		const configured = this.colorRanges[mode];
		if (configured)
			return configured;
		if (mode === "time")
			return { min: 0.0, max: this.timelineDuration };
		if (mode === "velocity")
			return this.getLayerVelocityRange () || { min: 0.0, max: 1.0 };
		return this.getLayerPowerRange () || { min: 0.0, max: 1.0 };
	}

	refreshToolpathColors ()
	{
		if (!this.glInstance)
			return;
		this.buildLinesGeometry ();
		this.applyTimeCap ();
		this.updateTransform ();
		this.RenderScene (true);
	}

	// Color of every line, and color gradients of power ramps, in the current display mode.
	buildLinesGeometry ()
	{
		if (!this.glInstance)
			return;

		this.glInstance.removeElement ("layerdata_lines");
		this.glInstance.removeElement ("layerdata_jumps");
		this.glInstance.removeElement ("layerdata_endpoints");
		this.jumpTargetLines = null;

		const lineCount = this.segmentProperties.length;
		if (!this.toolpathVisible || (lineCount === 0))
			return;

		const mode = this.toolpathColorMode;
		const colors = new Array (lineCount);
		let gradients = null;

		if (LAYERVIEW_COLORMAPMODES.includes (mode)) {
			const sampler = new ColorMapSampler (this.colorMapName, this.colorMapInverted);
			const normalize = LayerViewImpl.makeColorRangeNormalizer (this.getEffectiveColorRange (mode));

			if (mode === "time") {
				const startTimes = (this.lineStartTimes && (this.lineStartTimes.length === lineCount)) ? this.lineStartTimes : null;
				for (let lineIndex = 0; lineIndex < lineCount; lineIndex++)
					colors[lineIndex] = sampler.colorAt (startTimes ? normalize (startTimes[lineIndex]) : 0.0);
			} else if (mode === "velocity") {
				for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
					const speed = Number (this.segmentProperties[lineIndex].laserspeed);
					colors[lineIndex] = (Number.isFinite (speed) && (speed > 0)) ? sampler.colorAt (normalize (speed)) : LAYERVIEW_DISABLEDPARTCOLOR;
				}
			} else {
				gradients = new Array (lineCount).fill (null);
				for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
					const nominal = Number (this.segmentProperties[lineIndex].laserpower);
					const resolve = (power) => Number.isFinite (power) ? power : nominal;
					const knots = [{ t: 0.0, power: resolve (this.linePowers[lineIndex * 2]) }];
					const supportPoints = this.lineSupportPoints.get (lineIndex);
					if (supportPoints)
						for (const supportPoint of supportPoints)
							knots.push ({ t: supportPoint.t, power: resolve (supportPoint.power) });
					knots.push ({ t: 1.0, power: resolve (this.linePowers[lineIndex * 2 + 1]) });

					colors[lineIndex] = sampler.colorAt (normalize (knots[0].power));
					if (knots.some ((knot) => knot.power !== knots[0].power))
						gradients[lineIndex] = LayerViewImpl.buildColorGradient (knots, normalize, sampler);
				}
			}
		} else {
			for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
				if (mode === "type")
					colors[lineIndex] = (this.segmentProperties[lineIndex].type === "hatch") ? this.typeColors.hatch : this.typeColors.polyline;
				else if (mode === "laseron")
					colors[lineIndex] = LAYERVIEW_LASERONCOLOR;
				else
					colors[lineIndex] = this.lineProfileColors[lineIndex];
			}
		}

		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			if (this.segmentProperties[lineIndex].partdisabled) {
				colors[lineIndex] = LAYERVIEW_DISABLEDPARTCOLOR;
				if (gradients)
					gradients[lineIndex] = null;
			}
		}

		const thickness = this.lineScaleLevel * 0.3;
		this.glInstance.add2DLineGeometry ("layerdata_lines", this.linesCoordinates, 60, thickness, 0x000000, colors, gradients);

		if (mode === "laseron")
			this.buildJumpGeometry (thickness * LAYERVIEW_JUMPTHICKNESSFACTOR);

		// Two points per line, so the time cap shows the points of the first visibleLineCount lines.
		if (this.endPointsVisible)
			this.glInstance.add2DScreenPointsGeometry ("layerdata_endpoints", new Float32Array (this.linesCoordinates), 62,
				LAYERVIEW_ENDPOINTPIXELS * this.glInstance.getPixelRatio (), this.endPointColor, null);
	}

	setEndPointsVisible (visible)
	{
		const newVisible = visible === true;
		if (newVisible === this.endPointsVisible)
			return;
		this.endPointsVisible = newVisible;
		this.refreshToolpathColors ();
	}

	// Jumps between marking vectors: from the end of a polyline or hatch line to the start of the next one.
	buildJumpGeometry (thickness)
	{
		const coords = this.linesCoordinates;
		const groupIDs = this.lineGroupIDs;
		const lineCount = this.segmentProperties.length;
		if (!groupIDs || (groupIDs.length !== lineCount))
			return;

		const jumpCoordinates = [];
		const jumpTargetLines = [];
		for (let lineIndex = 1; lineIndex < lineCount; lineIndex++) {
			if (groupIDs[lineIndex] === groupIDs[lineIndex - 1])
				continue;
			const fromX = coords[(lineIndex - 1) * 4 + 2];
			const fromY = coords[(lineIndex - 1) * 4 + 3];
			const toX = coords[lineIndex * 4];
			const toY = coords[lineIndex * 4 + 1];
			if ((fromX === toX) && (fromY === toY))
				continue;
			jumpCoordinates.push (fromX, fromY, toX, toY);
			jumpTargetLines.push (lineIndex);
		}

		this.jumpTargetLines = jumpTargetLines;
		if (jumpTargetLines.length > 0)
			this.glInstance.add2DLineGeometry ("layerdata_jumps", jumpCoordinates, 59, thickness, this.typeColors.travel,
				new Array (jumpTargetLines.length).fill (this.typeColors.travel));
	}

	// Gradient stops [t, color, ...] of a piecewise linear power ramp. Pieces are split where the
	// normalized power crosses a color map stop, so that linear color interpolation between the
	// stops reproduces the color map exactly.
	static buildColorGradient (knots, normalize, sampler)
	{
		const positions = sampler.positions;
		let startValue = normalize (knots[0].power);
		const gradient = [0.0, sampler.colorAt (startValue)];

		for (let knotIndex = 1; knotIndex < knots.length; knotIndex++) {
			const ta = knots[knotIndex - 1].t;
			const tb = knots[knotIndex].t;
			const endValue = normalize (knots[knotIndex].power);

			if (endValue !== startValue) {
				const lower = Math.min (startValue, endValue);
				const upper = Math.max (startValue, endValue);
				const crossings = positions.filter ((position) => (position > lower) && (position < upper));
				if (endValue < startValue)
					crossings.reverse ();
				for (const position of crossings) {
					const t = ta + (position - startValue) / (endValue - startValue) * (tb - ta);
					gradient.push (t, sampler.colorAt (position));
				}
			}

			gradient.push (tb, sampler.colorAt (endValue));
			startValue = endValue;
		}

		return gradient;
	}

    Drag(deltaX, deltaY) {

        // console.log("dX: " + deltaX + " dY: " + deltaY);

        this.transform.x = this.transform.x + deltaX;
        this.transform.y = this.transform.y + deltaY;

        this.updateTransform();

    }

    SetAbsoluteScaling(newScaling, centerx, centery) {

        if (!centerx) {
            centerx = this.twoinstance.width * 0.5;
        }

        if (!centery) {
            centery = this.twoinstance.height * 0.5;
        }

        this.ScaleRelative(newScaling / this.transform.scaling, centerx, centery);

    }

    ScaleRelative(factor, centerx, centery) {

        if (!centerx) {
            centerx = this.currentSize.viewPortWidth * 0.5;
        }

        if (!centery) {
            centery = this.currentSize.viewPortHeight * 0.5;
        }

        this.transform.x = this.transform.x - centerx;
        this.transform.y = this.transform.y - centery;

		// console.log("oldscaling: " + this.transform.scaling);

        var oldScaling = this.transform.scaling;
        this.transform.scaling = oldScaling * factor;
        if (this.transform.scaling < LAYERVIEW_MINSCALING)
            this.transform.scaling = LAYERVIEW_MINSCALING;

        if (this.transform.scaling > LAYERVIEW_MAXSCALING)
            this.transform.scaling = LAYERVIEW_MAXSCALING;

		// console.log("newscaling: " + this.transform.scaling);

        factor = this.transform.scaling / oldScaling;

        this.transform.x = Math.ceil(this.transform.x * factor + centerx);
        this.transform.y = Math.ceil(this.transform.y * factor + centery);

        this.updateTransform();
		
    }
	
	CenterOnRectangle (minx, miny, maxx, maxy)
	{
		var sizex = maxx - minx;
		var sizey = maxy - miny;
		
		if ((this.currentSize.viewPortWidth > 0) && (this.currentSize.viewPortHeight > 0)) {
			if ((sizex > 0) && (sizey > 0)) {
				
				var scalingx = (this.currentSize.viewPortWidth / sizex);
				var scalingy = (this.currentSize.viewPortHeight / sizey);
				
				var newcenterx = (maxx + minx) * 0.5;
				var newcentery = (maxy + miny) * 0.5;
				
				var viewcenterx = this.currentSize.viewPortWidth * 0.5;
				var viewcentery = this.currentSize.viewPortHeight * 0.5;
								
				this.transform.x = viewcenterx - this.transform.scaling * newcenterx;
				this.transform.y = viewcentery + this.transform.scaling * newcentery;
								
				var newScaling;
				if (scalingx > scalingy) {
					newScaling = scalingy;
				} else {
					newScaling = scalingx;
				}
				
				this.SetAbsoluteScaling (newScaling, viewcenterx, viewcentery);
			
			}
		}
		
		
	}
	
    RenderScene (forceRender = false) 
	{
		if (forceRender) {
			this.renderNeedsUpdate = true;
		}
		
		if (this.renderNeedsUpdate && this.glInstance) {
			this.glInstance.renderScene ();
			this.renderNeedsUpdate = false;
		}			
		
	} 
	
	// Scalar field image stretched over the platform rectangle (0..sizeX, 0..sizeY in platform coordinates), for
	// example a heat map of the layer, see WebGLScalarImageElement for the encoding. valueMin and valueMax are the
	// values of the codes 0 and 65535. The overlay shares the position and the scale of the build plate, between
	// the plate (z 35) and the toolpath (z 59 and up). A null url removes it. onLoaded and onError are optional.
	SetOverlayImage (url, sizeX, sizeY, valueMin, valueMax, onLoaded, onError) {
		if (!this.glInstance)
			return;

		if (url) {
			this.glInstance.addScalarImageElement ("overlayimage", url, sizeX, sizeY, 0, 0, 36, {
				valueMin: valueMin,
				valueMax: valueMax,
				lookupTable: colorMapLookupTable (this.overlayColorMapName, this.overlayColorMapInverted),
				rangeMin: this.overlayRange.min,
				rangeMax: this.overlayRange.max,
				smoothing: this.overlaySmoothing,
				opacity: this.overlayOpacity,
				onLoaded: () => {
					this.updateTransform ();
					if (onLoaded)
						onLoaded ();
				},
				onError: onError
			});
			this.updateTransform ();
		} else {
			this.glInstance.removeElement ("overlayimage");
			this.RenderScene (true);
		}
	}

	// Picture laid over the platform, for example the camera image of the layer: a PNG drawn as it is (no color map),
	// stretched over the rectangle of sizeX x sizeY mm whose lower left corner is (originX, originY) in toolpath
	// coordinates, the 3mf coordinates without the rotation and the translation of the toolpath. The platform origin
	// places it on the build plate like the toolpath. It lies between the plate (z 35) and the scalar overlay (z 36),
	// is interpolated between its pixels when magnified, and keeps the opacity of setPictureOverlayOpacity. A null url
	// removes it. onLoaded and onError are optional.
	SetPictureOverlayImage (url, sizeX, sizeY, originX, originY, onLoaded, onError) {
		if (!this.glInstance)
			return;

		if (url) {
			this.glInstance.addImageElement ("pictureoverlay", url, sizeX, sizeY, originX + this.origin.x, originY + this.origin.y, 35.5, {
				smoothing: true,
				opacity: this.pictureOverlayOpacity,
				onLoaded: () => {
					this.updateTransform ();
					this.RenderScene (true);
					if (onLoaded)
						onLoaded ();
				},
				onError: onError
			});
			this.updateTransform ();
		} else {
			this.glInstance.removeElement ("pictureoverlay");
			this.RenderScene (true);
		}
	}

	// Opacity of the picture overlay from 0 (not seen) to 1 (drawn as it is, the default). Only the picture changes:
	// the plate shows through it; the scalar overlay, the toolpath and the points drawn above it stay as they are. Kept
	// for the pictures of the following layers.
	setPictureOverlayOpacity (opacity)
	{
		const value = Number (opacity);
		this.pictureOverlayOpacity = Number.isFinite (value) ? Math.min (Math.max (value, 0.0), 1.0) : 1.0;
		const element = this.glInstance ? this.glInstance.findElement ("pictureoverlay") : null;
		if (element && (typeof element.setOpacity === "function")) {
			element.setOpacity (this.pictureOverlayOpacity);
			this.RenderScene (true);
		}
	}

	setOverlayColorMap (name, inverted)
	{
		this.overlayColorMapName = name;
		this.overlayColorMapInverted = inverted === true;
		const element = this.glInstance ? this.glInstance.findElement ("overlayimage") : null;
		if (element && (typeof element.setLookupTable === "function")) {
			element.setLookupTable (colorMapLookupTable (this.overlayColorMapName, this.overlayColorMapInverted));
			this.RenderScene (true);
		}
	}

	// Interpolates between the pixels of the magnified overlay instead of drawing every pixel as a square, see
	// WebGLScalarImageElement.setSmoothing. Kept for the overlays of the following layers.
	setOverlaySmoothing (enabled)
	{
		this.overlaySmoothing = (enabled === true);
		const element = this.glInstance ? this.glInstance.findElement ("overlayimage") : null;
		if (element && (typeof element.setSmoothing === "function")) {
			element.setSmoothing (this.overlaySmoothing);
			this.RenderScene (true);
		}
	}

	// Opacity of the overlay from 0 (not seen) to 1 (drawn as it is, the default), see
	// WebGLScalarImageElement.setOpacity. Only the overlay changes: the plate shows through it, the toolpath and the
	// points drawn above it stay as they are. Kept for the overlays of the following layers.
	setOverlayOpacity (opacity)
	{
		const value = Number (opacity);
		this.overlayOpacity = Number.isFinite (value) ? Math.min (Math.max (value, 0.0), 1.0) : 1.0;
		const element = this.glInstance ? this.glInstance.findElement ("overlayimage") : null;
		if (element && (typeof element.setOpacity === "function")) {
			element.setOpacity (this.overlayOpacity);
			this.RenderScene (true);
		}
	}

	// False if the browser cannot filter the overlay texture; setOverlaySmoothing then changes nothing.
	supportsOverlaySmoothing ()
	{
		return !!this.glInstance && (typeof this.glInstance.supportsScalarImageSmoothing === "function") && this.glInstance.supportsScalarImageSmoothing ();
	}

	// Value range mapped onto the color map of the overlay; values outside are clamped to its ends.
	setOverlayRange (minValue, maxValue)
	{
		this.overlayRange = { min: minValue, max: maxValue };
		const element = this.glInstance ? this.glInstance.findElement ("overlayimage") : null;
		if (element && (typeof element.setValueRange === "function")) {
			element.setValueRange (minValue, maxValue);
			this.RenderScene (true);
		}
	}


	SetBuildPlateSVG (url) {
		if (this.glInstance) {
			if (url) {
				this.svgImage = this.glInstance.addSVGImage("buildplate", url, 35, true, true);
				this.updateTransform ();
			} else {
				this.glInstance.removeElement ("buildplate");
			}
		}
	} 
		
	setOrigin (x, y)
	{
		if (isNaN (x) || isNaN (y))
			return;
		
		this.origin.x = x;
		this.origin.y = y;
	}

	// Converts a viewport pixel coordinate (relative to the canvas, in CSS pixels)
	// into machine/build-plate coordinates in millimeters. The build plate places
	// machine (0,0) at (transform.x, transform.y) with the Y axis inverted, so this
	// is the exact inverse of that mapping. Returns null if no valid scaling exists.
	/**
	 * @param {number} screenX
	 * @param {number} screenY
	 */
	screenToMachine (screenX, screenY)
	{
		if (!this.transform)
			return null;

		const scaling = this.transform.scaling;
		if (!(scaling > 0) || isNaN (screenX) || isNaN (screenY))
			return null;

		return {
			x: (screenX - this.transform.x) / scaling,
			y: (this.transform.y - screenY) / scaling
		};
	}

	// Maps a raw toolpath point (as stored in linesCoordinates, i.e. before the
	// placement/rotation/origin transform) into machine/build-plate coordinates
	// in millimeters. This is the exact forward of screenToMachine so that a
	// cursor position and a segment endpoint can be compared in the same frame.
	/**
	 * @param {number} toolpathX
	 * @param {number} toolpathY
	 */
	toolpathPointToMachine (toolpathX, toolpathY)
	{
		const angleInRadians = this.transformAngleDegrees * Math.PI / 180.0;
		const cosine = Math.cos (angleInRadians);
		const sine = Math.sin (angleInRadians);
		const placement = this.transformToolpathPoint (0, 0);

		return {
			x: this.origin.x + placement.x + (toolpathX * cosine + toolpathY * sine),
			y: this.origin.y + placement.y + (-toolpathX * sine + toolpathY * cosine)
		};
	}

	// Inverse of screenToMachine: machine coordinates (mm) to viewport pixels.
	/**
	 * @param {number} machineX
	 * @param {number} machineY
	 */
	machineToScreen (machineX, machineY)
	{
		if (!this.transform)
			return null;

		return {
			x: this.transform.x + machineX * this.transform.scaling,
			y: this.transform.y - machineY * this.transform.scaling
		};
	}

	// Returns one axis-aligned bounding box per part of the loaded layer, in
	// machine coordinates (mm). Parts are identified by their build item UUID
	// (lower case), which is stable across layers, unlike the layer-local partid.
	// Segments without a UUID (older servers) are grouped by partid instead;
	// those boxes have an empty uuid.
	getPartBoundingBoxes ()
	{
		if (!this.layerSegmentsArray)
			return [];

		const cacheKey = [this.transformAngleDegrees, this.rotationCenter.x, this.rotationCenter.y,
			this.translation.x, this.translation.y, this.origin.x, this.origin.y].join ("|");
		if (this.partBoundsCache && (this.partBoundsCacheKey === cacheKey))
			return this.partBoundsCache;

		const angleInRadians = this.transformAngleDegrees * Math.PI / 180.0;
		const cosine = Math.cos (angleInRadians);
		const sine = Math.sin (angleInRadians);
		const placement = this.transformToolpathPoint (0, 0);
		const offsetX = this.origin.x + placement.x;
		const offsetY = this.origin.y + placement.y;

		const boxesByKey = new Map ();
		for (const segment of this.layerSegmentsArray) {
			if (!segment || !Array.isArray (segment.points))
				continue;

			let partUUID = (typeof segment.partuuid === "string") ? segment.partuuid.toLowerCase () : "";
			if (partUUID === "00000000-0000-0000-0000-000000000000")
				partUUID = "";

			let key;
			let name;
			if (partUUID !== "") {
				key = partUUID;
				name = this.layerPartNames.get (partUUID) || "";
			} else if (Number.isInteger (segment.partid)) {
				key = "partid:" + segment.partid;
				name = "Part " + segment.partid;
			} else {
				continue;
			}

			let box = boxesByKey.get (key);
			if (!box) {
				box = {
					key: key,
					uuid: partUUID,
					name: name,
					disabled: (partUUID !== "") && this.layerDisabledParts.has (partUUID),
					minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity
				};
				boxesByKey.set (key, box);
			}

			for (const point of segment.points) {
				const machineX = offsetX + (point.x * cosine + point.y * sine);
				const machineY = offsetY + (-point.x * sine + point.y * cosine);
				if (machineX < box.minx) box.minx = machineX;
				if (machineX > box.maxx) box.maxx = machineX;
				if (machineY < box.miny) box.miny = machineY;
				if (machineY > box.maxy) box.maxy = machineY;
			}
		}

		this.partBoundsCache = Array.from (boxesByKey.values ()).filter ((box) => (box.minx <= box.maxx) && (box.miny <= box.maxy));
		this.partBoundsCacheKey = cacheKey;
		return this.partBoundsCache;
	}

	// Squared distance from point (px,py) to the line segment (ax,ay)-(bx,by).
	static pointSegmentDistanceSq (px, py, ax, ay, bx, by)
	{
		const dx = bx - ax;
		const dy = by - ay;
		const lengthSq = dx * dx + dy * dy;

		let t = 0.0;
		if (lengthSq > 0.0) {
			t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
			if (t < 0.0) t = 0.0;
			if (t > 1.0) t = 1.0;
		}

		const cx = ax + t * dx;
		const cy = ay + t * dy;
		const ex = px - cx;
		const ey = py - cy;
		return ex * ex + ey * ey;
	}

	// Finds the toolpath line segment closest to the given machine coordinate
	// (mm). Returns the associated segment properties (laser power/speed, profile
	// name, part/laser index, type) when within toleranceMM, otherwise null.
	/**
	 * @param {number} machineX
	 * @param {number} machineY
	 * @param {number} toleranceMM
	 */
	pickSegmentAtMachinePoint (machineX, machineY, toleranceMM)
	{
		if (!this.toolpathVisible || !this.linesCoordinates || !this.segmentProperties)
			return null;

		const coords = this.linesCoordinates;
		const lineCount = Math.min (Math.floor (coords.length / 4), this.visibleLineCount);
		if (lineCount <= 0)
			return null;

		const angleInRadians = this.transformAngleDegrees * Math.PI / 180.0;
		const cosine = Math.cos (angleInRadians);
		const sine = Math.sin (angleInRadians);
		const placement = this.transformToolpathPoint (0, 0);
		const baseX = this.origin.x + placement.x;
		const baseY = this.origin.y + placement.y;

		let bestDistanceSq = toleranceMM * toleranceMM;
		let bestIndex = -1;

		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			const arrayIndex = lineIndex * 4;
			const px1 = coords[arrayIndex];
			const py1 = coords[arrayIndex + 1];
			const px2 = coords[arrayIndex + 2];
			const py2 = coords[arrayIndex + 3];

			const ax = baseX + (px1 * cosine + py1 * sine);
			const ay = baseY + (-px1 * sine + py1 * cosine);
			const bx = baseX + (px2 * cosine + py2 * sine);
			const by = baseY + (-px2 * sine + py2 * cosine);

			const distanceSq = LayerViewImpl.pointSegmentDistanceSq (machineX, machineY, ax, ay, bx, by);
			if (distanceSq < bestDistanceSq) {
				bestDistanceSq = distanceSq;
				bestIndex = lineIndex;
			}
		}

		if (bestIndex >= 0 && bestIndex < this.segmentProperties.length) {
			const power1 = this.linePowers[bestIndex * 2];
			const power2 = this.linePowers[bestIndex * 2 + 1];
			const supportPoints = this.lineSupportPoints.get (bestIndex);
			return {
				...this.segmentProperties[bestIndex],
				lineIndex: bestIndex,
				power1: Number.isFinite (power1) ? power1 : null,
				power2: Number.isFinite (power2) ? power2 : null,
				supportpoints: supportPoints ? supportPoints.map ((point) => ({ ...point })) : null
			};
		}

		return null;
	}

	// Draws (or removes, when lineIndex < 0) a highlight overlay on top of a
	// single toolpath line so the segment currently under the cursor stands out.
	// The overlay shares the toolpath transform applied in updateTransform().
	/**
	 * @param {number} lineIndex
	 */
	setHighlightLine (lineIndex)
	{
		if (!this.glInstance)
			return;

		if (lineIndex === undefined || lineIndex === null || lineIndex < 0 || !this.linesCoordinates || !this.toolpathVisible ||
			((lineIndex * 4 + 3) >= this.linesCoordinates.length))
			lineIndex = -1;

		// Hovering moves along the same line most of the time; keep the overlay then.
		if ((lineIndex === this.highlightLineIndex) && ((lineIndex < 0) || (this.highlightScaling === this.transform.scaling)))
			return;

		this.highlightLineIndex = lineIndex;
		this.buildHighlightGeometry ();
		this.positionHighlightGeometry ();
		this.RenderScene (true);
	}

	removeHighlightGeometry ()
	{
		this.glInstance.removeElement ("layerdata_highlight");
		this.glInstance.removeElement ("layerdata_highlightarrow");
		this.glInstance.removeElement ("layerdata_highlightpoints");
		this.highlightSupportPoints = null;
	}

	// Creates the overlay of highlightLineIndex: the line with an arrow head at its end point
	// (the marking direction) and, for nonlinear power ramps, its support points including
	// both end points. Uses the toolpath coordinates of linesCoordinates.
	buildHighlightGeometry ()
	{
		this.removeHighlightGeometry ();
		this.highlightScaling = this.transform.scaling;

		const lineIndex = this.highlightLineIndex;
		const arrayIndex = lineIndex * 4;
		if ((lineIndex < 0) || (arrayIndex + 3 >= this.linesCoordinates.length))
			return;

		const x1 = this.linesCoordinates[arrayIndex];
		const y1 = this.linesCoordinates[arrayIndex + 1];
		const x2 = this.linesCoordinates[arrayIndex + 2];
		const y2 = this.linesCoordinates[arrayIndex + 3];
		// Noticeably thicker than the regular preview lines (lineScaleLevel * 0.3)
		// and drawn at a higher z so it sits above lines (60) and points (61).
		const highlightThickness = this.lineScaleLevel * 1.1;
		this.glInstance.add2DLineGeometry ("layerdata_highlight", [x1, y1, x2, y2], 63, highlightThickness, LAYERVIEW_HIGHLIGHTCOLOR, [LAYERVIEW_HIGHLIGHTCOLOR]);

		const length = Math.hypot (x2 - x1, y2 - y1);
		const scaling = (this.transform.scaling > 0) ? this.transform.scaling : 1.0;
		const arrowLength = Math.min (Math.max (LAYERVIEW_HIGHLIGHTARROWPIXELS / scaling, highlightThickness * LAYERVIEW_HIGHLIGHTARROWTHICKNESSFACTOR), length * 0.5);
		if (arrowLength > 0) {
			const backX = (x1 - x2) / length;
			const backY = (y1 - y2) / length;
			const cosine = Math.cos (LAYERVIEW_HIGHLIGHTARROWANGLE);
			const sine = Math.sin (LAYERVIEW_HIGHLIGHTARROWANGLE);
			const arrowCoordinates = [
				x2, y2, x2 + arrowLength * (backX * cosine - backY * sine), y2 + arrowLength * (backX * sine + backY * cosine),
				x2, y2, x2 + arrowLength * (backX * cosine + backY * sine), y2 + arrowLength * (-backX * sine + backY * cosine)
			];
			this.glInstance.add2DLineGeometry ("layerdata_highlightarrow", arrowCoordinates, 63, highlightThickness * LAYERVIEW_HIGHLIGHTARROWWINGFACTOR,
				LAYERVIEW_HIGHLIGHTCOLOR, [LAYERVIEW_HIGHLIGHTCOLOR, LAYERVIEW_HIGHLIGHTCOLOR]);
		}

		const supportPoints = this.lineSupportPoints.get (lineIndex);
		if (!supportPoints)
			return;

		const knots = [{ t: 0.0, power: this.linePowers[lineIndex * 2] }, ...supportPoints, { t: 1.0, power: this.linePowers[lineIndex * 2 + 1] }];
		const knotCoordinates = new Float32Array (knots.length * 2);
		const knotColors = [];
		knots.forEach ((knot, knotIndex) => {
			knotCoordinates[knotIndex * 2] = x1 + knot.t * (x2 - x1);
			knotCoordinates[knotIndex * 2 + 1] = y1 + knot.t * (y2 - y1);
			knotColors.push (((knotIndex === 0) || (knotIndex === knots.length - 1)) ? LAYERVIEW_SUPPORTENDPOINTCOLOR : LAYERVIEW_SUPPORTPOINTCOLOR);
		});

		this.glInstance.add2DScreenPointsGeometry ("layerdata_highlightpoints", knotCoordinates, 64,
			LAYERVIEW_SUPPORTPOINTPIXELS * this.glInstance.getPixelRatio (), LAYERVIEW_SUPPORTPOINTCOLOR, knotColors);
		this.highlightSupportPoints = { knots, x1, y1, x2, y2, length };
	}

	positionHighlightGeometry ()
	{
		const placementOffset = this.transformToolpathPoint (0, 0);
		const positionX = this.transform.x + (this.origin.x + placementOffset.x) * this.transform.scaling;
		const positionY = this.transform.y - (this.origin.y + placementOffset.y) * this.transform.scaling;

		for (const identifier of ["layerdata_highlight", "layerdata_highlightarrow", "layerdata_highlightpoints"]) {
			const element = this.glInstance.findElement (identifier);
			if (element) {
				element.setPositionXY (positionX, positionY);
				element.setScaleXY (this.transform.scaling, - this.transform.scaling);
				element.setRotationZ (-this.transformAngleDegrees * Math.PI / 180.0);
			}
		}
	}

	// Support point of the highlighted nonlinear ramp under the viewport position, with its
	// neighbours, so the piece of the ramp on either side can be shown; null if none.
	/**
	 * @param {number} screenX
	 * @param {number} screenY
	 * @param {number} [pixelTolerance]
	 */
	pickHighlightSupportPoint (screenX, screenY, pixelTolerance = 3)
	{
		if (!this.glInstance || !this.highlightSupportPoints)
			return null;

		const pointsElement = this.glInstance.findElement ("layerdata_highlightpoints");
		if (!pointsElement || (typeof pointsElement.findNearestPoint !== "function"))
			return null;

		const knotIndex = pointsElement.findNearestPoint (screenX, screenY, pixelTolerance);
		const { knots, x1, y1, x2, y2, length } = this.highlightSupportPoints;
		if ((knotIndex < 0) || (knotIndex >= knots.length))
			return null;

		const describe = (index) => {
			if ((index < 0) || (index >= knots.length))
				return null;
			const knot = knots[index];
			return {
				t: knot.t,
				power: Number.isFinite (knot.power) ? knot.power : null,
				distance: knot.t * length
			};
		};

		const knot = knots[knotIndex];
		return {
			lineIndex: this.highlightLineIndex,
			index: knotIndex,
			count: knots.length,
			x: x1 + knot.t * (x2 - x1),
			y: y1 + knot.t * (y2 - y1),
			length,
			...describe (knotIndex),
			previous: describe (knotIndex - 1),
			next: describe (knotIndex + 1)
		};
	}

	clearHighlight ()
	{
		this.setHighlightLine (-1);
	}

	// Convenience picker that works directly in viewport pixel space. The pixel
	// tolerance is converted to millimeters using the current zoom so the hover
	// hit area stays constant on screen regardless of zoom level.
	/**
	 * @param {number} screenX
	 * @param {number} screenY
	 * @param {number} [pixelTolerance]
	 */
	pickSegmentAtScreenPoint (screenX, screenY, pixelTolerance = 6)
	{
		const machine = this.screenToMachine (screenX, screenY);
		if (!machine)
			return null;

		const scaling = this.transform.scaling;
		if (!(scaling > 0))
			return null;

		return this.pickSegmentAtMachinePoint (machine.x, machine.y, pixelTolerance / scaling);
	}

	setTransformAngle (angleInDegrees)
	{
		this.setCoordinateTransform(angleInDegrees, this.rotationCenter.x, this.rotationCenter.y, this.translation.x, this.translation.y);
	}

	setCoordinateTransform (angleInDegrees, rotationCenterX, rotationCenterY, translationX, translationY)
	{
		if (isNaN(angleInDegrees) || isNaN(rotationCenterX) || isNaN(rotationCenterY) || isNaN(translationX) || isNaN(translationY))
			return;

		this.transformAngleDegrees = Number(angleInDegrees);
		this.rotationCenter.x = Number(rotationCenterX);
		this.rotationCenter.y = Number(rotationCenterY);
		this.translation.x = Number(translationX);
		this.translation.y = Number(translationY);
		this.updateTransform();
	}
}



export default LayerViewImpl;
