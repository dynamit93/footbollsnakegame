import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'
import { Hub } from './Hub.tsx'
import { SoccerSnakeApp } from './games/SoccerSnakeApp.tsx'
import { FpsArena } from './games/FpsArena.tsx'

export function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Hub />} />
        <Route path="/games/soccer-snake" element={<SoccerSnakeApp />} />
        <Route path="/games/neon-hollow" element={<FpsArena />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
