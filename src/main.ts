import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// --------------------------------- game constants & setup --------------------- //
const GAMEPLAY_ZOOM = 19;
//const TILE_DEGREES = 1e-4; Might not need TILE_DEGREES
//const NEIGHBORHOOD_SIZE = 8;
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
statusPanelDiv.innerHTML = "Click a cell to pick up a token and begin! ";

// --------------------------------- map and player set up ----------------- //
const RANDOM_LATLNG = (() => {
  const lat = Math.random() * 180 - 90;
  const lng = Math.random() * 360 - 180;
  return leaflet.latLng(lat, lng);
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

// --------------------------------- grid and token logic --------------------- //

function generateTokenValue(token: string) {
  const exp = Math.floor(luck(token + ":v") * 5);
  return 2 ** exp;
}

const gridLayer = leaflet.layerGroup().addTo(map);
const tokenMap = new Map<string, number>();
const pickedCells = new Set<string>();
let playerHolding: number | null = null;

type TokenContext = {
  gridLayer: leaflet.LayerGroup;
  tokenMap: Map<string, number>;
  pickedCells: Set<string>;
  getPlayerHolding: () => number | null;
  setPlayerHolding: (v: number | null) => void;
  statusPanelDiv: HTMLElement;
};

const tokenCtx: TokenContext = {
  gridLayer,
  tokenMap,
  pickedCells,
  getPlayerHolding: () => playerHolding,
  setPlayerHolding: (v) => (playerHolding = v),
  statusPanelDiv,
};

function redrawGrid() {
  gridLayer.clearLayers();

  const origin = RANDOM_LATLNG;
  const zoom = map.getZoom();
  const originPoint = map.project(origin, zoom);

  const pixelBounds = map.getPixelBounds();

  const pixelSize = 40;
  const jMin = Math.floor((pixelBounds.min!.x - originPoint.x) / pixelSize);
  const jMax = Math.floor((pixelBounds.max!.x - originPoint.x) / pixelSize);
  const iMin = Math.floor((pixelBounds.min!.y - originPoint.y) / pixelSize);
  const iMax = Math.floor((pixelBounds.max!.y - originPoint.y) / pixelSize);

  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const topLeftPoint = originPoint.add(
        leaflet.point(j * pixelSize, i * pixelSize),
      );
      const bottomRightPoint = originPoint.add(
        leaflet.point((j + 1) * pixelSize, (i + 1) * pixelSize),
      );

      const bounds = leaflet.latLngBounds([
        map.unproject(topLeftPoint, zoom),
        map.unproject(bottomRightPoint, zoom),
      ]);

      const bg = leaflet.rectangle(bounds, {
        color: "#000000ff",
        weight: 1,
        opacity: 0.05,
        fill: false,
        interactive: true,
      });
      bg.addTo(gridLayer);

      updateTokenAtCell(tokenCtx, i, j, bounds);
    }
  }
}

function updateTokenAtCell(
  ctx: TokenContext,
  i: number,
  j: number,
  bounds: leaflet.LatLngBounds,
) {
  const token = `${i},${j}`;

  if (
    !ctx.tokenMap.has(token) &&
    !ctx.pickedCells.has(token) &&
    luck(token) < CACHE_SPAWN_PROBABILITY
  ) {
    ctx.tokenMap.set(token, generateTokenValue(token));
  }

  if (ctx.tokenMap.has(token)) {
    const tokenValue = ctx.tokenMap.get(token)!;
    let fillColor = "#cccccc";
    let strokeColor = "#ffffffff";
    switch (tokenValue) {
      case 1:
        fillColor = "#2196f3";
        strokeColor = "#0b79d0";
        break;
      case 2:
        fillColor = "#b7a60eff";
        strokeColor = "#685e13ff";
        break;
      case 4:
        fillColor = "#ff9800";
        strokeColor = "#b25500";
        break;
      case 8:
        fillColor = "#f44336";
        strokeColor = "#b71c1c";
        break;
      case 16:
        fillColor = "#4caf50";
        strokeColor = "#1b5e20";
        break;
    }

    const cache = leaflet.rectangle(bounds, {
      color: strokeColor,
      weight: 2,
      fill: true,
      fillColor,
      fillOpacity: 0.9,
    });

    cache.bindTooltip(String(tokenValue), {
      permanent: true,
      direction: "center",
      className: "cell-value-tooltip",
    });

    cache.addTo(ctx.gridLayer);

    cache.on("click", () => {
      const holding = ctx.getPlayerHolding();

      if (holding === null) {
        ctx.setPlayerHolding(tokenValue);
        ctx.tokenMap.delete(token);
        ctx.pickedCells.add(token);
        ctx.statusPanelDiv.innerText = "Holding: " + String(tokenValue);
        redrawGrid();
      } else {
        ctx.statusPanelDiv.innerText = "Already Holding: " + String(holding);
      }
    });
  }
}

// ---------------- game loop ---------------- //
map.on("moveend zoomend", redrawGrid);
globalThis.addEventListener("resize", () => {
  // invalidateSize tells leaflet to recalculate map dimensions
  map.invalidateSize();
  redrawGrid();
});

// initial draw
redrawGrid();
