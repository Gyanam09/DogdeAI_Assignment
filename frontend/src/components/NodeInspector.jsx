import { X, ExternalLink, Network } from 'lucide-react'

const TYPE_CONFIG = {
  SalesOrder: '#7c6af7', SalesOrderItem: '#9b88ff',
  Delivery: '#2dd4c4', DeliveryItem: '#22b8aa',
  BillingDoc: '#f5a623', BillingItem: '#d4892a',
  JournalEntry: '#34d399', Customer: '#e879f9',
  Material: '#60a5fa', Payment: '#fb923c',
}

const SKIP_FIELDS = ['id', 'type', 'table', 'label']

export default function NodeInspector({ node, onClose, onExpand }) {
  if (!node) return null
  const color = TYPE_CONFIG[node.type] || '#6b7280'
  const fields = Object.entries(node)
    .filter(([k, v]) => !SKIP_FIELDS.includes(k) && v && String(v).trim())

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      right: 12,
      width: 300,
      background: 'rgba(16,16,22,0.97)',
      border: `1px solid ${color}33`,
      borderRadius: 12,
      overflow: 'hidden',
      backdropFilter: 'blur(20px)',
      boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px ${color}22`,
      zIndex: 10,
      animation: 'slideIn 0.15s ease',
    }}>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: `1px solid ${color}22`,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        background: `${color}0f`,
      }}>
        <div>
          <div style={{ fontSize: 10, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 3 }}>
            {node.type?.toUpperCase()}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f0eff5' }}>
            {node.label}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {node.id}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', padding: 4, marginLeft: 8, flexShrink: 0 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Fields */}
      <div style={{ padding: '10px 14px', maxHeight: 320, overflowY: 'auto' }}>
        {fields.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, fontStyle: 'italic' }}>No additional metadata</div>
        )}
        {fields.map(([key, value]) => (
          <div key={key} style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
            <div style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'rgba(255,255,255,0.4)',
              minWidth: 110,
              paddingTop: 1,
              flexShrink: 0,
            }}>
              {key}
            </div>
            <div style={{
              fontSize: 12,
              color: '#d4d3e2',
              wordBreak: 'break-all',
            }}>
              {String(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        gap: 8,
      }}>
        <button
          onClick={() => onExpand(node.id)}
          style={{
            flex: 1,
            background: `${color}18`,
            border: `1px solid ${color}44`,
            color,
            borderRadius: 6,
            padding: '7px 12px',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            transition: 'all 0.15s',
          }}
        >
          <Network size={12} />
          Expand
        </button>
      </div>
    </div>
  )
}
