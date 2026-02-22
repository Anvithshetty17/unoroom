import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import randomCodeGenerator from '../utils/randomCodeGenerator'

const Homepage = () => {
    const [roomCode, setRoomCode] = useState('')
    const [playerName, setPlayerName] = useState('')
    // Generate once on mount so it doesn't change while typing the name
    const [newRoomCode] = useState(() => randomCodeGenerator(5))

    const encodedName = encodeURIComponent(playerName.trim())

    return (
        <div className='Homepage'>
            <div className='homepage-menu'>
                <img src={require('../assets/logo.png').default} width='200px' />
                <div className='homepage-form'>
                    <input
                        className='homepage-name-input'
                        type='text'
                        placeholder='Your Name'
                        maxLength={16}
                        value={playerName}
                        onChange={e => setPlayerName(e.target.value)}
                    />
                    <div className='homepage-join'>
                        <input type='text' placeholder='Game Code' onChange={(event) => setRoomCode(event.target.value)} />
                        <Link to={`/play?roomCode=${roomCode}&name=${encodedName}`}>
                            <button className="game-button green" disabled={!playerName.trim() || !roomCode.trim()}>JOIN GAME</button>
                        </Link>
                    </div>
                    <h1>OR</h1>
                    <div className='homepage-create'>
                        <Link to={`/play?roomCode=${newRoomCode}&name=${encodedName}`}>
                            <button className="game-button orange" disabled={!playerName.trim()}>CREATE GAME</button>
                        </Link>
                    </div>
                    {!playerName.trim() && <p className='homepage-name-hint'>Enter your name to play</p>}
                </div>
            </div>
        </div>
    )
}

export default Homepage
