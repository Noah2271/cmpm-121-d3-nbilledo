import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import "./style.css";

const GAMEPLAY_ZOOM = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

const RANDOM_LATLNG = (() => {
  const lat = Math.random() * 180 - 90; // -90 to +90
  const lng = Math.random() * 360 - 180; // -180 to +180
  return leaflet.latLng(lat, lng); // 'leaflet' is the Leaflet global
})();

const map = leaflet.map(mapDiv, {
  center: RANDOM_LATLNG,
  zoom: GAMEPLAY_ZOOM,
  minZoom: GAMEPLAY_ZOOM,
  maxZoom: GAMEPLAY_ZOOM,
  zoomControl: false, // this is probably gonna have to be used for the zoom feature later
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const playerMarker = leaflet.marker(RANDOM_LATLNG).addTo(map);
playerMarker.addTo(map);

let currentHolding = 0;
statusPanelDiv.innerHTML = "Holding: " + currentHolding;

// manage grid rectangles so we can clear & redraw
const gridLayer = leaflet.layerGroup().addTo(map);

function redrawGrid() {
  gridLayer.clearLayers(); // clear current grid

  // keep origin point and convert distances to projected screen pixels
  const origin = RANDOM_LATLNG;
  const zoom = map.getZoom();
  const originPoint = map.project(origin, zoom);

  // get the boundaries of the current visible screen area
  const pixelBounds = map.getPixelBounds();

  // determine the iteration limits via visible pixel coordinates
  const pixelSize = 40; // grid cell size
  const jMin = Math.floor((pixelBounds.min!.x - originPoint.x) / pixelSize);
  const jMax = Math.floor((pixelBounds.max!.x - originPoint.x) / pixelSize);
  const iMin = Math.floor((pixelBounds.min!.y - originPoint.y) / pixelSize);
  const iMax = Math.floor((pixelBounds.max!.y - originPoint.y) / pixelSize);

  // loop through each visible pixel coordinate and create cell
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const topLeftPoint = originPoint.add( // calculate the boundaries for the cells
        leaflet.point(j * pixelSize, i * pixelSize),
      );
      const bottomRightPoint = originPoint.add(
        leaflet.point((j + 1) * pixelSize, (i + 1) * pixelSize),
      );

      // convert back to map coordinates from projected screen pixel
      const bounds = leaflet.latLngBounds([
        map.unproject(topLeftPoint, zoom),
        map.unproject(bottomRightPoint, zoom),
      ]);

      // draw the rectangle
      const rect = leaflet.rectangle(bounds, {
        color: "#000000ff",
        weight: 1,
        opacity: 0.05,
        fill: false,
        interactive: false,
      });
      rect.addTo(gridLayer);
    }
  }
}

// event listener for zoom and panning
map.on("moveend zoomend", redrawGrid);
globalThis.addEventListener("resize", () => {
  // invalidateSize tells leaflet to recalculate map dimensions
  map.invalidateSize();
  redrawGrid();
});

// initial draw
redrawGrid();
