import { X, Network } from 'lucide-react'

const TYPE_CONFIG = {
  SalesOrder: '#6c5ce7', SalesOrderItem: '#8b7ff5',
  Delivery: '#00b4d8', DeliveryItem: '#0096c7',
  BillingDoc: '#f59e0b', BillingItem: '#d97706',
  JournalEntry: '#10b981', Customer: '#d946ef',
  Material: '#3b82f6', Payment: '#f97316',
}

const TYPE_CONFIG_DARK = {
  SalesOrder: '#7c6af7', SalesOrderItem: '#9b88ff',
  Delivery: '#2dd4c4', DeliveryItem: '#1aada0',
  BillingDoc: '#f5a623', BillingItem: '#d4892a',
  JournalEntry: '#34d399', Customer: '#e879f9',
  Material: '#60a5fa', Payment: '#fb923c',
}

const SKIP_FIELDS = ['id', 'type', 'table', 'label']

export default function NodeInspector({ node, onClose, onExpand, theme = 'light' }) {
  if (!node) return null
  const isDark = theme === 'dark'
  const config = isDark ? TYPE_CONFIG_DARK : TYPE_CONFIG
  const color = config[node.type] || (isDark ? '#6b7280' : '#9ca3af')
  const fields = Object.entries(node).filter(([k, v]) => !SKIP_FIELDS.includes(k) && v && String(v).trim())

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, width: 300,
      background: 'var(--node-inspector-bg)',
      border: `1px solid ${color}28`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: `var(--node-inspector-shadow), 0 0 0 1px ${color}14`,
      zIndex: 10,
      animation: 'slideIn 0.15s ease',
      transition: 'background 0.2s ease',
    }}>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: `1px solid ${color}18`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        background: `${color}08`,
      }}>
        <div>
          <div style={{ fontSize: 10, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 3 }}>
            {node.type?.toUpperCase()}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{node.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{node.id}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4, marginLeft: 8, flexShrink: 0, cursor: 'pointer' }}>
          <X size={14} />
        </button>
      </div>

      {/* Fields */}
      <div style={{ padding: '10px 14px', maxHeight: 320, overflowY: 'auto' }}>
        {fields.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>No additional metadata</div>
        )}
        {fields.map(([key, value]) => (
          <div key={key} style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: 110, paddingTop: 1, flexShrink: 0 }}>
              {key}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
              {String(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <button onClick={() => onExpand(node.id)} style={{
          flex: 1,
          background: `${color}0e`,
          border: `1px solid ${color}30`,
          color,
          borderRadius: 6, padding: '7px 12px', fontSize: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          transition: 'all 0.15s', cursor: 'pointer',
        }}>
          <Network size={12} />
          Expand
        </button>
      </div>
    </div>
  )
}
