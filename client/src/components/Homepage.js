import React, { useState } from 'react'
import { Link, useHistory } from 'react-router-dom'
import randomCodeGenerator from '../utils/randomCodeGenerator'

const Homepage = () => {
    const [roomCode, setRoomCode] = useState('')
    // pre-fill from localStorage if returning user
    const [playerName, setPlayerName] = useState(() => localStorage.getItem('uno_player_name') || '')
    const [newRoomCode] = useState(() => randomCodeGenerator(5))
    const history = useHistory()

    const [botDifficulty, setBotDifficulty] = useState('normal')

    const encodedName = encodeURIComponent(playerName.trim())

    const saveName = () => {
        if (playerName.trim()) localStorage.setItem('uno_player_name', playerName.trim())
    }

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
                            <button className="game-button green" disabled={!playerName.trim() || !roomCode.trim()} onClick={saveName}>JOIN GAME</button>
                        </Link>
                    </div>
                    <h1>OR</h1>
                    <div className='homepage-create'>
                        <Link to={`/play?roomCode=${newRoomCode}&name=${encodedName}`}>
                            <button className="game-button orange" disabled={!playerName.trim()} onClick={saveName}>CREATE MULTIPLAYER GAME</button>
                        </Link>
                        
                        <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                            <select 
                                value={botDifficulty} 
                                onChange={e => setBotDifficulty(e.target.value)} 
                                className='homepage-name-input' 
                                style={{ margin: 0, width: '100%', boxSizing: 'border-box' }}
                            >
                                <option value='easy'>Difficulty: Easy</option>
                                <option value='normal'>Difficulty: Normal</option>
                                <option value='hard'>Difficulty: Hard</option>
                            </select>
                            <button 
                                className="game-button orange" 
                                style={{ backgroundColor: '#2980b9', width: '100%', margin: 0 }} 
                                disabled={!playerName.trim()} 
                                onClick={() => {
                                    saveName();
                                    history.push(`/play?roomCode=${newRoomCode}-BOT&name=${encodedName}&botMode=true&botDifficulty=${botDifficulty}`);
                                }}
                            >
                                PLAY WITH BOT
                            </button>
                        </div>
                    </div>
                    {!playerName.trim() && <p className='homepage-name-hint'>Enter your name to play</p>}
                </div>
            </div>
        </div>
    )
}

export default Homepage
