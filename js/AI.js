// ============================================
// AI SYSTEM
// ============================================
// This file defines the AI architecture for CivChess.
// The AI is designed with 4 difficulty levels:
//   - EASY: Makes suboptimal decisions, limited lookahead
//   - MEDIUM: Balanced play, moderate strategy
//   - HARD: Optimal algorithmic play, full evaluation
//   - EXPERIMENTAL: Monte Carlo Tree Search with ML model (future)
//
// Core design principles:
// 1. The AI evaluates the game state through heatmaps and scoring
// 2. It chooses between three strategic focuses: expansion, research, militarization
// 3. Difficulty is controlled via "impairment" - reducing decision quality
// 4. The AI responds reactively to other players' actions
// ============================================

// ============================================
// CONSTANTS
// ============================================

/**
 * AI Difficulty levels
 * Each level has different parameters controlling decision quality
 */
const AI_DIFFICULTY = {
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard',
    EXPERIMENTAL: 'experimental'
};

/**
 * Strategic focus types the AI can prioritize
 * The AI dynamically switches between these based on game state
 */
const AI_STRATEGY = {
    EXPANSION: 'expansion',      // Focus on territory and new cities
    RESEARCH: 'research',        // Focus on tech advancement
    MILITARIZATION: 'militarization', // Focus on unit production and combat
    DEFENSIVE: 'defensive'       // Focus on protecting existing assets
};

/**
 * Action types the AI can take during its turn
 */
const AI_ACTION_TYPE = {
    MOVE_UNIT: 'move_unit',
    ATTACK: 'attack',
    BUILD_CITY: 'build_city',
    SET_PRODUCTION: 'set_production',
    DECLARE_WAR: 'declare_war',
    PROPOSE_PEACE: 'propose_peace',
    ACCEPT_PEACE: 'accept_peace',
    END_TURN: 'end_turn'
};

/**
 * Impairment configurations for each difficulty level
 * Higher impairment = weaker AI
 */
const DIFFICULTY_CONFIG = {
    [AI_DIFFICULTY.EASY]: {
        impairmentLevel: 0.6,           // 60% chance to make suboptimal choice
        maxLookahead: 1,                // Only looks 1 move ahead
        threatAwareness: 0.4,           // 40% chance to notice threats
        strategyStickiness: 0.8,        // High chance to stick with current strategy
        reactionDelay: 2,               // Turns before reacting to events
        randomMoveChance: 0.3,          // 30% chance to make random move
        peaceThreshold: 0.3,            // Low threshold to accept peace
        warThreshold: 0.8               // High threshold to declare war
    },
    [AI_DIFFICULTY.MEDIUM]: {
        impairmentLevel: 0.25,
        maxLookahead: 2,
        threatAwareness: 0.7,
        strategyStickiness: 0.5,
        reactionDelay: 1,
        randomMoveChance: 0.1,
        peaceThreshold: 0.5,
        warThreshold: 0.5
    },
    [AI_DIFFICULTY.HARD]: {
        impairmentLevel: 0.0,           // No impairment - optimal play
        maxLookahead: 3,
        threatAwareness: 1.0,
        strategyStickiness: 0.3,
        reactionDelay: 0,
        randomMoveChance: 0.0,
        peaceThreshold: 0.7,
        warThreshold: 0.3
    },
    [AI_DIFFICULTY.EXPERIMENTAL]: {
        // Uses Monte Carlo - these are fallback values
        impairmentLevel: 0.0,
        maxLookahead: 5,
        threatAwareness: 1.0,
        strategyStickiness: 0.2,
        reactionDelay: 0,
        randomMoveChance: 0.0,
        peaceThreshold: 0.6,
        warThreshold: 0.4,
        // MCTS-specific parameters
        mctsSimulations: 1000,
        mctsExplorationConstant: 1.41,
        useNeuralNetwork: true
    }
};

// ============================================
// AI CONTROLLER CLASS
// ============================================

/**
 * AIController - Main class managing AI decision-making
 *
 * This controller is responsible for:
 * - Evaluating the current game state
 * - Choosing a strategic focus
 * - Generating and ranking possible actions
 * - Executing the chosen action
 * - Responding to events from other players
 */
class AIController {
    /**
     * @param {GameEngine} engine - Reference to the game engine
     * @param {number} playerId - The player ID this AI controls
     * @param {string} difficulty - One of AI_DIFFICULTY values
     */
    constructor(engine, playerId, difficulty = AI_DIFFICULTY.MEDIUM) {
        this.engine = engine;
        this.playerId = playerId;
        this.difficulty = difficulty;
        this.config = DIFFICULTY_CONFIG[difficulty];

        // Current strategic state
        this.currentStrategy = AI_STRATEGY.EXPANSION;
        this.strategyTurnsRemaining = 0;

        // Memory of recent events for reactive behavior
        this.eventMemory = [];
        this.maxEventMemory = 10;

        // Pending peace proposals to consider
        this.pendingPeaceProposals = [];

        // For experimental mode: Monte Carlo tree
        this.mctsRoot = null;
    }

    // ========================================
    // MAIN ENTRY POINTS
    // ========================================

    /**
     * executeTurn - Main method called when it's this AI's turn
     *
     * This method orchestrates the entire AI turn:
     * 1. Analyzes the current game state
     * 2. Updates strategic focus if needed
     * 3. Handles any pending diplomatic decisions
     * 4. Generates all possible actions
     * 5. Evaluates and ranks actions
     * 6. Executes actions until turn is complete
     *
     * @returns {Array<Object>} List of actions taken this turn
     */
    executeTurn() {
        const actionsTaken = [];

        console.log(`[AI] Player ${this.playerId} executing turn (${this.difficulty})`);

        // 1. Analyze game state
        const gameState = this.analyzeGameState();

        // 2. Update strategy based on game state
        this.updateStrategy(gameState);

        // 3. Handle diplomacy first (accept peace proposals, consider war declarations)
        const diplomacyActions = this.handleDiplomacy(gameState);
        actionsTaken.push(...diplomacyActions);

        // 4. Set city productions
        const productionActions = this.handleCityProductions(gameState);
        actionsTaken.push(...productionActions);

        // 5. Move units (settlers first for city building, then warriors)
        const unitActions = this.handleUnitMoves(gameState);
        actionsTaken.push(...unitActions);

        return actionsTaken;
    }

    /**
     * respondToEvent - Called when another player takes an action
     *
     * Allows the AI to react to events like:
     * - War declarations
     * - Peace proposals
     * - Attacks on owned pieces/territory
     * - Enemy units approaching cities
     *
     * @param {Object} event - The game event that occurred
     * @param {string} event.type - Event type (WAR_DECLARED, PEACE_PROPOSED, etc.)
     * @param {Object} event.details - Event-specific details
     */
    respondToEvent(event) {
        // Check if we should notice this event based on difficulty
        if (!this.shouldNoticeEvent(event)) {
            return;
        }

        // Add event to memory
        this.eventMemory.push({
            event: event,
            turn: this.engine.turnNumber
        });

        // Trim memory if too long
        while (this.eventMemory.length > this.maxEventMemory) {
            this.eventMemory.shift();
        }

        // Handle specific event types
        switch (event.type) {
            case 'WAR_DECLARED':
                if (event.details.defender === this.playerId) {
                    // Someone declared war on us - shift to defensive
                    this.currentStrategy = AI_STRATEGY.DEFENSIVE;
                    this.strategyTurnsRemaining = 5;
                }
                break;

            case 'PEACE_PROPOSED':
                if (event.details.target === this.playerId) {
                    this.pendingPeaceProposals.push(event.details.proposer);
                }
                break;

            case 'CITY_CAPTURED':
                if (event.details.previousOwner === this.playerId) {
                    // We lost a city - consider militarization
                    if (this.currentStrategy !== AI_STRATEGY.DEFENSIVE) {
                        this.currentStrategy = AI_STRATEGY.MILITARIZATION;
                        this.strategyTurnsRemaining = 3;
                    }
                }
                break;
        }

        console.log(`[AI] Player ${this.playerId} responding to event: ${event.type}`);
    }

    // ========================================
    // GAME STATE ANALYSIS
    // ========================================

    /**
     * analyzeGameState - Comprehensive analysis of current game state
     *
     * Gathers all information needed for decision making:
     * - Own resources: cities, units, territory, tech level
     * - Enemy resources: same for each opponent
     * - Relative strength comparisons
     * - Threat assessment from heatmaps
     * - Opportunity assessment from heatmaps
     *
     * @returns {Object} Complete game state analysis
     */
    analyzeGameState() {
        const baseState = this.engine.getGameStateForAI(this.playerId);
        const threatHeatmap = this.engine.getThreatHeatmap(this.playerId);
        const opportunityHeatmap = this.engine.getOpportunityHeatmap(this.playerId);
        const territoryHeatmap = this.engine.getTerritoryHeatmap(this.playerId);
        const expansionHeatmap = this.engine.getExpansionHeatmap(this.playerId);
        const strategicPositions = this.engine.getStrategicPositions(this.playerId);

        // Calculate relative strengths against all opponents
        const relativePower = {};
        this.engine.players.forEach((player, i) => {
            if (i !== this.playerId && this.engine.getPlayerCities(i).length > 0) {
                relativePower[i] = this.engine.getRelativeStrength(this.playerId, i);
            }
        });

        // Calculate average threat to our cities
        let cityThreat = 0;
        baseState.ownPieces.cities.forEach(city => {
            cityThreat += threatHeatmap[city.row][city.col];
        });
        cityThreat = baseState.ownPieces.cities.length > 0
            ? cityThreat / baseState.ownPieces.cities.length
            : 0;

        // Find the best expansion spots
        const expansionSpots = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (expansionHeatmap[r][c] > 0.5) {
                    expansionSpots.push({ row: r, col: c, value: expansionHeatmap[r][c] });
                }
            }
        }
        expansionSpots.sort((a, b) => b.value - a.value);

        return {
            ...baseState,
            threatHeatmap,
            opportunityHeatmap,
            territoryHeatmap,
            expansionHeatmap,
            strategicPositions,
            relativePower,
            cityThreat,
            expansionSpots: expansionSpots.slice(0, 5), // Top 5 spots
            ownStrength: this.engine.getPlayerStrength(this.playerId)
        };
    }

    /**
     * evaluatePosition - Score a specific board position
     *
     * Considers multiple factors:
     * - Distance to own cities (defensive value)
     * - Distance to enemy cities (offensive value)
     * - Territory control implications
     * - Blockade potential
     * - Retreat options
     *
     * @param {number} row - Board row
     * @param {number} col - Board column
     * @param {Object} context - Additional context (unit type, purpose)
     * @param {Object} gameState - Current game state analysis
     * @returns {number} Position score (higher = better)
     */
    evaluatePosition(row, col, context = {}, gameState) {
        let score = 0;

        // Base score from opportunity heatmap
        score += gameState.opportunityHeatmap[row][col] * 5;

        // Subtract threat (unless we're attacking)
        if (context.purpose !== 'attack') {
            score -= gameState.threatHeatmap[row][col] * 3;
        }

        // Bonus for territory control
        score += gameState.territoryHeatmap[row][col] * 2;

        // Bonus for being near our cities (defensive positioning)
        gameState.ownPieces.cities.forEach(city => {
            const dist = AIUtils.chebyshevDistance(row, col, city.row, city.col);
            if (dist <= 2) {
                score += (3 - dist) * 2; // Closer is better for defense
            }
        });

        // Bonus for approaching vulnerable enemy cities
        if (context.purpose === 'attack') {
            gameState.strategicPositions.vulnerableCities.forEach(city => {
                const dist = AIUtils.chebyshevDistance(row, col, city.row, city.col);
                if (dist <= 3) {
                    score += (4 - dist) * city.vulnerability * 5;
                }
            });
        }

        // Apply difficulty impairment (add noise)
        const noise = (Math.random() - 0.5) * this.config.impairmentLevel * 10;
        score += noise;

        return score;
    }

    // ========================================
    // STRATEGY SELECTION
    // ========================================

    /**
     * updateStrategy - Determine or update the current strategic focus
     *
     * The AI chooses between strategies based on:
     * - Current game phase (early/mid/late)
     * - Relative military strength
     * - Tech level comparison
     * - Territory control
     * - Recent events (attacks, wars)
     *
     * Strategy "stickiness" (from difficulty config) determines
     * how likely the AI is to switch strategies.
     *
     * @param {Object} gameState - Result from analyzeGameState()
     * @returns {string} The chosen strategy from AI_STRATEGY
     */
    updateStrategy(gameState) {
        // If we have turns remaining on current strategy, maybe stick with it
        if (this.strategyTurnsRemaining > 0) {
            this.strategyTurnsRemaining--;
            if (Math.random() < this.config.strategyStickiness) {
                return this.currentStrategy;
            }
        }

        // Calculate scores for each strategy
        const scores = {
            [AI_STRATEGY.EXPANSION]: 0,
            [AI_STRATEGY.RESEARCH]: 0,
            [AI_STRATEGY.MILITARIZATION]: 0,
            [AI_STRATEGY.DEFENSIVE]: 0
        };

        // Early game favors expansion
        if (gameState.gamePhase === 'early') {
            scores[AI_STRATEGY.EXPANSION] += 30;
            scores[AI_STRATEGY.RESEARCH] += 10;
        }

        // Mid game - balance based on situation
        if (gameState.gamePhase === 'mid') {
            scores[AI_STRATEGY.RESEARCH] += 20;
            scores[AI_STRATEGY.MILITARIZATION] += 15;
        }

        // Late game - military focus
        if (gameState.gamePhase === 'late') {
            scores[AI_STRATEGY.MILITARIZATION] += 30;
        }

        // If we have few cities, expand
        if (gameState.ownPieces.cities.length < 2) {
            scores[AI_STRATEGY.EXPANSION] += 25;
        }

        // If settlers exist and good spots available, expansion is good
        if (gameState.ownPieces.settlers.length > 0 && gameState.expansionSpots.length > 0) {
            scores[AI_STRATEGY.EXPANSION] += 20;
        }

        // If cities are threatened, defensive
        if (gameState.cityThreat > 0.5) {
            scores[AI_STRATEGY.DEFENSIVE] += 40;
        }

        // If we're stronger than enemies, militarize
        let strongerCount = 0;
        let weakerCount = 0;
        for (const enemyId in gameState.relativePower) {
            const rel = gameState.relativePower[enemyId];
            if (rel.advantage === 'strong') strongerCount++;
            if (rel.advantage === 'weak') weakerCount++;
        }

        if (strongerCount > weakerCount) {
            scores[AI_STRATEGY.MILITARIZATION] += 25;
        } else if (weakerCount > strongerCount) {
            scores[AI_STRATEGY.DEFENSIVE] += 20;
            scores[AI_STRATEGY.RESEARCH] += 15; // Tech up to catch up
        }

        // If we're behind in tech, research more
        let techBehind = false;
        for (const enemyId in gameState.enemyPieces) {
            const enemy = this.engine.players[enemyId];
            if (enemy && enemy.techScore > gameState.techLevel + 1) {
                techBehind = true;
            }
        }
        if (techBehind) {
            scores[AI_STRATEGY.RESEARCH] += 25;
        }

        // At war with someone? Militarize
        const player = this.engine.players[this.playerId];
        let atWar = false;
        for (const otherId in player.relations) {
            if (player.relations[otherId] === 'war') {
                atWar = true;
                break;
            }
        }
        if (atWar) {
            scores[AI_STRATEGY.MILITARIZATION] += 20;
            scores[AI_STRATEGY.DEFENSIVE] += 15;
        }

        // Find best strategy
        let bestStrategy = AI_STRATEGY.EXPANSION;
        let bestScore = scores[bestStrategy];
        for (const strategy in scores) {
            if (scores[strategy] > bestScore) {
                bestScore = scores[strategy];
                bestStrategy = strategy;
            }
        }

        // Apply impairment - might pick suboptimal strategy
        if (Math.random() < this.config.impairmentLevel) {
            const strategies = Object.keys(scores);
            bestStrategy = strategies[Math.floor(Math.random() * strategies.length)];
        }

        this.currentStrategy = bestStrategy;
        this.strategyTurnsRemaining = 3 + Math.floor(Math.random() * 3);

        console.log(`[AI] Player ${this.playerId} strategy: ${this.currentStrategy}`);
        return this.currentStrategy;
    }

    /**
     * getStrategyWeights - Get production/action weights for current strategy
     *
     * Each strategy prioritizes different actions differently:
     * - EXPANSION: settlers > diplomacy > warriors
     * - RESEARCH: science > warriors > diplomacy
     * - MILITARIZATION: warriors > science > settlers
     * - DEFENSIVE: warriors > repair > diplomacy
     *
     * @returns {Object} Weights for different action types
     */
    getStrategyWeights() {
        const weights = {
            [AI_STRATEGY.EXPANSION]: {
                settler: 1.0, diplomacy: 0.8, warrior: 0.6, science: 0.4, repair: 0.3
            },
            [AI_STRATEGY.RESEARCH]: {
                science: 1.0, warrior: 0.6, diplomacy: 0.5, settler: 0.4, repair: 0.3
            },
            [AI_STRATEGY.MILITARIZATION]: {
                warrior: 1.0, science: 0.5, repair: 0.4, diplomacy: 0.3, settler: 0.2
            },
            [AI_STRATEGY.DEFENSIVE]: {
                warrior: 1.0, repair: 0.8, diplomacy: 0.5, science: 0.3, settler: 0.1
            }
        };

        return weights[this.currentStrategy] || weights[AI_STRATEGY.EXPANSION];
    }

    // ========================================
    // ACTION HANDLING
    // ========================================

    /**
     * handleDiplomacy - Process diplomatic actions
     */
    handleDiplomacy(gameState) {
        const actions = [];
        const player = this.engine.players[this.playerId];

        // Check for pending peace proposals directly from game state
        // This ensures we don't miss any proposals even if events weren't notified
        for (let otherId = 0; otherId < this.engine.players.length; otherId++) {
            if (otherId === this.playerId) continue;
            const otherPlayer = this.engine.players[otherId];
            if (!otherPlayer) continue;

            // Check if they proposed peace to us
            if (otherPlayer.relations[this.playerId] === 'peace_proposed') {
                if (!this.pendingPeaceProposals.includes(otherId)) {
                    this.pendingPeaceProposals.push(otherId);
                }
            }
        }

        // Handle pending peace proposals
        for (const proposerId of this.pendingPeaceProposals) {
            if (this.shouldAcceptPeace(proposerId, gameState)) {
                this.engine.acceptPeace(this.playerId, proposerId);
                actions.push({
                    type: AI_ACTION_TYPE.ACCEPT_PEACE,
                    target: proposerId
                });
            }
        }
        this.pendingPeaceProposals = [];

        // Check if we should declare war on anyone
        for (let otherId = 0; otherId < this.engine.players.length; otherId++) {
            if (otherId === this.playerId) continue;
            if (this.engine.getPlayerCities(otherId).length === 0) continue;

            const relation = player.relations[otherId];
            if (relation === 'peace' && this.shouldDeclareWar(otherId, gameState)) {
                this.engine.declareWar(this.playerId, otherId);
                actions.push({
                    type: AI_ACTION_TYPE.DECLARE_WAR,
                    target: otherId
                });
            }
        }

        // Check if we should propose peace
        for (let otherId = 0; otherId < this.engine.players.length; otherId++) {
            if (otherId === this.playerId) continue;
            if (this.engine.getPlayerCities(otherId).length === 0) continue;

            const relation = player.relations[otherId];
            if (relation === 'war' && this.shouldProposePeace(otherId, gameState)) {
                this.engine.proposePeace(this.playerId, otherId);
                actions.push({
                    type: AI_ACTION_TYPE.PROPOSE_PEACE,
                    target: otherId
                });
            }
        }

        return actions;
    }

    /**
     * handleCityProductions - Set production for all cities
     */
    handleCityProductions(gameState) {
        const actions = [];
        const weights = this.getStrategyWeights();

        for (const cityData of gameState.ownPieces.cities) {
            const city = this.engine.pieces.find(p => p.id === cityData.id);
            if (!city) continue;

            // If city already has production, maybe keep it
            if (city.production && Math.random() < 0.7) {
                continue;
            }

            // Evaluate each production option
            const options = [];

            // Warrior
            options.push({
                type: 'WARRIOR',
                score: weights.warrior * 10 + (gameState.ownPieces.warriors.length < 3 ? 5 : 0)
            });

            // Settler (only if we have good expansion spots)
            if (gameState.expansionSpots.length > 0 && gameState.ownPieces.settlers.length < 2) {
                options.push({
                    type: 'SETTLER',
                    score: weights.settler * 10 + gameState.expansionSpots[0].value * 5
                });
            }

            // Science
            options.push({
                type: 'SCIENCE',
                score: weights.science * 10 + (gameState.techLevel < 2 ? 3 : 0)
            });

            // Diplomacy (territory expansion)
            if (gameState.territory.owned < 15) {
                options.push({
                    type: 'DIPLOMACY',
                    score: weights.diplomacy * 10
                });
            }

            // Repair (only if damaged)
            if (city.hp < city.maxHp) {
                const damagePercent = 1 - (city.hp / city.maxHp);
                options.push({
                    type: 'REPAIR',
                    score: weights.repair * 10 + damagePercent * 15
                });
            }

            // Sort by score and pick best (with impairment)
            options.sort((a, b) => b.score - a.score);

            let chosen = options[0];
            if (Math.random() < this.config.impairmentLevel && options.length > 1) {
                // Pick randomly from top options
                const topOptions = options.slice(0, Math.min(3, options.length));
                chosen = topOptions[Math.floor(Math.random() * topOptions.length)];
            }

            if (chosen && city.production !== chosen.type) {
                this.engine.setProduction(city, chosen.type);
                actions.push({
                    type: AI_ACTION_TYPE.SET_PRODUCTION,
                    city: city,
                    production: chosen.type
                });
            }
        }

        return actions;
    }

    /**
     * handleUnitMoves - Move all units
     */
    handleUnitMoves(gameState) {
        const actions = [];

        // First, handle settlers (might want to build cities)
        for (const settlerData of gameState.ownPieces.settlers) {
            const settler = this.engine.pieces.find(p => p.id === settlerData.id);
            if (!settler || settler.hasMoved) continue;

            const settlerActions = this.getSettlerActions(settler, gameState);
            if (settlerActions.length > 0) {
                // Evaluate and pick best action
                settlerActions.sort((a, b) => b.score - a.score);
                const chosen = this.applyImpairment(settlerActions);

                if (chosen) {
                    const result = this.executeAction(chosen);
                    if (result.success) {
                        actions.push(chosen);
                    }
                }
            }
        }

        // Then handle warriors
        for (const warriorData of gameState.ownPieces.warriors) {
            const warrior = this.engine.pieces.find(p => p.id === warriorData.id);
            if (!warrior || warrior.hasMoved) continue;

            const warriorActions = this.getWarriorActions(warrior, gameState);
            if (warriorActions.length > 0) {
                // Evaluate and pick best action
                warriorActions.sort((a, b) => b.score - a.score);
                const chosen = this.applyImpairment(warriorActions);

                if (chosen) {
                    const result = this.executeAction(chosen);
                    if (result.success) {
                        actions.push(chosen);
                    }
                }
            }
        }

        return actions;
    }

    /**
     * getSettlerActions - Generate possible actions for a settler
     */
    getSettlerActions(settler, gameState) {
        const actions = [];

        // Check if settler can build a city here
        const canBuild = this.engine.canSettlerBuildCity(settler);
        if (canBuild.valid) {
            const buildScore = 50 + gameState.expansionHeatmap[settler.row][settler.col] * 30;
            actions.push({
                type: AI_ACTION_TYPE.BUILD_CITY,
                piece: settler,
                score: buildScore
            });
        }

        // Get valid moves
        const moves = this.engine.getValidMoves(settler);
        for (const move of moves) {
            // Score based on getting closer to good expansion spots
            let moveScore = 5; // Base score for moving

            // Bonus for moving toward best expansion spot
            if (gameState.expansionSpots.length > 0) {
                const bestSpot = gameState.expansionSpots[0];
                const currentDist = AIUtils.manhattanDistance(settler.row, settler.col, bestSpot.row, bestSpot.col);
                const newDist = AIUtils.manhattanDistance(move.row, move.col, bestSpot.row, bestSpot.col);

                if (newDist < currentDist) {
                    moveScore += (currentDist - newDist) * 5;
                }

                // Big bonus if we arrive at a good spot
                if (gameState.expansionHeatmap[move.row][move.col] > 0.5) {
                    moveScore += gameState.expansionHeatmap[move.row][move.col] * 20;
                }
            }

            // Penalty for moving into danger
            moveScore -= gameState.threatHeatmap[move.row][move.col] * 15;

            actions.push({
                type: AI_ACTION_TYPE.MOVE_UNIT,
                piece: settler,
                targetRow: move.row,
                targetCol: move.col,
                score: moveScore
            });
        }

        return actions;
    }

    /**
     * getWarriorActions - Generate possible actions for a warrior
     */
    getWarriorActions(warrior, gameState) {
        const actions = [];
        const moves = this.engine.getValidMoves(warrior);

        for (const move of moves) {
            const targetPiece = this.engine.board[move.row][move.col];

            if (targetPiece && targetPiece.ownerId !== this.playerId) {
                // This is an attack
                const attackScore = this.evaluateAttackAction(warrior, targetPiece, gameState);
                actions.push({
                    type: AI_ACTION_TYPE.ATTACK,
                    piece: warrior,
                    targetRow: move.row,
                    targetCol: move.col,
                    target: targetPiece,
                    score: attackScore
                });
            } else {
                // This is a move
                const moveScore = this.evaluateMoveAction(warrior, move.row, move.col, gameState);
                actions.push({
                    type: AI_ACTION_TYPE.MOVE_UNIT,
                    piece: warrior,
                    targetRow: move.row,
                    targetCol: move.col,
                    score: moveScore
                });
            }
        }

        // Add option to not move (might be in a good defensive position)
        const stayScore = this.evaluatePosition(warrior.row, warrior.col, { purpose: 'defend' }, gameState);
        actions.push({
            type: AI_ACTION_TYPE.MOVE_UNIT,
            piece: warrior,
            targetRow: warrior.row,
            targetCol: warrior.col,
            score: stayScore - 2, // Small penalty for not moving
            isStay: true
        });

        return actions;
    }

    // ========================================
    // ACTION GENERATION (Legacy methods for compatibility)
    // ========================================

    /**
     * generateAllActions - Generate all legal actions for this turn
     */
    generateAllActions() {
        const gameState = this.analyzeGameState();
        const actions = [];

        // Diplomacy actions
        actions.push(...this.generateDiplomacyActions());

        // Unit actions
        for (const warriorData of gameState.ownPieces.warriors) {
            const warrior = this.engine.pieces.find(p => p.id === warriorData.id);
            if (warrior && !warrior.hasMoved) {
                actions.push(...this.getWarriorActions(warrior, gameState));
            }
        }

        for (const settlerData of gameState.ownPieces.settlers) {
            const settler = this.engine.pieces.find(p => p.id === settlerData.id);
            if (settler && !settler.hasMoved) {
                actions.push(...this.getSettlerActions(settler, gameState));
            }
        }

        return actions;
    }

    /**
     * generateUnitActions - Generate actions for a specific unit
     */
    generateUnitActions(piece) {
        const gameState = this.analyzeGameState();

        if (piece.type === PIECE_TYPES.WARRIOR) {
            return this.getWarriorActions(piece, gameState);
        } else if (piece.type === PIECE_TYPES.SETTLER) {
            return this.getSettlerActions(piece, gameState);
        }

        return [];
    }

    /**
     * generateCityActions - Generate production options for a city
     */
    generateCityActions(city) {
        const actions = [];
        const weights = this.getStrategyWeights();
        const gameState = this.analyzeGameState();

        const productionTypes = ['WARRIOR', 'SETTLER', 'SCIENCE', 'DIPLOMACY'];
        if (city.hp < city.maxHp) {
            productionTypes.push('REPAIR');
        }

        for (const prodType of productionTypes) {
            let score = 0;
            switch (prodType) {
                case 'WARRIOR':
                    score = weights.warrior * 10;
                    break;
                case 'SETTLER':
                    score = weights.settler * 10;
                    break;
                case 'SCIENCE':
                    score = weights.science * 10;
                    break;
                case 'DIPLOMACY':
                    score = weights.diplomacy * 10;
                    break;
                case 'REPAIR':
                    score = weights.repair * 10 + (1 - city.hp / city.maxHp) * 15;
                    break;
            }

            actions.push({
                type: AI_ACTION_TYPE.SET_PRODUCTION,
                city: city,
                production: prodType,
                score: score
            });
        }

        return actions;
    }

    /**
     * generateDiplomacyActions - Generate diplomatic options
     */
    generateDiplomacyActions() {
        const actions = [];
        const player = this.engine.players[this.playerId];
        const gameState = this.analyzeGameState();

        for (let otherId = 0; otherId < this.engine.players.length; otherId++) {
            if (otherId === this.playerId) continue;
            if (this.engine.getPlayerCities(otherId).length === 0) continue;

            const relation = player.relations[otherId];

            if (relation === 'peace') {
                // Can declare war
                actions.push({
                    type: AI_ACTION_TYPE.DECLARE_WAR,
                    target: otherId,
                    score: this.evaluateDiplomacyAction({ type: 'war', target: otherId }, gameState)
                });
            } else if (relation === 'war') {
                // Can propose peace
                actions.push({
                    type: AI_ACTION_TYPE.PROPOSE_PEACE,
                    target: otherId,
                    score: this.evaluateDiplomacyAction({ type: 'peace', target: otherId }, gameState)
                });
            }
        }

        return actions;
    }

    // ========================================
    // ACTION EVALUATION
    // ========================================

    /**
     * evaluateActions - Score and rank all possible actions
     */
    evaluateActions(actions, gameState) {
        // Actions should already have scores, just sort them
        return actions.sort((a, b) => b.score - a.score);
    }

    /**
     * evaluateMoveAction - Score a unit movement
     */
    evaluateMoveAction(piece, targetRow, targetCol, gameState) {
        let score = 0;

        // Position evaluation
        score += this.evaluatePosition(targetRow, targetCol, { purpose: 'move' }, gameState);

        // Bonus for moving toward strategic positions
        const vulnerableCities = gameState.strategicPositions.vulnerableCities;
        if (vulnerableCities.length > 0) {
            const closestCity = vulnerableCities[0];
            const currentDist = AIUtils.chebyshevDistance(piece.row, piece.col, closestCity.row, closestCity.col);
            const newDist = AIUtils.chebyshevDistance(targetRow, targetCol, closestCity.row, closestCity.col);

            if (newDist < currentDist) {
                score += (currentDist - newDist) * 3 * closestCity.vulnerability;
            }
        }

        // Bonus for defending our cities if threatened
        for (const city of gameState.ownPieces.cities) {
            const cityThreat = gameState.threatHeatmap[city.row][city.col];
            if (cityThreat > 0.3) {
                const newDist = AIUtils.chebyshevDistance(targetRow, targetCol, city.row, city.col);
                if (newDist <= 2) {
                    score += (3 - newDist) * cityThreat * 10;
                }
            }
        }

        // Bonus for capturing territory
        const tileOwner = this.engine.tileOwnership[targetRow][targetCol];
        if (tileOwner !== this.playerId) {
            const player = this.engine.players[this.playerId];
            if (tileOwner === null) {
                score += 2; // Unowned
            } else if (player.relations[tileOwner] === 'war') {
                score += 4; // Enemy territory
            }
        }

        // Apply lookahead for higher difficulties
        if (this.config.maxLookahead > 1) {
            score += this.lookahead(gameState, { targetRow, targetCol, piece }, 1) * 0.5;
        }

        return score;
    }

    /**
     * evaluateAttackAction - Score an attack
     */
    evaluateAttackAction(attacker, defender, gameState) {
        let score = 0;

        // Base score for attacking
        score += 10;

        // Value of target
        if (defender.type === PIECE_TYPES.CITY) {
            score += 50; // Cities are very valuable
            // Extra bonus if city is low HP
            const damagePercent = 1 - (defender.hp / defender.maxHp);
            score += damagePercent * 30;

            // Check if we can kill it
            if (defender.hp <= attacker.damage) {
                score += 40; // Capture bonus
            }
        } else if (defender.type === PIECE_TYPES.SETTLER) {
            score += 25; // Settlers are valuable targets
        } else if (defender.type === PIECE_TYPES.WARRIOR) {
            score += 15;
            // Extra if we can kill it
            if (defender.hp <= attacker.damage) {
                score += 10;
            }
        }

        // Risk assessment - attacking might leave us exposed
        const attackerThreatAfter = gameState.threatHeatmap[defender.row][defender.col];
        score -= attackerThreatAfter * 10;

        // Strategic value - attacking enemies at war is better
        const player = this.engine.players[this.playerId];
        if (player.relations[defender.ownerId] === 'war') {
            score += 5;
        }

        return score;
    }

    /**
     * evaluateProductionChoice - Score a production option
     */
    evaluateProductionChoice(action, gameState) {
        const weights = this.getStrategyWeights();
        let score = 0;

        switch (action.production) {
            case 'WARRIOR':
                score = weights.warrior * 10;
                if (gameState.ownPieces.warriors.length < 2) score += 10;
                break;
            case 'SETTLER':
                score = weights.settler * 10;
                if (gameState.expansionSpots.length > 0) score += 5;
                break;
            case 'SCIENCE':
                score = weights.science * 10;
                break;
            case 'DIPLOMACY':
                score = weights.diplomacy * 10;
                break;
            case 'REPAIR':
                const city = action.city;
                const damagePercent = 1 - (city.hp / city.maxHp);
                score = weights.repair * 10 + damagePercent * 20;
                break;
        }

        return score;
    }

    /**
     * evaluateDiplomacyAction - Score a diplomatic action
     */
    evaluateDiplomacyAction(action, gameState) {
        let score = 0;
        const target = action.target;
        const relativeStrength = gameState.relativePower[target];

        if (action.type === 'war') {
            // Evaluate war declaration
            if (relativeStrength) {
                if (relativeStrength.advantage === 'strong') {
                    score += 30; // We're stronger, good to attack
                } else if (relativeStrength.advantage === 'weak') {
                    score -= 20; // We're weaker, bad idea
                }
            }

            // Check if we already have other wars
            const player = this.engine.players[this.playerId];
            let warCount = 0;
            for (const otherId in player.relations) {
                if (player.relations[otherId] === 'war') warCount++;
            }
            if (warCount > 0) {
                score -= 15 * warCount; // Multi-front war penalty
            }

            // Strategy bonus
            if (this.currentStrategy === AI_STRATEGY.MILITARIZATION) {
                score += 10;
            }

        } else if (action.type === 'peace') {
            // Evaluate peace proposal
            if (relativeStrength) {
                if (relativeStrength.advantage === 'weak') {
                    score += 25; // We're weaker, peace is good
                } else if (relativeStrength.advantage === 'strong') {
                    score -= 10; // We're stronger, maybe keep fighting
                }
            }

            // If we're defensive, peace is good
            if (this.currentStrategy === AI_STRATEGY.DEFENSIVE) {
                score += 15;
            }

            // If cities are threatened, peace is good
            if (gameState.cityThreat > 0.5) {
                score += 20;
            }
        }

        return score;
    }

    // ========================================
    // ACTION EXECUTION
    // ========================================

    /**
     * executeAction - Execute a chosen action through the game engine
     */
    executeAction(action) {
        if (!action) return { success: false };

        console.log(`[AI] Player ${this.playerId} executing: ${action.type}`);

        switch (action.type) {
            case AI_ACTION_TYPE.MOVE_UNIT:
                if (action.isStay) {
                    // Mark as moved but don't actually move
                    action.piece.hasMoved = true;
                    return { success: true };
                }
                return this.engine.movePiece(action.piece, action.targetRow, action.targetCol);

            case AI_ACTION_TYPE.ATTACK:
                return this.engine.movePiece(action.piece, action.targetRow, action.targetCol);

            case AI_ACTION_TYPE.BUILD_CITY:
                return this.engine.settlerBuildCity(action.piece);

            case AI_ACTION_TYPE.SET_PRODUCTION:
                return { success: this.engine.setProduction(action.city, action.production) };

            case AI_ACTION_TYPE.DECLARE_WAR:
                return { success: this.engine.declareWar(this.playerId, action.target) };

            case AI_ACTION_TYPE.PROPOSE_PEACE:
                return { success: this.engine.proposePeace(this.playerId, action.target) };

            case AI_ACTION_TYPE.ACCEPT_PEACE:
                return { success: this.engine.acceptPeace(this.playerId, action.target) };

            default:
                return { success: false };
        }
    }

    // ========================================
    // IMPAIRMENT SYSTEM (DIFFICULTY CONTROL)
    // ========================================

    /**
     * applyImpairment - Degrade decision quality based on difficulty
     */
    applyImpairment(rankedActions) {
        if (rankedActions.length === 0) return null;

        const config = this.config;

        // Random move chance - pick completely random
        if (Math.random() < config.randomMoveChance) {
            const randomIndex = Math.floor(Math.random() * rankedActions.length);
            return rankedActions[randomIndex];
        }

        // Impairment - chance to pick non-optimal
        if (Math.random() < config.impairmentLevel && rankedActions.length > 1) {
            // Pick from top 50% instead of best
            const topHalf = Math.ceil(rankedActions.length / 2);
            const index = Math.floor(Math.random() * topHalf);
            return rankedActions[index];
        }

        return rankedActions[0];
    }

    /**
     * shouldNoticeEvent - Check if AI notices an event (impaired at low difficulty)
     */
    shouldNoticeEvent(event) {
        return Math.random() < this.config.threatAwareness;
    }

    // ========================================
    // DIPLOMACY DECISIONS
    // ========================================

    /**
     * shouldDeclareWar - Decide whether to declare war on a player
     */
    shouldDeclareWar(targetPlayerId, gameState) {
        const relativeStrength = gameState.relativePower[targetPlayerId];
        if (!relativeStrength) return false;

        let warScore = 0;

        // Strength advantage
        if (relativeStrength.advantage === 'strong') {
            warScore += 0.4;
        } else if (relativeStrength.advantage === 'even') {
            warScore += 0.1;
        } else {
            warScore -= 0.3;
        }

        // Military ratio
        if (relativeStrength.militaryRatio > 1.5) {
            warScore += 0.3;
        }

        // Strategy influence
        if (this.currentStrategy === AI_STRATEGY.MILITARIZATION) {
            warScore += 0.2;
        }

        // Multi-front war penalty
        const player = this.engine.players[this.playerId];
        let existingWars = 0;
        for (const otherId in player.relations) {
            if (player.relations[otherId] === 'war') existingWars++;
        }
        warScore -= existingWars * 0.3;

        // Check if there are vulnerable enemy cities
        const vulnerableEnemyCities = gameState.strategicPositions.vulnerableCities.filter(
            c => this.engine.board[c.row][c.col]?.ownerId === targetPlayerId
        );
        if (vulnerableEnemyCities.length > 0) {
            warScore += 0.2;
        }

        // Compare against threshold (higher threshold = harder to declare war)
        return warScore > this.config.warThreshold;
    }

    /**
     * shouldAcceptPeace - Decide whether to accept a peace proposal
     */
    shouldAcceptPeace(proposerPlayerId, gameState) {
        const relativeStrength = gameState.relativePower[proposerPlayerId];
        if (!relativeStrength) return true; // Accept if unknown

        let peaceScore = 0.5; // Start neutral

        // If we're weaker, accept
        if (relativeStrength.advantage === 'weak') {
            peaceScore += 0.3;
        } else if (relativeStrength.advantage === 'strong') {
            peaceScore -= 0.2;
        }

        // If our cities are threatened, accept
        if (gameState.cityThreat > 0.5) {
            peaceScore += 0.3;
        }

        // If we're defensive, accept
        if (this.currentStrategy === AI_STRATEGY.DEFENSIVE) {
            peaceScore += 0.2;
        }

        // If we have multiple wars, accept
        const player = this.engine.players[this.playerId];
        let warCount = 0;
        for (const otherId in player.relations) {
            if (player.relations[otherId] === 'war') warCount++;
        }
        if (warCount > 1) {
            peaceScore += 0.2;
        }

        return peaceScore > this.config.peaceThreshold;
    }

    /**
     * shouldProposePeace - Decide whether to propose peace
     */
    shouldProposePeace(targetPlayerId, gameState) {
        const relativeStrength = gameState.relativePower[targetPlayerId];
        if (!relativeStrength) return false;

        let peaceScore = 0;

        // If we're weaker, propose peace
        if (relativeStrength.advantage === 'weak') {
            peaceScore += 0.4;
        }

        // If cities are threatened, propose peace
        if (gameState.cityThreat > 0.6) {
            peaceScore += 0.3;
        }

        // If defensive, propose peace
        if (this.currentStrategy === AI_STRATEGY.DEFENSIVE) {
            peaceScore += 0.2;
        }

        // Multi-front war consideration
        const player = this.engine.players[this.playerId];
        let warCount = 0;
        for (const otherId in player.relations) {
            if (player.relations[otherId] === 'war') warCount++;
        }
        if (warCount > 1) {
            peaceScore += 0.25;
        }

        return peaceScore > this.config.peaceThreshold;
    }

    // ========================================
    // LOOKAHEAD / MINIMAX
    // ========================================

    /**
     * lookahead - Simple minimax lookahead for action evaluation
     */
    lookahead(gameState, action, depth) {
        if (depth <= 0 || depth > this.config.maxLookahead) {
            return this.evaluateGameState(gameState);
        }

        // Simplified lookahead - just evaluate the resulting position
        const simulation = this.engine.simulateMove(
            action.piece,
            action.targetRow,
            action.targetCol
        );

        if (!simulation.valid) {
            return -100;
        }

        let value = 0;

        // Combat outcome
        if (simulation.combat) {
            if (simulation.combat.cityCapture) {
                value += 50;
            } else if (simulation.combat.defenderDestroyed) {
                value += 20;
            }
        }

        // Territory gain
        if (simulation.territoryGained) {
            value += 3;
        }

        // Piece loss risk
        if (simulation.ownPieceLost) {
            value -= 25;
        }

        // Position value
        value += this.evaluatePosition(action.targetRow, action.targetCol, { purpose: 'future' }, gameState) * 0.5;

        return value;
    }

    /**
     * evaluateGameState - Heuristic evaluation of a game state
     */
    evaluateGameState(gameState) {
        let score = 0;

        // City count (very important)
        score += gameState.ownPieces.cities.length * 30;

        // Unit count
        score += gameState.ownPieces.warriors.length * 8;
        score += gameState.ownPieces.settlers.length * 12;

        // Territory control
        score += gameState.territory.owned * 0.5;

        // Tech level
        score += gameState.techLevel * 5;

        // City health
        for (const city of gameState.ownPieces.cities) {
            score += (city.hp / city.maxHp) * 10;
        }

        // Subtract enemy strength
        for (const enemyId in gameState.enemyPieces) {
            const enemy = gameState.enemyPieces[enemyId];
            score -= enemy.cities.length * 15;
            score -= enemy.warriors.length * 4;
        }

        return score;
    }
}

// ============================================
// MONTE CARLO TREE SEARCH (EXPERIMENTAL)
// ============================================

/**
 * MCTSNode - Node in the Monte Carlo search tree
 *
 * Used by EXPERIMENTAL difficulty for more sophisticated
 * decision-making that can discover non-obvious strategies.
 */
class MCTSNode {
    constructor(state, parent = null, action = null) {
        this.state = state;
        this.parent = parent;
        this.action = action; // Action that led to this state
        this.children = [];
        this.visits = 0;
        this.value = 0;
        this.untriedActions = [];
    }

    /**
     * UCB1 - Upper Confidence Bound for action selection
     * Balances exploration vs exploitation
     */
    ucb1(explorationConstant) {
        if (this.visits === 0) return Infinity;

        const exploitation = this.value / this.visits;
        const exploration = explorationConstant *
            Math.sqrt(Math.log(this.parent.visits) / this.visits);

        return exploitation + exploration;
    }

    /**
     * select - Select best child node using UCB1
     */
    select(explorationConstant) {
        let bestChild = null;
        let bestUcb = -Infinity;

        for (const child of this.children) {
            const ucb = child.ucb1(explorationConstant);
            if (ucb > bestUcb) {
                bestUcb = ucb;
                bestChild = child;
            }
        }

        return bestChild;
    }

    /**
     * expand - Add a new child node for an untried action
     */
    expand() {
        if (this.untriedActions.length === 0) return null;

        const action = this.untriedActions.pop();
        const childState = { ...this.state }; // Would need proper state cloning
        const child = new MCTSNode(childState, this, action);
        this.children.push(child);
        return child;
    }

    /**
     * backpropagate - Update visit count and value up the tree
     */
    backpropagate(result) {
        let node = this;
        while (node !== null) {
            node.visits++;
            node.value += result;
            node = node.parent;
        }
    }
}

/**
 * MonteCarloTreeSearch - MCTS implementation for experimental AI
 *
 * This is a placeholder for future ML-enhanced MCTS that will:
 * 1. Use a neural network to guide action selection (policy network)
 * 2. Use a neural network to evaluate positions (value network)
 * 3. Run simulations to find optimal moves
 */
class MonteCarloTreeSearch {
    constructor(engine, playerId, config) {
        this.engine = engine;
        this.playerId = playerId;
        this.config = config;
        this.root = null;

        // Placeholder for neural network
        this.policyNetwork = null;
        this.valueNetwork = null;
    }

    /**
     * search - Run MCTS to find best action
     */
    search(gameState, numSimulations) {
        this.root = new MCTSNode(gameState);

        // Initialize untried actions
        // (Would need to properly generate all legal actions)

        for (let i = 0; i < numSimulations; i++) {
            // Selection
            let node = this.root;
            while (node.untriedActions.length === 0 && node.children.length > 0) {
                node = node.select(this.config.mctsExplorationConstant);
            }

            // Expansion
            if (node.untriedActions.length > 0) {
                node = node.expand();
            }

            // Simulation
            const result = this.simulate(node.state);

            // Backpropagation
            node.backpropagate(result);
        }

        // Return action with most visits
        let bestChild = null;
        let mostVisits = -1;
        for (const child of this.root.children) {
            if (child.visits > mostVisits) {
                mostVisits = child.visits;
                bestChild = child;
            }
        }

        console.log(`[MCTS] Completed ${numSimulations} simulations`);
        return bestChild ? bestChild.action : null;
    }

    /**
     * simulate - Run a simulation from a given state
     */
    simulate(state) {
        // If neural network available, use value network
        if (this.valueNetwork) {
            // return this.valueNetwork.evaluate(state);
        }

        // Otherwise, use heuristic evaluation
        // (Simplified - would need proper implementation)
        return 0;
    }

    /**
     * loadNeuralNetwork - Load pre-trained neural network
     */
    async loadNeuralNetwork(modelPath) {
        // Placeholder for TensorFlow.js or similar
        console.log(`[MCTS] Would load neural network from ${modelPath}`);
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * AIUtils - Static utility functions for AI calculations
 */
class AIUtils {
    /**
     * manhattanDistance - Calculate Manhattan distance between two points
     */
    static manhattanDistance(r1, c1, r2, c2) {
        return Math.abs(r1 - r2) + Math.abs(c1 - c2);
    }

    /**
     * chebyshevDistance - Calculate Chebyshev (chess king) distance
     * This is the relevant distance for warrior movement
     */
    static chebyshevDistance(r1, c1, r2, c2) {
        return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
    }

    /**
     * normalizeScore - Normalize a score to 0-1 range
     */
    static normalizeScore(score, min, max) {
        if (max === min) return 0.5;
        return (score - min) / (max - min);
    }

    /**
     * weightedRandom - Select from options based on weights
     */
    static weightedRandom(options, weights) {
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < options.length; i++) {
            random -= weights[i];
            if (random <= 0) return options[i];
        }

        return options[options.length - 1];
    }

    /**
     * shuffleArray - Fisher-Yates shuffle
     */
    static shuffleArray(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}

// ============================================
// AI MANAGER
// ============================================

/**
 * AIManager - Manages AI controllers for all AI players
 *
 * This is the interface between the game and AI system.
 * The GameScene/GameEngine will interact with this class.
 */
class AIManager {
    constructor(engine) {
        this.engine = engine;
        this.controllers = {}; // playerId -> AIController
    }

    /**
     * registerAIPlayer - Set up an AI controller for a player
     *
     * @param {number} playerId - Player to control with AI
     * @param {string} difficulty - Difficulty level
     */
    registerAIPlayer(playerId, difficulty = AI_DIFFICULTY.MEDIUM) {
        if (difficulty === AI_DIFFICULTY.EXPERIMENTAL) {
            // Use MCTS-based controller (falls back to regular for now)
            this.controllers[playerId] = new AIController(
                this.engine, playerId, difficulty
            );
            // Would also set up MCTS here
        } else {
            this.controllers[playerId] = new AIController(
                this.engine, playerId, difficulty
            );
        }

        console.log(`[AIManager] Registered AI for player ${playerId} (${difficulty})`);
    }

    /**
     * isAIPlayer - Check if a player is AI-controlled
     */
    isAIPlayer(playerId) {
        return playerId in this.controllers;
    }

    /**
     * getController - Get the AI controller for a player
     */
    getController(playerId) {
        return this.controllers[playerId] || null;
    }

    /**
     * executeAITurn - Execute turn for an AI player
     *
     * @param {number} playerId - AI player whose turn it is
     * @returns {Array<Object>} Actions taken
     */
    executeAITurn(playerId) {
        const controller = this.controllers[playerId];
        if (!controller) {
            console.warn(`[AIManager] No AI controller for player ${playerId}`);
            return [];
        }

        return controller.executeTurn();
    }

    /**
     * notifyEvent - Notify all AI players of an event
     *
     * @param {Object} event - Game event that occurred
     */
    notifyEvent(event) {
        for (const playerId in this.controllers) {
            this.controllers[playerId].respondToEvent(event);
        }
    }

    /**
     * getAIDifficulties - Get available difficulty levels
     */
    static getAIDifficulties() {
        return [AI_DIFFICULTY.EASY, AI_DIFFICULTY.MEDIUM, AI_DIFFICULTY.HARD];
    }
}
