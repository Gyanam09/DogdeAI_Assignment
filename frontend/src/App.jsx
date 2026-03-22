import { useState, useCallback, useEffect } from 'react'
import { Search, X, GitBranch, MessageSquare, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react'
import GraphCanvas from './components/GraphCanvas'
import ChatPanel from './components/ChatPanel'

export default function App() {
  const [chatOpen, setChatOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [highlightedIds, setHighlightedIds] = useState([])
  const [theme, setTheme] = useState('dark')

  // Apply theme to document root so all CSS variables respond
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light')
  const isDark = theme === 'dark'

  const handleSearch = useCallback(async (q) => {
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const resp = await fetch(`/api/graph/search?q=${encodeURIComponent(q)}&limit=10`)
      const data = await resp.json()
      setSearchResults(data)
    } catch (_) {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  const TYPE_COLOR = {
    SalesOrder: isDark ? '#7c6af7' : '#6c5ce7',
    Delivery: isDark ? '#2dd4c4' : '#00b4d8',
    BillingDoc: isDark ? '#f5a623' : '#f59e0b',
    JournalEntry: isDark ? '#34d399' : '#10b981',
    Customer: '#d946ef',
    Material: isDark ? '#60a5fa' : '#3b82f6',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-0)', transition: 'background 0.2s ease' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .search-result:hover { background: var(--accent-dim) !important; }
        .chat-toggle:hover { background: var(--accent-dim) !important; }
        .theme-toggle:hover { background: var(--bg-3) !important; }
      `}</style>

      {/* Top bar */}
      <header style={{
        height: 52,
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        background: 'var(--header-bg)',
        flexShrink: 0,
        zIndex: 30,
        boxShadow: 'var(--header-shadow)',
        transition: 'background 0.2s ease',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginRight: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--teal) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <GitBranch size={14} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              ContextGraph
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Order to Cash
            </div>
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--input-bg)',
            border: '1px solid var(--border-bright)',
            borderRadius: 8, padding: '0 10px', height: 32,
            transition: 'background 0.2s ease',
          }}>
            {searching
              ? <div style={{ width: 13, height: 13, border: '1.5px solid var(--border-bright)', borderTop: `1.5px solid var(--accent)`, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              : <Search size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            }
            <input
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search nodes by ID or name..."
              style={{
                background: 'none', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: 12, flex: 1,
                fontFamily: 'var(--font-mono)',
              }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Search dropdown */}
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: 36, left: 0, right: 0,
              background: 'var(--search-dropdown-bg)',
              border: '1px solid var(--border-bright)',
              borderRadius: 8, overflow: 'hidden',
              boxShadow: 'var(--search-dropdown-shadow)',
              zIndex: 50,
            }}>
              {searchResults.map(r => {
                const color = TYPE_COLOR[r.type] || '#888'
                return (
                  <div
                    key={r.id}
                    className="search-result"
                    onClick={() => { setSearchQuery(''); setSearchResults([]); setSelectedNode(r) }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'background 0.1s',
                    }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{r.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {r.type} · {r.id}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* Theme toggle */}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: 32, height: 32, borderRadius: 7,
              background: 'var(--bg-2)',
              border: '1px solid var(--border-bright)',
              color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', flexShrink: 0,
            }}
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* Chat toggle */}
          <button
            className="chat-toggle"
            onClick={() => setChatOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: chatOpen ? 'var(--accent-dim)' : 'var(--bg-2)',
              border: `1px solid ${chatOpen ? 'var(--accent-glow)' : 'var(--border-bright)'}`,
              color: chatOpen ? 'var(--accent)' : 'var(--text-secondary)',
              borderRadius: 7, padding: '0 12px', height: 32, fontSize: 12,
              transition: 'all 0.15s', cursor: 'pointer',
            }}
          >
            <MessageSquare size={12} />
            {chatOpen ? 'Hide Chat' : 'Show Chat'}
            {chatOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
        </div>
      </header>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Graph canvas */}
        <div style={{ flex: 1, transition: 'all 0.25s ease', overflow: 'hidden', position: 'relative' }}>
          <GraphCanvas onNodeSelect={setSelectedNode} externalNode={selectedNode} theme={theme} highlightedIds={highlightedIds} />
        </div>

        {/* Chat panel */}
        <div style={{
          width: chatOpen ? 380 : 0,
          flexShrink: 0,
          borderLeft: chatOpen ? '1px solid var(--border)' : 'none',
          overflow: 'hidden',
          transition: 'width 0.25s ease',
        }}>
          <div style={{ width: 380, height: '100%' }}>
            <ChatPanel theme={theme} onHighlight={setHighlightedIds} />
          </div>
        </div>
      </div>
    </div>
  )
}
