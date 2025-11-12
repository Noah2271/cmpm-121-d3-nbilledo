import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// --------------------------------- game constants --------------------- //
const GAMEPLAY_ZOOM = 19;
const NEIGHBORHOOD_SIZE = 6;
const CACHE_SPAWN_PROBABILITY = 0.1;

// --------------------------------- div elements --------------------- //
const Title_Card = document.createElement("div");
Title_Card.id = "titleCard";
document.body.append(Title_Card);
const _titleText = "WORLD OF BITS - COMBINE TO A VALUE OF 2048 TO WIN!";
Title_Card.innerHTML = _titleText
  .split("")
  .map((ch, idx) => {
    const char = ch === " " ? "&nbsp;" : ch;
    return `<span style="--delay:${(idx * 0.08).toFixed(2)}s">${char}</span>`;
  })
  .join("");

const mapDiv = document.createElement("div");
const mapWrap = document.createElement("div");
mapDiv.id = "map";
mapWrap.id = "mapWrap";
mapWrap.appendChild(mapDiv);

// small controls box to the left of the map
const controlsBox = document.createElement("div");
controlsBox.id = "controlsBox";
controlsBox.innerHTML = `
  <div class="controls-title">CONTROLS:</div>
  <div class="controls-text">MOVE WITH THE ARROW KEYS</div>
`;

// layout wrapper to hold controls + map side-by-side
const layout = document.createElement("div");
layout.id = "layout";
layout.appendChild(controlsBox);
layout.appendChild(mapWrap);

// append the layout (instead of appending mapWrap directly)
document.body.append(layout);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);
statusPanelDiv.innerHTML = "CLICK A CELL TO PICK UP A TOKEN AND BEGIN!";

// --------------------------------- map and player set up ----------------- //
const START_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

const map = leaflet.map(mapDiv, {
  center: START_LATLNG,
  zoom: GAMEPLAY_ZOOM,
  minZoom: GAMEPLAY_ZOOM,
  maxZoom: GAMEPLAY_ZOOM,
  keyboard: false, // no keyboard panning. Interferes with manual movement.
  zoomControl: false, // Not currently implemented, might not implement it.
  scrollWheelZoom: false,
});

// Panes for Z-ordering
map.createPane("neighbourhoodPane");
(map.getPane("neighbourhoodPane") as HTMLElement).style.zIndex = "650";

map.createPane("playerPane");
(map.getPane("playerPane") as HTMLElement).style.zIndex = "660";

const gridLayer = leaflet.layerGroup().addTo(map); // the actual gridlayer that tokens and empty spaces are drawn on
const neighborhoodLayer = leaflet.layerGroup().addTo(map); // additional layer on the map to indicate to the user their interactable area
const tokenMap = new Map<string, number>(); // map of i-j cell values and a token value used to draw tokens on the gridLayer
const pickedCells = new Set<string>(); // a set of i-j values that indicate which cells already had a token on it that has been grabbed.

const playerDivIcon = leaflet.divIcon({
  className: "player-div-icon",
  html: `<div class="player-sprite">
           <svg viewBox="0 0 24 24" width="20" height="20">
             <circle cx="12" cy="12" r="10" fill="#f9f9f9ff" stroke="#444444ff" stroke-width="4"/>
           </svg>
         </div>`,
  iconSize: [36, 36],
  iconAnchor: [10, 10],
});

const playerMarker = leaflet.marker(START_LATLNG, {
  icon: playerDivIcon,
  interactive: false,
  pane: "playerPane", // ensure marker renders in the player pane
}).addTo(map);

let playerHolding: number | null = null; // player holding state variable

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// --------------------------------- grid and token logic argument objects --------------------- //
// Argument objects for token logic
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
  setPlayerHolding: (v: number | null) => {
    playerHolding = v;
    const el = playerMarker.getElement?.() as HTMLElement | undefined;
    const circle = el?.querySelector?.("svg circle") as SVGCircleElement | null;
    if (circle) {
      if (v == null) {
        circle.setAttribute("fill", "#616362ff"); // default color when not holding
      } else {
        const { fillColor } = getColorsForTokenValue(v);
        circle.setAttribute("fill", fillColor);
      }
    }

    if (v === 2048) endGame();
  },
  statusPanelDiv,
};

// Argument objects for the grid environment
type GridEnvironment = {
  map: leaflet.Map;
  gridLayer: leaflet.LayerGroup;
  neighborhoodLayer: leaflet.LayerGroup;
  tokenCtx: TokenContext;
  origin: leaflet.LatLng;
  zoom: number;
  originPoint: leaflet.Point;
  pxScreenBoundary: leaflet.Bounds;
  pxCellSize: number;
};

const gridEnvironment: GridEnvironment = {
  map,
  gridLayer,
  neighborhoodLayer,
  tokenCtx,
  origin: START_LATLNG,
  zoom: map.getZoom(),
  originPoint: map.project(START_LATLNG, map.getZoom()),
  pxScreenBoundary: map.getPixelBounds(),
  pxCellSize: map.getZoom() * 2,
};

// Refreshes grid environment parameters, for use in redrawGrid()
function updateGridEnvironment() {
  const { zoom, originPoint, pxScreenBoundary, pxCellSize } = computeGridParams(
    gridEnvironment.map,
    gridEnvironment.origin,
  );
  gridEnvironment.zoom = zoom;
  gridEnvironment.originPoint = originPoint;
  gridEnvironment.pxScreenBoundary = pxScreenBoundary;
  gridEnvironment.pxCellSize = pxCellSize;
}

// --------------------------------- grid and token logic functions --------------------- //
// Calculate a random value 2-16 for a given token. Return the value.
function generateTokenValue(token: string) {
  const exp = 1 + Math.floor(luck(token + ":v") * 10);
  return 2 ** exp; // generates values 2,4,8,16
}

// Grab and return map grid values and computer cell size.
function computeGridParams(map: leaflet.Map, origin: leaflet.LatLng) {
  const zoom = map.getZoom();
  const originPoint = map.project(origin, zoom);
  const pxScreenBoundary = map.getPixelBounds();
  const pxCellSize = zoom * 2;
  return { zoom, originPoint, pxScreenBoundary, pxCellSize };
}

// compute player grid position using GridEnviroment
function computePlayerGridPosition(environment: GridEnvironment) {
  const map = environment.map;
  const playerPoint = map.project(playerMarker.getLatLng(), environment.zoom);
  const playerI = (playerPoint.y - environment.originPoint.y) /
    environment.pxCellSize;
  const playerJ = (playerPoint.x - environment.originPoint.x) /
    environment.pxCellSize;
  return { playerPoint, playerI, playerJ };
}

// Draws the active interactable radius around the player position.
function drawNeighbourhoodRect(
  environment: GridEnvironment,
  playerI: number,
  playerJ: number,
) {
  environment.neighborhoodLayer.clearLayers();
  const topLeft = environment.originPoint.add(
    leaflet.point(
      (playerJ - NEIGHBORHOOD_SIZE) * environment.pxCellSize,
      (playerI - NEIGHBORHOOD_SIZE) * environment.pxCellSize,
    ),
  );
  const bottomRight = environment.originPoint.add(
    leaflet.point(
      (playerJ + NEIGHBORHOOD_SIZE) * environment.pxCellSize,
      (playerI + NEIGHBORHOOD_SIZE) * environment.pxCellSize,
    ),
  );
  const bounds = leaflet.latLngBounds([
    environment.map.unproject(topLeft, environment.zoom),
    environment.map.unproject(bottomRight, environment.zoom),
  ]);
  const rect = leaflet.rectangle(bounds, {
    pane: "neighbourhoodPane",
    color: "#000000ff",
    weight: 2,
    fill: false,
    interactive: false,
    dashArray: "12 2",
    className: "neighbourhood-rect",
  });
  rect.addTo(environment.neighborhoodLayer);
}

// Draws a singular rectangle cell at the given i and j values.
function drawCellAndToken(
  environment: GridEnvironment,
  i: number,
  j: number,
  playerI: number,
  playerJ: number,
) {
  const topLeftPoint = environment.originPoint.add(
    leaflet.point(j * environment.pxCellSize, i * environment.pxCellSize),
  );
  const bottomRightPoint = environment.originPoint.add(
    leaflet.point(
      (j + 1) * environment.pxCellSize,
      (i + 1) * environment.pxCellSize,
    ),
  );
  const bounds = leaflet.latLngBounds([
    environment.map.unproject(topLeftPoint, environment.zoom),
    environment.map.unproject(bottomRightPoint, environment.zoom),
  ]);
  const allowed = Math.abs(i - playerI) < NEIGHBORHOOD_SIZE &&
    Math.abs(j - playerJ) < NEIGHBORHOOD_SIZE;

  const bg = leaflet.rectangle(bounds, {
    color: "#000000ff",
    weight: 1,
    opacity: 0.1,
    fill: true,
    fillOpacity: 0,
    interactive: allowed,
  });
  bg.addTo(environment.gridLayer);
  if (allowed) {
    bg.on("click", () => handleInteraction(environment, i, j, true));
  }

  generateAndUpdateTokens(environment, i, j, bounds, allowed);
}

// Calling function for drawCellAndToken, filling visible screen cells.
function iterateVisibleCellsAndDraw(
  environment: GridEnvironment,
  playerI: number,
  playerJ: number,
) {
  const { originPoint, pxScreenBoundary, pxCellSize } = environment;

  const jMin = Math.floor(
    (pxScreenBoundary.min!.x - originPoint.x) / pxCellSize,
  );
  const jMax = Math.floor(
    (pxScreenBoundary.max!.x - originPoint.x) / pxCellSize,
  );
  const iMin = Math.floor(
    (pxScreenBoundary.min!.y - originPoint.y) / pxCellSize,
  );
  const iMax = Math.floor(
    (pxScreenBoundary.max!.y - originPoint.y) / pxCellSize,
  );

  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      drawCellAndToken(environment, i, j, playerI, playerJ);
    }
  }
}

// Main redraw function for movement or zoom, zoom not implemented
function redrawGrid() {
  gridLayer.clearLayers();

  // update computed values on the shared env object instead of building a new one
  updateGridEnvironment();
  const { playerI, playerJ } = computePlayerGridPosition(gridEnvironment);
  // use a single rounded player cell index for both the neighbourhood box and the allowed checks
  const playerCellI = Math.round(playerI);
  const playerCellJ = Math.round(playerJ);

  if (playerHolding != null) {
    drawNeighbourhoodRect(gridEnvironment, playerCellI, playerCellJ);
  }
  iterateVisibleCellsAndDraw(gridEnvironment, playerCellI, playerCellJ);
}

// Function for deciding whether to generate a token in a cell, and drawing it if so
function generateAndUpdateTokens(
  environment: GridEnvironment,
  i: number,
  j: number,
  bounds: leaflet.LatLngBounds,
  allowed = true,
) {
  const ctx = environment.tokenCtx;
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
    const { fillColor, strokeColor } = getColorsForTokenValue(tokenValue);
    const stroke = allowed ? 6 : 4;
    const insetPx = Math.max(0, stroke / 2);
    const tokenBounds = insetBounds(environment, bounds, insetPx) || bounds;

    const cache = leaflet.rectangle(tokenBounds, {
      color: allowed ? strokeColor : "#342e2eff",
      weight: stroke,
      fill: true,
      fillColor: allowed ? fillColor : "#888888",
      fillOpacity: 0.9,
      interactive: allowed,
      className: allowed ? "rect-allowed" : "rect-default",
    });
    cache.bindTooltip(String(tokenValue), {
      permanent: true,
      direction: "center",
      className: "cell-value-tooltip",
    });

    cache.addTo(ctx.gridLayer);
    cache.on("click", () => handleInteraction(environment, i, j, allowed));
  }
}

// helper function to insert cell stroke. Minimizes overlapping for interactable cells
function insetBounds(
  environment: GridEnvironment,
  bounds: leaflet.LatLngBounds,
  insetPx: number,
): leaflet.LatLngBounds {
  if (!insetPx || insetPx <= 0) return bounds;
  const z = environment.map.getZoom();
  const nw = bounds.getNorthWest();
  const se = bounds.getSouthEast();
  const nwPt = environment.map.project(nw, z);
  const sePt = environment.map.project(se, z);
  const nwAdj = nwPt.add(leaflet.point(insetPx, insetPx));
  const seAdj = sePt.subtract(leaflet.point(insetPx, insetPx));

  if (seAdj.x <= nwAdj.x || seAdj.y <= nwAdj.y) {
    return bounds;
  }
  return leaflet.latLngBounds(
    environment.map.unproject(nwAdj, z),
    environment.map.unproject(seAdj, z),
  );
}

// --------------------------------- interaction logic --------------------- //
// Player pickup logic
function pickup(
  environment: GridEnvironment,
  cell: string,
  tokenValue: number,
) {
  const ctx = environment.tokenCtx;
  if (ctx.getPlayerHolding() !== null) return;
  ctx.setPlayerHolding(tokenValue);
  ctx.tokenMap.delete(cell);
  ctx.pickedCells.add(cell);
  if (tokenValue === 2048) {
    redrawGrid();
    endGame();
    return;
  }
  ctx.statusPanelDiv.innerHTML = `
      <div style="text-align:center;">
        <div style="color:${getColorsForTokenValue(tokenValue).fillColor};">
          HOLDING: ${String(tokenValue)}
        </div>
        <div>CLICK TO PLACE ON AN EMPTY CELL OR MERGE WITH AN IDENTICAL CELL</div>
      </div>
    `;
  redrawGrid();
}

// Player combine logic
function combine(
  environment: GridEnvironment,
  cell: string,
  tokenValue: number,
  currentHolding: number,
) {
  const ctx = environment.tokenCtx;
  if (currentHolding !== tokenValue) {
    ctx.statusPanelDiv.innerHTML = `
      <div style="text-align:center;">
        <div style="color:${
      getColorsForTokenValue(currentHolding).fillColor
    };">HOLDING: ${String(currentHolding)}</div>
        <div style="color:${
      getColorsForTokenValue(tokenValue).fillColor
    };">CANNOT COMBINE WITH CELL: ${String(tokenValue)}</div>
      </div>
    `;
    return;
  }
  const combined = tokenValue * 2;
  ctx.tokenMap.set(cell, combined);
  ctx.setPlayerHolding(null);
  ctx.statusPanelDiv.innerHTML = `
      <div style="text-align:center;">
        <div>HOLDING: X</div>
        <div style="color:${getColorsForTokenValue(combined).fillColor};">
          YOU'VE COMBINED TWO CELLS TO CREATE: ${String(combined)}
        </div>
      </div>
    `;

  // combine animation player
  const st = ctx.statusPanelDiv;
  st.classList.remove("status-anim");
  void st.offsetWidth;
  st.classList.add("status-anim");
  st.addEventListener(
    "animationend",
    () => st.classList.remove("status-anim"),
    { once: true },
  );

  const mapElement = document.getElementById("map");
  if (mapElement) {
    mapElement.classList.remove("mapPulse");
    void mapElement.offsetWidth;
    mapElement.classList.add("mapPulse");
    mapElement.addEventListener(
      "animationend",
      () => mapElement.classList.remove("mapPulse"),
      { once: true },
    );
  }

  environment.neighborhoodLayer.clearLayers();
  redrawGrid();
}

// Player place logic
function place(
  environment: GridEnvironment,
  cell: string,
  currentHolding: number,
) {
  const ctx = environment.tokenCtx;
  if (currentHolding == null) return;
  ctx.tokenMap.set(cell, currentHolding);
  ctx.setPlayerHolding(null);
  ctx.pickedCells.delete(cell);
  ctx.statusPanelDiv.innerHTML = `
    <div style="text-align:center;">
      <div>HOLDING: X</div>
      <div style="color:${getColorsForTokenValue(currentHolding).fillColor};">
        YOU PLACED DOWN CELL: ${String(currentHolding)}
      </div>
    </div>
  `;
  environment.neighborhoodLayer.clearLayers();
  redrawGrid();
}

// Main interaction handler
function handleInteraction(
  environment: GridEnvironment,
  i: number,
  j: number,
  allowed = true,
) {
  const ctx = environment.tokenCtx;
  const cell = `${i},${j}`;
  if (gameWon || !allowed) return;

  const hasToken = ctx.tokenMap.has(cell);
  const currentHolding = ctx.getPlayerHolding();

  if (hasToken) {
    const tokenValue = ctx.tokenMap.get(cell)!;
    if (currentHolding === null) {
      pickup(environment, cell, tokenValue);
      return;
    }
    combine(environment, cell, tokenValue, currentHolding);
    return;
  }

  // empty cell -> place if holding something
  if (!hasToken && currentHolding !== null) {
    place(environment, cell, currentHolding);
    return;
  }
}

// Tile colormapping logic
function getColorsForTokenValue(tokenValue: number) {
  const exp = Math.log2(tokenValue);
  // index 0 -> value 2 (2^1)
  const index = Math.max(0, Math.floor(exp) - 1);

  const palette: { fill: string; stroke: string }[] = [
    { fill: "#e4db82ff", stroke: "#b59f00" }, // 2
    { fill: "#ff9800", stroke: "#b25500" }, // 4
    { fill: "#f44336", stroke: "#b71c1c" }, // 8
    { fill: "#4caf50", stroke: "#1b5e20" }, // 16
    { fill: "#2196f3", stroke: "#0b79d0" }, // 32
    { fill: "#9c27b0", stroke: "#6a1b9a" }, // 64
    { fill: "#00bcd4", stroke: "#007c91" }, // 128
    { fill: "#ff5722", stroke: "#b23b12" }, // 256
    { fill: "#8bc34a", stroke: "#558b2f" }, // 512
    { fill: "#ffc107", stroke: "#ff6f00" }, // 1024
    { fill: "#e91e63", stroke: "#880e4fff" }, // 2048
  ];

  if (index < palette.length) {
    return {
      fillColor: palette[index].fill,
      strokeColor: palette[index].stroke,
    };
  }
  return { fillColor: "#000000", strokeColor: "#000000" }; // not implementing past 2048 should never reach this unless the end state broken
}

// --------------------------------- player movement --------------------- //
function move(dx: number, dy: number): void {
  const zoom = map.getZoom();
  const pxCellSize = zoom * 2;
  const curLatLng = playerMarker.getLatLng();
  const curPoint = map.project(curLatLng, zoom);
  const newPoint = curPoint.add(
    leaflet.point(dx * pxCellSize, dy * pxCellSize),
  );
  const newLatLng = map.unproject(newPoint, zoom);
  playerMarker.setLatLng(newLatLng);

  map.panTo(newLatLng);
  redrawGrid();
}

globalThis.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "ArrowDown" && !gameWon) {
    move(0, 1);
  }
  if (event.key === "ArrowUp" && !gameWon) {
    move(0, -1);
  }
  if (event.key === "ArrowLeft" && !gameWon) {
    move(-1, 0);
  }
  if (event.key === "ArrowRight" && !gameWon) {
    move(1, 0);
  }
});
// --------------------------------- end state --------------------- //
let gameWon = false;
function endGame() {
  if (gameWon) return;
  gameWon = true;

  // rebuild title with per-letter spans so existing animations still apply
  const winText = "YOU WIN! PRESS R TO RESTART";
  Title_Card.innerHTML = winText
    .split("")
    .map((ch, idx) => {
      const char = ch === " " ? "&nbsp;" : ch;
      return `<span style="--delay:${(idx * 0.08).toFixed(2)}s">${char}</span>`;
    })
    .join("");

  statusPanelDiv.innerHTML = `
    <div style="text-align:center;">
      <div style="color:#880e4fff;">
        YOU'VE REACHED 2048!
      </div>
      <div>Press R to restart the game</div>
    </div>
  `;
  const restartHandler = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === "r") {
      location.reload();
    }
  };
  globalThis.addEventListener("keydown", restartHandler, { once: true });
}

// --------------------------------- main game loop --------------------- //
map.on("moveend zoomend", redrawGrid);
globalThis.addEventListener("resize", () => {
  // invalidateSize tells leaflet to recalculate map dimensions
  map.invalidateSize();
  redrawGrid();
});

// initial draw
redrawGrid();
