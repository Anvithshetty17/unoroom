require('dotenv').config()
const express = require('express')
const socketio = require('socket.io')
const http = require('http')
const cors = require('cors')
const mongoose = require('mongoose')
const { addUser, removeUser, getUser, getUsersInRoom } = require('./users')
const GameRoom = require('./models/GameRoom')
const path = require('path')
const PACK_OF_CARDS = require('./utils/packOfCards')
const shuffleArray  = require('./utils/shuffleArray')

const ACTION_CARDS = ['skipR','skipG','skipB','skipY','_R','_G','_B','_Y','D2R','D2G','D2B','D2Y','W','D4W']

const PORT = process.env.PORT || 5000
const MONGODB_URI = process.env.MONGODB_URI

// Connect to MongoDB
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => {
        console.error('MongoDB connection error:', err.message)
        console.log('Server will continue without database persistence')
    })
} else {
    console.log('No MongoDB URI provided. Running without database persistence.')
}

const isDBConnected = () => mongoose.connection.readyState === 1

// ── Periodic cleanup: remove DB rooms older than 24 h (backup to TTL index) ──
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
setInterval(async () => {
    if (!isDBConnected()) return
    try {
        const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS)
        const result = await GameRoom.deleteMany({ lastActivity: { $lt: cutoff } })
        if (result.deletedCount > 0)
            console.log(`Cleanup: removed ${result.deletedCount} expired room(s) from DB`)
    } catch (err) {
        console.error('Cleanup error:', err.message)
    }
}, 60 * 60 * 1000) // runs every hour

const app = express()
const server = http.createServer(app)
const io = socketio(server)
const voiceRooms = {} // roomCode -> Set<socketId> of voice participants

app.use(cors())
app.use(express.json())

// ── Admin: clear all DB data ──────────────────────────────────────────────────
// Visit: /admin/clear-db?secret=YOUR_SECRET
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'uno-clear-2024'
app.get('/admin/clear-db', async (req, res) => {
    if (req.query.secret !== ADMIN_SECRET) {
        return res.status(403).json({ error: 'Forbidden — wrong secret' })
    }
    try {
        const result = await GameRoom.deleteMany({})
        return res.json({ ok: true, deleted: result.deletedCount, message: `Deleted ${result.deletedCount} room(s) from DB` })
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
})
// ─────────────────────────────────────────────────────────────────────────────

io.on('connection', socket => {
    socket.on('join', async (payload, callback) => {
        // Register in-memory user first (atomic slot assignment — no race condition)
        const { error, newUser } = addUser({
            id: socket.id,
            room: payload.room,
            name: payload.name
        })

        if (error)
            return callback(error)

        // Persist socket ID to DB for the assigned player slot
        if (isDBConnected()) {
            try {
                await GameRoom.findOneAndUpdate(
                    { room: payload.room },
                    { $set: { [`playerSocketIds.${newUser.name}`]: socket.id } },
                    { upsert: true }
                )
            } catch (err) {
                console.error('Error saving player slot to DB:', err)
            }
        }

        socket.join(newUser.room)

        io.to(newUser.room).emit('roomData', { room: newUser.room, users: getUsersInRoom(newUser.room) })
        socket.emit('currentUserData', { name: newUser.name, isHost: newUser.isHost })

        // ── Restore game state from DB (only genuine in-progress games) ───
        if (isDBConnected()) {
            try {
                const existingGame = await GameRoom.findOne({ room: newUser.room })

                // If the host is joining fresh (first player in room), wipe any stale DB record
                if (newUser.isHost) {
                    if (existingGame) {
                        await GameRoom.deleteOne({ room: newUser.room })
                        console.log(`Cleared stale DB record for room: ${newUser.room}`)
                    }
                } else if (
                    existingGame &&
                    !existingGame.gameOver &&
                    existingGame.players && existingGame.players.length > 0 &&
                    existingGame.playedCardsPile && existingGame.playedCardsPile.length > 0
                ) {
                    // Only restore if it's a real game with actual data
                    socket.emit('initGameState', {
                        gameOver: existingGame.gameOver,
                        winner: existingGame.winner,
                        turn: existingGame.turn,
                        direction: existingGame.direction || 1,
                        players: existingGame.players || [],
                        playerDecks: existingGame.playerDecks || {},
                        currentColor: existingGame.currentColor,
                        currentNumber: existingGame.currentNumber,
                        playedCardsPile: existingGame.playedCardsPile,
                        drawCardPile: existingGame.drawCardPile
                    })
                }
            } catch (err) {
                console.error('Error restoring game state on join:', err)
            }
        }

        callback()
    })

    // ── Start Game (server-authoritative) ───────────────────────────────
    socket.on('startGame', async () => {
        const user = getUser(socket.id)
        if (!user || !user.isHost) return
        const roomUsers = getUsersInRoom(user.room)
        if (roomUsers.length < 2) return

        const playerList = roomUsers.map(u => u.name)
        const shuffled   = shuffleArray([...PACK_OF_CARDS])
        const decks = {}
        playerList.forEach(p => { decks[p] = shuffled.splice(0, 7) })

        // Pick a non-action starting card
        let si
        while (true) {
            si = Math.floor(Math.random() * shuffled.length)
            if (!ACTION_CARDS.includes(shuffled[si])) break
        }
        const startCard  = shuffled.splice(si, 1)[0]
        const startColor = startCard[startCard.length - 1]
        const startNum   = startCard[0]

        const gameState = {
            gameOver: false,
            winner: '',
            turn: playerList[0],
            direction: 1,
            players: playerList,
            playerDecks: decks,
            currentColor: startColor,
            currentNumber: startNum,
            playedCardsPile: [startCard],
            drawCardPile: shuffled
        }

        io.to(user.room).emit('initGameState', gameState)

        if (isDBConnected()) {
            try {
                await GameRoom.findOneAndUpdate(
                    { room: user.room },
                    { $set: { ...gameState, room: user.room, lastActivity: Date.now() } },
                    { upsert: true, new: true }
                )
            } catch (err) {
                console.error('Error saving initial game state:', err)
            }
        }
    })

    // ── Restart Game (host only — reuses all current room members) ─────────
    socket.on('restartGame', async () => {
        const user = getUser(socket.id)
        if (!user || !user.isHost) return
        const roomUsers = getUsersInRoom(user.room)
        if (roomUsers.length < 2) return

        const playerList = roomUsers.map(u => u.name)
        const shuffled   = shuffleArray([...PACK_OF_CARDS])
        const decks = {}
        playerList.forEach(p => { decks[p] = shuffled.splice(0, 7) })

        let si
        while (true) {
            si = Math.floor(Math.random() * shuffled.length)
            if (!ACTION_CARDS.includes(shuffled[si])) break
        }
        const startCard  = shuffled.splice(si, 1)[0]
        const startColor = startCard[startCard.length - 1]
        const startNum   = startCard[0]

        const gameState = {
            gameOver: false,
            winner: '',
            turn: playerList[0],
            direction: 1,
            players: playerList,
            playerDecks: decks,
            currentColor: startColor,
            currentNumber: startNum,
            playedCardsPile: [startCard],
            drawCardPile: shuffled
        }

        io.to(user.room).emit('initGameState', gameState)

        if (isDBConnected()) {
            try {
                await GameRoom.findOneAndUpdate(
                    { room: user.room },
                    { $set: { ...gameState, room: user.room, lastActivity: Date.now() } },
                    { upsert: true, new: true }
                )
            } catch (err) {
                console.error('Error saving restarted game state:', err)
            }
        }
    })

    socket.on('initGameState', async gameState => {
        const user = getUser(socket.id)
        if (user) {
            io.to(user.room).emit('initGameState', gameState)

            if (isDBConnected()) {
                try {
                    await GameRoom.findOneAndUpdate(
                        { room: user.room },
                        {
                            $set: {
                                ...gameState,
                                room: user.room,
                                lastActivity: Date.now()
                            }
                        },
                        { upsert: true, new: true }
                    )
                    console.log(`Game state initialized for room: ${user.room}`)
                } catch (err) {
                    console.error('Error saving initial game state:', err)
                }
            }
        }
    })

    socket.on('updateGameState', async gameState => {
        const user = getUser(socket.id)
        if (user) {
            io.to(user.room).emit('updateGameState', gameState)

            if (isDBConnected()) {
                try {
                    if (gameState.gameOver === true) {
                        await GameRoom.deleteOne({ room: user.room })
                        console.log(`Game over — room deleted from DB: ${user.room}`)
                    } else {
                        await GameRoom.findOneAndUpdate(
                            { room: user.room },
                            {
                                $set: {
                                    ...gameState,
                                    lastActivity: Date.now()
                                }
                            },
                            { new: true }
                        )
                        console.log(`Game state updated for room: ${user.room}`)
                    }
                } catch (err) {
                    console.error('Error updating game state:', err)
                }
            }
        }
    })

    socket.on('unoAnnouncement', ({ name }) => {
        const user = getUser(socket.id)
        if (user) {
            io.to(user.room).emit('unoAnnouncement', { name })
        }
    })

    socket.on('emojiReaction', ({ emoji }) => {
        const user = getUser(socket.id)
        if (user) {
            io.to(user.room).emit('emojiReaction', { name: user.name, emoji })
        }
    })

    // ── WebRTC Voice Chat Signaling ──────────────────────────────────
    socket.on('joinVoice', () => {
        const user = getUser(socket.id)
        if (!user) return
        if (!voiceRooms[user.room]) voiceRooms[user.room] = new Set()
        const existingPeerIds = [...voiceRooms[user.room]]
        // Tell joining peer about everyone already in voice
        socket.emit('voiceExistingPeers', existingPeerIds.map(id => {
            const u = getUser(id)
            return { peerId: id, peerName: u ? u.name : 'Unknown' }
        }))
        // Tell existing voice peers about the new joiner
        existingPeerIds.forEach(id => {
            io.to(id).emit('voicePeerJoined', { peerId: socket.id, peerName: user.name })
        })
        voiceRooms[user.room].add(socket.id)
    })

    socket.on('leaveVoice', () => {
        const user = getUser(socket.id)
        if (!user) return
        if (voiceRooms[user.room]) {
            voiceRooms[user.room].delete(socket.id)
            if (voiceRooms[user.room].size === 0) delete voiceRooms[user.room]
        }
        socket.to(user.room).emit('voicePeerLeft', { peerId: socket.id })
    })

    socket.on('voiceOffer', ({ targetId, offer }) => {
        io.to(targetId).emit('voiceOffer', { peerId: socket.id, offer })
    })

    socket.on('voiceAnswer', ({ targetId, answer }) => {
        io.to(targetId).emit('voiceAnswer', { peerId: socket.id, answer })
    })

    socket.on('voiceIceCandidate', ({ targetId, candidate }) => {
        io.to(targetId).emit('voiceIceCandidate', { peerId: socket.id, candidate })
    })

    socket.on('sendMessage', async (payload, callback) => {
        const user = getUser(socket.id)
        if (!user) return

        const messageObj = { user: user.name, text: payload.message }
        io.to(user.room).emit('message', messageObj)

        // Persist message to DB
        if (isDBConnected()) {
            try {
                await GameRoom.findOneAndUpdate(
                    { room: user.room },
                    {
                        $push: { messages: { ...messageObj, timestamp: Date.now() } },
                        $set: { lastActivity: Date.now() }
                    }
                )
            } catch (err) {
                console.error('Error saving message to DB:', err)
            }
        }

        callback()
    })

    socket.on('disconnect', async () => {
        const user = removeUser(socket.id)
        if (user) {
            // Voice cleanup on disconnect
            if (voiceRooms[user.room]) {
                voiceRooms[user.room].delete(socket.id)
                if (voiceRooms[user.room].size === 0) delete voiceRooms[user.room]
            }
            io.to(user.room).emit('voicePeerLeft', { peerId: socket.id })

            const remaining = getUsersInRoom(user.room)
            io.to(user.room).emit('roomData', { room: user.room, users: remaining })

            if (isDBConnected()) {
                try {
                    // If room is now empty, wipe all DB data for it
                    if (remaining.length === 0) {
                        await GameRoom.deleteOne({ room: user.room })
                        console.log(`Room ${user.room} is empty — DB record deleted`)
                    } else {
                        // Free the player slot
                        const dbRoom = await GameRoom.findOne({ room: user.room })
                        if (dbRoom) {
                            const socketIds = dbRoom.playerSocketIds || {}
                            const slotKey = Object.keys(socketIds).find(k => socketIds[k] === socket.id)
                            if (slotKey) {
                                await GameRoom.findOneAndUpdate(
                                    { room: user.room },
                                    { $set: { [`playerSocketIds.${slotKey}`]: null } }
                                )
                            }
                        }
                    }
                } catch (err) {
                    console.error('Error on disconnect cleanup:', err)
                }
            }
        }
    })
})

//serve static assets in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static('client/build'))
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'))
    })
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
