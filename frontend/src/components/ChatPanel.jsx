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

function SqlBadge({ sql, rowCount }) {
  const [open, setOpen] = useState(false)
  if (!sql) return null
  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'rgba(45,212,196,0.08)', border: '1px solid rgba(45,212,196,0.25)',
        color: '#2dd4c4', borderRadius: 5, padding: '3px 8px', fontSize: 11,
        fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
      }}>
        <Code2 size={11} />
        SQL · {rowCount} rows
        <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
      </button>
      {open && (
        <pre style={{
          marginTop: 4, background: 'rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6,
          padding: '8px 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
          color: '#a5f3e8', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {sql}
        </pre>
      )}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
      {!isUser && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c6af7, #2dd4c4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={10} color="#fff" />
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>Graph Agent</span>
        </div>
      )}

      <div style={{
        maxWidth: '90%',
        background: isUser ? 'rgba(124,106,247,0.15)' : 'rgba(255,255,255,0.05)',
        border: isUser ? '1px solid rgba(124,106,247,0.3)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: isUser ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
        padding: '10px 13px', fontSize: 13, lineHeight: 1.6,
        color: isUser ? '#d4d0ff' : '#d4d3e2',
      }}>
        {msg.isLoading ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%', background: '#7c6af7',
                animation: `bounce 1.2s ${i*0.2}s infinite`,
              }}/>
            ))}
          </div>
        ) : (
          <>
            {msg.isOffTopic && (
              <div style={{
                display: 'flex', gap: 6, alignItems: 'flex-start',
                background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.25)',
                borderRadius: 6, padding: '6px 8px', marginBottom: 8,
              }}>
                <AlertCircle size={13} color="#f5a623" style={{ marginTop: 1, flexShrink: 0 }}/>
                <span style={{ fontSize: 12, color: '#f5a623' }}>Off-topic query</span>
              </div>
            )}
            <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
          </>
        )}
      </div>

      {!msg.isLoading && <SqlBadge sql={msg.sql} rowCount={msg.rowCount || 0} />}
    </div>
  )
}

export default function ChatPanel() {
  const [messages, setMessages] = useState([{
    id: 'welcome', role: 'assistant',
    content: 'Hi! I can help you analyze the Order-to-Cash process. Ask me about orders, deliveries, billing documents, business partners, or trace complete transaction flows.',
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (question) => {
    const q = (question || input).trim()
    if (!q || loading) return
    setInput('')
    setShowSuggestions(false)
    setLoading(true)

    const userMsg = { id: Date.now(), role: 'user', content: q }
    const loadingId = Date.now() + 1
    const loadingMsg = { id: loadingId, role: 'assistant', isLoading: true, content: '' }
    setMessages(prev => [...prev, userMsg, loadingMsg])

    const history = messages
      .filter(m => !m.isLoading && m.id !== 'welcome')
      .slice(-6)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      })

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let sql = null
      let rowCount = 0
      let isOffTopic = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const raw = decoder.decode(value)
        const lines = raw.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            const chunk = parsed.content || ''
            if (!chunk) continue

            // Meta chunk — carries SQL info
            if (chunk.startsWith('__META__')) {
              try {
                const meta = JSON.parse(chunk.slice(8))
                sql = meta.sql || null
                rowCount = meta.row_count || 0
              } catch (_) {}
              continue
            }

            fullText += chunk
            isOffTopic = fullText.includes('This system only answers')

            // Live streaming update
            setMessages(prev => prev.map(m =>
              m.id === loadingId
                ? { ...m, content: fullText, isLoading: false, sql, rowCount, isOffTopic }
                : m
            ))
          } catch (_) {}
        }
      }

      // Final update
      setMessages(prev => prev.map(m =>
        m.id === loadingId
          ? { ...m, content: fullText || 'No response received.', isLoading: false, sql, rowCount, isOffTopic }
          : m
      ))
    } catch (e) {
      setMessages(prev => prev.map(m =>
        m.id === loadingId
          ? { ...m, content: `Connection error: ${e.message}. Is the backend running?`, isLoading: false }
          : m
      ))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(10,10,14,0.98)' }}>
      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:scale(0.7);opacity:0.4} 40%{transform:scale(1);opacity:1} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .sug-btn:hover { background:rgba(124,106,247,0.12)!important; border-color:rgba(124,106,247,0.35)!important; color:#c4beff!important; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'linear-gradient(135deg, #7c6af7 0%, #2dd4c4 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={13} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f0eff5' }}>Graph Agent</div>
          <div style={{ fontSize: 10, color: '#7c6af7', fontFamily: 'var(--font-mono)' }}>Order to Cash · Groq LLaMA</div>
        </div>
        <div style={{
          marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%',
          background: loading ? '#f5a623' : '#34d399',
          boxShadow: loading ? '0 0 6px #f5a623' : '0 0 6px #34d399',
          transition: 'all 0.3s',
        }}/>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
        {messages.map(msg => <Message key={msg.id} msg={msg} />)}

        {showSuggestions && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 7, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              TRY ASKING
            </div>
            {SUGGESTED.map(s => (
              <button key={s} className="sug-btn" onClick={() => sendMessage(s)} style={{
                display: 'block', width: '100%', marginBottom: 5,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.5)', borderRadius: 7, padding: '7px 10px',
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
      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', gap: 8, background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
          padding: '6px 6px 6px 12px',
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
              color: '#f0eff5', fontSize: 13, resize: 'none', lineHeight: 1.5,
              padding: '4px 0', maxHeight: 80, overflowY: 'auto',
              fontFamily: 'var(--font-body)',
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={{
              width: 34, height: 34, borderRadius: 7, flexShrink: 0, alignSelf: 'flex-end',
              background: input.trim()&&!loading ? '#7c6af7' : 'rgba(255,255,255,0.06)',
              border: 'none', cursor: input.trim()&&!loading ? 'pointer' : 'default',
              color: input.trim()&&!loading ? '#fff' : 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
            }}
          >
            {loading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }}/> : <Send size={14}/>}
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 5, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          Enter to send · Shift+Enter for newline
        </div>
      </div>
    </div>
  )
}
