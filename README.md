# World of Bits — CMPM 121 D3 Project

## Project

Simple grid-based token game built for CMPM 121 D3.

## Status

- D3.a: Completed
  - Grid of squares centered on a start location.
  - Tokens spawn on visible cells using a luck function.
  - Player can grab one token at a time, place it, or combine identical tokens to craft higher values.
  - Tokens are colored by value (up to 16).
- D3.b: Completed
  - Movement controls (keyboard arrow keys).
  - Interactable radius that follows the player.
  - End condition for holding a high-value token.
  - Improved status UI with clearer feedback.
  - Cell merge effects.
  - Better centered cell value text.
- D3.c: Completed
  - Cell state saving for value and whether or not it has been picked from by the player. Only for current session.
  - Radius indication now presented to the user via which cells are colored and which are not. Still uses radius box for clear placement radius.
  - Player icon is now a circle that color matches to the current held value.
  - Mobile UI support via css media query and viewport meta tag.
  - Newly added flyweight optimization and memento state saving.
- D4.d: Completed
  - On game start, the game will ask the user for geolocational tracking permissions. If denied, the game will put the player at a default position ontop of a McDonald's. Movement controls for manual movement enabled for both geolocational gameplay and manual gameplay to allow play even when not moving. Location will just update to player's location on next movement.
  - Game now has autosave via a saveState function and loadState function. The first being called every redrawGrid() call.
  - Panning and interactable radius snap to player location every time the player position updates. This update is performed whenever the player's position changes by 1 cell size unit in any direction.
  - Game can be restarted at any time, which will remove the current save data.

## Features implemented

- Deterministic token generation via imported luck function.
- Interactable neighborhood around the player that moves with the player.
- Pick up, place, and combine mechanics.
- Token visuals and value tooltips.
- Button movement controls, disabled during geolocational play.
- Cell merge effects, and color effects for player actions.
- Game end state when the player crafts and creates token 2048.
- Mobile UI support.
- Game reset via restart button.
- Autosave implemented, called every grid redraw. Save is loaded on page load.
- Restart feature to hard reset the game and remove save data.
- Geolocational tracking.
