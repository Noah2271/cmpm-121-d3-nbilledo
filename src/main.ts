import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// --------------------------------- game constants --------------------- //
const GAMEPLAY_ZOOM = 19;
const NEIGHBORHOOD_SIZE = 4;
const CACHE_SPAWN_PROBABILITY = 0.1;
let playerHolding: number | null = null;
let gameWon = false;

// --------------------------------- div elements --------------------- //
// mobile support
const viewport = document.createElement("meta");
viewport.name = "viewport";
viewport.content =
  "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
document.head.appendChild(viewport);

const Title_Card = document.createElement("div");
const mapDiv = document.createElement("div");
const mapWrap = document.createElement("div");
const controlsBox = document.createElement("div");
const layout = document.createElement("div");
const statusPanelDiv = document.createElement("div");
const _titleText = "WORLD OF BITS - COMBINE TO A VALUE OF 2048 TO WIN!";
Title_Card.innerHTML = _titleText
  .split("")
  .map((ch, idx) => {
    const char = ch === " " ? "&nbsp;" : ch;
    return `<span style="--delay:${(idx * 0.08).toFixed(2)}s">${char}</span>`;
  })
  .join("");

Title_Card.id = "titleCard";
mapDiv.id = "map";
mapWrap.id = "mapWrap";
controlsBox.id = "controlsBox";
layout.id = "layout";
statusPanelDiv.id = "statusPanel";
document.body.append(Title_Card);
document.body.append(layout);
document.body.append(statusPanelDiv);
mapWrap.appendChild(mapDiv);
layout.appendChild(mapWrap);
layout.appendChild(controlsBox);

controlsBox.innerHTML = `
  <div class="controls-title">CONTROLS</div>
  <div id = "moveControls">
  <button id = "move-up"> UP</button>
  <div>
  <button id = "move-left"> LEFT</button><button id = "move-right"> RIGHT</button>
  </div>
  <button id = "move-down"> DOWN</button>
  </div>
  <br>
  <button id = "restart"> RESTART GAME</button>
`;

// --------------------------------- map and player set up ----------------- //
const DEFAULT_LAT = 33.94745; // mcdonald's location
const DEFAULT_LNG = -118.11787;

navigator.geolocation.getCurrentPosition(
  (position) => { // if given permission, use real-world location as the spawn point.
    const { latitude, longitude } = position.coords;
    initGame(latitude, longitude);
  },
  (_error) => { // else pass in the default mcdonalds location
    initGame(DEFAULT_LAT, DEFAULT_LNG);
  },
);

function initGame(latitude: number, longitude: number) {
  const START_LATLNG = leaflet.latLng(
    latitude,
    longitude,
  );

  const map = leaflet.map(mapDiv, {
    center: START_LATLNG,
    zoom: GAMEPLAY_ZOOM,
    zoomControl: false,
    minZoom: GAMEPLAY_ZOOM,
    maxZoom: GAMEPLAY_ZOOM,
    keyboard: false,
  });
  // --------------------------------- real-world player tracking --------------------- //
  let lastLatLng = START_LATLNG;

  if (navigator.geolocation) { // only track if the browser has support/permission for locational tracking.
    navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const newLatLng = leaflet.latLng(latitude, longitude);

        const movedDistance = map.distance(lastLatLng, newLatLng);

        const cellSizePx = gridEnvironment.pxCellSize;
        const cellMeters = map.containerPointToLatLng([cellSizePx, 0])
          .distanceTo(map.containerPointToLatLng([0, 0]));

        playerMarker.setLatLng(newLatLng);
        if (movedDistance >= cellMeters) { // every time the player moves a cell in any direction, refresh the screen and player position.
          map.panTo(newLatLng);
          lastLatLng = newLatLng;
          redrawGrid();
        }
      },
    );
  }

  // --------------------------------- map layers and data structures --------------------- //
  const gridLayer = leaflet.layerGroup().addTo(map);
  const neighborhoodLayer = leaflet.layerGroup().addTo(map);
  const tokenMap = new Map<string, number>();
  const pickedCells = new Set<string>();

  // Panes for Z-ordering
  map.createPane("neighbourhoodPane");
  (map.getPane("neighbourhoodPane") as HTMLElement).style.zIndex = "650";

  map.createPane("playerPane");
  (map.getPane("playerPane") as HTMLElement).style.zIndex = "660";

  leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: GAMEPLAY_ZOOM,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // --------------------------------- player marker --------------------- //
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
    pane: "playerPane",
  }).addTo(map);

  // --------------------------------- grid and token logic argument objects --------------------- //
  type TokenContext = { // argument object for token interaction functions
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
      const PlayerElement = playerMarker.getElement?.() as
        | HTMLElement
        | undefined;
      const circle = PlayerElement?.querySelector?.("svg circle") as
        | SVGCircleElement
        | null;
      if (circle) {
        if (v == null) {
          circle.setAttribute("fill", "#f8fcfaff"); // default color when not holding
        } else {
          const { fillColor } = getColorsForTokenValue(v);
          circle.setAttribute("fill", fillColor);
        }
      }
    },
    statusPanelDiv,
  };

  type GridEnvironment = { // argument object for grid drawing functions
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

  // --------------------------------- helper functions --------------------- //
  // helper function for getting latlng bounds from pixel bounds
  function toLatLngBoundaries(
    environment: GridEnvironment,
    topLeft: leaflet.PointExpression,
    bottomRight: leaflet.PointExpression,
  ) {
    return (leaflet.latLngBounds([
      environment.map.unproject(topLeft, environment.zoom),
      environment.map.unproject(bottomRight, environment.zoom),
    ]));
  }

  // helper function to play combine animation
  function playCombineAnimation(ctx: typeof tokenCtx) {
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
  }

  // helper function to inset stroke bounds by pixel amount
  function insetBounds(
    { map }: GridEnvironment,
    bounds: leaflet.LatLngBounds,
    insetPixels: number,
  ): leaflet.LatLngBounds {
    const topLeftPx = map.project(bounds.getNorthWest(), map.getZoom());
    const bottomRightPx = map.project(bounds.getSouthEast(), map.getZoom());
    const insetOffset = leaflet.point(insetPixels, insetPixels);
    const insetTopLeftPx = topLeftPx.add(insetOffset);
    const insetBottomRightPx = bottomRightPx.subtract(insetOffset);
    const insetTopLeft = map.unproject(insetTopLeftPx, map.getZoom());
    const insetBottomRight = map.unproject(insetBottomRightPx, map.getZoom());
    return leaflet.latLngBounds(insetTopLeft, insetBottomRight);
  }

  // --------------------------------- token color palette --------------------- //
  const TOKEN_COLOR_PALETTE: ReadonlyArray<{
    value: number;
    fill: string;
    stroke: string;
  }> = [
    { value: 2, fill: "#e4db82ff", stroke: "#b59f00" },
    { value: 4, fill: "#ff9800", stroke: "#b25500" },
    { value: 8, fill: "#f44336", stroke: "#b71c1c" },
    { value: 16, fill: "#4caf50", stroke: "#1b5e20" },
    { value: 32, fill: "#2196f3", stroke: "#0b79d0" },
    { value: 64, fill: "#9c27b0", stroke: "#6a1b9a" },
    { value: 128, fill: "#00bcd4", stroke: "#007c91" },
    { value: 256, fill: "#ff5722", stroke: "#b23b12" },
    { value: 512, fill: "#8bc34a", stroke: "#558b2f" },
    { value: 1024, fill: "#ffc107", stroke: "#ff6f00" },
    { value: 2048, fill: "#e91e63", stroke: "#880e4fff" },
  ] as const;

  function getColorsForTokenValue(tokenValue: number) {
    // iterate through shared palette instead of calculating index
    for (const entry of TOKEN_COLOR_PALETTE) {
      if (entry.value === tokenValue) {
        return {
          fillColor: entry.fill,
          strokeColor: entry.stroke,
        };
      }
    }
    return { fillColor: "#000000", stroke: "#000000" };
  }

  // --------------------------------- grid and token logic functions --------------------- //
  // token value generator, takes 2 and raises it to powers resulting values up to 16
  function generateTokenValue(token: string) {
    const exp = 1 + Math.floor(luck(token + ":v") * 4);
    return 2 ** exp; // generates values 2,4,8,16
  }

  // compute player grid position using relative to the origin point, using cell size as units
  function computePlayerGridPosition(environment: GridEnvironment) {
    const playerPoint = environment.map.project(
      playerMarker.getLatLng(),
      environment.zoom,
    );
    const playerI = (playerPoint.y - environment.originPoint.y) /
      environment.pxCellSize;
    const playerJ = (playerPoint.x - environment.originPoint.x) /
      environment.pxCellSize;
    return { playerPoint, playerI, playerJ };
  }

  // draws the active interactable radius around the player position
  function drawNeighbourhoodRect(
    environment: GridEnvironment,
    playerI: number,
    playerJ: number,
  ) {
    environment.neighborhoodLayer.clearLayers();

    const topLeft = environment.originPoint.add(
      leaflet.point(
        (playerJ - NEIGHBORHOOD_SIZE + 1) * environment.pxCellSize,
        (playerI - NEIGHBORHOOD_SIZE + 1) * environment.pxCellSize,
      ),
    );

    const bottomRight = environment.originPoint.add(
      leaflet.point(
        (playerJ + NEIGHBORHOOD_SIZE) * environment.pxCellSize,
        (playerI + NEIGHBORHOOD_SIZE) * environment.pxCellSize,
      ),
    );

    const InteractableBounds = toLatLngBoundaries(
      environment,
      topLeft,
      bottomRight,
    );

    const rect = leaflet.rectangle(InteractableBounds, {
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

  // draws a single regular cell on the grid and if it is is within player range of interaction.
  function drawCell(
    environment: GridEnvironment,
    i: number,
    j: number,
    playerI: number,
    playerJ: number,
  ) {
    const topLeft = environment.originPoint.add(
      leaflet.point(j * environment.pxCellSize, i * environment.pxCellSize),
    );
    const bottomRight = environment.originPoint.add(
      leaflet.point(
        (j + 1) * environment.pxCellSize,
        (i + 1) * environment.pxCellSize,
      ),
    );

    const bounds = toLatLngBoundaries(environment, topLeft, bottomRight);
    const allowed = Math.abs(i - Math.round(playerI)) < NEIGHBORHOOD_SIZE &&
      Math.abs(j - Math.round(playerJ)) < NEIGHBORHOOD_SIZE;

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

    generateAndUpdateTokens(environment, i, j, bounds, allowed); // pass the cell location to token generator and drawer
  }

  // main cell drawing loop for all visible cells within the current visible boundaries
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
        drawCell(environment, i, j, playerI, playerJ);
      }
    }
  }

  // main redraw function called on player movement and game state changes
  function redrawGrid() {
    gridLayer.clearLayers();
    saveGame(gridEnvironment); // save the game every main state update
    gridEnvironment.pxScreenBoundary = map.getPixelBounds(); // update visible pixel screen boundaries

    const { playerI, playerJ } = computePlayerGridPosition(gridEnvironment);
    const playerCellI = Math.round(playerI);
    const playerCellJ = Math.round(playerJ);

    if (playerHolding != null) { // draw the interactable neighborhood if the player is holding a token
      drawNeighbourhoodRect(gridEnvironment, playerCellI, playerCellJ);
    } // redraw grid of the visible cells and tokens
    iterateVisibleCellsAndDraw(gridEnvironment, playerCellI, playerCellJ);
  }

  // generation function that takes a cell, i, j and deterministically assigns it as a valued token
  // or, if the cell already is a token, updates the cell to represent itself as a token
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
      const { fillColor, strokeColor } = getColorsForTokenValue(
        ctx.tokenMap.get(token)!,
      );
      const insetPx = Math.max(0, (allowed ? 6 : 4) / 2);
      const tokenBounds = insetBounds(environment, bounds, insetPx) || bounds;

      const tokenCell = leaflet.rectangle(tokenBounds, {
        color: allowed ? strokeColor : "#342e2eff",
        weight: allowed ? 6 : 4,
        fill: true,
        fillColor: allowed ? fillColor : "#888888",
        fillOpacity: 0.9,
        interactive: allowed,
        className: allowed ? "rect-allowed" : "rect-default",
      });
      tokenCell.bindTooltip(String(ctx.tokenMap.get(token)), {
        permanent: true,
        direction: "center",
        className: "cell-value-tooltip",
      });

      tokenCell.addTo(ctx.gridLayer);
      tokenCell.on(
        "click",
        () => handleInteraction(environment, i, j, allowed),
      );
    }
  }

  // --------------------------------- interaction logic --------------------- //
  // save game state to LocalStorage
  function saveGame(environment: GridEnvironment) {
    const gameState = {
      playerHolding: environment.tokenCtx.getPlayerHolding(),
      tokenMap: Array.from(environment.tokenCtx.tokenMap.entries()),
      pickedCells: Array.from(environment.tokenCtx.pickedCells),
      playerLocation: playerMarker.getLatLng(),
    };
    localStorage.setItem("gameState", JSON.stringify(gameState));
  }

  // load game state from LocalStorage
  function loadGame(environment: GridEnvironment) {
    const ctx = environment.tokenCtx;
    const savedState = localStorage.getItem("gameState");
    if (savedState) {
      const gameState = JSON.parse(savedState);
      ctx.tokenMap = new Map<string, number>(gameState.tokenMap);
      ctx.pickedCells = new Set<string>(gameState.pickedCells);
      ctx.setPlayerHolding(gameState.playerHolding);
      playerMarker.setLatLng(gameState.playerLocation);
    }
  }

  // function for player pick up logic, updates player held if null after interacting with a token
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

  // function for player combine logic, merges two identical tokens if the player is holding a token and interacts with an identical token.
  // also plays combine animation.
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
    playCombineAnimation(environment.tokenCtx);
    environment.neighborhoodLayer.clearLayers();
    redrawGrid();
  }

  // function for player place logic, if holding a token and interacts with an empty cell, places the held token onto the cell
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

  // main interaction handler that routes to pickup, combine, or place logic based on the current state of the cell and player holding
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
    if (!hasToken && currentHolding !== null) {
      place(environment, cell, currentHolding);
      return;
    }
  }

  // event Listener for drag events to prevent excessive redraws map panning via mouse/finger
  let _isDragging = false;
  map.on("dragstart", () => (_isDragging = true));
  map.on("dragend", () => {
    _isDragging = false;
    redrawGrid(); // only redraw when user finishes dragging
  });

  // --------------------------------- player movement --------------------- //
  // player movement function, for manual movement controls
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

  (document.getElementById("move-right") as HTMLButtonElement).onclick = () =>
    move(1, 0);
  (document.getElementById("move-left") as HTMLButtonElement).onclick = () =>
    move(-1, 0);
  (document.getElementById("move-up") as HTMLButtonElement).onclick = () =>
    move(0, -1);
  (document.getElementById("move-down") as HTMLButtonElement).onclick = () =>
    move(0, 1);
  (document.getElementById("restart") as HTMLButtonElement).onclick = () => {
    localStorage.removeItem("gameState");
    location.reload();
  };

  // --------------------------------- end state --------------------- //
  // function to handle when the game reaches endstate of playerHolding = 2048
  function endGame() {
    if (gameWon) return;
    gameWon = true;
    const winText = "YOU WIN!"; // update title and attach title animation to each character
    Title_Card.innerHTML = winText
      .split("")
      .map((ch, idx) => {
        const char = ch === " " ? "&nbsp;" : ch;
        return `<span style="--delay:${
          (idx * 0.08).toFixed(2)
        }s">${char}</span>`;
      })
      .join("");
    // update status panel to reflect win state
    statusPanelDiv.innerHTML = `
    <div style="text-align:center;">
      <div style="color:#880e4fff;">
        YOU'VE REACHED 2048! RESTART THE GAME TO PLAY AGAIN!
      </div>
      <div>Restart the game to play again!</div>
    </div>
  `;
  }

  // --------------------------------- main game loop --------------------- //
  // main game loop initialization
  if (localStorage.getItem("gameState")) {
    loadGame(gridEnvironment); // load saved game state
  }
  map.panTo(playerMarker.getLatLng()); // center map on player spawn point
  map.once("moveend", () => {
    map.invalidateSize();
    redrawGrid();
  });
  if (playerHolding === null) { // determine initial status panel on load based on playerHolding
    statusPanelDiv.innerHTML = "CLICK A CELL TO PICK UP A TOKEN AND BEGIN!";
  } else if (playerHolding === 2048) {
    endGame();
    statusPanelDiv.innerHTML = `
      <div style="text-align:center;">
        <div style="color:#880e4fff;">
          YOU'VE REACHED 2048! RESTART THE GAME TO PLAY AGAIN!
        </div>
        <div>Restart the game to play again!</div>
      </div>
    `;
  } else {
    statusPanelDiv.innerHTML = ` 
      <div style="text-align:center;">
        <div style="color:${getColorsForTokenValue(playerHolding!).fillColor};">
          HOLDING: ${String(playerHolding)}
        </div>
        <div>CLICK TO PLACE ON AN EMPTY CELL OR MERGE WITH AN IDENTICAL CELL</div>
      </div>
    `;
  }
  redrawGrid(); // initial grid draw
}
