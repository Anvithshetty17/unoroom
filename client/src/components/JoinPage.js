import React, { useState } from 'react'
import { useHistory, useParams } from 'react-router-dom'

const JoinPage = () => {
    const { roomCode } = useParams()
    const history = useHistory()
    const [playerName, setPlayerName] = useState('')

    const handleJoin = () => {
        const name = playerName.trim()
        if (!name) return
        history.push(`/play?roomCode=${roomCode}&name=${encodeURIComponent(name)}`)
    }

    return (
        <div className='Homepage'>
            <div className='homepage-menu'>
                <img src={require('../assets/logo.png').default} width='200px' alt='UNO' />
                <div className='homepage-form'>
                    <div className='joinPageCodeBadge'>
                        <span className='joinPageCodeLabel'>ROOM CODE</span>
                        <span className='joinPageCodeValue'>{roomCode}</span>
                    </div>
                    <input
                        className='homepage-name-input'
                        type='text'
                        placeholder='Enter Your Name'
                        maxLength={16}
                        value={playerName}
                        onChange={e => setPlayerName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleJoin()}
                        autoFocus
                    />
                    <button
                        className='game-button green'
                        style={{ marginTop: '10px', width: '220px' }}
                        disabled={!playerName.trim()}
                        onClick={handleJoin}
                    >
                        JOIN GAME
                    </button>
                    {!playerName.trim() && (
                        <p className='homepage-name-hint'>Enter your name to join</p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default JoinPage
