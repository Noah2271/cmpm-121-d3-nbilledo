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
- D4.d: In Progress
  - On game start, request geolocation form the player. If denied, allow manual control. If approved, disable.
  - Add cross-session state persistence for cells, location, and current held value.
  - Panning and radius grid snap positional threshold to keep the game from redrawing the grid constantly.

## Features implemented

- Deterministic token generation via imported luck function.
- Interactable neighborhood around the player that moves with the player.
- Pick up, place, and combine mechanics.
- Token visuals and value tooltips.
- Button movement controls
- Cell merge effects, and color effects for player actions.
- Game end state when the player crafts and creates token 2048.
- Mobile UI support
- Game reset via restart button
