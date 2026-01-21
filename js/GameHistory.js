/**
 * GameHistory - Tracks game state history for replay purposes
 * Stores snapshots of tile ownership, tech levels, and piece placements
 * Persists to localStorage with a random game identifier
 */
class GameHistory {
    // Storage prefix for all saved games (separate from display name)
    static STORAGE_PREFIX = 'civchess_save_';

    constructor() {
        this.gameId = this.generateGameId();
        this.snapshots = [];
        this.metadata = {
            startTime: Date.now(),
            endTime: null,
            playerCount: 0,
            players: [],
            winner: null
        };
    }

    /**
     * Generate a random game ID like "Game a3f2"
     */
    generateGameId() {
        const randomNum = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        const hash = this.simpleHash(randomNum);
        const lastFour = hash.slice(-4);
        return `Game ${lastFour}`;
    }

    /**
     * Simple hash function to create a short identifier
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }

    /**
     * Initialize history with game metadata
     */
    initGame(players) {
        this.metadata.playerCount = players.length;
        this.metadata.players = players.map(p => ({
            id: p.id,
            name: p.name,
            color: p.color
        }));
        this.metadata.startTime = Date.now();
    }

    /**
     * Capture a snapshot of the current game state
     * @param {Object} engine - The GameEngine instance
     * @param {string} actionType - Type of action that triggered this snapshot
     * @param {Object} actionDetails - Additional details about the action
     */
    captureSnapshot(engine, actionType, actionDetails = {}) {
        const snapshot = {
            timestamp: Date.now(),
            turnNumber: engine.turnNumber || this.snapshots.length,
            currentPlayerIndex: engine.currentPlayerIndex,
            actionType: actionType,
            actionDetails: actionDetails,

            // Deep copy of tile ownership (10x10 grid)
            tileOwnership: this.copyTileOwnership(engine.tileOwnership),

            // Tech levels for all players
            techLevels: this.captureTechLevels(engine.players),

            // All pieces on the board
            pieces: this.capturePieces(engine.pieces),

            // Player relations (war/peace)
            playerRelations: this.captureRelations(engine.players)
        };

        this.snapshots.push(snapshot);
        this.saveToLocalStorage();
    }

    /**
     * Deep copy the tile ownership grid
     */
    copyTileOwnership(tileOwnership) {
        if (!tileOwnership) return [];
        return tileOwnership.map(row => row.slice());
    }

    /**
     * Capture tech levels for all players
     */
    captureTechLevels(players) {
        if (!players) return [];
        return players.map(p => ({
            playerId: p.id,
            techScore: p.techScore
        }));
    }

    /**
     * Capture all piece positions and states
     */
    capturePieces(pieces) {
        if (!pieces) return [];
        return pieces.map(p => ({
            id: p.id,
            type: p.type,
            ownerId: p.ownerId,
            row: p.row,
            col: p.col,
            hp: p.hp,
            maxHp: p.maxHp,
            hasMoved: p.hasMoved,
            // City-specific properties
            production: p.production || null,
            productionProgress: p.productionProgress || 0
        }));
    }

    /**
     * Capture player relations (war/peace status)
     */
    captureRelations(players) {
        if (!players) return [];
        return players.map(p => ({
            playerId: p.id,
            relations: { ...p.relations }
        }));
    }

    /**
     * Mark game as ended with winner info
     */
    endGame(winner) {
        this.metadata.endTime = Date.now();
        this.metadata.winner = winner;
        this.saveToLocalStorage();
    }

    /**
     * Save current history to localStorage
     */
    saveToLocalStorage() {
        const data = {
            gameId: this.gameId,
            metadata: this.metadata,
            snapshots: this.snapshots
        };

        try {
            const storageKey = GameHistory.STORAGE_PREFIX + this.gameId;
            localStorage.setItem(storageKey, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save game history to localStorage:', e);
        }
    }

    /**
     * Load a game history from localStorage by gameId
     */
    static loadFromLocalStorage(gameId) {
        try {
            const storageKey = GameHistory.STORAGE_PREFIX + gameId;
            const data = localStorage.getItem(storageKey);
            if (data) {
                return JSON.parse(data);
            }
            // Fallback: try loading with old format (for backwards compatibility)
            const oldData = localStorage.getItem(gameId);
            if (oldData) {
                return JSON.parse(oldData);
            }
        } catch (e) {
            console.warn('Failed to load game history from localStorage:', e);
        }
        return null;
    }

    /**
     * Get list of all saved game IDs from localStorage
     */
    static listSavedGames() {
        const games = [];
        const prefix = GameHistory.STORAGE_PREFIX;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            // Check for new prefix format
            if (key.startsWith(prefix)) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    games.push({
                        gameId: data.gameId || key.substring(prefix.length),
                        startTime: data.metadata?.startTime,
                        endTime: data.metadata?.endTime,
                        playerCount: data.metadata?.playerCount,
                        winner: data.metadata?.winner,
                        snapshotCount: data.snapshots?.length || 0
                    });
                } catch (e) {
                    // Skip invalid entries
                }
            }
            // Backwards compatibility: also check for old "Game " format
            else if (key.startsWith('Game ')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    games.push({
                        gameId: key,
                        startTime: data.metadata?.startTime,
                        endTime: data.metadata?.endTime,
                        playerCount: data.metadata?.playerCount,
                        winner: data.metadata?.winner,
                        snapshotCount: data.snapshots?.length || 0,
                        _legacyFormat: true  // Flag to indicate old format
                    });
                } catch (e) {
                    // Skip invalid entries
                }
            }
        }
        // Sort by start time, most recent first
        return games.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    }

    /**
     * Delete a saved game from localStorage
     */
    static deleteSavedGame(gameId) {
        try {
            const storageKey = GameHistory.STORAGE_PREFIX + gameId;
            // Try new format first
            if (localStorage.getItem(storageKey)) {
                localStorage.removeItem(storageKey);
                return true;
            }
            // Fallback to old format
            if (localStorage.getItem(gameId)) {
                localStorage.removeItem(gameId);
                return true;
            }
            return false;
        } catch (e) {
            console.warn('Failed to delete game history:', e);
            return false;
        }
    }

    /**
     * Rename a saved game in localStorage
     */
    static renameSavedGame(oldGameId, newGameId) {
        try {
            const prefix = GameHistory.STORAGE_PREFIX;
            const oldStorageKey = prefix + oldGameId;
            const newStorageKey = prefix + newGameId;

            // Check if target name already exists (in new format)
            if (localStorage.getItem(newStorageKey)) {
                return false;
            }

            // Try to load from new format first
            let data = localStorage.getItem(oldStorageKey);
            let oldKey = oldStorageKey;

            // Fallback to old format (legacy support)
            if (!data && localStorage.getItem(oldGameId)) {
                data = localStorage.getItem(oldGameId);
                oldKey = oldGameId;
            }

            if (!data) {
                return false;
            }

            // Parse and update the gameId in the data
            const gameData = JSON.parse(data);
            gameData.gameId = newGameId;

            // Save with new key (always use new format) and remove old
            localStorage.setItem(newStorageKey, JSON.stringify(gameData));
            localStorage.removeItem(oldKey);
            return true;
        } catch (e) {
            console.warn('Failed to rename game history:', e);
            return false;
        }
    }

    /**
     * Update the timestamp of a saved game to make it most recent
     */
    static updateTimestamp(gameId) {
        try {
            const storageKey = GameHistory.STORAGE_PREFIX + gameId;

            // Try new format first
            let data = localStorage.getItem(storageKey);
            let keyToUse = storageKey;

            // Fallback to old format
            if (!data && localStorage.getItem(gameId)) {
                data = localStorage.getItem(gameId);
                keyToUse = gameId;
            }

            if (!data) {
                return false;
            }

            const gameData = JSON.parse(data);
            gameData.metadata.startTime = Date.now();
            localStorage.setItem(keyToUse, JSON.stringify(gameData));
            return true;
        } catch (e) {
            console.warn('Failed to update game timestamp:', e);
            return false;
        }
    }

    /**
     * Get the current game ID
     */
    getGameId() {
        return this.gameId;
    }

    /**
     * Get all snapshots
     */
    getSnapshots() {
        return this.snapshots;
    }

    /**
     * Get snapshot at a specific index
     */
    getSnapshot(index) {
        if (index >= 0 && index < this.snapshots.length) {
            return this.snapshots[index];
        }
        return null;
    }

    /**
     * Get total number of snapshots
     */
    getSnapshotCount() {
        return this.snapshots.length;
    }
}
