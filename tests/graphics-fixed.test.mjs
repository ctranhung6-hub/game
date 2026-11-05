import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GRAPHICS} from '../public/play/graphics-config.js';
const game=readFileSync(new URL('../public/play/game.js',import.meta.url),'utf8');
test('Render profile is fixed and always uses bounded tablet profile',()=>{
 assert.ok(Object.isFrozen(GRAPHICS));
 assert.equal(GRAPHICS.pixelRatio,1.5);
 assert.equal(GRAPHICS.shadowMapSize,1024);
 assert.equal(GRAPHICS.labelCanvasScale,2);
});
test('Every device uses exactly one pixel ratio and same shadow size',()=>{
 assert.match(game,/renderer\.setPixelRatio\(GRAPHICS\.pixelRatio\)/);
 assert.match(game,/sun\.shadow\.mapSize\.set\(GRAPHICS\.shadowMapSize,GRAPHICS\.shadowMapSize\)/);
 assert.doesNotMatch(game,/tabletMode|graphicsMode|nextAutoLevel|matchMedia\('/);
});
test('Higher geometric detail, sharp labels and anisotropic grass textures',()=>{
 assert.match(game,/GRAPHICS\.sphereWidthSegments/);
 assert.match(game,/GRAPHICS\.labelCanvasScale/);
 assert.match(game,/GRAPHICS\.grassTextureAnisotropy/);
});
