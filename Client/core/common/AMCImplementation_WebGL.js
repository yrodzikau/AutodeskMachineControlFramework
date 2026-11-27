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

import * as THREE from 'three';
import * as Assert from "./AMCAsserts.js";

import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

//const RAYCAST_LINE_THRESHOLD = 3;

const DEFAULT_SCENE_BACKGROUND = 0xffffff;
const DEFAULT_GRID_COLOR_FINE = 0xe0e0e0;
const DEFAULT_GRID_COLOR_MEDIUM = 0xc8c8c8;
const DEFAULT_GRID_COLOR_COARSE = 0xc0c0c0;
const GRID_DARK_LUMINANCE_THRESHOLD = 0.3;
const GRID_DARK_SCALE_MEDIUM = 1.4;
const GRID_DARK_SCALE_COARSE = 1.8;
const GRID_LIGHT_SCALE_MEDIUM = 0.88;
const GRID_LIGHT_SCALE_COARSE = 0.78;

class WebGLElement {

    constructor() {
        this.glelement = null;
        this.position = {
            x: 0.0,
            y: 0.0,
            z: 0.0
        }
        this.scale = {
            x: 1.0,
            y: 1.0,
            z: 1.0
        }
        this.rotationZ = 0.0;
    }

    setPosition(x, y, z) {

        this.position.x = x;
        this.position.y = y;
        this.position.z = z;

        if (this.glelement) {
            this.glelement.position.x = x;
            this.glelement.position.y = y;
            this.glelement.position.z = z;
        }
    }

    setScale(x, y, z) {
        this.scale.x = x;
        this.scale.y = y;
        this.scale.z = z;

        if (this.glelement) {
            this.glelement.scale.x = x;
            this.glelement.scale.y = y;
            this.glelement.scale.z = z;
        }
    }

    setPositionXY(x, y) {

        this.position.x = x;
        this.position.y = y;

        if (this.glelement) {
            this.glelement.position.x = x;
            this.glelement.position.y = y;
        }
    }

    setScaleXY(x, y) {
        this.scale.x = x;
        this.scale.y = y;

        if (this.glelement) {
            this.glelement.scale.x = x;
            this.glelement.scale.y = y;
        }
    }

    setRotationZ(angleInRadians) {
        this.rotationZ = angleInRadians;

        if (this.glelement) {
            this.glelement.rotation.z = angleInRadians;
        }
    }
	
	updateGLPosition () 
	{
        if (this.glelement) {
            this.glelement.position.x = this.position.x;
            this.glelement.position.y = this.position.y;
            this.glelement.position.z = this.position.z;
            this.glelement.scale.x = this.scale.x;
            this.glelement.scale.y = this.scale.y;
            this.glelement.scale.z = this.scale.z;
            this.glelement.rotation.z = this.rotationZ;
        }
	}
		
}

class WebGLLinesElement extends WebGLElement {

	// lineGradients (optional, requires vertexcolors): per line either null or a flat array
	// [t0, color0, t1, color1, ...] with t increasing from 0 to 1 along the line. Colors are
	// interpolated linearly between the stops; the line color in vertexcolors is ignored then.
    constructor(lineData, zValue, lineThickness, lineColor, vertexcolors, lineGradients) {
        super();

        let geometry = new THREE.BufferGeometry();
        let material;

		if (vertexcolors) {
			material = new THREE.MeshBasicMaterial({
				vertexColors: true
			});
		} else {
			material = new THREE.MeshBasicMaterial({
				vertexColors: false,
				color: lineColor
			});
		}

        const positions = [];
		const colors = [];

        const lineCount = lineData.length / 4;
		// Vertex count after each input line; degenerate lines add no vertices.
		this.vertexEndOfLine = new Uint32Array (lineCount);

        for (let i = 0; i < lineCount; i++) {

            const x1 = lineData[i * 4];
            const y1 = lineData[i * 4 + 1];
            const x2 = lineData[i * 4 + 2];
            const y2 = lineData[i * 4 + 3];

            const dx = x2 - x1;
            const dy = y2 - y1;
            const dlen = Math.sqrt(dx * dx + dy * dy);

			const gradient = (vertexcolors && lineGradients) ? lineGradients[i] : null;

            if ((dlen > 0) && gradient && (gradient.length >= 4)) {
                const ux =  - dy / dlen * lineThickness * 0.5;
                const uy = dx / dlen * lineThickness * 0.5;

				let startColor = new THREE.Color(gradient[1]);
				for (let s = 2; s + 1 < gradient.length; s += 2) {
					const ta = gradient[s - 2];
					const tb = gradient[s];
					const endColor = new THREE.Color(gradient[s + 1]);
					if (tb > ta) {
						const xa = x1 + dx * ta;
						const ya = y1 + dy * ta;
						const xb = x1 + dx * tb;
						const yb = y1 + dy * tb;
						positions.push(xa + ux, ya + uy, zValue);
						positions.push(xb + ux, yb + uy, zValue);
						positions.push(xb - ux, yb - uy, zValue);
						positions.push(xb - ux, yb - uy, zValue);
						positions.push(xa - ux, ya - uy, zValue);
						positions.push(xa + ux, ya + uy, zValue);

						colors.push(startColor.r, startColor.g, startColor.b);
						colors.push(endColor.r, endColor.g, endColor.b);
						colors.push(endColor.r, endColor.g, endColor.b);
						colors.push(endColor.r, endColor.g, endColor.b);
						colors.push(startColor.r, startColor.g, startColor.b);
						colors.push(startColor.r, startColor.g, startColor.b);
					}
					startColor = endColor;
				}
            } else if (dlen > 0) {
                const ux =  - dy / dlen * lineThickness * 0.5;
                const uy = dx / dlen * lineThickness * 0.5;

                positions.push(x1 + ux, y1 + uy, zValue);
                positions.push(x2 + ux, y2 + uy, zValue);
                positions.push(x2 - ux, y2 - uy, zValue);
                positions.push(x2 - ux, y2 - uy, zValue);
                positions.push(x1 - ux, y1 - uy, zValue);
                positions.push(x1 + ux, y1 + uy, zValue);
				
				if (vertexcolors) {
					
					// Add colors for each vertex
					const color = new THREE.Color(vertexcolors[i]); 
					for (let j = 0; j < 6; j++) { 
						colors.push(color.r, color.g, color.b);
					}
				}
            }

			this.vertexEndOfLine[i] = positions.length / 3;
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		if (vertexcolors) {
			geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); 
		}
        geometry.computeBoundingSphere();

        this.glelement = new THREE.Mesh(geometry, material);
    }

	// Only the first lineCount input lines are rendered.
	setVisibleLineCount (lineCount) {
		if (!this.glelement)
			return;
		const count = Math.min (Math.max (Math.floor (lineCount), 0), this.vertexEndOfLine.length);
		const vertexCount = (count > 0) ? this.vertexEndOfLine[count - 1] : 0;
		this.glelement.geometry.setDrawRange (0, vertexCount);
	}
	
	intersectRay (mouseX, mouseY, raycaster) {
		if (!raycaster)
			return -1;
		if (!this.glelement)
			return -1;
		
		const rayOrigin = new THREE.Vector3(mouseX, mouseY, -100);
		const rayDirection = new THREE.Vector3(0, 0, 1);

		raycaster.ray.origin.copy(rayOrigin);
		raycaster.ray.direction.copy(rayDirection);                
		
		const collisionsPoints = raycaster.intersectObject(this.glelement);
		
		if (collisionsPoints.length > 0) {
			let faceIndex = collisionsPoints[0].faceIndex;
			if (faceIndex % 2 !== 0) {
				return (faceIndex - 1) / 2;
			} else {
				return faceIndex / 2;
			}
			
		} else {
			return -1;
		}		

	}
}

class WebGLPointsElement extends WebGLElement {

    constructor(pointsData, zValue, pointsRadius, pointsColor, vertexcolors) {
        super();

        let geometry = new THREE.BufferGeometry();
        let material;

		if (vertexcolors) {
			material = new THREE.MeshBasicMaterial({
				vertexColors: true
			});
		} else {
			material = new THREE.MeshBasicMaterial({
				vertexColors: false,
				color: pointsColor
			});
		}

        let numberOfPoints = pointsData.length / 2;

        const vertices = [];
		const colors = [];

        for (let i = 0; i < numberOfPoints; i++) {
            vertices.push(
                pointsData[i * 2] - pointsRadius / 2, pointsData[i * 2 + 1] - pointsRadius / 2, zValue,
                pointsData[i * 2] - pointsRadius / 2, pointsData[i * 2 + 1] + pointsRadius / 2, zValue,
                pointsData[i * 2] + pointsRadius / 2, pointsData[i * 2 + 1] + pointsRadius / 2, zValue,
                pointsData[i * 2] - pointsRadius / 2, pointsData[i * 2 + 1] - pointsRadius / 2, zValue,
                pointsData[i * 2] + pointsRadius / 2, pointsData[i * 2 + 1] + pointsRadius / 2, zValue,
                pointsData[i * 2] + pointsRadius / 2, pointsData[i * 2 + 1] - pointsRadius / 2, zValue,
            );
			
			if (vertexcolors) {
					
					// Add colors for each vertex
					const color = new THREE.Color(vertexcolors[i]); 
					for (let j = 0; j < 6; j++) { 
						colors.push(color.r, color.g, color.b);
					}
				}
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
		if (vertexcolors) {
			geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); 
		}
        geometry.computeBoundingSphere();

        this.glelement = new THREE.Mesh(geometry, material);
    }
}


class WebGLLocalizedPointsElement extends WebGLElement {

    constructor(pointsData, zValue, pointsRadius, pointsColor, vertexcolors, originx, originy, quadsizex, quadsizey, quadcountx, quadcounty) {
        super();
		
		this.quadgeometries = [];
		this.quadmaterials = [];
		this.glelements = [];
		this.xcoordinates = [];
		this.ycoordinates = [];
		this.pointids = [];
		
		this.originx = originx;
		this.originy = originy;
		this.quadsizex = quadsizex;
		this.quadsizey = quadsizey;
		this.quadcountx = quadcountx;
		this.quadcounty = quadcounty;
		this.quadcount = quadcountx * quadcounty;
		
		let group = new THREE.Group();
		
		for (let quadindex = 0; quadindex < this.quadcount; quadindex++) {
			this.xcoordinates[quadindex] = [];
			this.ycoordinates[quadindex] = [];
			this.pointids[quadindex] = [];
			this.quadgeometries[quadindex] = null;
			this.quadmaterials[quadindex] = null;
			this.glelements[quadindex] = null;			
		}
			


        let numberOfPoints = pointsData.length / 2;

        for (let i = 0; i < numberOfPoints; i++) {
			let x = pointsData[i * 2];
			let y = pointsData[i * 2 + 1];
			
			let quadx = Math.floor ( (x - originx) / quadsizex);
			let quady = Math.floor ( (y - originy) / quadsizey);
			
			if (quadx < 0) quadx = 0;
			if (quady < 0) quady = 0;
			if (quadx >= quadcountx) quadx = quadcountx - 1;
			if (quady >= quadcounty) quady = quadcounty - 1;
			
			let quadindex = quadx + quady * quadcountx;
			this.xcoordinates[quadindex].push (x);
			this.ycoordinates[quadindex].push (y);
			this.pointids[quadindex].push (i);
		}
		
		
		for (let quadindex = 0; quadindex < this.quadcount; quadindex++) {
			
			let xcoordinates = this.xcoordinates[quadindex];
			let ycoordinates = this.ycoordinates[quadindex];
			if ((xcoordinates.length > 0) && (xcoordinates.length === ycoordinates.length)) {
				
				let pointcount = xcoordinates.length;
				
				this.quadgeometries[quadindex] = new THREE.BufferGeometry();
				if (vertexcolors) {
					this.quadmaterials [quadindex] = new THREE.MeshBasicMaterial({
						vertexColors: true
					});
				} else {
					this.quadmaterials [quadindex] = new THREE.MeshBasicMaterial({
						vertexColors: false,
						color: pointsColor
					});
				}
				
				let vertices = [];
				let colors = [];
				for (let i = 0; i < pointcount; i++) {
					let x = xcoordinates[i];
					let y = ycoordinates[i];
					vertices.push(
						x - pointsRadius / 2, y - pointsRadius / 2, zValue,
						x - pointsRadius / 2, y + pointsRadius / 2, zValue,
						x + pointsRadius / 2, y + pointsRadius / 2, zValue,
						x - pointsRadius / 2, y - pointsRadius / 2, zValue,
						x + pointsRadius / 2, y + pointsRadius / 2, zValue,
						x + pointsRadius / 2, y - pointsRadius / 2, zValue,
					);
					
					if (vertexcolors) {
						let pointid = this.pointids[quadindex][i];
						const color = new THREE.Color(vertexcolors[pointid]); 
						for (let j = 0; j < 6; j++) { 
							colors.push(color.r, color.g, color.b);
						}
					}

				}
				
				
				this.quadgeometries[quadindex].setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
				if (vertexcolors) {
					this.quadgeometries[quadindex].setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); 
				}
				this.quadgeometries[quadindex].computeBoundingSphere();

				this.glelements[quadindex] = new THREE.Mesh(this.quadgeometries[quadindex], this.quadmaterials [quadindex]);
			
				group.add(this.glelements[quadindex]);
				
			}
								

			this.glelement = group;
	
			
			

            /*
			
			if (vertexcolors) {
					
					// Add colors for each vertex
					const color = new THREE.Color(vertexcolors[i]); 
					for (let j = 0; j < 6; j++) { 
						colors.push(color.r, color.g, color.b);
					}
				} */
        }

        
    }
	
	
	intersectRay (mouseX, mouseY, raycaster) {
		if (!raycaster)
			return -1;
		if (!this.glelement)
			return -1;
		
		let localmouseX = (mouseX - this.position.x) / this.scale.x;
		let localmouseY = (mouseY - this.position.y) / this.scale.y;
		
		let quadx = Math.floor ( (localmouseX - this.originx) / this.quadsizex);
		let quady = Math.floor ( (localmouseY - this.originy) / this.quadsizey);
			
		if (quadx < 0) quadx = 0;
		if (quady < 0) quady = 0;
		if (quadx >= this.quadcountx) quadx = this.quadcountx - 1;
		if (quady >= this.quadcounty) quady = this.quadcounty - 1;
		
		let quadindex = quadx + quady * this.quadcountx;
		let quadglelement = this.glelements[quadindex];
		if (quadglelement) {
		
			const rayOrigin = new THREE.Vector3(mouseX, mouseY, -100);
			const rayDirection = new THREE.Vector3(0, 0, 1);

			raycaster.ray.origin.copy(rayOrigin);
			raycaster.ray.direction.copy(rayDirection);                
			
			const collisionsPoints = raycaster.intersectObject(quadglelement);
			
			if (collisionsPoints.length > 0) {
				let faceIndex = collisionsPoints[0].faceIndex;
				let localPointIndex;
				if (faceIndex % 2 !== 0) {
					localPointIndex = (faceIndex - 1) / 2;
				} else {
					localPointIndex = faceIndex / 2;
				}
				
				let pointID = this.pointids[quadindex][localPointIndex];
				
				return pointID;
				
			} else {
				return -1;
			}		
		}
		
		return -1;

	}

}


// The shaders of the screen points have variants, chosen by defines, so that an element only pays for what it draws
// and the points without any of them are drawn by the plain shader:
// - POINT_VALUES: the color of a point is that of its vertex attribute pointValue in the color map uColorTable, which
//   spans the values uValueMin to uValueMax;
// - POINT_STRIDE (needs gl_VertexID, so WebGL 2): with uStride greater than 1 only every uStride-th point is drawn, the
//   others are moved behind the far plane, and a drawn point is as opaque as uStride points on top of each other;
// - POINT_GLOW: spots of light, see SCREENPOINTS_FRAGMENTSHADER.
// Without POINT_VALUES, uColorSource 0 takes uFillColor for all points, 1 the vertex color pointColor, 2 one of two
// state colors by the vertex attribute pointState (0: uStateColor0, 1: uStateColor1).
const SCREENPOINTS_VERTEXSHADER = `
	uniform float uPointSize;
	uniform float uColorSource;
	uniform vec3 uFillColor;
	uniform vec3 uStateColor0;
	uniform vec3 uStateColor1;
	attribute vec3 pointColor;
	attribute float pointState;
	#ifdef POINT_VALUES
	uniform sampler2D uColorTable;
	uniform float uValueMin;
	uniform float uValueMax;
	attribute float pointValue;
	#endif
	#ifdef POINT_STRIDE
	uniform int uStride;
	#endif
	varying vec3 vColor;
	void main() {
	#ifdef POINT_VALUES
		float span = uValueMax - uValueMin;
		float t = (span != 0.0) ? clamp((pointValue - uValueMin) / span, 0.0, 1.0) : ((pointValue >= uValueMax) ? 1.0 : 0.0);
		vColor = texture2D(uColorTable, vec2(t, 0.5)).rgb;
	#else
		if (uColorSource > 1.5)
			vColor = (pointState > 0.5) ? uStateColor1 : uStateColor0;
		else if (uColorSource > 0.5)
			vColor = pointColor;
		else
			vColor = uFillColor;
	#endif
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		gl_PointSize = uPointSize;
	#ifdef POINT_STRIDE
		if ((uStride > 1) && ((gl_VertexID % uStride) != 0)) {
			gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
			gl_PointSize = 1.0;
		}
	#endif
	}
`;

// Round points with a one pixel wide smooth edge: filled discs, or circles (rings uRingWidth pixels wide) if
// uRingWidth is greater than 0. Densely recorded points lie many to a pixel, and their half transparent edges add up
// to an opaque trail; a point that stands for uStride points (POINT_STRIDE) therefore takes the opacity that these
// would have had together, 1 - (1 - alpha) ^ uStride, so that skipping points leaves the trail as it was.
// POINT_GLOW draws a spot of light instead: opaque in its centre and fading out towards
// its edge like a Gaussian. Spots of light lie deeper the farther a fragment is from their centre (by up to uGlowDepth
// at the edge), and a depth pass of the same points comes before their color pass: where many of them overlap, as
// along a densely recorded path, a pixel only takes the color of the spot nearest to it instead of piling all of them
// up into an opaque band, so the path glows. Writing the depth of a fragment costs time on every point (about half
// as much again per frame on the bench GPU), which is why only the spots of light have it in their shader.
const SCREENPOINTS_FRAGMENTSHADER = `
	uniform float uPointSize;
	uniform float uRingWidth;
	#ifdef POINT_GLOW
	uniform float uGlowDepth;
	#endif
	#ifdef POINT_STRIDE
	uniform int uStride;
	#endif
	varying vec3 vColor;
	void main() {
		float size = max(uPointSize, 1.0);
		float radius = 0.5 * size;
		float distance = length(gl_PointCoord - 0.5) * size;
		float alpha = 1.0 - smoothstep(radius - 1.0, radius, distance);
	#ifdef POINT_GLOW
		float relative = min(distance / radius, 1.0);
		alpha *= exp(-3.0 * relative * relative);
	#else
		if (uRingWidth > 0.0)
			alpha *= smoothstep(radius - uRingWidth - 1.0, radius - uRingWidth, distance);
	#ifdef POINT_STRIDE
		if (uStride > 1)
			alpha = 1.0 - pow(1.0 - alpha, float(uStride));
	#endif
	#endif
		if (alpha <= 0.0)
			discard;
		gl_FragColor = vec4(vColor, alpha);
	#ifdef POINT_GLOW
		gl_FragDepth = gl_FragCoord.z + relative * uGlowDepth;
	#endif
	}
`;

// Depth (0..1 of the depth range of the camera) a spot of light falls back towards its edge, see
// SCREENPOINTS_FRAGMENTSHADER. Small enough to keep it above the toolpath of the layer view, 0.006 below it.
const SCREENPOINTS_GLOWDEPTH = 0.002;

const SCREENPOINTS_GRIDRESOLUTION = 256;

// Some GPU drivers silently drop the points of a single draw call beyond a few million (seen with ANGLE on Direct3D 11
// at about 2.4 million), so the points are drawn in groups of at most this many, one draw call per group.
const SCREENPOINTS_DRAWGROUPSIZE = 524288;

function colorToVector3 (color) {
	return new THREE.Vector3 (((color >> 16) & 255) / 255.0, ((color >> 8) & 255) / 255.0, (color & 255) / 255.0);
}

// Lookup textures of the color maps of point values, by the key the caller gives with the table (for example the name
// of the color map and whether it is inverted). A color map has few variants, so the textures are kept for the page.
const SCREENPOINTS_COLORTABLES = new Map ();

function screenPointsColorTableTexture (key, table) {
	let texture = SCREENPOINTS_COLORTABLES.get (key);
	if (texture)
		return texture;
	texture = new THREE.DataTexture (table, table.length / 4, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearFilter;
	texture.wrapS = THREE.ClampToEdgeWrapping;
	texture.wrapT = THREE.ClampToEdgeWrapping;
	texture.generateMipmaps = false;
	texture.colorSpace = THREE.NoColorSpace;
	texture.needsUpdate = true;
	SCREENPOINTS_COLORTABLES.set (key, texture);
	return texture;
}

// Points with a constant on-screen size in pixels, independent of the element scale, drawn as filled discs.
// Colours are 0xRRGGBB values written to the framebuffer unchanged: the vertex colors if given, pointsColor otherwise.
// pointStates (optional, one value per point, 0 or 1) with spotStyle.stateColors colors every point by its state
// instead; pointValues (optional, one number per point) with spotStyle.colorTable colors every point by its value
// in a color map. spotStyle (optional, see setSpotStyle): { ringWidth: pixels, 0 draws filled discs and more draws
// circles of that line width; glow: true draws spots of light instead; stateColors: [color of state 0, color of
// state 1]; colorTable: RGBA bytes of the color map from its lowest to its highest value (see colorMapLookupTable)
// with colorTableKey naming it; valueMin and valueMax: the values the color map spans; pickRadius: pixels around a
// point centre that pick it, null for half its size }. strideSupported: the context is WebGL 2, so setStride works.
class WebGLScreenPointsElement extends WebGLElement {

	constructor(pointsData, zValue, pointPixelSize, pointsColor, vertexcolors, spotStyle, pointStates, pointValues, strideSupported) {
		super();

		this.pointsData = pointsData;
		this.pointCount = Math.floor (pointsData.length / 2);
		this.drawCount = this.pointCount;
		this.pointPixelSize = pointPixelSize;
		this.pickRadius = null;
		this.strideSupported = strideSupported === true;
		this.glow = false;

		const hasValues = !!pointValues && (pointValues.length >= this.pointCount);
		const hasStates = !hasValues && !!pointStates && (pointStates.length >= this.pointCount);
		const hasVertexColors = !hasValues && !hasStates && !!vertexcolors;
		const positions = new Float32Array (this.pointCount * 3);
		const colors = hasVertexColors ? new Uint8Array (this.pointCount * 3) : null;
		const states = hasStates ? new Uint8Array (this.pointCount) : null;
		const values = hasValues ? new Float32Array (this.pointCount) : null;
		for (let i = 0; i < this.pointCount; i++) {
			positions[i * 3] = pointsData[i * 2];
			positions[i * 3 + 1] = pointsData[i * 2 + 1];
			positions[i * 3 + 2] = zValue;

			if (colors) {
				const color = (vertexcolors[i] !== undefined) ? vertexcolors[i] : pointsColor;
				colors[i * 3] = (color >> 16) & 255;
				colors[i * 3 + 1] = (color >> 8) & 255;
				colors[i * 3 + 2] = color & 255;
			}
			if (states)
				states[i] = (pointStates[i] !== 0) ? 1 : 0;
			if (values)
				values[i] = pointValues[i];
		}

		this.geometry = new THREE.BufferGeometry();
		this.geometry.setAttribute ('position', new THREE.BufferAttribute (positions, 3));
		if (colors)
			this.geometry.setAttribute ('pointColor', new THREE.BufferAttribute (colors, 3, true));
		if (states)
			this.geometry.setAttribute ('pointState', new THREE.BufferAttribute (states, 1));
		if (values)
			this.geometry.setAttribute ('pointValue', new THREE.BufferAttribute (values, 1));
		this.geometry.computeBoundingSphere ();
		for (let start = 0; start < this.pointCount; start += SCREENPOINTS_DRAWGROUPSIZE)
			this.geometry.addGroup (start, Math.min (SCREENPOINTS_DRAWGROUPSIZE, this.pointCount - start), 0);

		// The variants of the shaders this element needs, see SCREENPOINTS_VERTEXSHADER.
		this.defines = {};
		if (hasValues)
			this.defines.POINT_VALUES = "";
		if (this.strideSupported)
			this.defines.POINT_STRIDE = "";

		// One set of uniforms for all passes of the element.
		this.uniforms = {
			uPointSize: { value: pointPixelSize },
			uColorSource: { value: hasStates ? 2.0 : (hasVertexColors ? 1.0 : 0.0) },
			uFillColor: { value: colorToVector3 (pointsColor) },
			uStateColor0: { value: colorToVector3 (pointsColor) },
			uStateColor1: { value: colorToVector3 (pointsColor) },
			uColorTable: { value: null },
			uValueMin: { value: 0.0 },
			uValueMax: { value: 1.0 },
			uRingWidth: { value: 0.0 },
			uGlowDepth: { value: SCREENPOINTS_GLOWDEPTH },
			uStride: { value: 1 }
		};
		this.material = new THREE.ShaderMaterial ({
			uniforms: this.uniforms,
			defines: this.defines,
			vertexShader: SCREENPOINTS_VERTEXSHADER,
			fragmentShader: SCREENPOINTS_FRAGMENTSHADER,
			transparent: true,
			depthWrite: false
		});

		// A material array makes three.js issue one draw call per geometry group.
		this.colorPoints = new THREE.Points (this.geometry, [this.material]);
		this.colorPoints.frustumCulled = false;
		this.glelement = new THREE.Group ();
		this.glelement.add (this.colorPoints);
		// Passes of the spots of light, see setGlow.
		this.depthPoints = null;
		this.glowPoints = null;

		if (spotStyle)
			this.setSpotStyle (spotStyle);

		this.buildSpatialGrid ();
	}

	setPointPixelSize (pointPixelSize) {
		this.pointPixelSize = pointPixelSize;
		this.uniforms.uPointSize.value = pointPixelSize;
	}

	// Draws only every stride-th point (1: all of them); needs WebGL 2 and draws all points without it. Picking
	// still finds all points.
	setStride (stride) {
		this.uniforms.uStride.value = this.strideSupported ? Math.max (Math.floor (Number (stride) || 1), 1) : 1;
	}

	getStride () {
		return this.uniforms.uStride.value;
	}

	// Spots of light (see SCREENPOINTS_FRAGMENTSHADER) have two passes of their own in the place of the color pass of
	// the other looks: one that writes only the depth, then one for the color, both with the uniforms of the element.
	// The depth pass is transparent like the color pass, so that three.js draws it among the transparent elements
	// in the place of these points and not before the elements below them; it comes first because three.js draws
	// objects of the same depth in the order they were created. Both are created when the element first draws spots
	// of light, so the other elements do not carry them.
	setGlow (glow) {
		const enabled = glow === true;
		if (enabled === this.glow)
			return;
		this.glow = enabled;

		if (enabled && !this.glowPoints) {
			const settings = {
				uniforms: this.uniforms,
				defines: Object.assign ({ POINT_GLOW: "" }, this.defines),
				vertexShader: SCREENPOINTS_VERTEXSHADER,
				fragmentShader: SCREENPOINTS_FRAGMENTSHADER,
				transparent: true
			};
			this.depthPoints = new THREE.Points (this.geometry, [new THREE.ShaderMaterial (Object.assign ({ colorWrite: false, depthWrite: true }, settings))]);
			this.glowPoints = new THREE.Points (this.geometry, [new THREE.ShaderMaterial (Object.assign ({ depthWrite: false }, settings))]);
			for (const points of [this.depthPoints, this.glowPoints]) {
				points.frustumCulled = false;
				this.glelement.add (points);
			}
		}

		this.colorPoints.visible = !enabled;
		if (this.glowPoints) {
			this.depthPoints.visible = enabled;
			this.glowPoints.visible = enabled;
		}
	}

	// Upper bound of the number of points inside a rectangle of the screen (world coordinates of the element), counted
	// by the cells of the spatial grid that the rectangle touches.
	countPointsInScreenRectangle (left, top, right, bottom) {
		if ((this.pointCount <= 0) || !(this.scale.x !== 0) || !(this.scale.y !== 0))
			return 0;
		const cosine = Math.cos (-this.rotationZ);
		const sine = Math.sin (-this.rotationZ);
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const [worldX, worldY] of [[left, top], [right, top], [left, bottom], [right, bottom]]) {
			const dx = worldX - this.position.x;
			const dy = worldY - this.position.y;
			const localX = (dx * cosine - dy * sine) / this.scale.x;
			const localY = (dx * sine + dy * cosine) / this.scale.y;
			minX = Math.min (minX, localX);
			maxX = Math.max (maxX, localX);
			minY = Math.min (minY, localY);
			maxY = Math.max (maxY, localY);
		}
		const cellX1 = Math.max (Math.floor ((minX - this.gridMinX) / this.gridCellSize), 0);
		const cellX2 = Math.min (Math.floor ((maxX - this.gridMinX) / this.gridCellSize), this.gridCountX - 1);
		const cellY1 = Math.max (Math.floor ((minY - this.gridMinY) / this.gridCellSize), 0);
		const cellY2 = Math.min (Math.floor ((maxY - this.gridMinY) / this.gridCellSize), this.gridCountY - 1);
		let count = 0;
		for (let cellY = cellY1; cellY <= cellY2; cellY++) {
			const rowStart = cellY * this.gridCountX;
			if (cellX2 >= cellX1)
				count += this.gridCellStart[rowStart + cellX2 + 1] - this.gridCellStart[rowStart + cellX1];
		}
		return count;
	}

	// Ring width in pixels (0: filled discs), glow, the two state colors, the color map and its value range, see the
	// constructor. Only changes uniforms and, for glow, the passes that are drawn.
	setSpotStyle (spotStyle) {
		if (!spotStyle)
			return;
		const uniforms = this.uniforms;
		if (spotStyle.ringWidth !== undefined)
			uniforms.uRingWidth.value = Math.max (Number (spotStyle.ringWidth) || 0.0, 0.0);
		if (spotStyle.glow !== undefined)
			this.setGlow (spotStyle.glow === true);
		if (Array.isArray (spotStyle.stateColors) && (spotStyle.stateColors.length === 2)) {
			uniforms.uStateColor0.value = colorToVector3 (spotStyle.stateColors[0]);
			uniforms.uStateColor1.value = colorToVector3 (spotStyle.stateColors[1]);
		}
		if (spotStyle.colorTable && (spotStyle.colorTable.length >= 4) && spotStyle.colorTableKey)
			uniforms.uColorTable.value = screenPointsColorTableTexture (String (spotStyle.colorTableKey), spotStyle.colorTable);
		const valueMin = Number (spotStyle.valueMin);
		const valueMax = Number (spotStyle.valueMax);
		if (Number.isFinite (valueMin) && Number.isFinite (valueMax)) {
			uniforms.uValueMin.value = valueMin;
			uniforms.uValueMax.value = valueMax;
		}
		if (spotStyle.pickRadius !== undefined) {
			const pickRadius = Number (spotStyle.pickRadius);
			this.pickRadius = ((spotStyle.pickRadius !== null) && Number.isFinite (pickRadius)) ? Math.max (pickRadius, 0.0) : null;
		}
	}

	// Only the first drawCount points are rendered and pickable.
	setDrawCount (drawCount) {
		this.drawCount = Math.min (Math.max (Math.floor (drawCount), 0), this.pointCount);
		this.geometry.setDrawRange (0, this.drawCount);
	}

	buildSpatialGrid () {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (let i = 0; i < this.pointCount; i++) {
			const x = this.pointsData[i * 2];
			const y = this.pointsData[i * 2 + 1];
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}

		this.gridMinX = minX;
		this.gridMinY = minY;
		this.gridCellSize = Math.max (maxX - minX, maxY - minY, 1e-6) / SCREENPOINTS_GRIDRESOLUTION;
		this.gridCountX = Math.max (1, Math.ceil ((maxX - minX) / this.gridCellSize) + 1);
		this.gridCountY = Math.max (1, Math.ceil ((maxY - minY) / this.gridCellSize) + 1);

		// Counting sort of the point indices by cell.
		const cellCount = this.gridCountX * this.gridCountY;
		this.gridCellStart = new Uint32Array (cellCount + 1);
		const cellOfPoint = new Uint32Array (this.pointCount);
		for (let i = 0; i < this.pointCount; i++) {
			const cell = this.cellIndexOf (this.pointsData[i * 2], this.pointsData[i * 2 + 1]);
			cellOfPoint[i] = cell;
			this.gridCellStart[cell + 1]++;
		}
		for (let cell = 0; cell < cellCount; cell++)
			this.gridCellStart[cell + 1] += this.gridCellStart[cell];

		const fill = this.gridCellStart.slice (0, cellCount);
		this.gridPointIndices = new Uint32Array (this.pointCount);
		for (let i = 0; i < this.pointCount; i++)
			this.gridPointIndices[fill[cellOfPoint[i]]++] = i;
	}

	cellIndexOf (x, y) {
		const cellX = Math.min (Math.max (Math.floor ((x - this.gridMinX) / this.gridCellSize), 0), this.gridCountX - 1);
		const cellY = Math.min (Math.max (Math.floor ((y - this.gridMinY) / this.gridCellSize), 0), this.gridCountY - 1);
		return cellX + cellY * this.gridCountX;
	}

	// Returns the index of the drawn point closest to the world (screen) position within
	// pixelTolerance plus the pick radius (the point radius unless the spot style sets it), or -1.
	findNearestPoint (worldX, worldY, pixelTolerance) {
		const hit = this.findNearestPointWithDistance (worldX, worldY, pixelTolerance);
		return hit ? hit.index : -1;
	}

	// As findNearestPoint, but returns { index, distanceSq } with the squared distance in element units, or null.
	findNearestPointWithDistance (worldX, worldY, pixelTolerance) {
		if ((this.drawCount <= 0) || !(this.scale.x !== 0) || !(this.scale.y !== 0))
			return null;

		const dx = worldX - this.position.x;
		const dy = worldY - this.position.y;
		const cosine = Math.cos (-this.rotationZ);
		const sine = Math.sin (-this.rotationZ);
		const localX = (dx * cosine - dy * sine) / this.scale.x;
		const localY = (dx * sine + dy * cosine) / this.scale.y;

		const pickRadius = (this.pickRadius !== null) ? this.pickRadius : this.pointPixelSize * 0.5;
		const toleranceLocal = (pixelTolerance + pickRadius) / Math.abs (this.scale.x);
		let bestDistanceSq = toleranceLocal * toleranceLocal;
		let bestIndex = -1;

		const cellX1 = Math.max (Math.floor ((localX - toleranceLocal - this.gridMinX) / this.gridCellSize), 0);
		const cellX2 = Math.min (Math.floor ((localX + toleranceLocal - this.gridMinX) / this.gridCellSize), this.gridCountX - 1);
		const cellY1 = Math.max (Math.floor ((localY - toleranceLocal - this.gridMinY) / this.gridCellSize), 0);
		const cellY2 = Math.min (Math.floor ((localY + toleranceLocal - this.gridMinY) / this.gridCellSize), this.gridCountY - 1);

		for (let cellY = cellY1; cellY <= cellY2; cellY++) {
			for (let cellX = cellX1; cellX <= cellX2; cellX++) {
				const cell = cellX + cellY * this.gridCountX;
				for (let entry = this.gridCellStart[cell]; entry < this.gridCellStart[cell + 1]; entry++) {
					const pointIndex = this.gridPointIndices[entry];
					if (pointIndex >= this.drawCount)
						continue;
					const ex = this.pointsData[pointIndex * 2] - localX;
					const ey = this.pointsData[pointIndex * 2 + 1] - localY;
					const distanceSq = ex * ex + ey * ey;
					if (distanceSq < bestDistanceSq) {
						bestDistanceSq = distanceSq;
						bestIndex = pointIndex;
					}
				}
			}
		}

		return (bestIndex >= 0) ? { index: bestIndex, distanceSq: bestDistanceSq } : null;
	}

	intersectRay (mouseX, mouseY, raycaster) {
		return this.findNearestPoint (mouseX, mouseY, 2);
	}
}


class WebGLBoxElement extends WebGLElement {

    constructor(paramWidth, paramHeight, paramDepth) {
        super();

		let dWidth = Assert.NumberValue (paramWidth);
		let dHeight = Assert.NumberValue (paramHeight);
		let dDepth = Assert.NumberValue (paramDepth);
		
		this.material = new THREE.MeshPhongMaterial( {
			color: 0x808080,
			shininess: 50,
			specular: 0x111111
		} );


        const meshpositions = [];
        meshpositions.push (dWidth, dHeight, 0.0);		
        meshpositions.push (dWidth, 0.0, 0.0);
        meshpositions.push (0.0, 0.0, 0.0);
        meshpositions.push (0.0, 0.0, 0.0);
        meshpositions.push (0.0, dHeight, 0.0);
        meshpositions.push (dWidth, dHeight, 0.0);
		
        meshpositions.push (0.0, 0.0, dDepth);
        meshpositions.push (dWidth, 0.0, dDepth);
        meshpositions.push (dWidth, dHeight, dDepth);		
        meshpositions.push (dWidth, dHeight, dDepth);
        meshpositions.push (0.0, dHeight, dDepth);
        meshpositions.push (0.0, 0.0, dDepth);
		
        meshpositions.push (0.0, 0.0, 0.0);
        meshpositions.push (dWidth, 0.0, 0.0);
        meshpositions.push (dWidth, 0.0, dDepth);		
        meshpositions.push (dWidth, 0.0, dDepth);
        meshpositions.push (0.0, 0.0, dDepth);
        meshpositions.push (0.0, 0.0, 0.0);

        meshpositions.push (dWidth, 0.0, 0.0);
        meshpositions.push (dWidth, dHeight, 0.0);
        meshpositions.push (dWidth, dHeight, dDepth);
        meshpositions.push (dWidth, dHeight, dDepth);
        meshpositions.push (dWidth, 0.0, dDepth);
        meshpositions.push (dWidth, 0.0, 0.0);

        meshpositions.push (dWidth, dHeight, 0.0);
        meshpositions.push (0.0, dHeight, 0.0);
        meshpositions.push (0.0, dHeight, dDepth);
        meshpositions.push (0.0, dHeight, dDepth);
        meshpositions.push (dWidth, dHeight, dDepth);
        meshpositions.push (dWidth, dHeight, 0.0);
		
        meshpositions.push (0.0, dHeight, 0.0);
        meshpositions.push (0.0, 0.0, 0.0);
        meshpositions.push (0.0, 0.0, dDepth);
        meshpositions.push (0.0, 0.0, dDepth);
        meshpositions.push (0.0, dHeight, dDepth);
        meshpositions.push (0.0, dHeight, 0.0);

		
        this.meshgeometry = new THREE.BufferGeometry();
		this.meshgeometry.setAttribute('position', new THREE.Float32BufferAttribute(meshpositions, 3));
		this.meshgeometry.computeVertexNormals ();
		this.meshelement = new THREE.Mesh( this.meshgeometry, this.material );
		this.meshelement.castShadow = true;
		this.meshelement.receiveShadow = true;
		
        let linegeometry = new THREE.BufferGeometry();
        const linematerial = new THREE.LineBasicMaterial({
            linewidth: 1,
            color: 0x000000,
			transparent: true,
			opacity: 0.5
        })

        const positions = [];

        positions.push (0.0, 0.0, 0.0);
        positions.push (dWidth, 0.0, 0.0);
        positions.push (dWidth, 0.0, 0.0);
        positions.push (dWidth, dHeight, 0.0);
        positions.push (dWidth, dHeight, 0.0);
        positions.push (0.0, dHeight, 0.0);
        positions.push (0.0, dHeight, 0.0);
        positions.push (0.0, 0.0, 0.0);
		
        positions.push (0.0, 0.0, dDepth);
        positions.push (dWidth, 0.0, dDepth);
        positions.push (dWidth, 0.0, dDepth);
        positions.push (dWidth, dHeight, dDepth);
        positions.push (dWidth, dHeight, dDepth);
        positions.push (0.0, dHeight, dDepth);
        positions.push (0.0, dHeight, dDepth);
        positions.push (0.0, 0.0, dDepth);
		
		positions.push (0.0, 0.0, 0.0);
		positions.push (0.0, 0.0, dDepth);
		positions.push (dWidth, 0.0, 0.0);
		positions.push (dWidth, 0.0, dDepth);
		positions.push (dWidth, dHeight, 0.0);
		positions.push (dWidth, dHeight, dDepth);
		positions.push (0.0, dHeight, 0.0);
		positions.push (0.0, dHeight, dDepth);

        linegeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        linegeometry.computeBoundingSphere(); 

		let group = new THREE.Group()
        this.edgeselement = new THREE.LineSegments(linegeometry, linematerial);

        group.add(this.edgeselement);
		group.add(this.meshelement);

        this.glelement = group; 
		
		
		
    }

}

class WebGLMeshElement extends WebGLElement {

    constructor(applicationInstance, meshUUID, meshcolor) {
		
        super();

		let normalizedUUID = Assert.UUIDValue (meshUUID);
		this.meshUUID = normalizedUUID;
		
		if (!meshcolor)
			meshcolor = 0x808080;
		
		this.material = new THREE.MeshPhongMaterial( {
			color: 0x808080,
			shininess: 50,
			specular: 0x111111
		} );
		
		let materialToUse = this.material;
		
		let group = new THREE.Group()

        this.glelement = group; 
		
		applicationInstance.axiosGetArrayBufferRequest("/meshgeometry/" + normalizedUUID)
		.then(responseData => {
			let meshpositions = responseData.data;
			
			let meshgeometry = new THREE.BufferGeometry();
			meshgeometry.setAttribute('position', new THREE.Float32BufferAttribute(meshpositions, 3));
			meshgeometry.computeVertexNormals ();
			let meshelement = new THREE.Mesh( meshgeometry, materialToUse );
			meshelement.castShadow = true;
			meshelement.receiveShadow = true;
						
			group.add(meshelement);			
			
		})
		.catch(err => {
			if (err.response) {
				console.log (err.response);
			} else {
				console.log ("fatal error while retrieving mesh geometry " + normalizedUUID);
			}
		});
				
		applicationInstance.axiosGetArrayBufferRequest("/meshedges/" + normalizedUUID)
		.then(responseData => {
			let linepositions = responseData.data;
			
			let linegeometry = new THREE.BufferGeometry();
			const linematerial = new THREE.LineBasicMaterial({
				linewidth: 1,
				color: 0x000000,
				transparent: true,
				opacity: 0.5
			});
			
			linegeometry.setAttribute('position', new THREE.Float32BufferAttribute(linepositions, 3));
			linegeometry.computeBoundingSphere(); 
			
			let edgeselement = new THREE.LineSegments(linegeometry, linematerial);
						
			group.add(edgeselement);			
			
		})
		.catch(err => {
			if (err.response) {
				console.log (err.response);
			} else {
				console.log ("fatal error while retrieving edges " + normalizedUUID);
			}
		});
				
    }

}

class WebGLGridElement extends WebGLElement {

    constructor(width, height, zValue, factor, gridBaseColor) {
        super();

        this.lineElement1 = null;
        this.lineElement2 = null;
        this.lineElement3 = null;

        let group = new THREE.Group()

        let gridArray1 = []
        let gridArray2 = []
        let gridArray3 = []
        let x, y;

        let lineCountX = width / factor + 1;
        let lineCountY = height / factor + 1;
		
		let gridRecursion = 5;
		let gridRecursionSquared = gridRecursion * gridRecursion;

        for (x = 0; x < lineCountX; x++) {
            if (x % gridRecursion != 0) {
                gridArray1.push(x * factor, 0, x * factor, height);
            }
        }

        for (y = 0; y < lineCountY; y++) {
            if (y % gridRecursion != 0) {
                gridArray1.push(0, y * factor, width, y * factor);
            }
        }

        for (x = 0; x < (lineCountX / gridRecursion); x++) {
            if (x % gridRecursion != 0) {
                gridArray2.push(x * gridRecursion * factor, 0, x * gridRecursion * factor, height);
            }
        }

        for (y = 0; y < (lineCountY / gridRecursion); y++) {
            if (y % gridRecursion != 0) {
                gridArray2.push(0, y * gridRecursion * factor, width, y * gridRecursion * factor);
            }
        }

        for (x = 0; x < (lineCountX / gridRecursionSquared); x++) {
            gridArray3.push(x * gridRecursionSquared * factor, 0, x * gridRecursionSquared * factor, height);
        }

        for (y = 0; y < (lineCountY / gridRecursionSquared); y++) {
            gridArray3.push(0, y * gridRecursionSquared * factor, width, y * gridRecursionSquared * factor);
        }

        let c1 = DEFAULT_GRID_COLOR_FINE, c2 = DEFAULT_GRID_COLOR_MEDIUM, c3 = DEFAULT_GRID_COLOR_COARSE;
        if (gridBaseColor !== undefined) {
            const base = new THREE.Color(gridBaseColor);
            c1 = base.getHex();
            const luminance = base.r * 0.299 + base.g * 0.587 + base.b * 0.114;
            if (luminance < GRID_DARK_LUMINANCE_THRESHOLD) {
                c2 = base.clone().multiplyScalar(GRID_DARK_SCALE_MEDIUM).getHex();
                c3 = base.clone().multiplyScalar(GRID_DARK_SCALE_COARSE).getHex();
            } else {
                c2 = base.clone().multiplyScalar(GRID_LIGHT_SCALE_MEDIUM).getHex();
                c3 = base.clone().multiplyScalar(GRID_LIGHT_SCALE_COARSE).getHex();
            }
        }

        this.lineElement1 = new WebGLLinesElement(gridArray1, zValue, 0.5, c1);
        this.lineElement2 = new WebGLLinesElement(gridArray2, zValue, 0.6, c2);
        this.lineElement3 = new WebGLLinesElement(gridArray3, zValue, 0.8, c3);

        group.add(this.lineElement1.glelement);
        group.add(this.lineElement2.glelement);
        group.add(this.lineElement3.glelement);

        this.glelement = group;
	
    }

}

class WebGLSVGElement extends WebGLElement {

    constructor ()
	{
        super();
		this.glelement = null
	}
	
	
	loadData (data, fillShapes, showStrokes) {

        const paths = data.paths;

        const group = new THREE.Group();
        group.position.x = 0;
        group.position.y = 0;
        group.position.z = 0;
        group.scale.y *=  - 1;

        for (let i = 0; i < paths.length; i++) {

            const path = paths[i];

            const fillColor = path.userData.style.fill;
            if (fillShapes && fillColor !== undefined && fillColor !== 'none') {

                const material = new THREE.MeshBasicMaterial({
                    color: new THREE.Color().setStyle(fillColor),
                    opacity: path.userData.style.fillOpacity,
                    transparent: true,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    wireframe: false
                });

                const shapes = SVGLoader.createShapes(path);

                for (let j = 0; j < shapes.length; j++) {

                    const shape = shapes[j];

                    const geometry = new THREE.ShapeGeometry(shape);
                    const mesh = new THREE.Mesh(geometry, material);

                    group.add(mesh);

                }

            }

            const strokeColor = path.userData.style.stroke;

            if (showStrokes && strokeColor !== undefined && strokeColor !== 'none') {

                const material = new THREE.MeshBasicMaterial({
                    color: new THREE.Color().setStyle(strokeColor),
                    opacity: path.userData.style.strokeOpacity,
                    transparent: true,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    wireframe: false
                });

                for (let j = 0, jl = path.subPaths.length; j < jl; j++) {

                    const subPath = path.subPaths[j];

                    const geometry = SVGLoader.pointsToStroke(subPath.getPoints(), path.userData.style);

                    if (geometry) {

                        const mesh = new THREE.Mesh(geometry, material);

                        group.add(mesh);

                    }

                }

            }

        }

        this.glelement = group;
    }

}

// Frees the GPU resources of raster image elements (texture, material, geometry): three.js does not do that on
// scene.remove. Only meshes flagged with disposeOnRemove are touched, the other element types are left as they were.
function disposeImageResources (object3d) {
    if (!object3d)
        return;

    object3d.traverse((child) => {
        if (!child.isMesh || !child.userData || !child.userData.disposeOnRemove)
            return;

        if (child.material) {
            if (child.material.map)
                child.material.map.dispose();
            // Shader materials keep their textures in uniforms.
            if (child.material.uniforms) {
                for (const uniform of Object.values(child.material.uniforms)) {
                    if (uniform && uniform.value && uniform.value.isTexture)
                        uniform.value.dispose();
                }
            }
            child.material.dispose();
        }
        if (child.geometry)
            child.geometry.dispose();
    });
}

// Scalar field stored in a PNG: the 16-bit code of a pixel lies in its red (high byte) and green (low byte)
// channel, blue is 255 where the pixel holds a value and 0 where it does not. The codes are decoded into a float
// texture of (value * coverage, coverage) and drawn through a color lookup table over an adjustable value range,
// so a new range or color map costs one render and no new download. Linear filtering of the float texture needs
// OES_texture_float_linear; without it the texels are sampled nearest. With it the texture is always filtered
// linearly and the shader decides what a magnified texel looks like: a sharp square (smoothing off, the lookup
// goes to the centre of the texel, where the filter returns the texel itself) or an interpolation between the
// texels (smoothing on). Switching between the two costs one render and no new upload of the texture.
const SCALARIMAGE_VERTEXSHADER = `
    varying vec2 vUv;
    void main () {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4 (position, 1.0);
    }
`;

const SCALARIMAGE_FRAGMENTSHADER = `
    precision highp float;
    uniform sampler2D fieldMap;
    uniform sampler2D lookupTable;
    uniform vec2 fieldSize;
    uniform float smoothing;
    uniform float rangeMin;
    uniform float rangeMax;
    uniform float opacity;
    varying vec2 vUv;
    void main () {
        // Texels per screen pixel: below 1 the field is magnified. A minified field is averaged in both modes.
        vec2 uv = vUv;
        if (smoothing < 0.5) {
            vec2 texelsPerPixel = fwidth (vUv * fieldSize);
            if (max (texelsPerPixel.x, texelsPerPixel.y) < 1.0)
                uv = (floor (vUv * fieldSize) + 0.5) / fieldSize;
        }
        // (value * coverage, coverage): filtering averages the values of the covered texels only.
        vec2 field = texture2D (fieldMap, uv).rg;
        if (field.g < 0.001)
            discard;
        float value = field.r / field.g;
        float span = rangeMax - rangeMin;
        float t = (span > 0.0) ? clamp ((value - rangeMin) / span, 0.0, 1.0) : 0.0;
        vec4 color = texture2D (lookupTable, vec2 (t, 0.5));
        gl_FragColor = vec4 (color.rgb, color.a * opacity * min (field.g, 1.0));
    }
`;

class WebGLScalarImageElement extends WebGLElement {

    constructor (filterable)
    {
        super();
        this.glelement = null;
        this.material = null;
        this.lookupTexture = null;
        this.filterable = filterable === true;
        this.smoothing = false;
        this.rangeMin = 0.0;
        this.rangeMax = 1.0;
        this.opacity = 1.0;
        this.visible = true;
    }

    // Decodes the loaded PNG into (value * coverage, coverage) floats. Pixels without a value stay (0, 0).
    static decodeField (image, valueMin, valueMax)
    {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if ((width <= 0) || (height <= 0))
            throw new Error ("the image is empty");

        const canvas = document.createElement ("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext ("2d", { willReadFrequently: true });
        context.drawImage (image, 0, 0);
        const pixels = context.getImageData (0, 0, width, height).data;

        const field = new Float32Array (width * height * 2);
        const span = valueMax - valueMin;
        let covered = 0;
        for (let index = 0, offset = 0; index < pixels.length; index += 4, offset += 2) {
            if (pixels[index + 2] < 128)
                continue;
            const code = pixels[index] * 256 + pixels[index + 1];
            field[offset] = valueMin + (code / 65535.0) * span;
            field[offset + 1] = 1.0;
            covered++;
        }
        return { data: field, width: width, height: height, covered: covered };
    }

    load (url, width, height, offsetX, offsetY, valueMin, valueMax, onLoaded, onError)
    {
        const image = new Image ();
        image.onload = () => {
            let decoded;
            try {
                decoded = WebGLScalarImageElement.decodeField (image, valueMin, valueMax);
            } catch (error) {
                if (onError)
                    onError (error);
                return;
            }

            console.debug ("[WebGL] scalar image " + decoded.width + " x " + decoded.height + ", " + decoded.covered + " pixels hold a value, values "
                + valueMin + ".." + valueMax + (this.filterable ? ", linear filtering" : ", nearest filtering"));

            const texture = new THREE.DataTexture (decoded.data, decoded.width, decoded.height, THREE.RGFormat, THREE.FloatType);
            // Row 0 of a PNG is its top row; flipY puts it on the local +Y side of the plane, like the TextureLoader does.
            texture.flipY = true;
            texture.magFilter = this.filterable ? THREE.LinearFilter : THREE.NearestFilter;
            texture.minFilter = this.filterable ? THREE.LinearFilter : THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.colorSpace = THREE.NoColorSpace;
            texture.needsUpdate = true;

            const material = new THREE.ShaderMaterial ({
                uniforms: {
                    fieldMap: { value: texture },
                    lookupTable: { value: this.lookupTexture },
                    fieldSize: { value: new THREE.Vector2 (decoded.width, decoded.height) },
                    smoothing: { value: this.smoothing ? 1.0 : 0.0 },
                    rangeMin: { value: this.rangeMin },
                    rangeMax: { value: this.rangeMax },
                    opacity: { value: this.opacity }
                },
                vertexShader: SCALARIMAGE_VERTEXSHADER,
                fragmentShader: SCALARIMAGE_FRAGMENTSHADER,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const geometry = new THREE.PlaneGeometry (width, height);
            const mesh = new THREE.Mesh (geometry, material);
            // PlaneGeometry is centred on its origin; move it so that its lower left corner is the given offset.
            mesh.position.set (offsetX + width / 2, offsetY + height / 2, 0);
            mesh.userData.disposeOnRemove = true;

            const group = new THREE.Group ();
            group.add (mesh);
            group.visible = this.visible;
            this.glelement = group;
            this.material = material;
            this.updateGLPosition ();

            if (onLoaded)
                onLoaded (this);
        };
        image.onerror = () => {
            if (onError)
                onError (new Error ("the image could not be loaded"));
        };
        image.src = url;
    }

    // table: RGBA bytes of the color map from value 0 to 1, see colorMapLookupTable.
    setLookupTable (table)
    {
        if (!table || (table.length < 4))
            return;

        const texture = new THREE.DataTexture (table, table.length / 4, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.NoColorSpace;
        texture.needsUpdate = true;

        if (this.lookupTexture)
            this.lookupTexture.dispose ();
        this.lookupTexture = texture;
        if (this.material)
            this.material.uniforms.lookupTable.value = texture;
    }

    setValueRange (minValue, maxValue)
    {
        this.rangeMin = minValue;
        this.rangeMax = maxValue;
        if (this.material) {
            this.material.uniforms.rangeMin.value = minValue;
            this.material.uniforms.rangeMax.value = maxValue;
        }
    }

    // Smoothing interpolates between the texels of a magnified field; without it every texel is a sharp square.
    // It needs a filterable float texture and changes nothing without one.
    setSmoothing (enabled)
    {
        this.smoothing = (enabled === true);
        if (this.material)
            this.material.uniforms.smoothing.value = this.smoothing ? 1.0 : 0.0;
    }

    // Opacity of the whole field from 0 (not seen) to 1 (drawn as it is). It scales the alpha of the colors of the
    // lookup table and costs one render, no new upload of the texture.
    setOpacity (opacity)
    {
        const value = Number (opacity);
        this.opacity = Number.isFinite (value) ? Math.min (Math.max (value, 0.0), 1.0) : 1.0;
        if (this.material)
            this.material.uniforms.opacity.value = this.opacity;
    }

    setVisible (visible)
    {
        this.visible = (visible !== false);
        if (this.glelement)
            this.glelement.visible = this.visible;
    }

}

// The four corners of a picture of an image, as fractions of its width and height from its top left corner (x to the
// right, y down): the members topleftx, toplefty, toprightx, toprighty, bottomrightx, bottomrighty, bottomleftx and
// bottomlefty. These are the corners of the full image.
export const FULL_IMAGE_CORNERS = Object.freeze ({
    topleftx: 0.0, toplefty: 0.0, toprightx: 1.0, toprighty: 0.0,
    bottomrightx: 1.0, bottomrighty: 1.0, bottomleftx: 0.0, bottomlefty: 1.0
});

// Perspective (projective) transform of the unit square onto the quadrilateral of corners (see FULL_IMAGE_CORNERS):
// (s, t) with s to the right and t down, (0, 0) the top left and (1, 1) the bottom right corner of the square, maps to
// the image point x = (a s + b t + c) / (g s + h t + 1), y = (d s + e t + f) / (g s + h t + 1). Every corner of the
// square goes to the corner of the same name, straight lines stay straight (Heckbert, Fundamentals of Texture Mapping
// and Image Warping, 1989). Returns the rows { u: [a, b, c], v: [d, e, f], w: [g, h, 1] }, or null if the corners are
// no numbers or the quadrilateral is degenerate.
export function computeQuadHomography (corners)
{
    if (!corners)
        return null;

    const x0 = Number (corners.topleftx), y0 = Number (corners.toplefty);
    const x1 = Number (corners.toprightx), y1 = Number (corners.toprighty);
    const x2 = Number (corners.bottomrightx), y2 = Number (corners.bottomrighty);
    const x3 = Number (corners.bottomleftx), y3 = Number (corners.bottomlefty);
    if (![x0, y0, x1, y1, x2, y2, x3, y3].every (Number.isFinite))
        return null;

    const sumX = x0 - x1 + x2 - x3;
    const sumY = y0 - y1 + y2 - y3;
    let g = 0.0, h = 0.0;
    if ((Math.abs (sumX) > 1e-12) || (Math.abs (sumY) > 1e-12)) {
        const dx1 = x1 - x2, dx2 = x3 - x2;
        const dy1 = y1 - y2, dy2 = y3 - y2;
        const determinant = dx1 * dy2 - dx2 * dy1;
        if (Math.abs (determinant) < 1e-15)
            return null;
        g = (sumX * dy2 - dx2 * sumY) / determinant;
        h = (dx1 * sumY - sumX * dy1) / determinant;
    }

    return {
        u: [x1 - x0 + g * x1, x3 - x0 + h * x3, x0],
        v: [y1 - y0 + g * y1, y3 - y0 + h * y3, y0],
        w: [g, h, 1.0]
    };
}

const WARPEDIMAGE_VERTEXSHADER = `
    varying vec2 vUv;
    void main () {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4 (position, 1.0);
    }
`;

// The plane is the target rectangle: vUv (0, 0) is its lower left and (1, 1) its upper right corner. The homography
// takes the point of the rectangle (s to the right, t down) to the point of the image (x to the right, y down); the
// texture holds row 0 of the image at v = 1 (flipY of the loader). The texture is sRGB and decoded on sampling, the
// output is encoded again, like MeshBasicMaterial does, so that a picture looks the same in both.
const WARPEDIMAGE_FRAGMENTSHADER = `
    uniform sampler2D map;
    uniform float opacity;
    uniform vec3 homographyU;
    uniform vec3 homographyV;
    uniform vec3 homographyW;
    varying vec2 vUv;
    void main () {
        vec3 target = vec3 (vUv.x, 1.0 - vUv.y, 1.0);
        float w = dot (homographyW, target);
        vec2 imagePoint = vec2 (dot (homographyU, target), dot (homographyV, target)) / w;
        vec4 texel = texture2D (map, vec2 (imagePoint.x, 1.0 - imagePoint.y));
        gl_FragColor = vec4 (texel.rgb, texel.a * opacity);
        #include <colorspace_fragment>
    }
`;

// Raster image stretched over a rectangle of the scene, for example a camera image of the layer laid over the build
// plate. The texture is loaded asynchronously; until then the element has no glelement, like an SVG before its load.
// Smoothing interpolates between the pixels of the magnified image (and filters a reduced one through mipmaps);
// without it every pixel of a magnified image is a sharp square. The opacity scales the whole image.
// With corners (see FULL_IMAGE_CORNERS) the element is a corrected picture: the quadrilateral of the image between
// the corners is drawn with perspective correction over the rectangle, the top left corner onto the top left corner
// of the rectangle and so on; the parts of the image outside of it are not drawn. setCorners moves the corners of a
// loaded picture without a new upload. Without corners the whole image is stretched over the rectangle.
class WebGLImageElement extends WebGLElement {

    constructor ()
	{
        super();
		this.glelement = null;
		this.material = null;
		this.smoothing = false;
		this.opacity = 1.0;
		this.visible = true;
		// null: the whole image, no perspective correction. Chosen before the load, see setCorners.
		this.corners = null;
	}

    // Makes the element a corrected picture (before loadTexture) or moves the corners of a corrected picture. Corners
    // that are no quadrilateral are ignored, the previous ones stay. A loaded picture without corrections stays one.
    // Returns true if the corners were taken.
    setCorners (corners)
    {
        const homography = computeQuadHomography (corners);
        if (!homography)
            return false;

        if (this.glelement && !this.isCorrected ())
            return false;

        this.corners = Object.assign ({}, corners);
        if (this.material && this.material.uniforms) {
            this.material.uniforms.homographyU.value.fromArray (homography.u);
            this.material.uniforms.homographyV.value.fromArray (homography.v);
            this.material.uniforms.homographyW.value.fromArray (homography.w);
        }
        return true;
    }

    isCorrected ()
    {
        return this.corners !== null;
    }

	loadTexture (url, width, height, offsetX, offsetY, onLoaded, onError)
	{
        const loader = new THREE.TextureLoader();
        loader.load(url, (texture) => {
            // A PNG holds sRGB colours and the renderer outputs sRGB, so the colours stay as rendered.
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.magFilter = this.smoothing ? THREE.LinearFilter : THREE.NearestFilter;
            // A smoothed image is reduced through mipmaps, so that a large picture does not flicker when zoomed out.
            texture.minFilter = this.smoothing ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
            texture.generateMipmaps = this.smoothing;

            // transparent: the PNG may carry an alpha channel and the opacity may be below 1, the build plate stays
            // visible under the image.
            let material;
            const homography = this.isCorrected () ? computeQuadHomography (this.corners) : null;
            if (homography) {
                material = new THREE.ShaderMaterial({
                    uniforms: {
                        map: { value: texture },
                        opacity: { value: this.opacity },
                        homographyU: { value: new THREE.Vector3 ().fromArray (homography.u) },
                        homographyV: { value: new THREE.Vector3 ().fromArray (homography.v) },
                        homographyW: { value: new THREE.Vector3 ().fromArray (homography.w) }
                    },
                    vertexShader: WARPEDIMAGE_VERTEXSHADER,
                    fragmentShader: WARPEDIMAGE_FRAGMENTSHADER,
                    transparent: true,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
            } else {
                material = new THREE.MeshBasicMaterial({
                    map: texture,
                    transparent: true,
                    opacity: this.opacity,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
            }
            const geometry = new THREE.PlaneGeometry(width, height);
            const mesh = new THREE.Mesh(geometry, material);
            // PlaneGeometry is centred on its origin; move it so that its lower left corner is the given offset.
            // With the default flipY of the loader, row 0 of the image lies on the local +Y side of the plane.
            mesh.position.set(offsetX + width / 2, offsetY + height / 2, 0);
            mesh.userData.disposeOnRemove = true;

            const group = new THREE.Group();
            group.add(mesh);
            group.visible = this.visible;
            this.glelement = group;
            this.material = material;
            this.updateGLPosition();

            const image = texture.image;
            console.debug("[WebGL] image " + ((image && (image.naturalWidth || image.width)) || 0) + " x " + ((image && (image.naturalHeight || image.height)) || 0)
                + " over " + width + " x " + height + (this.smoothing ? ", linear filtering" : ", nearest filtering") + (homography ? ", perspective correction" : ""));

            if (onLoaded)
                onLoaded(this);
        }, undefined, (error) => {
            console.error("Could not load the image " + url, error);
            if (onError)
                onError((error instanceof Error) ? error : new Error("the image could not be loaded"));
        });
	}

    setSmoothing (enabled)
    {
        this.smoothing = (enabled === true);
    }

    // Opacity of the whole image from 0 (not seen) to 1 (drawn as it is). It costs one render, no new upload.
    setOpacity (opacity)
    {
        const value = Number (opacity);
        this.opacity = Number.isFinite (value) ? Math.min (Math.max (value, 0.0), 1.0) : 1.0;
        if (this.material) {
            if (this.material.uniforms)
                this.material.uniforms.opacity.value = this.opacity;
            else
                this.material.opacity = this.opacity;
        }
    }

    setVisible (visible)
    {
        this.visible = (visible !== false);
        if (this.glelement)
            this.glelement.visible = this.visible;
    }

}

class WebGLAmbientLight extends WebGLElement {

    constructor (paramColor, paramIntensity) {
        super();

		let dColor = Assert.NumberValue (paramColor);
		let dIntensity = Assert.NumberValue (paramIntensity);

        this.glelement = new THREE.AmbientLight( dColor, dIntensity );

    }

}

class WebGLImpl {

    constructor() {
		
        this.renderer = new THREE.WebGLRenderer({
            antialias: true
        });
		
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(DEFAULT_SCENE_BACKGROUND);

		this.raycaster = new THREE.Raycaster();

        this.renderElements = new Map();
		
		this.camera = null;
		this.hasPerspectiveView = false;
		
		this.controls = null;
    }

    setBackgroundColor(hexColor) {
        if (this.scene && hexColor) {
            this.scene.background = new THREE.Color(hexColor);
        }
    }

    setup2DView(paramSizeX, paramSizeY, paramNear, paramFar) 
	{
		let dSizeX = Assert.NumberValue (paramSizeX);
		let dSizeY = Assert.NumberValue (paramSizeY);
		let dNear = Assert.NumberValue (paramNear);
		let dFar = Assert.NumberValue (paramFar);
		
        this.camera = new THREE.OrthographicCamera(0, dSizeX, 0, dSizeY, dNear, dFar);
        this.camera.position.z = dFar * 0.99;
    }

    setupOrthoView(paramSizeX, paramSizeY, paramNear, paramFar) 
	{
		let dSizeX = Assert.NumberValue (paramSizeX);
		let dSizeY = Assert.NumberValue (paramSizeY);
		let dNear = Assert.NumberValue (paramNear);
		let dFar = Assert.NumberValue (paramFar);

        this.camera = new THREE.OrthographicCamera(-dSizeX * 0.5, dSizeX * 0.5, -dSizeY * 0.5, dSizeY * 0.5, dNear, dFar);
        this.camera.position.z = dFar * 0.99;
    }
	
    setupPerspectiveView(paramFieldOfView, paramAspectRatio, paramNear, paramFar) 
	{
				
		let dFieldOfView = Assert.NumberValue (paramFieldOfView);
		let dAspectRatio = Assert.NumberValue (paramAspectRatio);
		let dNear = Assert.NumberValue (paramNear);
		let dFar = Assert.NumberValue (paramFar);
		
        this.camera = new THREE.PerspectiveCamera( dFieldOfView, dAspectRatio, dNear, dFar );
		this.camera.up.set (0, 0, 1); // Set Z up
		this.hasPerspectiveView = true;
	}

	setCameraPosition (paramX, paramY, paramZ) 
	{	
		if (!this.camera)
			throw "Camera has not been set up";

		let dX = Assert.NumberValue (paramX);
		let dY = Assert.NumberValue (paramY);
		let dZ = Assert.NumberValue (paramZ);

		this.camera.position.set( dX, dY, dZ );
	}

    setupDOMElement(domelement) {
		if (!domelement)
			throw "No DOM Element to attach to";

        domelement.append(this.renderer.domElement);

        // const rendererWindowPosition = this.renderer.domElement.getBoundingClientRect();
        // console.log(rendererWindowPosition);

        const infoboxDiv = document.createElement('div');
        infoboxDiv.id = 'infobox_points';
        infoboxDiv.style.display = 'none'
        infoboxDiv.style.position = 'absolute';
        infoboxDiv.style.top = 0;
        infoboxDiv.style.left = 0;
        infoboxDiv.style.zIndex = 100;
        infoboxDiv.style.padding = '5px';
        infoboxDiv.style.borderRadius = '5px';
        infoboxDiv.style.fontFamily = 'Arial';
        infoboxDiv.style.fontSize = '8pt';
        infoboxDiv.style.fontWeight = 'bold';
        infoboxDiv.style.background = 'rgba(0, 0, 0, 0.7)';
        infoboxDiv.style.color = 'white';
        infoboxDiv.style.visibility = 'none';
        infoboxDiv.innerText = '---';

        this.renderer.domElement.parentElement.style.position = 'relative';
        this.renderer.domElement.parentElement.appendChild(infoboxDiv);
    }

    resizeTo(sizex, sizey) {
        if (this.renderer) {
            this.renderer.setSize(sizex, sizey);
        }
		
		if (this.camera && this.hasPerspectiveView) {
			if ((sizex > 0) && (sizey > 0)) {
				this.camera.aspect = sizex / sizey;
				this.camera.updateProjectionMatrix ();
			}
			
		}
		
    }

    renderScene() {

        if (this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }

    }

	getRaycasterCollisions(elementidentifier, mouseX, mouseY) {
		
		let elementMesh = this.findElement (elementidentifier);
		
		if (!elementMesh) 
			return -1;
			
		if (!elementMesh.glelement) 
			return -1;
						
		if (elementMesh.intersectRay) {
			return elementMesh.intersectRay (mouseX, mouseY, this.raycaster);
		}
		
		return -1;
							
	}
	
    hasElement(identifier) {
        if (!identifier)
            return false;

        return (this.renderElements.has(identifier));
    }

    disposeObject(object) {
        if (!object)
            return;

        object.traverse((child) => {
            if (child.geometry)
                child.geometry.dispose();

            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                for (const material of materials) {
                    if (material.map)
                        material.map.dispose();
                    material.dispose();
                }
            }
        });
    }

    removeElement(identifier) {
        if (!identifier)
            return false;

		let selectedObject = this.scene.getObjectByName(identifier);
		if (selectedObject) {
			this.scene.remove(selectedObject);
			this.disposeObject(selectedObject);
		}
		
        if (this.renderElements.has(identifier)) {
            this.renderElements.delete(identifier);
        }

    }

    findElement(identifier) {
        if (!identifier)
            return null;

        if (!this.renderElements.has(identifier))
            return null;

        return this.renderElements.get(identifier);
    }

    getElementPosition(identifier) {
        const element = this.findElement(identifier);

        if (!element || !element.position) {
            return null;
        }

        return element.position;
    }

    getElementEdgePositions(identifier) {
        const element = this.findElement(identifier);

        if (!element || !element.glelement.geometry.attributes.position.array) {
            return null;
        }

        return element.glelement.geometry.attributes.position.array;
    }

    getElementScale(identifier) {
        const element = this.findElement(identifier);

        if (!element || !element.glelement.scale) {
            return null;
        }

        return element.glelement.scale;
    }

    addElement(identifier, renderElement) {
        if (!identifier)
            return;
        if (!renderElement)
            return;

        if (this.hasElement(identifier))
            this.removeElement(identifier);

        this.renderElements.set(identifier, renderElement);

        if (this.scene) {
            if (renderElement.glelement) {
                renderElement.glelement.name = identifier;
                this.scene.add(renderElement.glelement);
            }
        }
    }

    add2DGridGeometry(identifier, width, height, zValue, factor, gridBaseColor) {

        if (!identifier)
            return;

        let gridElement = new WebGLGridElement(width, height, zValue, factor, gridBaseColor);

        this.addElement(identifier, gridElement);

        return gridElement;
    }

    add2DLineGeometry(identifier, lineData, zValue, lineThickness, lineColor, vertexcolors, lineGradients) {
        if (!identifier)
            return;
		
		this.removeElement (identifier);

        let linesElement = new WebGLLinesElement(lineData, zValue, lineThickness, lineColor, vertexcolors, lineGradients);

        this.addElement(identifier, linesElement);

        return linesElement;
    }

    add2DPointsGeometry(identifier, pointsData, zValue, pointsSize, pointsColor, vertexcolors) {
        if (!identifier)
            return;
		
		this.removeElement (identifier);

        let pointsElement = new WebGLPointsElement(pointsData, zValue, pointsSize, pointsColor, vertexcolors);

        this.addElement(identifier, pointsElement);

        return pointsElement;
    }

    add2DScreenPointsGeometry(identifier, pointsData, zValue, pointPixelSize, pointsColor, vertexcolors, spotStyle, pointStates, pointValues) {
        if (!identifier)
            return;

		this.removeElement (identifier);

        let pointsElement = new WebGLScreenPointsElement(pointsData, zValue, pointPixelSize, pointsColor, vertexcolors, spotStyle, pointStates, pointValues,
            this.supportsPointStride());

        this.addElement(identifier, pointsElement);

        return pointsElement;
    }

    getPixelRatio() {
        return this.renderer ? this.renderer.getPixelRatio() : 1.0;
    }

    // Screen points can skip points in their vertex shader (setStride), which needs WebGL 2.
    supportsPointStride() {
        if (this.pointStrideSupported === undefined) {
            const context = this.renderer ? this.renderer.getContext() : null;
            if (!context)
                return false;
            this.pointStrideSupported = (typeof WebGL2RenderingContext !== "undefined") && (context instanceof WebGL2RenderingContext);
        }
        return this.pointStrideSupported;
    }

    // Largest point diameter the graphics card draws, in device pixels.
    getMaxPointPixelSize() {
        if (this.maxPointPixelSize === undefined) {
            const context = this.renderer ? this.renderer.getContext() : null;
            if (!context)
                return 64.0;
            const range = context.getParameter(context.ALIASED_POINT_SIZE_RANGE);
            this.maxPointPixelSize = (range && (range.length > 1) && (range[1] > 0)) ? range[1] : 64.0;
        }
        return this.maxPointPixelSize;
    }

    add2DLocalizedPointsGeometry(identifier, pointsData, zValue, pointsRadius, pointsColor, vertexcolors, originx, originy, quadsizex, quadsizey, quadcountx, quadcounty) {
        if (!identifier)
            return;
		
		this.removeElement (identifier);

        let pointsElement = new WebGLLocalizedPointsElement(pointsData, zValue, pointsRadius, pointsColor, vertexcolors, originx, originy, quadsizex, quadsizey, quadcountx, quadcounty);

        this.addElement(identifier, pointsElement);

        return pointsElement;
    }
	

    addSVGImage(identifier, url, zValue, fillShapes, showStrokes) {
        if (!identifier)
            return;

        let scene = this.scene;

        let svgElement = new WebGLSVGElement();
        this.addElement(identifier, svgElement);
		
		svgElement.setPosition (0, 0, zValue);

        const loader = new SVGLoader();
        loader.load(url, (data) => {
						
			svgElement.loadData (data, fillShapes, showStrokes);
			
            if (svgElement.glelement) {
                svgElement.glelement.name = identifier;
                scene.add(svgElement.glelement);
				
				svgElement.updateGLPosition ();						
            }
			
			this.renderScene ();
									
        });

    }
	
	// Raster image over a rectangle of the scene (lower left corner at offsetX/offsetY, width x height in the local
	// units of the element), for example a heat map over the build plate. The texture loads asynchronously; an
	// element that was removed or replaced in the meantime is not added to the scene.
	// Raster image over a rectangle of the scene, see WebGLImageElement. options (all optional): smoothing, opacity (0
	// to 1), visible, corners (perspective correction of the quadrilateral of the image between them onto the
	// rectangle, see FULL_IMAGE_CORNERS; corners that are no quadrilateral stretch the whole image), onLoaded and onError
	// callbacks. The image loads asynchronously; an element that was removed or replaced in the meantime is not added to
	// the scene.
	addImageElement (identifier, url, width, height, offsetX, offsetY, zValue, options)
	{
        if (!identifier)
            return;

        const settings = options || {};
        let imageElement = new WebGLImageElement ();
        this.addElement(identifier, imageElement);
        imageElement.setPosition (0, 0, zValue);
        imageElement.setSmoothing (settings.smoothing === true);
        imageElement.setOpacity (Number.isFinite (settings.opacity) ? settings.opacity : 1.0);
        imageElement.setVisible (settings.visible !== false);
        if (settings.corners && !imageElement.setCorners (settings.corners))
            console.warn ("[WebGL] the corners of the image " + url + " are no quadrilateral, the whole image is drawn", settings.corners);

        imageElement.loadTexture (url, width, height, offsetX, offsetY, (element) => {
            if (this.renderElements.get(identifier) !== element) {
                disposeImageResources (element.glelement);
                return;
            }

            if (element.glelement && this.scene) {
                element.glelement.name = identifier;
                this.scene.add(element.glelement);
                element.updateGLPosition ();
            }

            this.renderScene ();
            if (settings.onLoaded)
                settings.onLoaded (element);
        }, (error) => {
            if (settings.onError)
                settings.onError (error);
        });

        return imageElement;
	}

	// True if float textures are filtered linearly, which the smoothing of a scalar image needs.
	supportsScalarImageSmoothing ()
	{
		return !!this.renderer && this.renderer.extensions.has ("OES_texture_float_linear");
	}

	// Scalar field image over a rectangle of the scene, see WebGLScalarImageElement. options: valueMin and valueMax
	// (values of the codes 0 and 65535), lookupTable (RGBA bytes), rangeMin and rangeMax (values mapped onto the
	// table), smoothing, opacity (0 to 1), visible, onLoaded and onError callbacks. The image loads asynchronously; an
	// element that was removed or replaced in the meantime is not added to the scene.
	addScalarImageElement (identifier, url, width, height, offsetX, offsetY, zValue, options)
	{
        if (!identifier)
            return;

        const settings = options || {};
        const filterable = this.renderer.extensions.has ("OES_texture_float_linear");
        let element = new WebGLScalarImageElement (filterable);
        this.addElement (identifier, element);
        element.setPosition (0, 0, zValue);
        if (settings.lookupTable)
            element.setLookupTable (settings.lookupTable);
        element.setValueRange (Number.isFinite (settings.rangeMin) ? settings.rangeMin : 0.0, Number.isFinite (settings.rangeMax) ? settings.rangeMax : 1.0);
        element.setSmoothing (settings.smoothing === true);
        element.setOpacity (Number.isFinite (settings.opacity) ? settings.opacity : 1.0);
        element.setVisible (settings.visible !== false);

        element.load (url, width, height, offsetX, offsetY, settings.valueMin, settings.valueMax, (loadedElement) => {
            if (this.renderElements.get (identifier) !== loadedElement) {
                disposeImageResources (loadedElement.glelement);
                return;
            }

            if (loadedElement.glelement && this.scene) {
                loadedElement.glelement.name = identifier;
                this.scene.add (loadedElement.glelement);
                loadedElement.updateGLPosition ();
            }

            this.renderScene ();
            if (settings.onLoaded)
                settings.onLoaded (loadedElement);
        }, (error) => {
            console.error ("Could not load the scalar image " + url, error);
            if (settings.onError)
                settings.onError (error);
        });

        return element;
	}

	addAmbientLight (identifier, color, intensity)
	{
        if (!identifier)
            return;
		
		let lightElement = new WebGLAmbientLight (color, intensity);
				
		this.addElement(identifier, lightElement);
		
		return lightElement;
	}
	
	addBoxElement (identifier, width, height, depth)
	{
        if (!identifier)
            return;
		
		let boxElement = new WebGLBoxElement (width, height, depth);
				
		this.addElement(identifier, boxElement);
		
		return boxElement;
	}

	addMeshElement (identifier, applicationInstance, meshUUID, meshColor)
	{
        if (!identifier)
            return;
		
		let meshElement = new WebGLMeshElement (applicationInstance, meshUUID, meshColor);
				
		this.addElement(identifier, meshElement);
		
		return meshElement;
	}
	
	pick2DElement (x, y)
	{		
		x; y;
		/*if (this.camera) {
			
			console.log("pick X: " + x + " y: " + y);
			
			const pointer = new THREE.Vector2();
			pointer.x = x;
			pointer.y = y;
			
			this.raycaster.setFromCamera( pointer, this.camera );
			
			const intersects = this.raycaster.intersectObjects( this.scene.children[1], true );
			if (intersects.length > 0) {
				alert ("intersect");
			}
		} */
		
	}

    setupDemoScene() {

		// Lights

		//this.scene.add(  );

		this.spotLight = new THREE.SpotLight( 0xffffff, 500 );
		this.spotLight.name = 'Spot Light';
		this.spotLight.angle = Math.PI / 5;
		this.spotLight.penumbra = 0.3;
		this.spotLight.position.set( 10, 5, 10 );
		this.spotLight.castShadow = true;
		this.spotLight.shadow.camera.near = 8;
		this.spotLight.shadow.camera.far = 30;
		this.spotLight.shadow.mapSize.width = 1024;
		this.spotLight.shadow.mapSize.height = 1024;
		this.scene.add( this.spotLight );


		this.dirLight = new THREE.DirectionalLight( 0xffffff, 3 );
		this.dirLight.name = 'Dir. Light';
		this.dirLight.position.set( 10, 0, 10 );
		this.dirLight.castShadow = true;
		this.dirLight.shadow.camera.near = 1;
		this.dirLight.shadow.camera.far = 10;
		this.dirLight.shadow.camera.right = 15;
		this.dirLight.shadow.camera.left = - 15;
		this.dirLight.shadow.camera.top	= 15;
		this.dirLight.shadow.camera.bottom = - 15;
		this.dirLight.shadow.mapSize.width = 1024;
		this.dirLight.shadow.mapSize.height = 1024;
		this.scene.add( this.dirLight );


		// Geometry
		/*let geometry = new THREE.TorusKnotGeometry( 25, 8, 75, 20 );
		let material = new THREE.MeshPhongMaterial( {
			color: 0xff0000,
			shininess: 150,
			specular: 0x222222
		} ); */

		/*this.torusKnot = new THREE.Mesh( geometry, material );
		this.torusKnot.scale.multiplyScalar( 1 / 18 );
		this.torusKnot.position.z = 3;
		this.torusKnot.castShadow = true;
		this.torusKnot.receiveShadow = true;
		this.scene.add( this.torusKnot ); */


/*		let geometry = new THREE.BoxGeometry( 30, 30, 1 );
		let material = new THREE.MeshPhongMaterial( {
			color: 0xa0adaf,
			shininess: 150,
			specular: 0x111111
		} );

		const ground = new THREE.Mesh( geometry, material );
		ground.castShadow = false;
		ground.receiveShadow = true;
		ground.position.z = -6.5;
		this.scene.add( ground );  */
		
		this.scene.background = new THREE.Color( 0xffffff );
		
		const mesh = new THREE.Mesh( new THREE.PlaneGeometry( 300, 300 ), new THREE.MeshPhongMaterial( { color: 0xc0c0c0, depthWrite: false } ) );
				//mesh.rotation.x = - Math.PI / 2;
				mesh.position.z = -6;
				//mesh.receiveShadow = true;	
				this.scene.add( mesh );
				
		
		this.scene.fog = new THREE.Fog( 0xffffff, 1505, 1650 );
		
		const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x8d8d8d, 3 );
		hemiLight.position.set( 0, 500, 0 );
		this.scene.add( hemiLight );
		
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.BasicShadowMap;

		// Mouse control
		const controls = new OrbitControls( this.camera, this.renderer.domElement );
		controls.mouseButtons = {
			LEFT: THREE.MOUSE.NONE,
			MIDDLE: THREE.MOUSE.PAN,
			RIGHT: THREE.MOUSE.ROTATE
		}		
		
		controls.target.set( 0, 0, 2 );
		controls.update();

		this.clock = new THREE.Clock();
				
		return;
    }
}

export default WebGLImpl;
