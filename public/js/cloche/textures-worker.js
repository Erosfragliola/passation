// Web Worker : calcule les textures procédurales hors du fil principal (la page reste fluide).
import { genererTout, tampons } from "/js/cloche/textures.js";

self.onmessage = (e) => {
  const t = genererTout(Boolean(e.data?.mobile));
  self.postMessage(t, tampons(t));
};
