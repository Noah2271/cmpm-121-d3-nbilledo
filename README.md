# CMPM 121 D3 Project - Noah Billedo

## Game Title: World of Bits

## Assignement: D3

## Current Progress: D3.a Completed, working on D3.b next.

### Functionality for D3.a

- Creates a grid of squares centered on the location from the starting code. Tokens are spawned on the map at random using an imported luck function and variable.
- The player is allowed to grab tokens within a box radius around them, holding one at a time and being able to place the token onto an empty space or a space with a matching token to "craft/combine" them. They can then pick up this token, and use it for more crafting or hold onto it.
- Tokens are colored in varied ways depending on their value. Currently up to value 16.
- You can drag and explore the map away from the player. Current implementation of the token and grid system using mapping and sets to draw grids on whatever is on the screen relative to the point of origin at the start of the program seems to allow the grid to remember it's state even offscreen. 

### Planned Functionalty for D3.b

- Movement buttons and keyboard functionality for manual player movement.
- Allow the radius box to move with the player. Might remove it and opt to add a on-cell indicator of whether or not a cell is reachable.
- End state for if the player currently possesses some high value token, obtained by crafting
- More detailed status window that better explains the functionality of the game, and provides player more feedback for actions.

