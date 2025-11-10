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
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);
statusPanelDiv.innerHTML = "CLICK A CELL TO PICK UP A TOKEN AND BEGIN!";

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
  setPlayerHolding: (v) => (playerHolding = v),
  statusPanelDiv,
};

function generateTokenValue(token: string) {
  const exp = 1 + Math.floor(luck(token + ":v") * 8);
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

    // combine if identical
    if (holding === tokenValue) {
      const combined = tokenValue * 2;
      ctx.tokenMap.set(cell, combined);
      ctx.setPlayerHolding(null);
      ctx.statusPanelDiv.innerHTML = `
      <div style="text-align:center;">
        <div>HOLDING: X</div>
        <div style="color:${
        getColorsForTokenValue(combined).fillColor
      };">YOU'VE COMBINED TWO CELLS TO CREATE: ${String(combined)}</div>
      </div>
    `;
      redrawGrid();
      return;
    }

    // otherwise refuse
    ctx.statusPanelDiv.innerHTML = `
      <div style="text-align:center;">
        <div style="color:${
      getColorsForTokenValue(holding).fillColor
    };">HOLDING: ${String(holding)}</div>
        <div style="color:${
      getColorsForTokenValue(tokenValue).fillColor
    };">CANNOT COMBINE WITH CELL: ${String(tokenValue)}</div>
      </div>
    `;
    return;
  }

  // No token present
  if (holding === null) {
    return;
  }
  ctx.tokenMap.set(cell, holding);
  ctx.setPlayerHolding(null);
  ctx.pickedCells.delete(cell);
  ctx.statusPanelDiv.innerHTML = `
  <div style="text-align:center;">
    <div>HOLDING: X</div>
    <div style="color:${getColorsForTokenValue(holding).fillColor};">
      YOU PLACED DOWN CELL: ${String(holding)}
    </div>
  </div>
`;
  redrawGrid();
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
    { fill: "#e91e63", stroke: "#880e4f" }, // 2048
  ];

  if (index < palette.length) {
    return {
      fillColor: palette[index].fill,
      strokeColor: palette[index].stroke,
    };
  }
  return { fillColor: "#000000", strokeColor: "#000000" }; // not implementing past 2048 should never reach this unless the end state broken
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
