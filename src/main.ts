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
  <div id="moveControls">
    <button id="move-up">UP</button>
    <div>
      <button id="move-left">LEFT</button><button id="move-right">RIGHT</button>
    </div>
    <button id="move-down">DOWN</button>
  </div>
  <br>
  <button id="restart">RESTART GAME</button>
  <div class="note">
  <br>
    NOTE: TO TOGGLE GEOLOCATION, TOGGLE VIA BROWSER SETTINGS. IT WILL RESTART THE GAME AND REMOVE/ADD MANUAL CONTROLS.
  </div>
`;

// --------------------------------- map and player set up ----------------- //
const DEFAULT_LAT = 33.94745; // mcdonald's location
const DEFAULT_LNG = -118.11787;

navigator.geolocation.getCurrentPosition(
  (position) => {
    const { latitude, longitude } = position.coords;
    const moveControls = document.getElementById("moveControls");
    if (moveControls) moveControls.style.display = "none";

    initGame(latitude, longitude);
  },
  (_error) => {
    initGame(DEFAULT_LAT, DEFAULT_LNG);
  },
);

navigator.permissions.query({ name: "geolocation" }).then((status) => {
  status.onchange = () => {
    location.reload(); // toggle resets the game entirely
    localStorage.clear();
  };
});

// ----------------------------- Flyweight types ------------------------------
// flyweight factory for cells. Stores the cell color, stroke, and whether cell is interactable by default
type CellFly = { fill: string; stroke: string; allowedDefault: boolean };
class CellFlyFactory {
  private cellFlyMap = new Map<string, CellFly>();
  constructor() {
    this.cellFlyMap.set("default", {
      fill: "#888888",
      stroke: "#342e2e",
      allowedDefault: false,
    });
  }
  get(key: string) {
    if (!this.cellFlyMap.has(key)) {
      this.cellFlyMap.set(key, {
        fill: "#000000",
        stroke: "#000000",
        allowedDefault: false,
      });
    }
    return this.cellFlyMap.get(key)!;
  }
}

// flyweight factory for tokens, stores value, fill color, and stroke color
type TokenFly = { value: number; fill: string; stroke: string };
class TokenFlyFactory {
  private TokenFlyMap = new Map<number, TokenFly>();
  private palette: TokenFly[] = [
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
  ];
  get(flyValue: number) { // if tokenFly already exists for the value, return it; else create it from the palette and set it for reuse later.
    if (!this.TokenFlyMap.has(flyValue)) {
      const found = this.palette.find((p) => p.value === flyValue);
      this.TokenFlyMap.set(flyValue, found!);
    }
    return this.TokenFlyMap.get(flyValue)!;
  }
}

// --------------------------------- initGame main ------------------------------------ //
function initGame(latitude: number, longitude: number) {
  const START_LATLNG = leaflet.latLng(latitude, longitude);

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

  // --------------------------------- layers & state ------------------------------- //
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

  // --------------------------------- flyweight instances -------------------------- //
  const cellFly = new CellFlyFactory();
  const tokenFly = new TokenFlyFactory();

  // --------------------------------- cell contexts for sparse storage -------------- //
  // Cell context interface
  interface CellContext {
    i: number;
    j: number;
    tokenValue?: number;
    allowedOverride?: boolean;
    flyKey?: string;
  }

  // Handler for cell contexts using a Map for sparse storage
  class CellHandler {
    private cellMap = new Map<string, CellContext>();
    id(i: number, j: number) { // use position as unique cell id
      return `${i},${j}`;
    }
    get(i: number, j: number) { // get or create cell context
      const cell = this.id(i, j);
      if (!this.cellMap.has(cell)) {
        this.cellMap.set(cell, { i, j, flyKey: "default" });
      }
      return this.cellMap.get(cell)!;
    }
    remove(i: number, j: number) { // remove stored cell context
      this.cellMap.delete(this.id(i, j));
    }
    entries() { // get all stored cell contexts
      return this.cellMap.entries();
    }
    clear() { // clear all stored cell contexts
      this.cellMap.clear();
    }
  }
  const cellHandler = new CellHandler();

  // --------------------------------- token context object ------- //
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
      const PlayerElement = playerMarker.getElement?.() as
        | HTMLElement
        | undefined;
      const circle = PlayerElement?.querySelector?.("svg circle") as
        | SVGCircleElement
        | null;
      if (circle) {
        if (v == null) {
          circle.setAttribute("fill", "#f8fcfaff"); // default color for when holding nothing
        } else {
          const tf = tokenFly.get(v);
          circle.setAttribute("fill", tf.fill);
        }
      }
    },
    statusPanelDiv,
  };

  // --------------------------------- Grid Environment ---------------------------- //
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
    return leaflet.latLngBounds([
      environment.map.unproject(topLeft, environment.zoom),
      environment.map.unproject(bottomRight, environment.zoom),
    ]);
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

  // --------------------------------- token & cell helpers --------------------- //
  // deterministic token value generator, takes 2 and raises it to powers resulting in values up to 16
  function generateTokenValue(token: string) {
    const exp = 1 + Math.floor(luck(token + ":v") * 4);
    return 2 ** exp; // generates values 2,4,8,16
  }

  // computer player grid position relative to the origin point, using cell size as units
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

  // draws the active interactive neighborhood rectangle around the player position
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
      weight: 10,
      fill: false,
      interactive: false,
      dashArray: "12 2",
      className: "neighbourhood-rect",
    });
    rect.addTo(environment.neighborhoodLayer);
  }

  // draw a cell rectangle using flyweights and add click handler when allowed
  function drawFlyCell(
    environment: GridEnvironment,
    ctx: CellContext,
    bounds: leaflet.LatLngBounds,
  ) {
    const cellFlyKey = ctx.flyKey ?? "default"; // if no key, set to default for style
    const cellFlyObject = cellFly.get(cellFlyKey); // grab the flyWeight object corresponding to key
    const allowed = ctx.allowedOverride !== undefined // use override for allowed if assigned
      ? ctx.allowedOverride
      : cellFlyObject.allowedDefault;

    const rect = leaflet.rectangle(bounds, { // draw cell based on properties stored in flyweight
      color: cellFlyObject.stroke,
      weight: 1,
      opacity: 0.6,
      fill: true,
      fillColor: cellFlyObject.fill,
      fillOpacity: 0.0,
      interactive: allowed,
      className: allowed ? "rect-allowed" : "rect-default",
    });
    rect.addTo(environment.gridLayer); // add to the gridLayer
    if (allowed) {
      rect.on(
        "click",
        () => handleInteraction(environment, ctx.i, ctx.j, true),
      );
    }
  }

  function drawTokenForCell(
    environment: GridEnvironment,
    ctx: CellContext,
    bounds: leaflet.LatLngBounds,
    allowed: boolean,
  ) {
    if (ctx.tokenValue == null) return;
    const flyValueInfo = tokenFly.get(ctx.tokenValue); // grab value, fill, and stroke stored in flyweight
    const insetPx = Math.max(0, (allowed ? 6 : 4) / 2); // inset based on allowed status using insetBounds helper
    const tokenBounds = insetBounds(environment, bounds, insetPx) || bounds;

    const tokenCell = leaflet.rectangle(tokenBounds, { // draw rectangle using flyweight properties from flyValueInfo
      color: allowed ? flyValueInfo.stroke : "#342e2eff",
      weight: allowed ? 6 : 4,
      fill: true,
      fillColor: allowed ? flyValueInfo.fill : "#888888",
      fillOpacity: 0.9,
      interactive: allowed,
      className: allowed ? "rect-allowed" : "rect-default",
    });

    tokenCell.bindTooltip(String(ctx.tokenValue), { // bind tooltip and add the token to gridLayer, attach click handler
      permanent: true,
      direction: "center",
      className: "cell-value-tooltip",
    });

    tokenCell.addTo(environment.gridLayer);
    tokenCell.on(
      "click",
      () => handleInteraction(environment, ctx.i, ctx.j, allowed),
    );
  }

  // --------------------------------- main draw / generation loop --------------------- //
  // draws a single cell at (i,j) using flyweights
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
    const ctx = cellHandler.get(i, j); // grab the context for this cell for sparse storage
    ctx.allowedOverride = allowed; // override the default allowed property

    const tokenId = `${i},${j}`; // get token id and spawn token only if one already doesn't exist deterministically
    if (
      !tokenCtx.tokenMap.has(tokenId) && !tokenCtx.pickedCells.has(tokenId) &&
      luck(tokenId) < CACHE_SPAWN_PROBABILITY
    ) {
      tokenCtx.tokenMap.set(tokenId, generateTokenValue(tokenId));
    }

    if (tokenCtx.tokenMap.has(tokenId)) { // align cellContext tokenValue with tokenMap, deleting token in cellContext if no token present
      ctx.tokenValue = tokenCtx.tokenMap.get(tokenId)!;
    } else {
      delete ctx.tokenValue;
    }

    drawFlyCell(environment, ctx, bounds); // draw cell or token via flyweights, rather than making an entire new tile per render
    drawTokenForCell(environment, ctx, bounds, allowed);
  }

  // iterate over visible cells and draw them
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

  // main redraw function, uses memento pattern to save game state on each redraw
  function redrawGrid() {
    gridLayer.clearLayers();
    GameCaretaker.save(originator);

    gridEnvironment.pxScreenBoundary = map.getPixelBounds();
    const { playerI, playerJ } = computePlayerGridPosition(gridEnvironment);
    const playerCellI = Math.round(playerI);
    const playerCellJ = Math.round(playerJ);

    if (playerHolding != null) {
      drawNeighbourhoodRect(gridEnvironment, playerCellI, playerCellJ);
    }

    iterateVisibleCellsAndDraw(gridEnvironment, playerCellI, playerCellJ);
  }

  // ----------------------------------- Memento Pattern ------------------------ //
  class GameMemento { // class for game state snapshot
    constructor(
      public playerHolding: number | null,
      public tokenMap: Map<string, number>,
      public pickedCells: Set<string>,
      public playerLocation: { lat: number; lng: number },
    ) {}
  }

  class GameOriginator {
    constructor(private environment: GridEnvironment) {}
    createMemento(): GameMemento { // create snapshot of current game state to save
      return new GameMemento(
        this.environment.tokenCtx.getPlayerHolding(), // save player holding and create clones of tokenMap and pickedCells
        new Map(this.environment.tokenCtx.tokenMap),
        new Set(this.environment.tokenCtx.pickedCells),
        {
          lat: playerMarker.getLatLng().lat, // save player location
          lng: playerMarker.getLatLng().lng,
        },
      );
    }

    restoreMemento(memento: GameMemento) { // restore save from the momento
      const ctx = this.environment.tokenCtx;
      ctx.tokenMap = new Map(memento.tokenMap);
      ctx.pickedCells = new Set(memento.pickedCells);
      ctx.setPlayerHolding(memento.playerHolding);
      playerMarker.setLatLng(
        leaflet.latLng(memento.playerLocation.lat, memento.playerLocation.lng),
      );
    }
  }

  class GameCaretaker {
    static save(originator: GameOriginator) { // function to save game state to localStorage
      const memento = originator.createMemento();
      const serializable = { // convert Map/Set to arrays for serialization for jSON storage
        playerHolding: memento.playerHolding,
        tokenMap: Array.from(memento.tokenMap.entries()),
        pickedCells: Array.from(memento.pickedCells.values()),
        playerLocation: memento.playerLocation,
      };
      localStorage.setItem("gameState", JSON.stringify(serializable));
    }

    static load(originator: GameOriginator) { // function to load game state from localStorage
      const saved = localStorage.getItem("gameState");
      if (!saved) return;

      const obj = JSON.parse(saved);
      const memento = new GameMemento(
        obj.playerHolding,
        new Map(obj.tokenMap),
        new Set(obj.pickedCells),
        obj.playerLocation,
      );
      originator.restoreMemento(memento);
    }
  }

  const originator = new GameOriginator(gridEnvironment);

  // --------------------------------- interaction logic --------------------- //
  // function to handle picking up a token from a cell
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
        <div style="color:${tokenFly.get(tokenValue).fill};">
          HOLDING: ${String(tokenValue)}
        </div>
        <div>CLICK TO PLACE ON AN EMPTY CELL OR MERGE WITH AN IDENTICAL CELL</div>
      </div>
    `;
    redrawGrid();
  }

  // function to combine two identical tokens
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
        <div style="color:${tokenFly.get(currentHolding).fill};">HOLDING: ${
        String(currentHolding)
      }</div>
        <div style="color:${
        tokenFly.get(tokenValue).fill
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
        <div style="color:${tokenFly.get(combined).fill};">
          YOU'VE COMBINED TWO CELLS TO CREATE: ${String(combined)}
        </div>
      </div>
    `;
    playCombineAnimation(environment.tokenCtx);
    environment.neighborhoodLayer.clearLayers();
    redrawGrid();
  }

  // function to place a token onto an empty cell
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
      <div style="color:${tokenFly.get(currentHolding).fill};">
        YOU PLACED DOWN CELL: ${String(currentHolding)}
      </div>
    </div>
  `;
    environment.neighborhoodLayer.clearLayers();
    redrawGrid();
  }

  // main interaction handler that routes to pickup, combine, or place functions
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

  // --------------------------------- map movement --------------------- //
  map.on("moveend", () => {
    redrawGrid();
  });

  // --------------------------------- player movement --------------------- //
  // player movement function using on-screen buttons
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
  // function to handle when the game reaches the win condition of playerHolding = 2048
  function endGame() {
    if (gameWon) return;
    gameWon = true;
    const winText = "YOU WIN!";
    Title_Card.innerHTML = winText
      .split("")
      .map((ch, idx) => {
        const char = ch === " " ? "&nbsp;" : ch;
        return `<span style="--delay:${
          (idx * 0.08).toFixed(2)
        }s">${char}</span>`;
      })
      .join("");
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
  if (localStorage.getItem("gameState")) {
    GameCaretaker.load(originator);
  }

  map.panTo(playerMarker.getLatLng());
  map.once("moveend", () => {
    map.invalidateSize();
    redrawGrid();
  });

  if (playerHolding === null) {
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
        <div style="color:${tokenFly.get(playerHolding!).fill};">
          HOLDING: ${String(playerHolding)}
        </div>
        <div>CLICK TO PLACE ON AN EMPTY CELL OR MERGE WITH AN IDENTICAL CELL</div>
      </div>
    `;
  }
  redrawGrid();

  // --------------------------------- optional live geolocation update --------------------- //
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      const newLatLng = leaflet.latLng(latitude, longitude);
      const movedDistance = map.distance(lastLatLng, newLatLng);
      const cellSizePx = gridEnvironment.pxCellSize;
      const cellMeters = map.containerPointToLatLng([cellSizePx, 0])
        .distanceTo(map.containerPointToLatLng([0, 0]));

      playerMarker.setLatLng(newLatLng);
      if (movedDistance >= cellMeters) {
        map.panTo(newLatLng);
        lastLatLng = newLatLng;
        redrawGrid();
      }
    });
  }
}
