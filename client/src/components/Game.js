import React, { useEffect, useRef, useState } from 'react'
import shuffleArray from '../utils/shuffleArray'
import io from 'socket.io-client'
import queryString from 'query-string'
import useSound from 'use-sound'

import unoSound from '../assets/sounds/uno-sound.mp3'
import shufflingSound from '../assets/sounds/shuffling-cards-1.mp3'
import skipCardSound from '../assets/sounds/skip-sound.mp3'
import draw2CardSound from '../assets/sounds/draw2-sound.mp3'
import wildCardSound from '../assets/sounds/wild-sound.mp3'
import draw4CardSound from '../assets/sounds/draw4-sound.mp3'
import gameOverSound from '../assets/sounds/game-over-sound.mp3'

const ENDPOINT = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000'
const MAX_PLAYERS = 10

const Game = (props) => {
    const socketRef = useRef(null)
    const localStreamRef       = useRef(null)     // local mic MediaStream
    const peerConnectionsRef   = useRef({})        // { [socketId]: RTCPeerConnection }
    const data = queryString.parse(props.location.search)
    const _searchParams  = new URLSearchParams(props.location.search)

    const [room]         = useState(_searchParams.get('roomCode') || data.roomCode || '')
    const [roomFull, setRoomFull]   = useState(false)
    const [users, setUsers]         = useState([])
    const [currentUser, setCurrentUser] = useState('')
    const [isHost, setIsHost]           = useState(false)

    const [gameOver, setGameOver]           = useState(true)
    const [winner, setWinner]               = useState('')
    const [turn, setTurn]                   = useState('')
    const [direction, setDirection]         = useState(1)
    const [players, setPlayers]             = useState([])
    const [playerDecks, setPlayerDecks]     = useState({})
    const [currentColor, setCurrentColor]   = useState('')
    const [currentNumber, setCurrentNumber] = useState('')
    const [playedCardsPile, setPlayedCardsPile] = useState([])
    const [drawCardPile, setDrawCardPile]       = useState([])

    const [isUnoButtonPressed, setUnoButtonPressed] = useState(false)
    const [colorPickerVisible, setColorPickerVisible]   = useState(false)
    const [colorPickerCallback, setColorPickerCallback] = useState(null)
    const [toast, setToast] = useState(null)  // { msg, type: 'info'|'warn' }
    const [hasDrawn, setHasDrawn]       = useState(false)   // drew a card this turn
    const [drawnCardKey, setDrawnCardKey] = useState(null)  // which card was drawn
    const [stackPenalty, setStackPenalty] = useState(0)      // accumulated +2/+4 penalty
    const [stackType, setStackType]       = useState(null)   // 'D2' or 'D4' — last stack card type
    const [emojiReactions, setEmojiReactions] = useState([]) // [{id, name, emoji}]
    const [pressedEmoji, setPressedEmoji]     = useState(null)

    const [voiceActive, setVoiceActive]   = useState(false)
    const [isMuted, setIsMuted]           = useState(false)
    const [voicePeers, setVoicePeers]     = useState({}) // { [socketId]: peerName }

    const [playUnoSound]       = useSound(unoSound)
    const [playShufflingSound] = useSound(shufflingSound)
    const [playSkipCardSound]  = useSound(skipCardSound)
    const [playDraw2CardSound] = useSound(draw2CardSound)
    const [playWildCardSound]  = useSound(wildCardSound)
    const [playDraw4CardSound] = useSound(draw4CardSound)
    const [playGameOverSound]  = useSound(gameOverSound)

    useEffect(() => {
        const socket = io.connect(ENDPOINT, {
            forceNew: true,
            reconnectionAttempts: 'Infinity',
            timeout: 10000,
            transports: ['websocket']
        })
        socketRef.current = socket
        socket.emit('join', { room, name: data.name || '' }, (error) => {
            if (error) setRoomFull(true)
        })
        return () => {
            Object.values(peerConnectionsRef.current).forEach(pc => pc.close())
            Object.keys(peerConnectionsRef.current).forEach(id => {
                const a = document.getElementById('voice-audio-' + id)
                if (a) a.remove()
            })
            if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop())
            socket.disconnect()
            socket.off()
        }
    }, [])

    useEffect(() => {
        const socket = socketRef.current
        socket.on('initGameState', (state) => {
            setGameOver(state.gameOver)
            setWinner(state.winner || '')
            setTurn(state.turn || '')
            setDirection(state.direction || 1)
            setPlayers(state.players || [])
            setPlayerDecks(state.playerDecks || {})
            setCurrentColor(state.currentColor || '')
            setCurrentNumber(state.currentNumber !== undefined ? state.currentNumber : '')
            setPlayedCardsPile(state.playedCardsPile || [])
            setDrawCardPile(state.drawCardPile || [])
            setStackPenalty(state.stackPenalty || 0)
            setStackType(state.stackType || null)
            // reset per-turn UI state when a new game starts
            setHasDrawn(false)
            setDrawnCardKey(null)
            setUnoButtonPressed(false)
        })

        socket.on('updateGameState', (state) => {
            if (state.gameOver !== undefined) setGameOver(state.gameOver)
            if (state.gameOver === true) playGameOverSound()
            if (state.winner  !== undefined) setWinner(state.winner)
            if (state.turn    !== undefined) setTurn(state.turn)
            if (state.direction  !== undefined) setDirection(state.direction)
            if (state.players)     setPlayers(state.players)
            if (state.playerDecks) setPlayerDecks(state.playerDecks)
            if (state.currentColor)  setCurrentColor(state.currentColor)
            if (state.currentNumber !== undefined) setCurrentNumber(state.currentNumber)
            if (state.playedCardsPile) setPlayedCardsPile(state.playedCardsPile)
            if (state.drawCardPile)    setDrawCardPile(state.drawCardPile)
            if (state.stackPenalty !== undefined) setStackPenalty(state.stackPenalty)
            if (state.stackType   !== undefined) setStackType(state.stackType)
            setUnoButtonPressed(false)
            setHasDrawn(false)
            setDrawnCardKey(null)
        })

        socket.on('roomData',       ({ users }) => setUsers(users))
        socket.on('currentUserData',({ name, isHost: h }) => { setCurrentUser(name); setIsHost(!!h) })

        socket.on('unoAnnouncement', ({ name }) => {
            showToast(`🎴 ${name} said UNO!`, 'info')
        })

        socket.on('emojiReaction', ({ name, emoji }) => {
            const id = Date.now() + Math.random()
            setEmojiReactions(prev => [...prev, { id, name, emoji }])
            setTimeout(() => setEmojiReactions(prev => prev.filter(r => r.id !== id)), 2600)
        })

        // ── WebRTC Voice Chat ─────────────────────────────────────────
        socket.on('voiceExistingPeers', async (peers) => {
            for (const { peerId, peerName } of peers) {
                const pc = createPeerConnection(peerId, peerName)
                try {
                    const offer = await pc.createOffer()
                    await pc.setLocalDescription(offer)
                    socket.emit('voiceOffer', { targetId: peerId, offer })
                } catch (err) { console.error('Voice offer error:', err) }
            }
        })

        socket.on('voicePeerJoined', ({ peerId, peerName }) => {
            createPeerConnection(peerId, peerName)
        })

        socket.on('voiceOffer', async ({ peerId, offer }) => {
            let pc = peerConnectionsRef.current[peerId]
            if (!pc) pc = createPeerConnection(peerId, 'Unknown')
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(offer))
                const answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)
                socket.emit('voiceAnswer', { targetId: peerId, answer })
            } catch (err) { console.error('Voice answer error:', err) }
        })

        socket.on('voiceAnswer', async ({ peerId, answer }) => {
            const pc = peerConnectionsRef.current[peerId]
            if (pc) {
                try { await pc.setRemoteDescription(new RTCSessionDescription(answer)) }
                catch (_) {}
            }
        })

        socket.on('voiceIceCandidate', async ({ peerId, candidate }) => {
            const pc = peerConnectionsRef.current[peerId]
            if (pc) {
                try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) }
                catch (_) {}
            }
        })

        socket.on('voicePeerLeft', ({ peerId }) => {
            closePeerConnection(peerId)
        })
    }, [])

    const nextPlayer = (currentTurn, dir, playerList, skip = 0) => {
        const n = playerList.length
        if (n === 0) return ''
        const idx = playerList.indexOf(currentTurn)
        if (idx === -1) return playerList[0]
        return playerList[((idx + dir * (1 + skip)) % n + n) % n]
    }

    const ensureCards = (drawPile, playedPile, needed) => {
        if (drawPile.length >= needed || playedPile.length <= 1) return
        const top = playedPile[playedPile.length - 1]
        const reshuffled = shuffleArray([...playedPile.slice(0, -1), ...drawPile])
        drawPile.length = 0;  drawPile.push(...reshuffled)
        playedPile.length = 0; playedPile.push(top)
    }

    const showColorPicker  = (cb) => { setColorPickerCallback(() => cb); setColorPickerVisible(true) }
    const handleColorSelect = (color) => {
        setColorPickerVisible(false)
        setColorPickerCallback(prev => { if (prev) prev(color); return null })
    }

    // Auto-join voice when game starts, leave when game ends
    useEffect(() => {
        if (!gameOver && winner === '') {
            // game just started — join voice muted
            if (!voiceActive) joinVoice()
        } else {
            // game over / lobby — leave voice
            if (voiceActive) leaveVoice()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameOver])

    const showToast = (msg, type = 'info') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    // Server handles all deck creation / shuffling to avoid stale closure bugs
    const startGame = () => {
        if (!isHost || users.length < 2) return
        socketRef.current && socketRef.current.emit('startGame')
    }

    // ── WebRTC Voice Chat helpers ─────────────────────────────────
    const createPeerConnection = (peerId, peerName) => {
        const pc = new RTCPeerConnection({ iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]})
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track =>
                pc.addTrack(track, localStreamRef.current)
            )
        }
        pc.ontrack = (e) => {
            const audioId = 'voice-audio-' + peerId
            let audio = document.getElementById(audioId)
            if (!audio) {
                audio = document.createElement('audio')
                audio.id = audioId
                audio.autoplay = true
                document.body.appendChild(audio)
            }
            audio.srcObject = e.streams[0]
        }
        pc.onicecandidate = (e) => {
            if (e.candidate && socketRef.current) {
                socketRef.current.emit('voiceIceCandidate', { targetId: peerId, candidate: e.candidate })
            }
        }
        peerConnectionsRef.current[peerId] = pc
        setVoicePeers(prev => ({ ...prev, [peerId]: peerName }))
        return pc
    }

    const closePeerConnection = (peerId) => {
        if (peerConnectionsRef.current[peerId]) {
            peerConnectionsRef.current[peerId].close()
            delete peerConnectionsRef.current[peerId]
        }
        const audio = document.getElementById('voice-audio-' + peerId)
        if (audio) audio.remove()
        setVoicePeers(prev => { const n = { ...prev }; delete n[peerId]; return n })
    }

    const joinVoice = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            // start muted — user must press button to unmute
            stream.getAudioTracks().forEach(t => { t.enabled = false })
            localStreamRef.current = stream
            setIsMuted(true)
            setVoiceActive(true)
            socketRef.current && socketRef.current.emit('joinVoice')
        } catch (_) {
            // mic denied — still join as listener (speaker always on)
            localStreamRef.current = null
            setIsMuted(true)
            setVoiceActive(true)
            socketRef.current && socketRef.current.emit('joinVoice')
        }
    }

    const leaveVoice = () => {
        Object.keys(peerConnectionsRef.current).forEach(id => closePeerConnection(id))
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop())
            localStreamRef.current = null
        }
        socketRef.current && socketRef.current.emit('leaveVoice')
        setVoiceActive(false)
        setIsMuted(false)
        setVoicePeers({})
    }

    const toggleMute = () => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0]
            if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled) }
        }
    }

    const onCardPlayedHandler = (played_card) => {
        if (turn !== currentUser) return
        const myDeck = [...(playerDecks[currentUser] || [])]
        const removeIndex = myDeck.indexOf(played_card)
        if (removeIndex === -1) return

        const isSkip    = played_card.startsWith('skip')
        const isReverse = played_card.startsWith('_')
        const isDraw2   = played_card.startsWith('D2')
        const isWild    = played_card === 'W'
        const isDraw4   = played_card === 'D4W'
        const cardColor = (isWild || isDraw4) ? null : played_card[played_card.length - 1]
        const cardNum   = isSkip ? 404 : isReverse ? '_' : isDraw2 ? 252 : isWild ? 300 : isDraw4 ? 600 : played_card[0]

        if (!isWild && !isDraw4) {
            const colorOk = cardColor === currentColor
            const numOk   = String(cardNum) === String(currentNumber)
            if (!colorOk && !numOk) { showToast('Invalid move! Match the color or number.', 'warn'); return }
        }

        // Stack rule: when a penalty is active, only allowed cards may be played
        if (stackPenalty > 0) {
            if (stackType === 'D4' && !isDraw4) {
                showToast(`+4 was stacked! Only +4 can stack now, or TAKE ${stackPenalty} CARDS.`, 'warn'); return
            }
            if (stackType === 'D2' && !isDraw2 && !isDraw4) {
                showToast(`Stack active! Play +2 or +4, or TAKE ${stackPenalty} CARDS.`, 'warn'); return
            }
        }

        const copiedDraw   = [...drawCardPile]
        const copiedPlayed = [...playedCardsPile]
        if (myDeck.length === 2 && !isUnoButtonPressed) {
            showToast('Forgot UNO! +2 cards as penalty.', 'warn')
            ensureCards(copiedDraw, copiedPlayed, 2)
            myDeck.push(copiedDraw.pop())
            myDeck.push(copiedDraw.pop())
        }

        myDeck.splice(removeIndex, 1)
        const newDecks   = { ...playerDecks, [currentUser]: myDeck }
        const isWinner   = myDeck.length === 0
        const newPlayed  = [...copiedPlayed, played_card]
        const base = {
            playerDecks: newDecks,
            playedCardsPile: newPlayed,
            drawCardPile: copiedDraw,
            ...(isWinner ? { gameOver: true, winner: currentUser } : {})
        }

        if (isWild) {
            showColorPicker((newColor) => {
                playWildCardSound()
                socketRef.current && socketRef.current.emit('updateGameState', {
                    ...base,
                    currentColor: newColor,
                    currentNumber: 300,
                    turn: isWinner ? turn : nextPlayer(currentUser, direction, players)
                })
            }); return
        }

        if (isDraw4) {
            showColorPicker((newColor) => {
                playDraw4CardSound()
                const newPenalty = stackPenalty + 4
                socketRef.current && socketRef.current.emit('updateGameState', {
                    ...base,
                    currentColor: newColor, currentNumber: 600,
                    stackPenalty: newPenalty,
                    stackType: 'D4',
                    turn: isWinner ? turn : nextPlayer(currentUser, direction, players)
                })
            }); return
        }

        if (isSkip) {
            playSkipCardSound()
            socketRef.current && socketRef.current.emit('updateGameState', {
                ...base,
                currentColor: cardColor, currentNumber: 404,
                turn: isWinner ? turn : nextPlayer(currentUser, direction, players, 1)
            }); return
        }

        if (isReverse) {
            const newDir  = direction * -1
            const newTurn = isWinner ? turn
                : (players.length === 2 ? currentUser : nextPlayer(currentUser, newDir, players))
            playShufflingSound()
            socketRef.current && socketRef.current.emit('updateGameState', {
                ...base,
                currentColor: cardColor, currentNumber: '_',
                direction: newDir, turn: newTurn
            }); return
        }

        if (isDraw2) {
            playDraw2CardSound()
            const newPenalty = stackPenalty + 2
            socketRef.current && socketRef.current.emit('updateGameState', {
                ...base,
                currentColor: cardColor, currentNumber: 252,
                stackPenalty: newPenalty,
                stackType: 'D2',
                turn: isWinner ? turn : nextPlayer(currentUser, direction, players)
            }); return
        }

        playShufflingSound()
        socketRef.current && socketRef.current.emit('updateGameState', {
            ...base,
            currentColor: cardColor, currentNumber: cardNum,
            turn: isWinner ? turn : nextPlayer(currentUser, direction, players)
        })
    }

    const onCardDrawnHandler = () => {
        if (turn !== currentUser || hasDrawn) return
        const copiedDraw   = [...drawCardPile]
        const copiedPlayed = [...playedCardsPile]
        ensureCards(copiedDraw, copiedPlayed, 1)
        if (copiedDraw.length === 0) return

        const drawnCard = copiedDraw.pop()
        const newDecks  = { ...playerDecks }
        newDecks[currentUser] = [...(playerDecks[currentUser] || []), drawnCard]

        const isWildD    = drawnCard === 'W'
        const isDraw4D   = drawnCard === 'D4W'
        const cardColorD = (isWildD || isDraw4D) ? null : drawnCard[drawnCard.length - 1]
        const cardNumD   = drawnCard.startsWith('skip') ? 404
            : drawnCard.startsWith('_') ? '_'
            : drawnCard.startsWith('D2') ? 252
            : isWildD ? 300 : isDraw4D ? 600 : drawnCard[0]

        const canPlay = isWildD || isDraw4D
            || (cardColorD && cardColorD === currentColor)
            || String(cardNumD) === String(currentNumber)

        playShufflingSound()
        // Update locally only — no socket emit yet (avoids listener resetting hasDrawn)
        setPlayerDecks(newDecks)
        setDrawCardPile(copiedDraw)
        setHasDrawn(true)
        setDrawnCardKey(drawnCard)
        if (canPlay) {
            showToast('Card drawn! You can play it or PASS your turn.', 'info')
        } else {
            showToast('No match \u2014 press PASS TURN to continue.', 'warn')
        }
    }

    // Pass turn after drawing without playing
    const onPassTurn = () => {
        if (!hasDrawn) return
        setHasDrawn(false)
        setDrawnCardKey(null)
        socketRef.current && socketRef.current.emit('updateGameState', {
            playerDecks,
            playedCardsPile,
            drawCardPile,
            stackPenalty: 0,
            stackType: null,
            turn: nextPlayer(currentUser, direction, players)
        })
    }

    // Accept the stacked penalty — draw all accumulated cards
    const onTakeStackedCards = () => {
        if (stackPenalty === 0) return
        const copiedDraw   = [...drawCardPile]
        const copiedPlayed = [...playedCardsPile]
        ensureCards(copiedDraw, copiedPlayed, stackPenalty)
        const myNewCards = [...(playerDecks[currentUser] || [])]
        for (let i = 0; i < stackPenalty; i++) {
            if (copiedDraw.length > 0) myNewCards.push(copiedDraw.pop())
        }
        const newDecks = { ...playerDecks, [currentUser]: myNewCards }
        playDraw2CardSound()
        socketRef.current && socketRef.current.emit('updateGameState', {
            playerDecks: newDecks,
            drawCardPile: copiedDraw,
            playedCardsPile,
            stackPenalty: 0,
            stackType: null,
            turn: nextPlayer(currentUser, direction, players)
        })
    }

    const myCards       = playerDecks[currentUser] || []
    const opponentNames = players.filter(p => p !== currentUser)
    const isMyTurn      = turn === currentUser
    const inLobby       = gameOver && winner === ''
    // A drawn card is "playable" if it can be put on the pile right now
    const drawnCardPlayable = drawnCardKey && (() => {
        const c = drawnCardKey
        if (c === 'W' || c === 'D4W') return true
        const col = c[c.length - 1]
        const num = c.startsWith('skip') ? 404 : c.startsWith('_') ? '_' : c.startsWith('D2') ? 252 : c[0]
        return col === currentColor || String(num) === String(currentNumber)
    })()

    return (
        <div className='Game backgroundColorR'>
            {!roomFull ? (
                <>
                    <div className='topInfo'>
                        <img src={require('../assets/logo.png').default} alt='UNO' />
                        <h1>Game Code: {room}</h1>
                    </div>

                    {inLobby && (
                        <div className='waitingCard'>
                            <h2 className='waitingTitle'>Lobby</h2>
                            <p className='waitingSubtitle'>{users.length} / {MAX_PLAYERS} players joined</p>
                            <ul className='lobbyPlayerList'>
                                {users.map((u, idx) => (
                                    <li key={u.name} className='lobbyPlayerItem'>
                                        <span className='lobbyPlayerName'>{u.name}</span>
                                        {idx === 0 && <span className='lobbyHostBadge'>HOST</span>}
                                    </li>
                                ))}
                            </ul>
                            {isHost ? (
                                <>
                                    <div className='waitingCodeBox'>
                                        <span className='waitingCodeLabel'>GAME CODE</span>
                                        <div className='waitingCodeRow'>
                                            <span className='waitingCode'>{room}</span>
                                            <button className='copyBtn' onClick={(e) => {
                                                const btn = e.currentTarget
                                                navigator.clipboard.writeText(room).then(() => {
                                                    btn.textContent = 'Copied!'
                                                    setTimeout(() => { btn.textContent = 'Copy' }, 1500)
                                                }).catch(() => { btn.textContent = 'Copy' })
                                            }} title='Copy code'>Copy</button>
                                        </div>
                                    </div>
                                    <button className='shareLinkBtn' onClick={async (e) => {
                                        const btn = e.currentTarget
                                        const link = `${window.location.origin}/join/${room}`
                                        if (navigator.share) {
                                            try {
                                                await navigator.share({
                                                    title: 'Join my UNO game!',
                                                    text: `Join my UNO ROOM — just enter your name and play! 🎴`,
                                                    url: link
                                                })
                                            } catch (_) {}
                                        } else {
                                            navigator.clipboard.writeText(link).then(() => {
                                                btn.textContent = '✅ Link Copied!'
                                                setTimeout(() => { btn.textContent = '🔗 Share Invite Link' }, 2000)
                                            }).catch(() => {})
                                        }
                                    }}>🔗 Share Invite Link</button>
                                    <p className='waitingHint'>Share the link or code, then press Start</p>
                                    <button
                                        className={`game-button ${users.length >= 2 ? 'green' : ''}`}
                                        disabled={users.length < 2}
                                        onClick={startGame}
                                        style={{marginTop: '14px', width: '100%'}}
                                    >
                                        {users.length < 2 ? 'Waiting for players...' : `START GAME (${users.length} players)`}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className='waitingSpinnerRing'><div/><div/><div/><div/></div>
                                    <p className='waitingHint'>Waiting for Player 1 (host) to start...</p>
                                </>
                            )}
                        </div>
                    )}

                    {gameOver && winner !== '' && (
                        <div className='gameOverScreen'>
                            <div className='goTrophy'>🏆</div>
                            <p className='goCongrats'>CONGRATULATIONS!</p>
                            <h1 className='goWinnerName'>{winner}</h1>
                            <p className='goSubtitle'>wins the game!</p>
                            <div className='goDivider' />
                            <p className='goPlayersLabel'>{users.length} / {MAX_PLAYERS} PLAYERS</p>
                            <ul className='goPlayerList'>
                                {users.map((u, idx) => {
                                    const isWin = u.name === winner
                                    const isHst = idx === 0
                                    return (
                                        <li key={u.name} className={`goPlayerItem${isWin ? ' goPlayerItemWin' : ''}`}>
                                            <span className='goPlayerName'>
                                                {isWin ? '👑 ' : ''}{u.name}
                                            </span>
                                            <span className='goBadges'>
                                                {isHst && <span className='goBadgeHost'>HOST</span>}
                                                {isWin && <span className='goBadgeWinner'>WINNER</span>}
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                            {isHost ? (
                                <button
                                    className='game-button green restartBtn'
                                    onClick={() => socketRef.current && socketRef.current.emit('restartGame')}
                                >
                                    🔄 Play Again ({users.length} players)
                                </button>
                            ) : (
                                <div className='waitingRestart'>
                                    <div className='waitingSpinnerRing'><div/><div/><div/><div/></div>
                                    <p>Waiting for host to restart...</p>
                                </div>
                            )}
                        </div>
                    )}

                    {!gameOver && (
                        <div>
                            <div className='opponentsArea'>
                                {opponentNames.map(p => (
                                    <div key={p} className={`opponentSection${turn === p ? ' opponentActive' : ''}`}>
                                        <p className='opponentLabel'>{p}</p>
                                        <div className='opponentBadge'>{(playerDecks[p] || []).length}</div>
                                    </div>
                                ))}
                            </div>

                            <div className={`turnIndicator ${isMyTurn ? 'myTurn' : 'theirTurn'}`}>
                                <span className='turnArrow'>{isMyTurn ? '\u25BC' : '\u25B2'}</span>
                                <span className='turnLabel'>{isMyTurn ? 'YOUR TURN' : `${turn}'S TURN`}</span>
                            </div>

                            <div className='middleInfo' style={!isMyTurn ? {pointerEvents: 'none'} : null}>
                                <div className='pileArea'>
                                    {playedCardsPile.length > 0 && (
                                        <img className='Card pileCard'
                                            src={require(`../assets/cards-front/${playedCardsPile[playedCardsPile.length - 1]}.png`).default}
                                            alt='pile' />
                                    )}
                                    {currentColor && (() => { const top = playedCardsPile[playedCardsPile.length - 1]; return (top === 'W' || top === 'D4W'); })() && (
                                        <div className={`colorIndicator colorIndicator${currentColor}`}>
                                            <span className='colorIndicatorLabel'>{{'R':'RED','G':'GREEN','B':'BLUE','Y':'YELLOW'}[currentColor]}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Desktop: UNO + draw/pass stacked */}
                                <div className='middleButtons'>
                                    <button className='game-button orange'
                                        disabled={myCards.length !== 2}
                                        onClick={() => { setUnoButtonPressed(!isUnoButtonPressed); playUnoSound(); if (!isUnoButtonPressed) socketRef.current && socketRef.current.emit('unoAnnouncement', { name: currentUser }) }}>  
                                        UNO
                                    </button>
                                    {stackPenalty > 0 ? (
                                        <button className='game-button red stackTakeBtn'
                                            disabled={!isMyTurn}
                                            onClick={onTakeStackedCards}>
                                            TAKE {stackPenalty}
                                        </button>
                                    ) : hasDrawn ? (
                                        <button className='game-button passBtn'
                                            onClick={onPassTurn}>
                                            PASS TURN
                                        </button>
                                    ) : (
                                        <button className='game-button'
                                            disabled={!isMyTurn}
                                            onClick={onCardDrawnHandler}>
                                            DRAW CARD
                                        </button>
                                    )}
                                </div>

                                {/* Mobile: card-back image + draw/pass below */}
                                <div className='drawPileArea'>
                                    <img className='Card cardBackImg'
                                        src={require('../assets/card-back.png').default}
                                        alt='draw pile' />
                                    {stackPenalty > 0 ? (
                                        <button className='game-button red stackTakeBtn'
                                            disabled={!isMyTurn}
                                            onClick={onTakeStackedCards}>
                                            TAKE {stackPenalty}
                                        </button>
                                    ) : hasDrawn ? (
                                        <button className='game-button passBtn'
                                            onClick={onPassTurn}>
                                            PASS TURN
                                        </button>
                                    ) : (
                                        <button className='game-button'
                                            disabled={!isMyTurn}
                                            onClick={onCardDrawnHandler}>
                                            DRAW CARD
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Emoji reaction bar — fixed above UNO button, mobile only */}
                            <div className='emojiBar'>
                                {['😂','😤','😢'].map(em => (
                                    <button
                                        key={em}
                                        className={`emojiBtn${pressedEmoji === em ? ' emojiBtn--pop' : ''}`}
                                        onClick={() => {
                                            socketRef.current && socketRef.current.emit('emojiReaction', { emoji: em })
                                            setPressedEmoji(em)
                                            setTimeout(() => setPressedEmoji(null), 350)
                                        }}
                                    >{em}</button>
                                ))}
                            </div>

                            {/* Mobile UNO button — fixed bottom-right */}
                            <button className='game-button orange unoFixedBtn'
                                disabled={myCards.length !== 2}
onClick={() => { setUnoButtonPressed(!isUnoButtonPressed); playUnoSound(); if (!isUnoButtonPressed) socketRef.current && socketRef.current.emit('unoAnnouncement', { name: currentUser }) }}>  
                                UNO
                            </button>

                            {/* Stack penalty banner */}
                            {stackPenalty > 0 && (
                                <div className='stackBanner'>
                                    ⚠ +{stackPenalty} penalty! {stackType === 'D4' ? 'Only +4 can stack now' : 'Play +2 or +4 to stack'}, or TAKE {stackPenalty}
                                </div>
                            )}

                            <div className='player1Deck ownDeck' style={!isMyTurn ? {pointerEvents: 'none'} : null}>
                                <p className='playerDeckText'>{currentUser} (You)</p>
                                {myCards.map((card, i) => {
                                    const isDrawn    = card === drawnCardKey
                                    const isPlayable = isDrawn && drawnCardPlayable
                                    const isStackable = stackPenalty > 0 && isMyTurn && (
                                        stackType === 'D4' ? card === 'D4W' : (card.startsWith('D2') || card === 'D4W')
                                    )
                                    return (
                                        <img key={i}
                                            className={`Card${isPlayable ? ' drawnPlayable' : isDrawn ? ' drawnCard' : isStackable ? ' stackableCard' : ''}`}
                                            onClick={() => onCardPlayedHandler(card)}
                                            src={require(`../assets/cards-front/${card}.png`).default}
                                            alt={card} />
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <h1 style={{color:'#fff', textAlign:'center', marginTop:'40px'}}>
                    Room is full (max {MAX_PLAYERS} players)
                </h1>
            )}

            {toast && (
                <div className={`gameToast gameToast--${toast.type}`}>
                    <span className='gameToastIcon'>{toast.type === 'warn' ? '!' : 'i'}</span>
                    {toast.msg}
                </div>
            )}

            {/* Floating emoji reactions */}
            <div className='emojiReactionArea'>
                {emojiReactions.map(r => (
                    <div key={r.id} className='emojiReactionFloat'>
                        <span className='emojiReactionEmoji'>{r.emoji}</span>
                        <span className='emojiReactionName'>{r.name}</span>
                    </div>
                ))}
            </div>

            {/* Voice Chat — only during active game */}
            {!gameOver && (
            <div className='voiceContainer'>
                <button
                    className={`voiceMicBtn${voiceActive ? (isMuted ? ' voiceMicMuted' : ' voiceMicActive') : ''}`}
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                    {isMuted ? '🔇' : '🎙️'}
                </button>
            </div>
            )}

            {colorPickerVisible && (
                <div className='colorPickerOverlay'>
                    <div className='colorPickerModal'>
                        <h2>Choose a Color</h2>
                        <div className='colorPickerButtons'>
                            <button className='colorBtn colorBtnRed'    onClick={() => handleColorSelect('R')}><span className='colorBtnLabel'>Red</span></button>
                            <button className='colorBtn colorBtnGreen'  onClick={() => handleColorSelect('G')}><span className='colorBtnLabel'>Green</span></button>
                            <button className='colorBtn colorBtnBlue'   onClick={() => handleColorSelect('B')}><span className='colorBtnLabel'>Blue</span></button>
                            <button className='colorBtn colorBtnYellow' onClick={() => handleColorSelect('Y')}><span className='colorBtnLabel'>Yellow</span></button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Game