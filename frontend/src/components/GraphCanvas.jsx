import { useEffect, useRef, useState, useCallback } from 'react'

const TYPE_COLORS = {
    SalesOrder: '#7c6af7',
    SalesOrderItem: '#9b88ff',
    ScheduleLine: '#b8acff',
    Delivery: '#2dd4c4',
    DeliveryItem: '#1aada0',
    BillingDoc: '#f5a623',
    BillingItem: '#d4892a',
    BillingCancel: '#ff6b6b',
    JournalEntry: '#34d399',
    Payment: '#fb923c',
    BusinessPartner: '#e879f9',
    BPAddress: '#c026d3',
    CustomerCompany: '#d946ef',
    CustomerSalesArea: '#a855f7',
    Product: '#60a5fa',
    ProductDesc: '#3b82f6',
    ProductPlant: '#1d4ed8',
    ProductStorage: '#1e40af',
    Plant: '#f59e0b',
}

const DEFAULT_COLOR = '#6b7280'
const NODE_RADIUS = 4
const SELECTED_RADIUS = 8

function getColor(type) { return TYPE_COLORS[type] || DEFAULT_COLOR }

// Simple force simulation
function useForceLayout(nodes, edges, width, height) {
    const posRef = useRef({})
    const velRef = useRef({})

    useEffect(() => {
        if (!nodes.length) return
        // Initialize positions randomly if not set
        nodes.forEach(n => {
            if (!posRef.current[n.id]) {
                posRef.current[n.id] = {
                    x: width / 2 + (Math.random() - 0.5) * width * 0.8,
                    y: height / 2 + (Math.random() - 0.5) * height * 0.8,
                }
                velRef.current[n.id] = { x: 0, y: 0 }
            }
        })
    }, [nodes, width, height])

    const tick = useCallback(() => {
        const pos = posRef.current
        const vel = velRef.current
        const ids = nodes.map(n => n.id)
        const k = Math.sqrt((width * height) / Math.max(nodes.length, 1))

        // Repulsion
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const a = ids[i], b = ids[j]
                if (!pos[a] || !pos[b]) continue
                const dx = pos[b].x - pos[a].x
                const dy = pos[b].y - pos[a].y
                const dist = Math.sqrt(dx * dx + dy * dy) || 1
                const force = (k * k) / dist * 0.5
                const fx = (dx / dist) * force
                const fy = (dy / dist) * force
                vel[a].x -= fx; vel[a].y -= fy
                vel[b].x += fx; vel[b].y += fy
            }
        }

        // Attraction along edges
        edges.forEach(e => {
            const a = pos[e.source], b = pos[e.target]
            if (!a || !b) return
            const dx = b.x - a.x
            const dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const force = (dist * dist) / k * 0.08
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            vel[e.source].x += fx; vel[e.source].y += fy
            vel[e.target].x -= fx; vel[e.target].y -= fy
        })

        // Center gravity
        ids.forEach(id => {
            if (!pos[id]) return
            vel[id].x += (width / 2 - pos[id].x) * 0.01
            vel[id].y += (height / 2 - pos[id].y) * 0.01
        })

        // Apply velocity with damping
        const damping = 0.85
        ids.forEach(id => {
            if (!pos[id] || !vel[id]) return
            vel[id].x *= damping
            vel[id].y *= damping
            pos[id].x += vel[id].x
            pos[id].y += vel[id].y
            // Clamp to canvas
            pos[id].x = Math.max(20, Math.min(width - 20, pos[id].x))
            pos[id].y = Math.max(20, Math.min(height - 20, pos[id].y))
        })

        return { ...pos }
    }, [nodes, edges, width, height])

    return { posRef, velRef, tick }
}

export default function GraphCanvas({ onNodeSelect }) {
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

    // Load graph data
    useEffect(() => {
        fetch('/api/graph/initial?max_nodes=200')
            .then(r => r.json())
            .then(data => {
                setGraphData(data)
                // Init positions
                const pos = {}
                const vel = {}
                data.nodes.forEach((n, i) => {
                    const angle = (2 * Math.PI * i) / data.nodes.length
                    const radius = Math.min(W.current, H.current) * 0.35
                    pos[n.id] = {
                        x: W.current / 2 + Math.cos(angle) * radius * (0.5 + Math.random() * 0.5),
                        y: H.current / 2 + Math.sin(angle) * radius * (0.5 + Math.random() * 0.5),
                    }
                    vel[n.id] = { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 }
                })
                posRef.current = pos
                velRef.current = vel
                setPositions({ ...pos })
                setLoading(false)
                simulationRef.current = { running: true, ticks: 0 }
            })
            .catch(() => setLoading(false))

        fetch('/api/graph/summary')
            .then(r => r.json())
            .then(setSummary)
            .catch(() => { })
    }, [])

    // Force simulation loop
    useEffect(() => {
        if (!graphData.nodes.length) return
        const nodes = graphData.nodes
        const edges = graphData.edges

        function runTick() {
            if (!simulationRef.current.running) return
            const pos = posRef.current
            const vel = velRef.current
            const ids = nodes.map(n => n.id)
            const w = W.current, h = H.current
            const k = Math.sqrt((w * h) / Math.max(nodes.length, 1)) * 1.2

            // Repulsion (sample for perf)
            const sampleSize = Math.min(ids.length, 80)
            for (let i = 0; i < sampleSize; i++) {
                for (let j = i + 1; j < sampleSize; j++) {
                    const a = ids[i], b = ids[j]
                    if (!pos[a] || !pos[b]) continue
                    const dx = pos[b].x - pos[a].x
                    const dy = pos[b].y - pos[a].y
                    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
                    if (dist > 200) continue
                    const force = (k * k) / dist * 0.4
                    const fx = (dx / dist) * force, fy = (dy / dist) * force
                    if (vel[a]) { vel[a].x -= fx; vel[a].y -= fy }
                    if (vel[b]) { vel[b].x += fx; vel[b].y += fy }
                }
            }

            // Attraction
            edges.forEach(e => {
                const a = pos[e.source], b = pos[e.target]
                const va = vel[e.source], vb = vel[e.target]
                if (!a || !b || !va || !vb) return
                const dx = b.x - a.x, dy = b.y - a.y
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
                const force = (dist * dist) / k * 0.06
                const fx = (dx / dist) * force, fy = (dy / dist) * force
                va.x += fx; va.y += fy
                vb.x -= fx; vb.y -= fy
            })

            // Center gravity + apply
            const cooling = Math.max(0.3, 1 - simulationRef.current.ticks / 300)
            ids.forEach(id => {
                if (!pos[id] || !vel[id]) return
                if (dragNodeRef.current === id) return
                vel[id].x += (w / 2 - pos[id].x) * 0.008
                vel[id].y += (h / 2 - pos[id].y) * 0.008
                vel[id].x *= 0.88 * cooling
                vel[id].y *= 0.88 * cooling
                pos[id].x = Math.max(12, Math.min(w - 12, pos[id].x + vel[id].x))
                pos[id].y = Math.max(12, Math.min(h - 12, pos[id].y + vel[id].y))
            })

            simulationRef.current.ticks++
            if (simulationRef.current.ticks > 400) simulationRef.current.running = false

            drawCanvas()
            animFrameRef.current = requestAnimationFrame(runTick)
        }

        animFrameRef.current = requestAnimationFrame(runTick)
        return () => cancelAnimationFrame(animFrameRef.current)
    }, [graphData])

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const { x: tx, y: ty, scale } = transform
        const pos = posRef.current
        const nodes = graphData.nodes
        const edges = graphData.edges

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.save()
        ctx.translate(tx, ty)
        ctx.scale(scale, scale)

        // Draw edges
        edges.forEach(e => {
            const a = pos[e.source], b = pos[e.target]
            if (!a || !b) return
            const isHighlighted = selectedNode &&
                (e.source === selectedNode.id || e.target === selectedNode.id)

            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = isHighlighted
                ? getColor(selectedNode.type) + 'cc'
                : 'rgba(147,197,253,0.18)'
            ctx.lineWidth = isHighlighted ? 1.5 : 0.6
            ctx.stroke()
        })

        // Draw nodes
        nodes.forEach(n => {
            const p = pos[n.id]
            if (!p) return
            const isSelected = selectedNode?.id === n.id
            const isHovered = hoveredNode?.id === n.id
            const color = getColor(n.type)
            const r = isSelected ? SELECTED_RADIUS : isHovered ? 6 : NODE_RADIUS

            // Glow for selected
            if (isSelected) {
                ctx.beginPath()
                ctx.arc(p.x, p.y, r + 8, 0, Math.PI * 2)
                ctx.fillStyle = color + '22'
                ctx.fill()
                ctx.beginPath()
                ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2)
                ctx.fillStyle = color + '44'
                ctx.fill()
            }

            ctx.beginPath()
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
            ctx.fillStyle = isSelected || isHovered ? color : color + 'cc'
            ctx.fill()

            if (isSelected || isHovered) {
                ctx.beginPath()
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
                ctx.strokeStyle = '#fff'
                ctx.lineWidth = 1
                ctx.stroke()
            }

            // Label for selected/hovered
            if (isSelected || isHovered) {
                const label = String(n.label || n.id).slice(0, 16)
                ctx.font = '11px "DM Mono", monospace'
                ctx.fillStyle = '#f0eff5'
                ctx.textAlign = 'center'
                ctx.fillText(label, p.x, p.y - r - 5)
            }
        })

        ctx.restore()
    }, [graphData, selectedNode, hoveredNode, transform])

    // Redraw when state changes
    useEffect(() => { drawCanvas() }, [drawCanvas, positions, selectedNode, hoveredNode, transform])

    // Resize observer
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

    // Hit test
    const hitTest = useCallback((clientX, clientY) => {
        const canvas = canvasRef.current
        if (!canvas) return null
        const rect = canvas.getBoundingClientRect()
        const cx = (clientX - rect.left - transform.x) / transform.scale
        const cy = (clientY - rect.top - transform.y) / transform.scale
        const pos = posRef.current
        const nodes = graphData.nodes

        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i]
            const p = pos[n.id]
            if (!p) continue
            const r = selectedNode?.id === n.id ? SELECTED_RADIUS : NODE_RADIUS
            const dx = cx - p.x, dy = cy - p.y
            if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return n
        }
        return null
    }, [graphData, selectedNode, transform])

    const handleMouseMove = useCallback((e) => {
        if (isDraggingRef.current && dragNodeRef.current) {
            const rect = canvasRef.current.getBoundingClientRect()
            const cx = (e.clientX - rect.left - transform.x) / transform.scale
            const cy = (e.clientY - rect.top - transform.y) / transform.scale
            posRef.current[dragNodeRef.current] = { x: cx, y: cy }
            drawCanvas()
            return
        }
        if (isDraggingRef.current && dragStartRef.current) {
            const dx = e.clientX - dragStartRef.current.x
            const dy = e.clientY - dragStartRef.current.y
            setTransform(t => ({ ...t, x: dragStartRef.current.tx + dx, y: dragStartRef.current.ty + dy }))
            return
        }
        const hit = hitTest(e.clientX, e.clientY)
        setHoveredNode(hit)
        if (canvasRef.current) canvasRef.current.style.cursor = hit ? 'pointer' : 'grab'

        if (hit) {
            const rect = canvasRef.current.getBoundingClientRect()
            setTooltip({ node: hit, x: e.clientX - rect.left, y: e.clientY - rect.top })
        } else {
            setTooltip(null)
        }
    }, [hitTest, transform, drawCanvas])

    const handleMouseDown = useCallback((e) => {
        const hit = hitTest(e.clientX, e.clientY)
        if (hit) {
            dragNodeRef.current = hit.id
            simulationRef.current.running = false
        } else {
            dragStartRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y }
        }
        isDraggingRef.current = true
    }, [hitTest, transform])

    const handleMouseUp = useCallback((e) => {
        const wasDraggingNode = dragNodeRef.current
        isDraggingRef.current = false
        dragNodeRef.current = null
        dragStartRef.current = null

        if (!wasDraggingNode) {
            const hit = hitTest(e.clientX, e.clientY)
            if (hit) {
                setSelectedNode(prev => prev?.id === hit.id ? null : hit)
                onNodeSelect?.(hit)
            } else {
                setSelectedNode(null)
                onNodeSelect?.(null)
            }
        }
    }, [hitTest, onNodeSelect])

    const handleWheel = useCallback((e) => {
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.1 : 0.9
        const rect = canvasRef.current.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        setTransform(t => {
            const newScale = Math.max(0.1, Math.min(5, t.scale * factor))
            return {
                scale: newScale,
                x: mx - (mx - t.x) * (newScale / t.scale),
                y: my - (my - t.y) * (newScale / t.scale),
            }
        })
    }, [])

    const expandNode = useCallback(async (nodeId) => {
        try {
            const resp = await fetch(`/api/graph/node/${encodeURIComponent(nodeId)}?depth=1`)
            const data = await resp.json()
            const existingIds = new Set(graphData.nodes.map(n => n.id))
            const newNodes = data.nodes.filter(n => !existingIds.has(n.id))
            if (!newNodes.length) return

            const srcPos = posRef.current[nodeId] || { x: W.current / 2, y: H.current / 2 }
            newNodes.forEach((n, i) => {
                const angle = (2 * Math.PI * i) / newNodes.length
                posRef.current[n.id] = {
                    x: srcPos.x + Math.cos(angle) * 120,
                    y: srcPos.y + Math.sin(angle) * 100,
                }
                velRef.current[n.id] = { x: 0, y: 0 }
            })

            setGraphData(prev => ({
                nodes: [...prev.nodes, ...newNodes],
                edges: [...prev.edges, ...data.edges.filter(e =>
                    !prev.edges.find(ex => ex.source === e.source && ex.target === e.target)
                )],
            }))
            simulationRef.current = { running: true, ticks: 0 }
        } catch (e) { console.error(e) }
    }, [graphData])

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0a0e' }}>
            {loading && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexDirection: 'column', gap: 12, zIndex: 10,
                }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.08)',
                        borderTop: '2px solid #7c6af7',
                        animation: 'spin 0.7s linear infinite',
                    }} />
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                        Building graph...
                    </span>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
            )}

            <canvas
                ref={canvasRef}
                width={W.current}
                height={H.current}
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
                    position: 'absolute',
                    left: tooltip.x + 16,
                    top: tooltip.y - 10,
                    background: 'rgba(255,255,255,0.97)',
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 10,
                    padding: '14px 16px',
                    pointerEvents: 'none',
                    zIndex: 20,
                    minWidth: 220,
                    maxWidth: 300,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.13)',
                    color: '#1a1a2e',
                }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
                        {tooltip.node.type?.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    {Object.entries(tooltip.node)
                        .filter(([k, v]) => !['id', 'type', 'table', 'label'].includes(k) && v && String(v) !== 'nan')
                        .slice(0, 10)
                        .map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5, fontSize: 13 }}>
                                <span style={{ color: '#555', fontWeight: 500 }}>{k}:</span>
                                <span style={{ color: '#111', textAlign: 'right', maxWidth: 160, wordBreak: 'break-all' }}>
                                    {String(v).slice(0, 40)}
                                </span>
                            </div>
                        ))
                    }
                    <div style={{ marginTop: 8, fontSize: 11, color: '#999', borderTop: '1px solid #eee', paddingTop: 6 }}>
                        Click to inspect · Double-click to expand
                    </div>
                </div>
            )}

            {/* Selected node detail panel */}
            {selectedNode && (
                <div style={{
                    position: 'absolute', top: 12, right: 12,
                    width: 280,
                    background: 'rgba(14,14,20,0.97)',
                    border: `1px solid ${getColor(selectedNode.type)}33`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    backdropFilter: 'blur(20px)',
                    boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px ${getColor(selectedNode.type)}18`,
                    zIndex: 15,
                }}>
                    <div style={{ padding: '12px 14px', background: `${getColor(selectedNode.type)}0e`, borderBottom: `1px solid ${getColor(selectedNode.type)}22` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontSize: 9, color: getColor(selectedNode.type), fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 3 }}>
                                    {selectedNode.type?.toUpperCase()}
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#f0eff5' }}>{selectedNode.label}</div>
                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{selectedNode.id}</div>
                            </div>
                            <button onClick={() => setSelectedNode(null)}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>×</button>
                        </div>
                    </div>

                    <div style={{ padding: '10px 14px', maxHeight: 260, overflowY: 'auto' }}>
                        {Object.entries(selectedNode)
                            .filter(([k, v]) => !['id', 'type', 'table', 'label'].includes(k) && v && String(v) !== 'nan')
                            .slice(0, 12)
                            .map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)', minWidth: 100, flexShrink: 0, paddingTop: 1 }}>{k}</div>
                                    <div style={{ fontSize: 12, color: '#d4d3e2', wordBreak: 'break-all' }}>{String(v).slice(0, 60)}</div>
                                </div>
                            ))
                        }
                    </div>

                    <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <button
                            onClick={() => expandNode(selectedNode.id)}
                            style={{
                                width: '100%', background: `${getColor(selectedNode.type)}18`,
                                border: `1px solid ${getColor(selectedNode.type)}44`,
                                color: getColor(selectedNode.type), borderRadius: 6,
                                padding: '7px 0', fontSize: 12, cursor: 'pointer',
                            }}
                        >
                            Expand neighbors
                        </button>
                    </div>
                </div>
            )}

            {/* Stats overlay */}
            {summary && !loading && (
                <div style={{
                    position: 'absolute', top: 12, left: 12,
                    background: 'rgba(10,10,14,0.88)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 8, padding: '10px 14px',
                    backdropFilter: 'blur(10px)',
                }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginBottom: 6 }}>GRAPH STATS</div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#7c6af7', lineHeight: 1 }}>{summary.total_nodes?.toLocaleString()}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>nodes</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#2dd4c4', lineHeight: 1 }}>{summary.total_edges?.toLocaleString()}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>edges</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {Object.entries(summary.node_types || {}).map(([type, count]) => (
                            <div key={type} style={{
                                background: `${TYPE_COLORS[type] || '#666'}15`,
                                border: `1px solid ${TYPE_COLORS[type] || '#666'}30`,
                                color: TYPE_COLORS[type] || '#888',
                                borderRadius: 4, padding: '2px 6px',
                                fontSize: 9, fontFamily: 'var(--font-mono)',
                            }}>
                                {type} · {count}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Controls hint */}
            <div style={{
                position: 'absolute', bottom: 12, left: 12,
                fontSize: 10, color: 'rgba(255,255,255,0.2)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.8,
            }}>
                Scroll to zoom · Drag to pan · Click node to inspect
            </div>
        </div>
    )
}
