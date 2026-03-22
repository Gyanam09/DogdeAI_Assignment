"""Graph API routes — node/edge data for visualization."""
from fastapi import APIRouter, HTTPException
from services.graph_builder import get_graph_builder

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/summary")
async def graph_summary():
    """High-level graph statistics."""
    gb = get_graph_builder()
    return gb.get_graph_summary()


@router.get("/initial")
async def initial_graph(max_nodes: int = 150):
    """Return a representative subgraph for the initial render."""
    gb = get_graph_builder()
    return gb.get_initial_graph(max_nodes=min(max_nodes, 300))


@router.get("/node/{node_id:path}")
async def node_detail(node_id: str, depth: int = 1):
    """Return a node and its neighbors up to given depth."""
    gb = get_graph_builder()
    if node_id not in gb.graph:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found")
    return gb.get_node_neighbors(node_id, depth=min(depth, 2))


@router.get("/search")
async def search_nodes(q: str, limit: int = 20):
    """Search nodes by label or ID (case-insensitive substring)."""
    gb = get_graph_builder()
    q_lower = q.lower()
    results = []
    for node_id, data in gb.graph.nodes(data=True):
        label = str(data.get("label", ""))
        if q_lower in node_id.lower() or q_lower in label.lower():
            results.append({"id": node_id, **data})
            if len(results) >= limit:
                break
    return results
