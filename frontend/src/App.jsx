import { useState, useCallback } from 'react'
import { Search, X, GitBranch, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import GraphCanvas from './components/GraphCanvas'
import ChatPanel from './components/ChatPanel'

export default function App() {
  const [chatOpen, setChatOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-0)' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .search-result:hover { background: rgba(124,106,247,0.1) !important; }
        .chat-toggle:hover { background: rgba(124,106,247,0.15) !important; }
      `}</style>

      {/* Top bar */}
      <header style={{
        height: 52,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        background: 'rgba(10,10,14,0.98)',
        backdropFilter: 'blur(10px)',
        flexShrink: 0,
        zIndex: 30,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginRight: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, #7c6af7 0%, #2dd4c4 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <GitBranch size={14} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f0eff5', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              ContextGraph
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>
              Order to Cash
            </div>
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.07)' }} />

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 8, padding: '0 10px', height: 32,
          }}>
            {searching
              ? <div style={{ width: 13, height: 13, border: '1.5px solid rgba(255,255,255,0.2)', borderTop: '1.5px solid #7c6af7', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              : <Search size={13} color="rgba(255,255,255,0.35)" style={{ flexShrink: 0 }} />
            }
            <input
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search nodes by ID or name..."
              style={{
                background: 'none', border: 'none', outline: 'none',
                color: '#f0eff5', fontSize: 12, flex: 1,
                fontFamily: 'var(--font-mono)',
              }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', padding: 0, display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Search dropdown */}
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: 36, left: 0, right: 0,
              background: 'rgba(16,16,22,0.98)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 8, overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              zIndex: 50,
            }}>
              {searchResults.map(r => {
                const color = {
                  SalesOrder: '#7c6af7', Delivery: '#2dd4c4', BillingDoc: '#f5a623',
                  JournalEntry: '#34d399', Customer: '#e879f9', Material: '#60a5fa',
                }[r.type] || '#888'
                return (
                  <div
                    key={r.id}
                    className="search-result"
                    onClick={() => { setSearchQuery(''); setSearchResults([]); setSelectedNode(r) }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'background 0.1s',
                    }}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: color, flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontSize: 12, color: '#f0eff5' }}>{r.label}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>
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
          {/* Chat toggle */}
          <button
            className="chat-toggle"
            onClick={() => setChatOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: chatOpen ? 'rgba(124,106,247,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${chatOpen ? 'rgba(124,106,247,0.4)' : 'rgba(255,255,255,0.09)'}`,
              color: chatOpen ? '#a89cff' : 'rgba(255,255,255,0.5)',
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
        <div style={{
          flex: 1,
          transition: 'all 0.25s ease',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <GraphCanvas onNodeSelect={setSelectedNode} externalNode={selectedNode} />
        </div>

        {/* Chat panel */}
        <div style={{
          width: chatOpen ? 380 : 0,
          flexShrink: 0,
          borderLeft: chatOpen ? '1px solid rgba(255,255,255,0.07)' : 'none',
          overflow: 'hidden',
          transition: 'width 0.25s ease',
        }}>
          <div style={{ width: 380, height: '100%' }}>
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
