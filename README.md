# 🃏 UNO Online — Multiplayer Card Game

A real-time multiplayer UNO card game built with **React**, **Node.js**, **Socket.IO**, and **MongoDB**. Play with friends from any device — supports up to **10 players** per room, voice chat, emoji reactions, and full game-state persistence.

---

## 🚀 Live Demo

> Deploy on Render / Railway / Heroku — see [DEPLOY.md](./DEPLOY.md) for full instructions.

---

## 📁 Project Structure

```
uno/
├── server.js              # Express + Socket.IO backend server
├── users.js               # In-memory player slot management
├── package.json           # Server dependencies
├── .env                   # Environment variables (not committed)
│
├── models/
│   └── GameRoom.js        # Mongoose schema for game room persistence
│
├── utils/
│   ├── packOfCards.js     # Full 108-card UNO deck definition
│   └── shuffleArray.js    # Fisher-Yates shuffle utility
│
└── client/                # React frontend (Create React App)
    ├── package.json
    └── src/
        ├── App.js          # Root component + routing
        ├── App.css         # All styles (responsive + desktop panel layout)
        ├── index.js        # React entry point
        ├── index.css       # Global base styles
        │
        ├── components/
        │   ├── Homepage.js  # Landing page — join or create a room
        │   ├── Game.js      # Main game screen (all game logic lives here)
        │   ├── JoinPage.js  # Join via shared invite link
        │   └── Spinner.js   # Loading spinner component
        │
        ├── assets/
        │   ├── backgrounds/ # bgR.png, bgG.png, bgB.png, bgY.png
        │   ├── cards-front/ # PNG image for every UNO card
        │   └── sounds/      # MP3 sound effects (shuffle, skip, draw, wild, UNO, game-over)
        │
        └── utils/
            ├── packOfCards.js       # Client-side card definitions
            ├── shuffleArray.js      # Shuffle utility (client copy)
            └── randomCodeGenerator.js # Generates 5-digit room codes
```

---

## ✨ Features

### 🎮 Gameplay
- Full UNO rules: number cards, Skip, Reverse, Draw 2, Wild, Wild Draw 4
- **+2 / +4 stacking** — stack penalties on your opponent
- **Color picker modal** when playing a Wild or Wild Draw 4
- Turn indicator with animated arrow showing whose turn it is
- Playable card highlighting — only valid cards glow/are clickable
- **UNO button** — press it when you have 1 card left or get penalised
- **Draw Card** button — draw from the pile on your turn

### 👥 Multiplayer
- Up to **10 players** per room
- 5-digit room codes (shareable link or code)
- Host-controlled game start
- Player lobby with live join list
- **Game state persists in MongoDB** — players can rejoin after disconnect

### 🔊 Voice & Reactions
- **WebRTC voice chat** — talk to other players in real time (peer-to-peer)
- Mute / unmute microphone button
- **Emoji reactions** — 3 reaction buttons (😂 😢 😮) float on screen for all players

### 🖥️ Responsive UI
- **Desktop**: 480px mobile panel centered on screen with blurred background on sides
- **Mobile**: Full-screen native mobile layout
- All fixed buttons (UNO, emoji bar, mute) anchor to the game panel edges

### 🔔 Notifications
- In-game toast notifications for stack warnings, UNO calls, forced draws
- Centered, wraps on small screens, auto-dismisses after ~3 seconds

### 🔊 Sound Effects
| Action | Sound |
|--------|-------|
| Game start | Card shuffling |
| Skip card | Skip sound |
| Draw 2 | Draw 2 sound |
| Wild card | Wild sound |
| Wild Draw 4 | Draw 4 sound |
| UNO pressed | UNO sound |
| Game over | Game over jingle |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 17, React Router v5, Socket.IO Client |
| Backend | Node.js, Express 4, Socket.IO 3 |
| Database | MongoDB via Mongoose 9 |
| Real-time | Socket.IO (WebSocket) |
| Voice | WebRTC (peer-to-peer, no media server needed) |
| Styling | Pure CSS (custom, no UI framework) |
| Fonts | Google Fonts — Carter One |
| Sounds | use-sound (Howler.js wrapper) |

---

## ⚙️ Environment Variables

Create a `.env` file in the root (`uno/`) directory:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/uno
ADMIN_SECRET=your-admin-secret
```

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Port for the backend server (default: `5000`) | No |
| `MONGODB_URI` | MongoDB connection string | No (game works without DB, no persistence) |
| `ADMIN_SECRET` | Secret for the `/admin/clear-db` endpoint | No |

> Without `MONGODB_URI` the game works fully — game state is only held in memory and lost on server restart.

---

## 🧑‍💻 Local Development

### Prerequisites
- Node.js v16–v20
- npm

### 1. Clone & install

```bash
git clone https://github.com/Anvithshetty17/unoroom.git
cd unoroom

# Install server dependencies
npm install

# Install client dependencies
npm install --prefix client
```

### 2. Set up environment

```bash
# Copy and edit the env file
cp .env.example .env
```

### 3. Run the app

Open **two terminals**:

```bash
# Terminal 1 — Backend server (port 5000)
npm start

# Terminal 2 — React dev server (port 3000)
npm run client
```

Then open [http://localhost:3000](http://localhost:3000)

> **Note:** If you see `error:0308010C:digital envelope routines::unsupported`, your Node.js version is newer than react-scripts supports. The `package.json` already sets `NODE_OPTIONS=--openssl-legacy-provider` in the start/build scripts to fix this automatically.

---

## 🏗️ How It Works

### Room & Player Flow
1. Player visits homepage → enters name → clicks **CREATE GAME** (generates a random 5-digit code) or **JOIN GAME** (enters existing code)
2. Server registers the player in memory (`users.js`) and in MongoDB
3. All players in the room join a Socket.IO room identified by the code
4. Host sees the lobby; non-hosts see a waiting screen
5. Host clicks **START GAME** (minimum 2 players required)

### Game State Management
- **Server-authoritative**: the host's client calculates the new game state after each move and emits `updateGameState` to the server
- Server broadcasts it to all players in the room and persists it to MongoDB
- On reconnect, the server restores the full game state from MongoDB

### Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `join` | Client → Server | Join a room with name + code |
| `startGame` | Client → Server | Host starts the game |
| `restartGame` | Client → Server | Host restarts after game over |
| `initGameState` | Server → Client | Initial game state broadcast |
| `updateGameState` | Client ↔ Server | Every card play / draw syncs state |
| `unoAnnouncement` | Client → Server | Player presses UNO button |
| `emojiReaction` | Client → Server | Player sends emoji reaction |
| `roomData` | Server → Client | Updated player list |
| `joinVoice` / `leaveVoice` | Client → Server | WebRTC voice signaling |
| `voiceOffer` / `voiceAnswer` / `voiceIceCandidate` | Client ↔ Server | WebRTC peer connection |

### Card Naming Convention
Cards are named as `{value}{color}`:
- Number cards: `0R`, `5G`, `9B` (value + color initial)
- Skip: `skipR`, `skipG`, `skipB`, `skipY`
- Reverse: `_R`, `_G`, `_B`, `_Y`
- Draw 2: `D2R`, `D2G`, `D2B`, `D2Y`
- Wild: `W`
- Wild Draw 4: `D4W`

Colors: `R` = Red, `G` = Green, `B` = Blue, `Y` = Yellow

---

## 🗄️ Database Schema (MongoDB)

`GameRoom` document:

```js
{
  room: String,             // 5-digit room code (unique)
  playerSocketIds: Object,  // { 'PlayerName': socketId }
  gameOver: Boolean,
  winner: String,
  turn: String,             // Name of player whose turn it is
  direction: Number,        // 1 = clockwise, -1 = counter-clockwise
  players: [String],        // Ordered player list
  playerDecks: Object,      // { 'PlayerName': ['0R', '5G', ...] }
  currentColor: String,
  currentNumber: Mixed,
  playedCardsPile: [String],
  drawCardPile: [String],
  messages: [MessageSchema],
  lastActivity: Date        // TTL index — rooms auto-delete after 24h
}
```

---

## 🧹 Admin

Clear all rooms from the database:

```
GET /admin/clear-db?secret=YOUR_ADMIN_SECRET
```

---

## 📦 Production Build

```bash
# Builds React app into client/build — served by Express in production
npm run heroku-postbuild

# Or manually:
npm install --prefix client
npm run build --prefix client
npm start
```

The Express server serves the React build as static files when `NODE_ENV=production`.

---

## 📜 License

ISC — free to use and modify.
