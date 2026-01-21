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
        // PLACEHOLDER: Implementation will:
        // 1. Call analyzeGameState() to get current situation
        // 2. Call updateStrategy() to determine focus
        // 3. Call handleDiplomacy() for peace proposals
        // 4. Loop: generateActions() -> evaluateActions() -> executeAction()
        // 5. Return list of actions taken

        console.log(`[AI] Player ${this.playerId} executing turn (${this.difficulty})`);
        return [];
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
        // PLACEHOLDER: Implementation will:
        // 1. Add event to memory
        // 2. Check if event requires immediate response
        // 3. For peace proposals, store for consideration on next turn
        // 4. For war declarations, potentially shift to defensive strategy
        // 5. For attacks, mark aggressor as priority target

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
        // PLACEHOLDER: Implementation will use engine's analysis functions:
        // - engine.getGameStateForAI(this.playerId)
        // - engine.getThreatHeatmap(this.playerId)
        // - engine.getOpportunityHeatmap(this.playerId)
        // - engine.getPlayerStrength(playerId) for all players
        // - engine.getTerritoryControl()

        return {
            ownStrength: 0,
            threats: [],
            opportunities: [],
            relativePower: {},
            territoryControl: 0,
            techAdvantage: 0
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
     * @returns {number} Position score (higher = better)
     */
    evaluatePosition(row, col, context = {}) {
        // PLACEHOLDER: Implementation will calculate weighted score from:
        // - Heatmap values at position
        // - Distance metrics
        // - Strategic importance
        // Score will be impaired based on difficulty

        return 0;
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
        // PLACEHOLDER: Implementation will:
        // 1. Calculate score for each strategy based on game state
        // 2. Apply randomization based on difficulty
        // 3. Consider strategy stickiness
        // 4. Update this.currentStrategy and strategyTurnsRemaining

        // Strategy selection logic:
        // - EXPANSION when: early game, few cities, territory available
        // - RESEARCH when: mid game, tech behind, stable borders
        // - MILITARIZATION when: enemies weak, war declared, under attack
        // - DEFENSIVE when: cities threatened, outnumbered

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
        // PLACEHOLDER: Return weights based on this.currentStrategy

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
    // ACTION GENERATION
    // ========================================

    /**
     * generateAllActions - Generate all legal actions for this turn
     *
     * Iterates through all owned pieces and cities to find:
     * - Valid moves for each unit
     * - Valid attacks for each warrior
     * - Valid city-building spots for settlers
     * - Production options for each city
     * - Diplomatic options with each player
     *
     * @returns {Array<Object>} List of all possible actions
     */
    generateAllActions() {
        // PLACEHOLDER: Implementation will:
        // 1. Get all pieces owned by this.playerId
        // 2. For each unit: engine.getValidMoves()
        // 3. For each settler: check canSettlerBuildCity()
        // 4. For each city: check production options
        // 5. Check diplomatic options with each player

        return [];
    }

    /**
     * generateUnitActions - Generate actions for a specific unit
     *
     * @param {Object} piece - The unit to generate actions for
     * @returns {Array<Object>} Possible actions for this unit
     */
    generateUnitActions(piece) {
        // PLACEHOLDER: Implementation will:
        // 1. If warrior: movement + attack options
        // 2. If settler: movement + city building
        // 3. Each action includes target position and expected outcome

        return [];
    }

    /**
     * generateCityActions - Generate production options for a city
     *
     * @param {Object} city - The city to generate options for
     * @returns {Array<Object>} Possible production choices
     */
    generateCityActions(city) {
        // PLACEHOLDER: Implementation will:
        // 1. Check what production options are beneficial
        // 2. Consider current production (should it change?)
        // 3. Consider repair if city is damaged

        return [];
    }

    /**
     * generateDiplomacyActions - Generate diplomatic options
     *
     * @returns {Array<Object>} Possible diplomatic actions
     */
    generateDiplomacyActions() {
        // PLACEHOLDER: Implementation will:
        // 1. Check relations with each player
        // 2. For peace: can we benefit from attacking them?
        // 3. For war: should we propose peace?
        // 4. Consider pending peace proposals

        return [];
    }

    // ========================================
    // ACTION EVALUATION
    // ========================================

    /**
     * evaluateActions - Score and rank all possible actions
     *
     * Each action is scored based on:
     * - Immediate value (damage dealt, territory gained)
     * - Strategic value (alignment with current strategy)
     * - Future value (positioning, setup for next turn)
     * - Risk assessment (potential losses)
     *
     * @param {Array<Object>} actions - List of possible actions
     * @param {Object} gameState - Current game state analysis
     * @returns {Array<Object>} Actions sorted by score (best first)
     */
    evaluateActions(actions, gameState) {
        // PLACEHOLDER: Implementation will:
        // 1. Calculate base score for each action
        // 2. Apply strategy weights
        // 3. Apply lookahead evaluation (minimax-style)
        // 4. Apply impairment based on difficulty
        // 5. Sort by final score

        return actions;
    }

    /**
     * evaluateMoveAction - Score a unit movement
     *
     * @param {Object} action - The move action
     * @param {Object} gameState - Current game state
     * @returns {number} Score for this action
     */
    evaluateMoveAction(action, gameState) {
        // PLACEHOLDER: Consider:
        // - Does this improve position? (heatmap comparison)
        // - Does this threaten enemy pieces?
        // - Does this protect our pieces?
        // - Does this capture territory?

        return 0;
    }

    /**
     * evaluateAttackAction - Score an attack
     *
     * @param {Object} action - The attack action
     * @param {Object} gameState - Current game state
     * @returns {number} Score for this action
     */
    evaluateAttackAction(action, gameState) {
        // PLACEHOLDER: Consider:
        // - Value of target (city > warrior > settler)
        // - Probability of success
        // - Risk to attacking unit
        // - Strategic importance of target

        return 0;
    }

    /**
     * evaluateProductionChoice - Score a production option
     *
     * @param {Object} action - The production action
     * @param {Object} gameState - Current game state
     * @returns {number} Score for this action
     */
    evaluateProductionChoice(action, gameState) {
        // PLACEHOLDER: Consider:
        // - Alignment with current strategy
        // - Current needs (units, tech, territory)
        // - Time to completion vs urgency

        return 0;
    }

    /**
     * evaluateDiplomacyAction - Score a diplomatic action
     *
     * @param {Object} action - The diplomatic action
     * @param {Object} gameState - Current game state
     * @returns {number} Score for this action
     */
    evaluateDiplomacyAction(action, gameState) {
        // PLACEHOLDER: Consider:
        // - Relative strength vs target
        // - Current military engagements
        // - Strategic benefit of peace/war
        // - Multi-front war risks

        return 0;
    }

    // ========================================
    // ACTION EXECUTION
    // ========================================

    /**
     * executeAction - Execute a chosen action through the game engine
     *
     * @param {Object} action - The action to execute
     * @returns {Object} Result of the action
     */
    executeAction(action) {
        // PLACEHOLDER: Implementation will call appropriate engine methods:
        // - MOVE_UNIT/ATTACK: engine.movePiece()
        // - BUILD_CITY: engine.settlerBuildCity()
        // - SET_PRODUCTION: engine.setProduction()
        // - DECLARE_WAR: engine.declareWar()
        // - PROPOSE_PEACE: engine.proposePeace()
        // - ACCEPT_PEACE: engine.acceptPeace()

        console.log(`[AI] Executing action: ${action.type}`);
        return { success: false };
    }

    // ========================================
    // IMPAIRMENT SYSTEM (DIFFICULTY CONTROL)
    // ========================================

    /**
     * applyImpairment - Degrade decision quality based on difficulty
     *
     * Impairment works in several ways:
     * 1. Random chance to pick suboptimal action
     * 2. Noise added to evaluation scores
     * 3. Reduced lookahead depth
     * 4. Chance to "miss" threats
     *
     * @param {Array<Object>} rankedActions - Actions sorted by score
     * @returns {Object} The action to take (possibly not the best one)
     */
    applyImpairment(rankedActions) {
        // PLACEHOLDER: Implementation will:
        // 1. Check randomMoveChance - if triggered, return random action
        // 2. Apply impairmentLevel to potentially pick non-optimal action
        // 3. Lower difficulties have higher chance to pick worse actions

        if (rankedActions.length === 0) return null;

        const config = this.config;

        // Random move chance
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
     *
     * @param {Object} event - The event to potentially notice
     * @returns {boolean} Whether the AI notices this event
     */
    shouldNoticeEvent(event) {
        return Math.random() < this.config.threatAwareness;
    }

    // ========================================
    // DIPLOMACY DECISIONS
    // ========================================

    /**
     * shouldDeclareWar - Decide whether to declare war on a player
     *
     * Considers:
     * - Relative military strength
     * - Current number of wars
     * - Strategic benefit (cities to capture)
     * - Difficulty-based war threshold
     *
     * @param {number} targetPlayerId - Player to potentially attack
     * @param {Object} gameState - Current game state
     * @returns {boolean} Whether to declare war
     */
    shouldDeclareWar(targetPlayerId, gameState) {
        // PLACEHOLDER: Implementation will calculate war score based on:
        // - Own vs target military strength
        // - Potential gains (cities, territory)
        // - Risk of multi-front war
        // - Compare score against config.warThreshold

        return false;
    }

    /**
     * shouldAcceptPeace - Decide whether to accept a peace proposal
     *
     * Considers:
     * - Current war status (winning/losing?)
     * - Benefits of continued war
     * - Other ongoing conflicts
     * - Difficulty-based peace threshold
     *
     * @param {number} proposerPlayerId - Player proposing peace
     * @param {Object} gameState - Current game state
     * @returns {boolean} Whether to accept peace
     */
    shouldAcceptPeace(proposerPlayerId, gameState) {
        // PLACEHOLDER: Implementation will calculate peace score based on:
        // - Current war progress
        // - Resource drain of war
        // - Other threats
        // - Compare score against config.peaceThreshold

        return false;
    }

    /**
     * shouldProposePeace - Decide whether to propose peace
     *
     * @param {number} targetPlayerId - Player to propose peace to
     * @param {Object} gameState - Current game state
     * @returns {boolean} Whether to propose peace
     */
    shouldProposePeace(targetPlayerId, gameState) {
        // PLACEHOLDER: Inverse of war decision logic

        return false;
    }

    // ========================================
    // LOOKAHEAD / MINIMAX
    // ========================================

    /**
     * lookahead - Simple minimax lookahead for action evaluation
     *
     * Used by MEDIUM and HARD difficulties to evaluate
     * the consequences of actions multiple turns ahead.
     *
     * @param {Object} gameState - Current state
     * @param {Object} action - Action to evaluate
     * @param {number} depth - How many turns to look ahead
     * @returns {number} Expected value of this action
     */
    lookahead(gameState, action, depth) {
        // PLACEHOLDER: Implementation will:
        // 1. Simulate the action
        // 2. Generate opponent responses
        // 3. Recursively evaluate to depth limit
        // 4. Return minimax value
        //
        // Depth is limited by config.maxLookahead

        if (depth <= 0) {
            return this.evaluateGameState(gameState);
        }

        return 0;
    }

    /**
     * evaluateGameState - Heuristic evaluation of a game state
     *
     * @param {Object} gameState - State to evaluate
     * @returns {number} Score (positive = good for AI, negative = bad)
     */
    evaluateGameState(gameState) {
        // PLACEHOLDER: Weighted sum of:
        // - City count difference
        // - Unit count difference
        // - Territory control
        // - Tech level
        // - City health

        return 0;
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
     *
     * @param {number} explorationConstant - Controls exploration (sqrt(2) typical)
     * @returns {number} UCB1 score
     */
    ucb1(explorationConstant) {
        // PLACEHOLDER: UCB1 = value/visits + c * sqrt(ln(parent.visits) / visits)
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
        // PLACEHOLDER: Return child with highest UCB1 score
        return null;
    }

    /**
     * expand - Add a new child node for an untried action
     */
    expand() {
        // PLACEHOLDER: Pop action from untriedActions, create child node
        return null;
    }

    /**
     * backpropagate - Update visit count and value up the tree
     */
    backpropagate(result) {
        // PLACEHOLDER: Walk up to root, updating visits and value
    }
}

/**
 * MonteCarloTreeSearch - MCTS implementation for experimental AI
 *
 * This is a placeholder for future ML-enhanced MCTS that will:
 * 1. Use a neural network to guide action selection (policy network)
 * 2. Use a neural network to evaluate positions (value network)
 * 3. Run simulations to find optimal moves
 *
 * The neural network will be trained offline on game data and
 * loaded when experimental mode is selected.
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
     *
     * @param {Object} gameState - Current game state
     * @param {number} numSimulations - Number of simulations to run
     * @returns {Object} Best action found
     */
    search(gameState, numSimulations) {
        // PLACEHOLDER: Implementation will:
        // 1. Create root node from current state
        // 2. For numSimulations iterations:
        //    a. Selection: traverse tree using UCB1
        //    b. Expansion: add new node for unexplored action
        //    c. Simulation: play out to terminal or use value network
        //    d. Backpropagation: update node values
        // 3. Return action with most visits from root

        console.log(`[MCTS] Running ${numSimulations} simulations`);
        return null;
    }

    /**
     * simulate - Run a simulation from a given state
     *
     * Either plays randomly to conclusion or uses value network
     * to estimate the outcome.
     *
     * @param {Object} state - State to simulate from
     * @returns {number} Estimated value for AI player
     */
    simulate(state) {
        // PLACEHOLDER: If neural network available, use it
        // Otherwise, random playout

        return 0;
    }

    /**
     * loadNeuralNetwork - Load pre-trained neural network
     *
     * The network is trained separately and stored in a model file.
     * This method loads it for use in search.
     *
     * @param {string} modelPath - Path to model file
     */
    async loadNeuralNetwork(modelPath) {
        // PLACEHOLDER: Load TensorFlow.js or similar model
        // Policy network: state -> action probabilities
        // Value network: state -> expected outcome

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
    registerAIPlayer(playerId, difficulty) {
        // PLACEHOLDER: Create appropriate controller based on difficulty

        if (difficulty === AI_DIFFICULTY.EXPERIMENTAL) {
            // Use MCTS-based controller
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
        return Object.values(AI_DIFFICULTY);
    }
}
