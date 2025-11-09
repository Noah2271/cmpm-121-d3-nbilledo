# D3: World of Bits

# Game Design Vision

A game in which crafting is the main core mechanic. The player navigates this game's world via a grid which is overlayed onto a real world map. The grid consists of rectangles in which tokens could spawn with various number values. Each of these tokens can be grabbed and put down ontop of any other token of the same value or into any empty slot. Combining two tokens by putting two equal value ones on top of each other will create a token of the combined value. The player however, cannot hold more than one token at once.

# Technologies

- TypeScript for most game code, little to no explicit HTML, and all CSS collected in common `style.css` file
- Deno and Vite for building
- GitHub Actions + GitHub Pages for deployment automation
- Leaflet for map interactions and mechanics
- Source code in main.ts and style fields in style.css

# Assignments

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
- [ ] allow user to pick up the token within a square radius around them
- [x] make sure cells lose their token when they are picked up
- [x] make it so player can only hold one token at a time
- [ ] make it so the player can put the token down where they please
- [ ] implement crafting, so if the player places two identical tokens on eachother they combine

## D3.b Globe Spanning Gameplay

Key technical challenge: How is a map with cells created without retaining memory when they are not visible on the screen? How do you create an end state for the game?
Key gameplay challenge: Can the player move their character about the map or scroll the map to see cells everywhere? Is the player succesfully stopped from interacting from cells that are out of range? Is the player able to craft and reach a high enough token value to end the game?

### D3.b Steps

- [ ] implement some sort of button system for player movement or allow the player to scroll the map
- [ ] confirm that cells actually spawn wherever the player can see
- [ ] confirm that the player interaction radius actually stops the player from interacting with all cells
- [ ] edit cell implementation so that they spawn when on the screen. Despawn otherwise
- [ ] create a conditional where if the player is HOLDING a token of high enough value, game ends
