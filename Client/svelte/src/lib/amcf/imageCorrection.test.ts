// @ts-nocheck -- run by `node --test` (npm test); the project has no @types/node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	FULL_IMAGE_CORNERS, areaCorner, clampSplitWidth, cornersAreValid, cornersEqual, fitTransform, formatTimestamp, imageMenuCaption,
	isFullImage, keepCentre, outwardDirection, parseCorners, parseCorrectionImages, parseOptionalCorners, pixelCornerText,
	platformCornerText, quadrilateralProblem, roundCorners, wheelZoomFactor, withCorner, zoomAround
} from './imageCorrection.ts';
import type { ImageCorners } from './imageCorrection.ts';

const SKEWED: ImageCorners = {
	topleftx: 0.1, toplefty: 0.2, toprightx: 0.8, toprighty: 0.15, bottomrightx: 0.95, bottomrighty: 0.9, bottomleftx: 0.05, bottomlefty: 0.7
};

test('the full image and a skewed quadrilateral are valid', () => {
	assert.equal(quadrilateralProblem(FULL_IMAGE_CORNERS), null);
	assert.equal(quadrilateralProblem(SKEWED), null);
	assert.ok(isFullImage({ ...FULL_IMAGE_CORNERS }));
	assert.ok(!isFullImage(SKEWED));
});

test('a mirrored quadrilateral is valid, it compensates a mirrored image', () => {
	const mirrored = { topleftx: 1, toplefty: 0, toprightx: 0, toprighty: 0, bottomrightx: 0, bottomrighty: 1, bottomleftx: 1, bottomlefty: 1 };
	assert.ok(cornersAreValid(mirrored));
});

test('crossing, concave, degenerate and outside quadrilaterals are invalid', () => {
	// TR and BR swapped: the sides cross.
	assert.match(quadrilateralProblem({ ...FULL_IMAGE_CORNERS, toprightx: 1, toprighty: 1, bottomrightx: 1, bottomrighty: 0 }) ?? '', /convex/);
	// BR pulled into the quadrilateral.
	assert.match(quadrilateralProblem(withCorner(FULL_IMAGE_CORNERS, 'bottomright', { x: 0.3, y: 0.3 })) ?? '', /convex/);
	// BR on the line from TR to BL.
	assert.match(quadrilateralProblem(withCorner(FULL_IMAGE_CORNERS, 'bottomright', { x: 0.5, y: 0.5 })) ?? '', /line/);
	assert.match(quadrilateralProblem(withCorner(FULL_IMAGE_CORNERS, 'topleft', { x: -0.01, y: 0 })) ?? '', /outside/);
	assert.match(quadrilateralProblem({ ...FULL_IMAGE_CORNERS, topleftx: Number.NaN }) ?? '', /no number/);
});

test('parseCorners reads a declaration and falls back to the full image', () => {
	assert.ok(cornersEqual(parseCorners(JSON.stringify(SKEWED)), SKEWED));
	assert.ok(cornersEqual(parseCorners(SKEWED), SKEWED));
	assert.ok(isFullImage(parseCorners('')));
	const warnings: string[] = [];
	assert.ok(isFullImage(parseCorners('{', (message) => warnings.push(message))));
	assert.ok(isFullImage(parseCorners({ ...SKEWED, toprightx: 'x' }, (message) => warnings.push(message))));
	assert.ok(isFullImage(parseCorners({ ...FULL_IMAGE_CORNERS, toprightx: 1, toprighty: 1, bottomrightx: 1, bottomrighty: 0 }, (message) => warnings.push(message))));
	assert.equal(warnings.length, 3);
	assert.equal(parseOptionalCorners(undefined), null);
	assert.equal(parseOptionalCorners(''), null);
	assert.ok(cornersEqual(parseOptionalCorners(SKEWED) as ImageCorners, SKEWED));
});

test('parseCorrectionImages keeps the usable entries in their order', () => {
	const uuid = '0123ABCD-0123-4567-89ab-0123456789ab';
	const images = parseCorrectionImages(JSON.stringify({ images: [
		{ caption: 'Layer 0 - After Recoating - Cuboids', timestamp: '2026-11-25T13:03:12.123456Z', imageuuid: uuid, sizex: 300, sizey: 300, originx: -150, originy: -150 },
		{ caption: '', imageuuid: uuid, sizex: 300, sizey: 300, originx: -150, originy: -150 },
		{ caption: 'no image', imageuuid: '00000000-0000-0000-0000-000000000000', sizex: 300, sizey: 300, originx: -150, originy: -150 },
		{ caption: 'empty area', imageuuid: uuid, sizex: 0, sizey: 300, originx: -150, originy: -150 },
		{ caption: 'Layer 1 - After Exposure - Cuboids', imageuuid: uuid, sizex: 200, sizey: 100, originx: -100, originy: -50 }
	] }));
	assert.equal(images.length, 2);
	assert.equal(images[0].imageUUID, uuid.toLowerCase());
	assert.deepEqual(images[1].area, { sizeX: 200, sizeY: 100, originX: -100, originY: -50 });
	assert.equal(images[1].timestamp, '');
	assert.equal(imageMenuCaption(images[1]), 'Layer 1 - After Exposure - Cuboids');
	assert.match(imageMenuCaption(images[0]), /^Layer 0 - After Recoating - Cuboids - \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	assert.deepEqual(parseCorrectionImages(''), []);
	assert.deepEqual(parseCorrectionImages('nonsense'), []);
});

test('formatTimestamp writes local time without milliseconds', () => {
	const local = new Date(2026, 10, 25, 14, 3, 12);
	assert.equal(formatTimestamp(local.toISOString()), '2026-11-25 14:03:12');
	assert.equal(formatTimestamp('not a time'), '');
});

test('corner texts in image pixels and in toolpath millimetres', () => {
	const corners = withCorner(FULL_IMAGE_CORNERS, 'topleft', { x: 412 / 2840, y: 388 / 2840 });
	assert.equal(pixelCornerText('topleft', corners, 2840, 2840), 'TL (412, 388)');
	assert.equal(pixelCornerText('bottomright', corners, 2840, 2840), 'BR (2840, 2840)');
	const area = { sizeX: 300, sizeY: 300, originX: -150, originY: -150 };
	assert.equal(platformCornerText('topleft', area), 'TL (-150.0, 150.0)');
	assert.equal(platformCornerText('bottomright', area), 'BR (150.0, -150.0)');
	assert.deepEqual(areaCorner(area, 'topright'), { x: 150, y: 150 });
	assert.equal(platformCornerText('bottomleft', { sizeX: 10, sizeY: 10, originX: -0.01, originY: 0 }), 'BL (0.0, 0.0)');
});

test('labels point away from the centre', () => {
	const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
	const direction = outwardDirection(points, 0);
	assert.ok(direction.x < 0 && direction.y < 0);
	assert.ok(Math.abs(Math.hypot(direction.x, direction.y) - 1) < 1e-12);
});

test('fit, zoom around a point and resize keep the content in place', () => {
	const fit = fitTransform(2840, 2840, 600, 400);
	assert.ok(Math.abs(fit.scale - 400 / 2840) < 1e-12);
	assert.ok(Math.abs(fit.offsetX - 100) < 1e-9);
	assert.equal(fit.offsetY, 0);

	const zoomed = zoomAround(fit, 2, 300, 200, fit.scale / 2, 16);
	// The content point under (300, 200) stays there.
	const before = { x: (300 - fit.offsetX) / fit.scale, y: (200 - fit.offsetY) / fit.scale };
	const after = { x: (300 - zoomed.offsetX) / zoomed.scale, y: (200 - zoomed.offsetY) / zoomed.scale };
	assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
	assert.equal(zoomAround(fit, 1e6, 0, 0, fit.scale / 2, 16).scale, 16);
	assert.equal(zoomAround(fit, 1e-6, 0, 0, fit.scale / 2, 16).scale, fit.scale / 2);

	const resized = keepCentre(fit, 600, 400, 800, 400);
	assert.equal(resized.scale, fit.scale);
	assert.ok(Math.abs((400 - resized.offsetX) / resized.scale - (300 - fit.offsetX) / fit.scale) < 1e-9);
});

test('wheel and splitter limits', () => {
	assert.ok(wheelZoomFactor(-100) > 1);
	assert.ok(wheelZoomFactor(100) < 1);
	assert.equal(wheelZoomFactor(100), wheelZoomFactor(5));
	assert.equal(clampSplitWidth(50, 1000, 200), 200);
	assert.equal(clampSplitWidth(950, 1000, 200), 800);
	assert.equal(clampSplitWidth(500, 1000, 200), 500);
	assert.equal(clampSplitWidth(100, 300, 200), 150);
});

test('corners are rounded to the six decimals the server stores', () => {
	const rounded = roundCorners({ ...SKEWED, topleftx: 0.09345794392523364, bottomrighty: 0.9221183800623053 });
	assert.equal(rounded.topleftx, 0.093458);
	assert.equal(rounded.bottomrighty, 0.922118);
	assert.ok(cornersAreValid(rounded));
});
