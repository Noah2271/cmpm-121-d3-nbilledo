import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// --------------------------------- game constants & setup --------------------- //
const GAMEPLAY_ZOOM = 19;
const NEIGHBORHOOD_SIZE = 6;
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
/*const RANDOM_LATLNG = (() => {
  const lat = Math.random() * 180 - 90;
  const lng = Math.random() * 360 - 180;
  return leaflet.latLng(lat, lng);
})(); */

const RANDOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

const map = leaflet.map(mapDiv, {
  center: RANDOM_LATLNG,
  zoom: GAMEPLAY_ZOOM,
  minZoom: GAMEPLAY_ZOOM,
  maxZoom: GAMEPLAY_ZOOM,
  zoomControl: false, // Not currently implemented, might not implement it.
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

const gridLayer = leaflet.layerGroup().addTo(map); // the actual gridlayer that tokens and empty spaces are drawn on
const neighborhoodLayer = leaflet.layerGroup().addTo(map); // additional layer on the map to indicate to the user their interactable area
const tokenMap = new Map<string, number>(); // map of i-j cell values and a token value used to draw tokens on the gridLayer
const pickedCells = new Set<string>(); // a set of i-j values that indicate which cells already had a token on it that has been grabbed.
let playerHolding: number | null = null; // player holding state variable

type TokenContext = { // argument objects for token logic
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

function generateTokenValue(token: string) {
  const exp = Math.floor(luck(token + ":v") * 5);
  return 2 ** exp; // generates values 1,2,4,8,16
}

function redrawGrid() {
  gridLayer.clearLayers(); // clear the grid layer

  const origin = RANDOM_LATLNG; // the fixed origin generated at the start of the program that the entire grid is aligned to
  const zoom = map.getZoom();
  const originPoint = map.project(origin, zoom); // convert origin to pixel coordinates
  const pxScreenBoundary = map.getPixelBounds(); // screen view boundary in pixels
  const pxCellSize = map.getZoom() * 2; // dynamic for later possible implementation of zooming in, out
  const playerPoint = map.project(RANDOM_LATLNG, zoom); // player spawn position to pixel coordinates at the current zoom level.
  const playerI = Math.floor((playerPoint.y - originPoint.y) / pxCellSize); // player position horizontal and vertical in relative to the origin point
  const playerJ = Math.floor((playerPoint.x - originPoint.x) / pxCellSize);

  // create boundary around the player
  const boundaryTopLeft = originPoint.add( // calculate boundaries relative to current size of boxes
    leaflet.point(
      (playerJ - NEIGHBORHOOD_SIZE) * pxCellSize,
      (playerI - NEIGHBORHOOD_SIZE) * pxCellSize,
    ),
  );

  const boundaryBottomRight = originPoint.add(
    leaflet.point(
      (playerJ + NEIGHBORHOOD_SIZE) * pxCellSize,
      (playerI + NEIGHBORHOOD_SIZE) * pxCellSize,
    ),
  );

  const neighbourhoodBounds = leaflet.latLngBounds([ // convert back to coordinates for leaflet to draw boundary rectangle
    map.unproject(boundaryTopLeft, zoom),
    map.unproject(boundaryBottomRight, zoom),
  ]);

  const neighbourhoodRect = leaflet.rectangle(neighbourhoodBounds, {
    color: "#000000ff",
    weight: 2,
    fill: false,
    interactive: false,
    dashArray: "5 5",
  });
  neighbourhoodRect.addTo(neighborhoodLayer); // draw the rectangle on the layer

  const jMin = Math.floor(
    (pxScreenBoundary.min!.x - originPoint.x) / pxCellSize, // calculate column indices for visible cells to origin
  );
  const jMax = Math.floor(
    (pxScreenBoundary.max!.x - originPoint.x) / pxCellSize,
  );
  const iMin = Math.floor(
    (pxScreenBoundary.min!.y - originPoint.y) / pxCellSize, // calculate row indices for visible cells relative to origin
  );
  const iMax = Math.floor(
    (pxScreenBoundary.max!.y - originPoint.y) / pxCellSize,
  );

  for (let i = iMin; i <= iMax; i++) { // iterate through the visible cells
    for (let j = jMin; j <= jMax; j++) {
      const topLeftPoint = originPoint.add( // calculate cell top left and right bottom boundaries before converting back to coordinate positions to be drawn by leaflet
        leaflet.point(j * pxCellSize, i * pxCellSize),
      );
      const bottomRightPoint = originPoint.add(
        leaflet.point((j + 1) * pxCellSize, (i + 1) * pxCellSize),
      );

      const bounds = leaflet.latLngBounds([
        map.unproject(topLeftPoint, zoom),
        map.unproject(bottomRightPoint, zoom),
      ]);

      const allowed = Math.abs(i - playerI) <= NEIGHBORHOOD_SIZE && // flag for interactibility
        Math.abs(j - playerJ) <= NEIGHBORHOOD_SIZE; // condition: if player's horizontal and vertical distance from a cell is not greater than neighborhood size.

      const bg = leaflet.rectangle(bounds, {
        color: "#000000ff",
        weight: 1,
        opacity: 0.1,
        fill: true,
        fillOpacity: 0,
        interactive: allowed,
      });
      bg.addTo(gridLayer);

      // allow placing/combining on empty cells as well
      if (allowed) {
        bg.on("click", () => placeGrabOrCombine(tokenCtx, i, j, true));
      }

      generateAndUpdateTokens(tokenCtx, i, j, bounds, allowed);
    }
  }
}

function generateAndUpdateTokens(
  ctx: TokenContext,
  i: number,
  j: number,
  bounds: leaflet.LatLngBounds,
  allowed = true,
) {
  const token = `${i},${j}`;

  if (
    // if current i and j cell does not have a token, small chance one is generated
    !ctx.tokenMap.has(token) &&
    !ctx.pickedCells.has(token) &&
    luck(token) < CACHE_SPAWN_PROBABILITY
  ) {
    ctx.tokenMap.set(token, generateTokenValue(token)); // generate and set token value
  }

  if (ctx.tokenMap.has(token)) { // if the cell has a token generated, draw it
    const tokenValue = ctx.tokenMap.get(token)!;
    let fillColor = "#cccccc";
    let strokeColor = "#ffffffff";
    switch (tokenValue) { // different colors for different token values
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
      interactive: allowed,
    });

    cache.bindTooltip(String(tokenValue), { // indicator for token value
      permanent: true,
      direction: "center",
      className: "cell-value-tooltip",
    });

    cache.addTo(ctx.gridLayer); // draw the token cell on the grid layer

    cache.on("click", () => placeGrabOrCombine(ctx, i, j, allowed));
  }
}

function placeGrabOrCombine(
  ctx: TokenContext,
  i: number,
  j: number,
  allowed = true,
) {
  const cell = `${i},${j}`;
  if (!allowed) {
    return;
  }

  const holding = ctx.getPlayerHolding();
  const hasToken = ctx.tokenMap.has(cell);

  // If there's a token at the cell -> pickup or combine
  if (hasToken) {
    const tokenValue = ctx.tokenMap.get(cell)!;

    // pick up when hands empty
    if (holding === null) {
      ctx.setPlayerHolding(tokenValue);
      ctx.tokenMap.delete(cell);
      ctx.pickedCells.add(cell);
      ctx.statusPanelDiv.innerText = "Holding: " + String(tokenValue);
      redrawGrid();
      return;
    }

    // combine if identical
    if (holding === tokenValue) {
      const combined = tokenValue * 2;
      ctx.tokenMap.set(cell, combined);
      ctx.setPlayerHolding(null);
      ctx.statusPanelDiv.innerText = "Combined to: " + String(combined);
      redrawGrid();
      return;
    }

    // otherwise refuse
    ctx.statusPanelDiv.innerText = "Already holding: " + String(holding);
    return;
  }

  // No token present
  if (holding === null) {
    return;
  }
  ctx.tokenMap.set(cell, holding);
  ctx.pickedCells.delete(cell);
  ctx.statusPanelDiv.innerText = "Placed down token: " + String(holding);
  ctx.setPlayerHolding(null);
  redrawGrid();
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
