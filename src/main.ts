import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// --------------------------------- game constants & setup --------------------- //
const GAMEPLAY_ZOOM = 19;
const NEIGHBORHOOD_SIZE = 6;
const CACHE_SPAWN_PROBABILITY = 0.1;

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
document.body.append(mapWrap);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);
statusPanelDiv.innerHTML = "CLICK A CELL TO PICK UP A TOKEN AND BEGIN!";

// --------------------------------- map and player set up ----------------- //
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

// create custom panes for strict z ordering
map.createPane("neighbourhoodPane");
(map.getPane("neighbourhoodPane") as HTMLElement).style.zIndex = "650";

map.createPane("playerPane");
(map.getPane("playerPane") as HTMLElement).style.zIndex = "660";

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const playerMarker = leaflet.marker(RANDOM_LATLNG, { pane: "playerPane" })
  .addTo(map);
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
  setPlayerHolding: (v: number | null) => {
    playerHolding = v;
    if (v === 2048) endGame();
  },
  statusPanelDiv,
};

function generateTokenValue(token: string) {
  const exp = 1 + Math.floor(luck(token + ":v") * 10);
  return 2 ** exp; // generates values 1,2,4,8,16
}

function redrawGrid() {
  gridLayer.clearLayers(); // clear the grid layer
  neighborhoodLayer.clearLayers();

  const origin = RANDOM_LATLNG; // the fixed origin generated at the start of the program that the entire grid is aligned to
  const zoom = map.getZoom();
  const originPoint = map.project(origin, zoom); // convert origin to pixel coordinates
  const pxScreenBoundary = map.getPixelBounds(); // screen view boundary in pixels
  const pxCellSize = map.getZoom() * 2; // dynamic for later possible implementation of zooming in, out
  const playerPoint = map.project(playerMarker.getLatLng(), zoom); // use current player marker position
  const playerI = (playerPoint.y - originPoint.y) / pxCellSize; // player position horizontal and vertical in relative to the origin point
  const playerJ = (playerPoint.x - originPoint.x) / pxCellSize;

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

  // when drawing the neighbourhood rectangle use the pane option:
  const neighbourhoodRect = leaflet.rectangle(neighbourhoodBounds, {
    pane: "neighbourhoodPane",
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

      const allowed = Math.abs(i - playerI) < NEIGHBORHOOD_SIZE && // flag for interactibility
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
        bg.on("click", () => handleInteraction(tokenCtx, i, j, true));
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
    const { fillColor, strokeColor } = getColorsForTokenValue(tokenValue);

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

    cache.on("click", () => handleInteraction(ctx, i, j, allowed));
  }
}

function pickup(ctx: TokenContext, cell: string, tokenValue: number) {
  if (ctx.getPlayerHolding() === null) {
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
    return;
  }
  return;
}

function combine(
  ctx: TokenContext,
  cell: string,
  tokenValue: number,
  currentHolding: number,
) {
  if (currentHolding === tokenValue) {
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

    redrawGrid();
    return;
  } else {
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
}

function place(
  ctx: TokenContext,
  cell: string,
  currentHolding: number,
) {
  ctx.tokenMap.set(cell, currentHolding);

  if (currentHolding !== null) {
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
    redrawGrid();
  }
}

function handleInteraction(
  ctx: TokenContext,
  i: number,
  j: number,
  allowed = true,
) {
  const cell = `${i},${j}`;
  if (gameWon || !allowed) return;

  const hasToken = ctx.tokenMap.has(cell);
  const currentHolding = ctx.getPlayerHolding();

  if (hasToken) {
    const tokenValue = ctx.tokenMap.get(cell)!;

    if (currentHolding === null) {
      pickup(ctx, cell, tokenValue);
      return;
    }

    if (tokenValue > 1 && currentHolding !== null) {
      combine(ctx, cell, tokenValue, currentHolding);
      return;
    }
  } else if (!hasToken) {
    if (currentHolding === null) return;
    place(ctx, cell, currentHolding);
    return;
  }
}

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
  const pxCellSize = zoom * 2; // cell size is currently being calculated by zoom * 2
  const curLatLng = playerMarker.getLatLng();
  const curPoint = map.project(curLatLng, zoom);
  const newPoint = curPoint.add(
    leaflet.point(dx * pxCellSize, dy * pxCellSize), // convert current Latitude and Longitude to pixel coordinates to be translated by onscreen pixel value of 1 cell in given direction
  );
  const newLatLng = map.unproject(newPoint, zoom); // unproject the pixel coordinates to set new playerMarket position
  playerMarker.setLatLng(newLatLng);

  map.panTo(newLatLng);
  redrawGrid();
}

globalThis.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "ArrowDown") {
    move(0, 1);
  }
  if (event.key === "ArrowUp") {
    move(0, -1);
  }
  if (event.key === "ArrowLeft") {
    move(-1, 0);
  }
  if (event.key === "ArrowRight") {
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
