/**
 * GameHistory - Tracks game state history for replay purposes
 * Stores snapshots of tile ownership, tech levels, and piece placements
 * Persists to localStorage with a random game identifier
 */
class GameHistory {
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
            localStorage.setItem(this.gameId, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save game history to localStorage:', e);
        }
    }

    /**
     * Load a game history from localStorage by gameId
     */
    static loadFromLocalStorage(gameId) {
        try {
            const data = localStorage.getItem(gameId);
            if (data) {
                return JSON.parse(data);
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
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('Game ')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    games.push({
                        gameId: key,
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
        }
        // Sort by start time, most recent first
        return games.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
    }

    /**
     * Delete a saved game from localStorage
     */
    static deleteSavedGame(gameId) {
        try {
            localStorage.removeItem(gameId);
            return true;
        } catch (e) {
            console.warn('Failed to delete game history:', e);
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
