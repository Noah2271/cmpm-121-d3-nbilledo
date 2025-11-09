# World of Bits — CMPM 121 D3 Project

## Project

Simple grid-based token game built for CMPM 121 D3.

## Status

- D3.a: Completed
  - Grid of squares centered on a start location.
  - Tokens spawn on visible cells using a luck function.
  - Player can grab one token at a time, place it, or combine identical tokens to craft higher values.
  - Tokens are colored by value (up to 16).
- D3.b: In progress
  - Movement controls (buttons / keyboard).
  - Interactable radius that follows the player.
  - End condition for holding a high-value token.
  - Improved status UI with clearer feedback.

## Features implemented

- Deterministic token generation via imported luck function.
- Interactable neighborhood around the player.
- Pick up, place, and combine mechanics.
- Token visuals and value tooltips.
