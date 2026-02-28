import './App.css'
import { Route } from 'react-router-dom'
import Homepage from './components/Homepage'
import Game from './components/Game'
import JoinPage from './components/JoinPage'

const App = () => {
  return (
    <div className="app-outer">
      <div className="app-backdrop" />
      <div className="App">
        <Route path='/' exact component={Homepage} />
        <Route path='/play' exact component={Game} />
        <Route path='/join/:roomCode' exact component={JoinPage} />
      </div>
    </div>
  )
}

export default App
