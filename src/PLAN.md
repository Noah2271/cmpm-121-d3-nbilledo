# D3: World of Bits

## Game Design Vision

A game in which crafting is the main core mechanic. The player navigates this game's world via a grid which is overlayed onto a real world map. The grid consists of rectangles in which tokens could spawn with various number values. Each of these tokens can be grabbed and put down ontop of any other token of the same value or into any empty slot. Combining two tokens by putting two equal value ones on top of each other will create a token of the combined value. The player however, cannot hold more than one token at once.

## Technologies

- TypeScript for most game code, little to no explicit HTML, and all CSS collected in common `style.css` file
- Deno and Vite for building
- GitHub Actions + GitHub Pages for deployment automation
- Leaflet for map interactions and mechanics
- Source code in main.ts and style fields in style.css

## Assignments

## D3.a: Core Mechanics (token collection and crafting)

Key technical challenge: Can you assemble a map-based user interface using the Leaflet mapping framework?
Key gameplay challenge: Can players collect and craft tokens from nearby locations to finally make one of sufficiently high value?

### D3.a Steps

- [x] copy main.ts to reference.ts for future reference
- [x] delete everything in main.ts
- [x] put a basic leaflet map on the screen
- REMOVED RANDOM LOCATION IDEA. TOO MUCH WATER ON GLOBE
- [x] draw the player's location on the map
- [x] draw a rectangle representing one cell on the map
- [x] use loops to draw a whole grid of cells on the map
- [x] create tokens on a randomized number of grid cells using _luck.ts
- [x] allow user to pick up the token within a square radius around them
- [x] make sure cells lose their token when they are picked up
- [x] make it so player can only hold one token at a time
- [x] make it so the player can put the token down where they please
- [x] implement crafting, so if the player places two identical tokens on eachother they combine

## D3.b Globe Spanning Gameplay

Key technical challenge: How is a map with cells created without retaining memory when they are not visible on the screen? How do you create an end state for the game?
Key gameplay challenge: Can players craft an even higher value token by moving to other locations to get access to more crafting materials?

### D3.b Steps

- [x] confirm that cells actually spawn wherever the player can see (Tested Via Drag)
- [x] implement some sort of button system or location tracking for player movement
- [x] ensure the active radius, does in-fact, move with the player
- [x] create a conditional where if the player is HOLDING a token of high enough value, game ends
- [x] change the UI at the bottom of the screen to display both the current held value, and other indicators such as "You can't pick up token (value), you are already holding a token!"
- [x] possibly add some effects when combining tokens to indicate to the player that they're supposed to be doing that.
- [x] add header to the top of the screen that indicates a game title and the goal of the game (What value is necessary for the end state)
- [Moved to D3.c] change player indicator to something more interesting
- [x] make sure the drawing order of objects such as the player, token/cache cells, and neighborhood grid is correct for design

## D3.c Object Persistence

Key technical challenge: Can your software accurately remember the state of map cells even when they scroll off the screen?
Key gameplay challenge: Can you fix a gameplay bug where players can farm tokens by moving into and out of a region repeatedly to get access to fresh resources?

## D3.c Steps

- [x] Grid map remembers state after players grab it due to the marking of a tile as "picked" after the player picks a token off of it. This keeps cells from respawning after being interacted with since the token i, j values relative to the origin are stored into a Set which is checked on tile spawn.
- [x] Grid map also remembers when the player since the cell value and coordinates are also stored in a Map, and these are also checked on cell spawn.
- [x] Possibly change the radius box, instead using the 'allowed' value of each box denoting whether or not the box has a certain effect which indicates it's in range of the player.
- [x] Maybe look into a more efficient way to spawn tiles or add a cooldown to how fast the player can MANUALLY move across the screen via arrow controls. Too much movement loads tiles way too fast. A possible solution can also be loading in tiles after a set amount of time after manual movement stops.
- [x] Change the player indicator to something more interesting.
- [x] Add viewport meta tag to HTML
- [x] Create CSS media query for mobile
- [x] Add on-screen directional button controls
- [x] Test on actual mobile device

## D4.d Gameplay across real-world space and time

Key technical challenge: Can your software remember game state even when the page is closed? Is the player character's in game movement controlled by actual geo-location?
Key gameplay challenge: Can the user test the game with multiple gameplay sesisons, involving some real-world movement and simulated movement?

## D3.d Steps

- [x] State Persistence: Identify what game state characteristics need to save on close
- [x] Add geolocation permission request, implement watchPosition for player marker, handle permission denied case.
- [x] Convert real world lat and lng values to grid cell positions
- [x] Add possible toggle between GPS and manual movement
- [x] Periodically neighborhood updating only after player moves a certain distance... snap to grid behavior.
- [x] Test in a bus, walk around campus
