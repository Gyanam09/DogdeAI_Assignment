import { useState, useRef, useEffect } from 'react'
import { Send, Loader, ChevronDown, Code2, AlertCircle, Sparkles } from 'lucide-react'


const SUGGESTED = [
  "Which products appear in the most billing documents?",
  "Trace the full flow of a billing document",
  "Show sales orders delivered but not billed",
  "Which business partners have the highest order value?",
  "Find incomplete order-to-cash flows",
  "How many deliveries per sales order on average?",
]


// Extract numeric/alphanumeric entity IDs mentioned in agent responses
function extractEntityIds(text) {
  const ids = new Set()
  // Match patterns like: 9-digit billing/journal numbers, 6-digit sales orders,
  // delivery numbers, payment references etc.
  const patterns = [
    /\b(9[0-9]{8,9})\b/g,   // billing/journal docs: 90000001, 9400635958
    /\b([7-8][0-9]{5,6})\b/g, // sales orders: 740527, 800000xx
    /\b([0-9]{7,10})\b/g,    // any long numeric ID
  ]
  patterns.forEach(re => {
    let m
    while ((m = re.exec(text)) !== null) ids.add(m[1])
  })
  return [...ids].slice(0, 20) // cap at 20 to avoid noise
}

function SqlBadge({ sql, rowCount, isDark }) {
  const [open, setOpen] = useState(false)
  if (!sql) return null
  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'var(--teal-dim)',
        border: '1px solid rgba(14,165,160,0.25)',
        color: 'var(--teal)',
        borderRadius: 5, padding: '3px 8px', fontSize: 11,
        fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
      }}>
        <Code2 size={11} />
        SQL · {rowCount} rows
        <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
      </button>
      {open && (
        <pre style={{
          marginTop: 4,
          background: 'var(--sql-pre-bg)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--sql-pre-color)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {sql}
        </pre>
      )}
    </div>
  )
}

function Message({ msg, isDark }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
      {!isUser && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), var(--teal))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={10} color="#fff" />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Graph Agent</span>
        </div>
      )}

      <div style={{
        maxWidth: '90%',
        background: isUser
          ? 'var(--accent)'
          : isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
        border: isUser
          ? 'none'
          : isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--border)',
        borderRadius: isUser ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
        padding: '10px 13px', fontSize: 13, lineHeight: 1.6,
        color: isUser ? '#ffffff' : 'var(--text-primary)',
        boxShadow: isUser ? 'none' : isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        {msg.isLoading ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
                animation: `bounce 1.2s ${i*0.2}s infinite`,
              }}/>
            ))}
          </div>
        ) : (
          <>
            {msg.isOffTopic && (
              <div style={{
                display: 'flex', gap: 6, alignItems: 'flex-start',
                background: 'var(--amber-dim)',
                border: '1px solid rgba(217,119,6,0.22)',
                borderRadius: 6, padding: '6px 8px', marginBottom: 8,
              }}>
                <AlertCircle size={13} color="var(--amber)" style={{ marginTop: 1, flexShrink: 0 }}/>
                <span style={{ fontSize: 12, color: 'var(--amber)' }}>Off-topic query</span>
              </div>
            )}
            <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
          </>
        )}
      </div>

      {!msg.isLoading && <SqlBadge sql={msg.sql} rowCount={msg.rowCount || 0} isDark={isDark} />}
    </div>
  )
}

export default function ChatPanel({ theme = 'light', onHighlight }) {
  const isDark = theme === 'dark'

  const [messages, setMessages] = useState([{
    id: 'welcome', role: 'assistant',
    content: 'Hi! I can help you analyze the Order-to-Cash process. Ask me about orders, deliveries, billing documents, business partners, or trace complete transaction flows.',
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async (question) => {
    const q = (question || input).trim()
    if (!q || loading) return
    setInput(''); setShowSuggestions(false); setLoading(true)

    const userMsg = { id: Date.now(), role: 'user', content: q }
    const loadingId = Date.now() + 1
    setMessages(prev => [...prev, userMsg, { id: loadingId, role: 'assistant', isLoading: true, content: '' }])

    const history = messages.filter(m => !m.isLoading && m.id !== 'welcome').slice(-6).map(m => ({ role: m.role, content: m.content }))

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let fullText = '', sql = null, rowCount = 0, isOffTopic = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            const chunk = parsed.content || ''
            if (!chunk) continue
            if (chunk.startsWith('__META__')) {
              try { const meta = JSON.parse(chunk.slice(8)); sql = meta.sql || null; rowCount = meta.row_count || 0 } catch (_) {}
              continue
            }
            fullText += chunk
            isOffTopic = fullText.includes('This system only answers')
            setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, content: fullText, isLoading: false, sql, rowCount, isOffTopic } : m))
          } catch (_) {}
        }
      }

      setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, content: fullText || 'No response received.', isLoading: false, sql, rowCount, isOffTopic } : m))
      // Highlight nodes mentioned in the response
      if (fullText && onHighlight) {
        const ids = extractEntityIds(fullText)
        onHighlight(ids)
      }
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, content: `Connection error: ${e.message}. Is the backend running?`, isLoading: false } : m))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel-bg)', transition: 'background 0.2s ease' }}>
      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:scale(0.7);opacity:0.4} 40%{transform:scale(1);opacity:1} }
        .sug-btn:hover { background: var(--accent-dim) !important; border-color: var(--accent-glow) !important; color: var(--accent) !important; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        background: 'var(--panel-bg)',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: isDark ? '#1f1f26' : '#111118',
          border: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-display)' }}>D</span>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Graph Agent</div>
          <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>Order to Cash · Groq LLaMA</div>
        </div>
        <div style={{
          marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%',
          background: loading ? 'var(--amber)' : 'var(--green)',
          boxShadow: loading ? '0 0 6px var(--amber)' : '0 0 6px var(--green)',
          transition: 'all 0.3s',
        }}/>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', background: 'var(--panel-bg-messages)', transition: 'background 0.2s ease' }}>
        {messages.map(msg => <Message key={msg.id} msg={msg} isDark={isDark} />)}

        {showSuggestions && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 7, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              TRY ASKING
            </div>
            {SUGGESTED.map(s => (
              <button key={s} className="sug-btn" onClick={() => sendMessage(s)} style={{
                display: 'block', width: '100%', marginBottom: 5,
                background: 'var(--sug-btn-bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                borderRadius: 7, padding: '7px 10px',
                fontSize: 12, textAlign: 'left', transition: 'all 0.15s', cursor: 'pointer', lineHeight: 1.4,
              }}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--panel-bg)' }}>
        <div style={{
          display: 'flex', gap: 8,
          background: 'var(--input-bg)',
          border: '1px solid var(--border-bright)',
          borderRadius: 10, padding: '6px 6px 6px 12px',
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Ask about orders, deliveries, billing..."
            disabled={loading}
            rows={1}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 13, resize: 'none', lineHeight: 1.5,
              padding: '4px 0', maxHeight: 80, overflowY: 'auto',
              fontFamily: 'var(--font-body)',
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={{
              width: 34, height: 34, borderRadius: 7, flexShrink: 0, alignSelf: 'flex-end',
              background: input.trim()&&!loading ? 'var(--accent)' : 'var(--bg-3)',
              border: 'none',
              cursor: input.trim()&&!loading ? 'pointer' : 'default',
              color: input.trim()&&!loading ? '#fff' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
            }}
          >
            {loading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }}/> : <Send size={14}/>}
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          Enter to send · Shift+Enter for newline
        </div>
      </div>
    </div>
  )
}
