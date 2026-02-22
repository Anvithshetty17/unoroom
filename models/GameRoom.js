const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    user: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const GameRoomSchema = new mongoose.Schema({
    room: {
        type: String,
        required: true,
        unique: true
    },
    // Per-player slot tracking: { 'Player 1': socketId, 'Player 2': socketId, ... }
    playerSocketIds: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    gameOver: {
        type: Boolean,
        default: false
    },
    winner: {
        type: String,
        default: ''
    },
    turn: {
        type: String,
        default: ''
    },
    direction: {
        type: Number,
        default: 1
    },
    // Ordered list of player names (determines turn order)
    players: {
        type: [String],
        default: []
    },
    // Per-player card decks: { 'Player 1': ['0R', ...], 'Player 2': [...], ... }
    playerDecks: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    currentColor: {
        type: String,
        default: ''
    },
    currentNumber: {
        type: mongoose.Schema.Types.Mixed,
        default: ''
    },
    playedCardsPile: {
        type: [String],
        default: []
    },
    drawCardPile: {
        type: [String],
        default: []
    },
    messages: {
        type: [MessageSchema],
        default: []
    },
    lastActivity: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Auto-delete old games after 24 hours of inactivity
GameRoomSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('GameRoom', GameRoomSchema);
