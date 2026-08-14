// One-off generator for the source icon/splash images used by `npx capacitor-assets generate`.
// Run with: node resources/generate-source-images.js
const path = require("path");
const sharp = require("sharp");

const BRAND_BLUE = "#2a78d6";
const BRAND_BG = "#f9f9f7";

const iconSvg = `
<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="${BRAND_BLUE}"/>
  <text x="512" y="600" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700"
        font-size="380" fill="#ffffff">MC</text>
</svg>`;

const iconForegroundSvg = `
<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="${BRAND_BLUE}"/>
  <text x="512" y="565" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700"
        font-size="300" fill="#ffffff">MC</text>
</svg>`;

const splashSvg = `
<svg width="2732" height="2732" xmlns="http://www.w3.org/2000/svg">
  <rect width="2732" height="2732" fill="${BRAND_BG}"/>
  <rect x="1166" y="1166" width="400" height="400" rx="90" fill="${BRAND_BLUE}"/>
  <text x="1366" y="1430" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700"
        font-size="150" fill="#ffffff">MC</text>
</svg>`;

async function main() {
  await sharp(Buffer.from(iconSvg)).png().toFile(path.join(__dirname, "icon.png"));
  await sharp(Buffer.from(iconForegroundSvg)).png().toFile(path.join(__dirname, "icon-foreground.png"));
  await sharp(Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><rect width="1024" height="1024" fill="${BRAND_BLUE}"/></svg>`))
    .png().toFile(path.join(__dirname, "icon-background.png"));
  await sharp(Buffer.from(splashSvg)).png().toFile(path.join(__dirname, "splash.png"));
  await sharp(Buffer.from(splashSvg)).png().toFile(path.join(__dirname, "splash-dark.png"));
  console.log("Generated resources/icon.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png");
}
main();
