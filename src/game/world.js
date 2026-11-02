// SKYBOUND · world
import { WORLD_SEED } from './config.js';
import { createTerrainLib } from './terrainLib.js';

// One seeded terrain instance on the main thread (physics, trees, textures); workers build their own.
export const terrain=createTerrainLib(WORLD_SEED);
export const terrainFrame=terrain.init();
export const AIRPORT_H=terrainFrame.airportH;
