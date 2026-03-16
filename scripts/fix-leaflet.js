// Fix Turbopack incompatibility with leaflet's CSS auto-inclusion
// Removes the "style" field from leaflet's package.json to prevent
// Turbopack from auto-processing leaflet.css (which has url() references
// that fail in Turbopack's CSS pipeline on Windows)
const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "node_modules", "leaflet", "package.json");
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.style) {
    delete pkg.style;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log("[fix-leaflet] Removed style field from leaflet/package.json");
  }
} catch (e) {
  // Ignore if leaflet is not installed
}
