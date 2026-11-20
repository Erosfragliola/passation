// Share image (og:image, 1200 × 630) taken from the hero poster: node scripts/image-partage.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../public/img/photos/hero-poster-2400.webp", import.meta.url));
const sortie = fileURLToPath(new URL("../public/img/partage.jpg", import.meta.url));
await sharp(source).resize(1200, 630, { fit: "cover", position: "attention" }).jpeg({ quality: 82, mozjpeg: true }).toFile(sortie);
console.log(`écrit : ${sortie}`);
