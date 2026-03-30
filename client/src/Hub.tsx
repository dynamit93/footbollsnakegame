import { Link } from 'react-router-dom'
import type { ReactElement } from 'react'

const GAMES = [
  {
    id: 'soccer-snake',
    title: 'Soccer Snake',
    tagline: 'Online 1v1 — grid soccer with snake movement and a ball.',
    path: '/games/soccer-snake',
    badge: 'Multiplayer',
    tone: 'pitch',
  },
  {
    id: 'neon-hollow',
    title: 'Neon Hollow',
    tagline: 'Browser FPS — pointer lock, WASD, blast hovering targets in a neon arena.',
    path: '/games/neon-hollow',
    badge: 'Single-player',
    tone: 'neon',
  },
] as const

export function Hub(): ReactElement {
  return (
    <div className="liberty">
      <header className="liberty-header">
        <p className="liberty-mark">Game Liberty</p>
        <h1>Play in your browser</h1>
        <p className="liberty-lede">
          A lightweight library for web games — like a store shelf for instant play. Pick a title and
          jump in; no install.
        </p>
      </header>

      <section className="liberty-grid" aria-label="Game library">
        {GAMES.map((g) => (
          <article key={g.id} className={`game-card game-card--${g.tone}`}>
            <div className="game-card-top">
              <span className="game-card-badge">{g.badge}</span>
              <h2>{g.title}</h2>
              <p>{g.tagline}</p>
            </div>
            <Link to={g.path} className="game-card-play">
              Play
            </Link>
          </article>
        ))}
      </section>

      <footer className="liberty-footer">
        <p>
          More games can land here as new routes — each stays a self-contained experience under{' '}
          <code>/games/…</code>.
        </p>
      </footer>
    </div>
  )
}
