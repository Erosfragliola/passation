// Point d'entrée du paquet « rendu3d » : uniquement ce que la scène 3D utilise (le reste est éliminé à l'assemblage).
export {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, EdgeDetectionMode, VignetteEffect,
  NoiseEffect, TiltShiftEffect, ToneMappingEffect, ToneMappingMode, BlendFunction, HueSaturationEffect,
  BrightnessContrastEffect, KernelSize,
} from "postprocessing";
export { N8AOPostPass } from "n8ao";
export { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
// Traits d'esquisse épais et nets (lignes en pixels écran), modules d'exemple de Three.js
export { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
export { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
export { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
