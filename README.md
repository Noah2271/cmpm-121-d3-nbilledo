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
- D3.c: In Progress
  - Cell state saving for value and whether or not it has been picked from by the player
  - Switch player position calculation using cell size as units, so the player can move off the exact lines of the grid.
  - Switch from a radius to actual cell indicators for interaction.
  - A better, or more originalp player icon/indicator.
- D4.d: Not Started, Plan Below
  - Game save state for when the game is closed at any given moment.
  - Have the game start, and track on the players actual map location.
  - Option to restart the game whenever the player wants so they do not get trapped in their current save.

## Features implemented

- Deterministic token generation via imported luck function.
- Interactable neighborhood around the player that moves with the player.
- Pick up, place, and combine mechanics.
- Token visuals and value tooltips.
- Arrow Movement Controls.
- Cell merge effects, and color effects for player actions.
- Game end state when the player crafts and creates token 2048.
