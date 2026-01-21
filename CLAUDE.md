# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CivChess is a browser-based strategy game built with Phaser 3 that combines civilization-building mechanics with chess-style gameplay. Players control cities, warriors, and settlers on a 10x10 grid, competing to capture all cities.

## Running the Game

Open `index.html` directly in a browser - no build step required. The game loads Phaser 3 from CDN.

## Architecture

### Core Components

**GameEngine (`js/GameEngine.js`)** - Stateful game logic handler that manages:
- Board state (10x10 grid) and piece positions
- Turn management and player relations (peace/war)
- Movement validation and combat resolution
- City production queue (diplomacy, science, units, repair)
- Territory ownership and expansion
- Victory/elimination conditions

All game actions flow through the engine which validates rules and logs actions.

**Scenes (`js/scenes/`)**
- `MenuScene.js` - Pre-game setup: player count (2-4), color selection
- `GameScene.js` - Main game rendering, input handling, UI panel, piece sprites

**Constants (`js/constants.js`)** - Board dimensions, tile sizes, colors, piece types, production costs

### Data Flow

1. User input (drag/click) → GameScene
2. GameScene calls GameEngine methods for validation
3. Engine updates internal state, logs action, returns result
4. GameScene updates sprites and UI based on result

### Key Game Rules

- **Cities** (rooks): Immovable, produce units/tech/territory, start with 4 HP
- **Warriors** (pawns): Move 1 tile any direction, attack enemies, flip tile ownership
- **Settlers** (knights): Move 3 tiles orthogonally, can found new cities (2+ tiles from other cities)
- Players must declare war before attacking; peace is default
- First player to own all cities wins

### AI System

**AI (`js/AI.js`)** - Personality-driven AI with two types:
- **Militaristic**: Builds armies, researches tech, declares war when ready, focuses on conquest
- **Expansionist**: Maintains army parity with enemies, prioritizes settlers and new cities, limits territory growth

Personalities are randomly assigned at game start. The AI:
- Reevaluates production whenever a project completes (no paralysis)
- Makes decisions based on board state analysis each turn
- Difficulty levels (Easy/Medium/Hard) control mistake chance
