import { useEffect, useRef, useState, useCallback } from 'react'

const TYPE_COLORS_LIGHT = {
    SalesOrder: '#6c5ce7', SalesOrderItem: '#8b7ff5', ScheduleLine: '#a99ef8',
    Delivery: '#00b4d8', DeliveryItem: '#0096c7',
    BillingDoc: '#f59e0b', BillingItem: '#d97706', BillingCancel: '#ef4444',
    JournalEntry: '#10b981', Payment: '#f97316',
    BusinessPartner: '#d946ef', BPAddress: '#c026d3', CustomerCompany: '#a21caf', CustomerSalesArea: '#9333ea',
    Product: '#3b82f6', ProductDesc: '#2563eb', ProductPlant: '#1d4ed8', ProductStorage: '#1e40af',
    Plant: '#d97706',
}

const TYPE_COLORS_DARK = {
    SalesOrder: '#7c6af7', SalesOrderItem: '#9b88ff', ScheduleLine: '#b8acff',
    Delivery: '#2dd4c4', DeliveryItem: '#1aada0',
    BillingDoc: '#f5a623', BillingItem: '#d4892a', BillingCancel: '#ff6b6b',
    JournalEntry: '#34d399', Payment: '#fb923c',
    BusinessPartner: '#e879f9', BPAddress: '#c026d3', CustomerCompany: '#d946ef', CustomerSalesArea: '#a855f7',
    Product: '#60a5fa', ProductDesc: '#3b82f6', ProductPlant: '#1d4ed8', ProductStorage: '#1e40af',
    Plant: '#f59e0b',
}

const NODE_RADIUS = 4
const SELECTED_RADIUS = 8

export default function GraphCanvas({ onNodeSelect, theme = 'light', highlightedIds = [] }) {
    const isDark = theme === 'dark'
    const TYPE_COLORS = isDark ? TYPE_COLORS_DARK : TYPE_COLORS_LIGHT
    const highlightedSet = new Set(highlightedIds)
    const DEFAULT_COLOR = isDark ? '#6b7280' : '#9ca3af'
    const getColor = (type) => TYPE_COLORS[type] || DEFAULT_COLOR

    const canvasRef = useRef(null)
    const [graphData, setGraphData] = useState({ nodes: [], edges: [] })
    const [positions, setPositions] = useState({})
    const [selectedNode, setSelectedNode] = useState(null)
    const [hoveredNode, setHoveredNode] = useState(null)
    const [summary, setSummary] = useState(null)
    const [loading, setLoading] = useState(true)
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
    const [tooltip, setTooltip] = useState(null)

    const animFrameRef = useRef(null)
    const simulationRef = useRef({ running: true, ticks: 0 })
    const posRef = useRef({})
    const velRef = useRef({})
    const isDraggingRef = useRef(false)
    const dragStartRef = useRef(null)
    const dragNodeRef = useRef(null)
    const containerRef = useRef(null)
    const W = useRef(900)
    const H = useRef(650)

    useEffect(() => {
        fetch('/api/graph/initial?max_nodes=200')
            .then(r => r.json())
            .then(data => {
                setGraphData(data)
                const pos = {}, vel = {}
                // Cluster nodes by type for a clean initial layout
                const typeGroups = {}
                data.nodes.forEach(n => {
                    if (!typeGroups[n.type]) typeGroups[n.type] = []
                    typeGroups[n.type].push(n)
                })
                const types = Object.keys(typeGroups)
                const cx = W.current / 2, cy = H.current / 2
                const clusterRadius = Math.min(W.current, H.current) * 0.20
                types.forEach((type, ti) => {
                    const clusterAngle = (2 * Math.PI * ti) / types.length
                    const clusterX = cx + Math.cos(clusterAngle) * clusterRadius
                    const clusterY = cy + Math.sin(clusterAngle) * clusterRadius
                    typeGroups[type].forEach((n, ni) => {
                        const a = (2 * Math.PI * ni) / Math.max(typeGroups[type].length, 1)
                        const r = 25 * Math.sqrt(Math.random() + 0.1)
                        pos[n.id] = {
                            x: clusterX + Math.cos(a) * r,
                            y: clusterY + Math.sin(a) * r,
                        }
                        vel[n.id] = { x: 0, y: 0 }
                    })
                })
                posRef.current = pos
                velRef.current = vel
                setPositions({ ...pos })
                setLoading(false)
                simulationRef.current = { running: true, ticks: 0 }
            })
            .catch(() => setLoading(false))

        fetch('/api/graph/summary').then(r => r.json()).then(setSummary).catch(() => {})
    }, [])

    useEffect(() => {
        if (!graphData.nodes.length) return
        const nodes = graphData.nodes
        const edges = graphData.edges

        function runTick() {
            if (!simulationRef.current.running) return
            const pos = posRef.current, vel = velRef.current
            const ids = nodes.map(n => n.id)
            const w = W.current, h = H.current
            const k = Math.sqrt((w * h) / Math.max(nodes.length, 1)) * 0.6
            const sampleSize = Math.min(ids.length, 80)

            for (let i = 0; i < sampleSize; i++) {
                for (let j = i + 1; j < sampleSize; j++) {
                    const a = ids[i], b = ids[j]
                    if (!pos[a] || !pos[b]) continue
                    const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y
                    const dist = Math.sqrt(dx*dx + dy*dy) || 0.1
                    if (dist > 150) continue
                    const force = (k*k) / dist * 0.25
                    const fx = (dx/dist)*force, fy = (dy/dist)*force
                    if (vel[a]) { vel[a].x -= fx; vel[a].y -= fy }
                    if (vel[b]) { vel[b].x += fx; vel[b].y += fy }
                }
            }

            edges.forEach(e => {
                const a = pos[e.source], b = pos[e.target]
                const va = vel[e.source], vb = vel[e.target]
                if (!a || !b || !va || !vb) return
                const dx = b.x - a.x, dy = b.y - a.y
                const dist = Math.sqrt(dx*dx + dy*dy) || 0.1
                // Use ideal edge length — attract if too far, repel if too close
                const idealLen = 60
                const force = (dist - idealLen) * 0.03
                const fx = (dx/dist)*force, fy = (dy/dist)*force
                va.x += fx; va.y += fy; vb.x -= fx; vb.y -= fy
            })

            const cooling = Math.max(0.1, 1 - simulationRef.current.ticks / 400)
            ids.forEach(id => {
                if (!pos[id] || !vel[id] || dragNodeRef.current === id) return
                vel[id].x += (w/2 - pos[id].x) * 0.04
                vel[id].y += (h/2 - pos[id].y) * 0.04
                vel[id].x *= 0.82 * cooling
                vel[id].y *= 0.82 * cooling
                pos[id].x = Math.max(12, Math.min(w-12, pos[id].x + vel[id].x))
                pos[id].y = Math.max(12, Math.min(h-12, pos[id].y + vel[id].y))
            })

            simulationRef.current.ticks++
            if (simulationRef.current.ticks > 600) simulationRef.current.running = false
            drawCanvas()
            animFrameRef.current = requestAnimationFrame(runTick)
        }

        animFrameRef.current = requestAnimationFrame(runTick)
        return () => cancelAnimationFrame(animFrameRef.current)
    }, [graphData])


    // When chat highlights IDs, fetch those nodes if not already in graph
    useEffect(() => {
        if (!highlightedIds.length) return
        highlightedIds.forEach(async (hid) => {
            const alreadyLoaded = graphData.nodes.some(n =>
                String(n.id).includes(hid) || String(n.label || '').includes(hid)
            )
            if (alreadyLoaded) return
            try {
                const resp = await fetch(`/api/graph/search?q=${encodeURIComponent(hid)}&limit=3`)
                const results = await resp.json()
                if (!results.length) return
                const existingIds = new Set(graphData.nodes.map(n => n.id))
                const newNodes = results.filter(n => !existingIds.has(n.id))
                if (!newNodes.length) return
                // Place new nodes near center
                newNodes.forEach((n, i) => {
                    const angle = (2 * Math.PI * i) / newNodes.length
                    posRef.current[n.id] = {
                        x: W.current / 2 + Math.cos(angle) * 80,
                        y: H.current / 2 + Math.sin(angle) * 80,
                    }
                    velRef.current[n.id] = { x: 0, y: 0 }
                })
                setGraphData(prev => ({
                    nodes: [...prev.nodes, ...newNodes],
                    edges: prev.edges,
                }))
            } catch (_) {}
        })
    }, [highlightedIds])

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const { x: tx, y: ty, scale } = transform
        const pos = posRef.current
        const nodes = graphData.nodes
        const edges = graphData.edges

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = isDark ? '#0a0a0e' : '#f7f7f8'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.save()
        ctx.translate(tx, ty)
        ctx.scale(scale, scale)

        // Edges
        edges.forEach(e => {
            const a = pos[e.source], b = pos[e.target]
            if (!a || !b) return
            const isHighlighted = selectedNode && (e.source === selectedNode.id || e.target === selectedNode.id)
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = isHighlighted
                ? getColor(selectedNode.type) + '99'
                : isDark ? 'rgba(147,197,253,0.18)' : 'rgba(147,197,253,0.45)'
            ctx.lineWidth = isHighlighted ? 1.5 : 0.7
            ctx.stroke()
        })

        // Nodes
        nodes.forEach(n => {
            const p = pos[n.id]
            if (!p) return
            const isSelected = selectedNode?.id === n.id
            const isHovered = hoveredNode?.id === n.id
            // Check if node ID or label matches any highlighted ID from chat
            const isHighlighted = highlightedIds.length > 0 && highlightedIds.some(hid => {
                const nid = String(n.id)
                const nlabel = String(n.label || '')
                // Only match if the node's own ID/label contains the highlighted ID
                // Avoid reverse matching (hid.includes(nid)) which causes false positives
                // for short labels like "20" matching inside "9400635958"
                return nid === hid || nlabel === hid ||
                       nid.includes(hid) || nlabel.includes(hid)
            })
            const color = getColor(n.type)
            const r = isSelected ? SELECTED_RADIUS : isHovered ? 6 : NODE_RADIUS

            // Chat-highlight glow — bright pulsing ring
            if (isHighlighted && !isSelected) {
                ctx.beginPath(); ctx.arc(p.x, p.y, r + 10, 0, Math.PI*2)
                ctx.fillStyle = color + '15'; ctx.fill()
                ctx.beginPath(); ctx.arc(p.x, p.y, r + 6, 0, Math.PI*2)
                ctx.fillStyle = color + '30'; ctx.fill()
                ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI*2)
                ctx.strokeStyle = color
                ctx.lineWidth = 1.5; ctx.stroke()
            }

            if (isSelected) {
                ctx.beginPath(); ctx.arc(p.x, p.y, r+8, 0, Math.PI*2)
                ctx.fillStyle = color + '18'; ctx.fill()
                ctx.beginPath(); ctx.arc(p.x, p.y, r+4, 0, Math.PI*2)
                ctx.fillStyle = color + '30'; ctx.fill()
            }

            // Dim non-highlighted nodes when highlights are active
            const dimmed = highlightedIds.length > 0 && !isHighlighted && !isSelected && !isHovered
            ctx.beginPath()
            ctx.arc(p.x, p.y, r, 0, Math.PI*2)
            ctx.fillStyle = dimmed ? color + '44' : (isSelected || isHovered ? color : color + 'cc')
            ctx.fill()

            if (isSelected || isHovered || isHighlighted) {
                ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2)
                ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.95)'
                ctx.lineWidth = 1.5; ctx.stroke()
            }

            if (isSelected || isHovered || isHighlighted) {
                const label = String(n.label || n.id).slice(0, 16)
                ctx.font = '11px "DM Mono", monospace'
                ctx.textAlign = 'center'
                const tw = ctx.measureText(label).width
                ctx.fillStyle = isDark ? 'rgba(10,10,14,0.82)' : 'rgba(255,255,255,0.88)'
                ctx.fillRect(p.x - tw/2 - 3, p.y - r - 18, tw + 6, 14)
                ctx.fillStyle = isDark ? '#f0eff5' : '#111118'
                ctx.fillText(label, p.x, p.y - r - 7)
            }
        })

        ctx.restore()
    }, [graphData, selectedNode, hoveredNode, transform, isDark, highlightedIds])

    useEffect(() => { drawCanvas() }, [drawCanvas, positions, selectedNode, hoveredNode, transform, theme, highlightedIds])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const ro = new ResizeObserver(entries => {
            for (const e of entries) {
                W.current = e.contentRect.width
                H.current = e.contentRect.height
                if (canvasRef.current) {
                    canvasRef.current.width = W.current
                    canvasRef.current.height = H.current
                }
                drawCanvas()
            }
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [drawCanvas])

    const hitTest = useCallback((clientX, clientY) => {
        const canvas = canvasRef.current
        if (!canvas) return null
        const rect = canvas.getBoundingClientRect()
        const cx = (clientX - rect.left - transform.x) / transform.scale
        const cy = (clientY - rect.top - transform.y) / transform.scale
        const pos = posRef.current
        for (let i = graphData.nodes.length - 1; i >= 0; i--) {
            const n = graphData.nodes[i]
            const p = pos[n.id]
            if (!p) continue
            const r = selectedNode?.id === n.id ? SELECTED_RADIUS : NODE_RADIUS
            const dx = cx - p.x, dy = cy - p.y
            if (dx*dx + dy*dy <= (r+4)*(r+4)) return n
        }
        return null
    }, [graphData, selectedNode, transform])

    const handleMouseMove = useCallback((e) => {
        if (isDraggingRef.current && dragNodeRef.current) {
            const rect = canvasRef.current.getBoundingClientRect()
            posRef.current[dragNodeRef.current] = {
                x: (e.clientX - rect.left - transform.x) / transform.scale,
                y: (e.clientY - rect.top - transform.y) / transform.scale,
            }
            drawCanvas(); return
        }
        if (isDraggingRef.current && dragStartRef.current) {
            setTransform(t => ({ ...t, x: dragStartRef.current.tx + e.clientX - dragStartRef.current.x, y: dragStartRef.current.ty + e.clientY - dragStartRef.current.y }))
            return
        }
        const hit = hitTest(e.clientX, e.clientY)
        setHoveredNode(hit)
        if (canvasRef.current) canvasRef.current.style.cursor = hit ? 'pointer' : 'grab'
        if (hit) {
            const rect = canvasRef.current.getBoundingClientRect()
            setTooltip({ node: hit, x: e.clientX - rect.left, y: e.clientY - rect.top })
        } else setTooltip(null)
    }, [hitTest, transform, drawCanvas])

    const handleMouseDown = useCallback((e) => {
        const hit = hitTest(e.clientX, e.clientY)
        if (hit) { dragNodeRef.current = hit.id; simulationRef.current.running = false }
        else dragStartRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y }
        isDraggingRef.current = true
    }, [hitTest, transform])

    const handleMouseUp = useCallback((e) => {
        const wasDraggingNode = dragNodeRef.current
        isDraggingRef.current = false; dragNodeRef.current = null; dragStartRef.current = null
        if (!wasDraggingNode) {
            const hit = hitTest(e.clientX, e.clientY)
            if (hit) { setSelectedNode(prev => prev?.id === hit.id ? null : hit); onNodeSelect?.(hit) }
            else { setSelectedNode(null); onNodeSelect?.(null) }
        }
    }, [hitTest, onNodeSelect])

    const handleWheel = useCallback((e) => {
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.1 : 0.9
        const rect = canvasRef.current.getBoundingClientRect()
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        setTransform(t => {
            const newScale = Math.max(0.1, Math.min(5, t.scale * factor))
            return { scale: newScale, x: mx - (mx - t.x) * (newScale/t.scale), y: my - (my - t.y) * (newScale/t.scale) }
        })
    }, [])

    const expandNode = useCallback(async (nodeId) => {
        try {
            const resp = await fetch(`/api/graph/node/${encodeURIComponent(nodeId)}?depth=1`)
            const data = await resp.json()
            const existingIds = new Set(graphData.nodes.map(n => n.id))
            const newNodes = data.nodes.filter(n => !existingIds.has(n.id))
            if (!newNodes.length) return
            const srcPos = posRef.current[nodeId] || { x: W.current/2, y: H.current/2 }
            newNodes.forEach((n, i) => {
                const angle = (2*Math.PI*i) / newNodes.length
                posRef.current[n.id] = { x: srcPos.x + Math.cos(angle)*120, y: srcPos.y + Math.sin(angle)*100 }
                velRef.current[n.id] = { x: 0, y: 0 }
            })
            setGraphData(prev => ({
                nodes: [...prev.nodes, ...newNodes],
                edges: [...prev.edges, ...data.edges.filter(e => !prev.edges.find(ex => ex.source===e.source && ex.target===e.target))],
            }))
            simulationRef.current = { running: true, ticks: 0 }
        } catch (e) { console.error(e) }
    }, [graphData])

    const tooltipTextColor = isDark ? '#1a1a2e' : '#111118'
    const tooltipSubColor = isDark ? '#555' : '#6b7280'
    const tooltipBorderColor = isDark ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.10)'

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: 'var(--canvas-bg)', transition: 'background 0.2s ease' }}>
            {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, zIndex: 10, background: 'var(--canvas-bg)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', animation: 'spin 0.7s linear infinite' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>Building graph...</span>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}

            <canvas
                ref={canvasRef}
                width={W.current} height={H.current}
                style={{ display: 'block', width: '100%', height: '100%' }}
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { setHoveredNode(null); setTooltip(null); isDraggingRef.current = false; dragNodeRef.current = null }}
                onWheel={handleWheel}
            />

            {/* Tooltip */}
            {tooltip && (
                <div style={{
                    position: 'absolute', left: tooltip.x + 16, top: tooltip.y - 10,
                    background: 'var(--tooltip-bg)',
                    border: `1px solid ${tooltipBorderColor}`,
                    borderRadius: 10, padding: '14px 16px',
                    pointerEvents: 'none', zIndex: 20,
                    minWidth: 220, maxWidth: 320,
                    boxShadow: 'var(--tooltip-shadow)',
                    color: tooltipTextColor,
                    transition: 'background 0.2s ease',
                }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: tooltipTextColor }}>
                        {tooltip.node.type?.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    {Object.entries(tooltip.node)
                        .filter(([k, v]) => !['id','type','table','label'].includes(k) && v && String(v) !== 'nan')
                        .slice(0, 10)
                        .map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5, fontSize: 13 }}>
                                <span style={{ color: tooltipSubColor, fontWeight: 500 }}>{k}:</span>
                                <span style={{ color: tooltipTextColor, textAlign: 'right', maxWidth: 160, wordBreak: 'break-all' }}>{String(v).slice(0, 40)}</span>
                            </div>
                        ))
                    }
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                        Click to inspect · Double-click to expand
                    </div>
                </div>
            )}

            {/* Selected node panel */}
            {selectedNode && (
                <div style={{
                    position: 'absolute', top: 12, right: 12, width: 280,
                    background: 'var(--node-inspector-bg)',
                    border: `1px solid ${getColor(selectedNode.type)}33`,
                    borderRadius: 12, overflow: 'hidden',
                    boxShadow: `var(--node-inspector-shadow), 0 0 0 1px ${getColor(selectedNode.type)}18`,
                    zIndex: 15, transition: 'background 0.2s ease',
                }}>
                    <div style={{ padding: '12px 14px', background: `${getColor(selectedNode.type)}0a`, borderBottom: `1px solid ${getColor(selectedNode.type)}22` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontSize: 9, color: getColor(selectedNode.type), fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 3 }}>
                                    {selectedNode.type?.toUpperCase()}
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedNode.label}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{selectedNode.id}</div>
                            </div>
                            <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>×</button>
                        </div>
                    </div>

                    <div style={{ padding: '10px 14px', maxHeight: 260, overflowY: 'auto' }}>
                        {Object.entries(selectedNode)
                            .filter(([k, v]) => !['id','type','table','label'].includes(k) && v && String(v) !== 'nan')
                            .slice(0, 12)
                            .map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 100, flexShrink: 0, paddingTop: 1 }}>{k}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{String(v).slice(0, 60)}</div>
                                </div>
                            ))
                        }
                    </div>

                    <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
                        <button onClick={() => expandNode(selectedNode.id)} style={{
                            width: '100%', background: `${getColor(selectedNode.type)}10`,
                            border: `1px solid ${getColor(selectedNode.type)}33`,
                            color: getColor(selectedNode.type), borderRadius: 6,
                            padding: '7px 0', fontSize: 12, cursor: 'pointer',
                        }}>
                            Expand neighbors
                        </button>
                    </div>
                </div>
            )}

            {/* Stats overlay */}
            {summary && !loading && (
                <div style={{
                    position: 'absolute', top: 12, left: 12,
                    background: 'var(--stats-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 14px',
                    backdropFilter: 'blur(10px)',
                    boxShadow: 'var(--stats-shadow)',
                    transition: 'background 0.2s ease',
                }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6 }}>GRAPH STATS</div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{summary.total_nodes?.toLocaleString()}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>nodes</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--teal)', lineHeight: 1 }}>{summary.total_edges?.toLocaleString()}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>edges</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {Object.entries(summary.node_types || {}).map(([type, count]) => {
                            const c = TYPE_COLORS[type] || '#888'
                            return (
                                <div key={type} style={{
                                    background: c + '12', border: `1px solid ${c}28`,
                                    color: c, borderRadius: 4, padding: '2px 6px',
                                    fontSize: 9, fontFamily: 'var(--font-mono)',
                                }}>
                                    {type} · {count}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            <div style={{ position: 'absolute', bottom: 12, left: 12, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
                Scroll to zoom · Drag to pan · Click node to inspect
            </div>
        </div>
    )
}
