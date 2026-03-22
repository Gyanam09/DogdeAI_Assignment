"""
Graph Builder Service — SAP Order-to-Cash Dataset
Each entity is a folder inside data/ containing a CSV or Parquet file.
Builds:
  - NetworkX DiGraph  (graph traversal & visualization)
  - SQLite database   (LLM-generated SQL queries)
"""
import logging
import sqlite3
from pathlib import Path
from typing import Optional

import pandas as pd
import networkx as nx

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
DB_PATH  = Path(__file__).parent.parent / "graph.db"

# ── Entity config ─────────────────────────────────────────────────────────────
# folder_name → (NodeType, primary_key_col, display_label_col)
ENTITY_CONFIG = {
    "sales_order_headers":                     ("SalesOrder",        "salesOrder",          "salesOrder"),
    "sales_order_items":                       ("SalesOrderItem",    "salesOrderItem",      "salesOrderItem"),
    "sales_order_schedule_lines":              ("ScheduleLine",      "salesOrderItem",      "salesOrderItem"),
    "outbound_delivery_headers":               ("Delivery",          "deliveryDocument",    "deliveryDocument"),
    "outbound_delivery_items":                 ("DeliveryItem",      "deliveryDocumentItem","deliveryDocumentItem"),
    "billing_document_headers":                ("BillingDoc",        "billingDocument",     "billingDocument"),
    "billing_document_items":                  ("BillingItem",       "billingDocumentItem", "billingDocumentItem"),
    "billing_document_cancellations":          ("BillingCancel",     "billingDocument",     "billingDocument"),
    "journal_entry_items_accounts_receivable": ("JournalEntry",      "accountingDocument",  "accountingDocument"),
    "payments_accounts_receivable":            ("Payment",           "accountingDocument",  "accountingDocument"),
    "business_partners":                       ("BusinessPartner",   "businessPartner",     "businessPartnerFullName"),
    "business_partner_addresses":              ("BPAddress",         "businessPartner",     "businessPartner"),
    "customer_company_assignments":            ("CustomerCompany",   "customer",            "customer"),
    "customer_sales_area_assignments":         ("CustomerSalesArea", "customer",            "customer"),
    "products":                                ("Product",           "product",             "product"),
    "product_descriptions":                    ("ProductDesc",       "product",             "product"),
    "product_plants":                          ("ProductPlant",      "product",             "product"),
    "product_storage_locations":               ("ProductStorage",    "product",             "product"),
    "plants":                                  ("Plant",             "plant",               "plantName"),
}

# ── Relationship config ───────────────────────────────────────────────────────
# (source_folder, target_folder, source_fk_col, target_pk_col, edge_label)
RELATIONSHIP_CONFIG = [
    ("sales_order_items",                      "sales_order_headers",                    "salesOrder",                 "salesOrder",          "ITEM_OF"),
    ("sales_order_schedule_lines",             "sales_order_items",                      "salesOrderItem",             "salesOrderItem",      "SCHEDULED_FROM"),
    ("sales_order_headers",                    "business_partners",                      "soldToParty",                "businessPartner",     "SOLD_TO"),
    ("sales_order_items",                      "products",                               "material",                   "product",             "USES_PRODUCT"),
    ("outbound_delivery_items",                "outbound_delivery_headers",              "deliveryDocument",           "deliveryDocument",    "ITEM_OF"),
    ("outbound_delivery_headers",              "sales_order_headers",                    "salesOrder",                 "salesOrder",          "DELIVERS"),
    ("outbound_delivery_items",                "sales_order_items",                      "salesOrderItem",             "salesOrderItem",      "DELIVERS_ITEM"),
    ("outbound_delivery_headers",              "plants",                                 "shippingPoint",              "plant",               "SHIPS_FROM"),
    ("billing_document_headers",               "sales_order_headers",                    "salesOrder",                 "salesOrder",          "BILLED_FROM"),
    ("billing_document_headers",               "business_partners",                      "payerParty",                 "businessPartner",     "BILLED_TO"),
    ("billing_document_items",                 "billing_document_headers",               "billingDocument",            "billingDocument",     "ITEM_OF"),
    ("billing_document_items",                 "outbound_delivery_items",                "deliveryDocumentItem",       "deliveryDocumentItem","FROM_DELIVERY"),
    ("billing_document_items",                 "products",                               "material",                   "product",             "BILLED_PRODUCT"),
    ("journal_entry_items_accounts_receivable","billing_document_headers",               "referenceDocument",          "billingDocument",     "JOURNAL_FOR"),
    ("payments_accounts_receivable",           "billing_document_headers",               "clearingAccountingDocument", "billingDocument",     "PAYMENT_FOR"),
    ("billing_document_cancellations",         "billing_document_headers",               "billingDocument",            "billingDocument",     "CANCELS"),
    ("customer_company_assignments",           "business_partners",                      "customer",                   "businessPartner",     "CUSTOMER_OF"),
    ("product_plants",                         "products",                               "product",                    "product",             "PRODUCT_AT"),
    ("product_plants",                         "plants",                                 "plant",                      "plant",               "AT_PLANT"),
]


class GraphBuilder:
    def __init__(self):
        self.graph: nx.DiGraph = nx.DiGraph()
        self.tables: dict[str, pd.DataFrame] = {}
        self.conn: Optional[sqlite3.Connection] = None
        self._built = False

    def build(self):
        if self._built:
            return
        logger.info("Loading dataset folders from %s", DATA_DIR)
        self._load_folders()
        logger.info("Loaded %d tables", len(self.tables))
        logger.info("Building SQLite database…")
        self._build_sqlite()
        logger.info("Building NetworkX graph…")
        self._build_graph()
        self._built = True
        logger.info(
            "Graph ready: %d nodes, %d edges",
            self.graph.number_of_nodes(),
            self.graph.number_of_edges(),
        )

    # ── File loading ──────────────────────────────────────────────────────────
    def _load_folders(self):
        if not DATA_DIR.exists():
            DATA_DIR.mkdir(parents=True)
            logger.warning("data/ directory not found — created at %s", DATA_DIR)

        for folder_name in ENTITY_CONFIG:
            folder = DATA_DIR / folder_name
            if not folder.exists():
                logger.debug("Folder not found: %s", folder_name)
                continue
            df = self._read_folder(folder)
            if df is not None and not df.empty:
                # Sanitize column names
                df.columns = [c.strip().replace(" ", "_").replace("/", "_") for c in df.columns]
                self.tables[folder_name] = df
                logger.info("  %-55s  %6d rows  %d cols", folder_name, len(df), len(df.columns))

        if not self.tables:
            logger.warning("No dataset folders found — using built-in sample data.")
            self._load_sample_data()

    def _read_folder(self, folder: Path) -> Optional[pd.DataFrame]:
        for pattern in ["*.jsonl", "*.json", "*.csv", "*.parquet"]:
            files = sorted(folder.glob(pattern))
            if files:
                dfs = [d for d in (self._read_file(f) for f in files[:20]) if d is not None and not d.empty]
                return pd.concat(dfs, ignore_index=True) if dfs else None
        for pattern in ["**/*.jsonl", "**/*.json", "**/*.csv", "**/*.parquet"]:
            files = sorted(folder.glob(pattern))
            if files:
                dfs = [d for d in (self._read_file(f) for f in files[:20]) if d is not None and not d.empty]
                return pd.concat(dfs, ignore_index=True) if dfs else None
        return None

    def _read_file(self, path: Path) -> Optional[pd.DataFrame]:
        try:
            name = path.name.lower()
            if name.endswith(".jsonl"):
                return pd.read_json(path, lines=True, dtype=str).fillna("")
            elif name.endswith(".json"):
                return pd.read_json(path, dtype=str).fillna("")
            elif name.endswith(".parquet"):
                return pd.read_parquet(path).astype(str).fillna("")
            else:
                return pd.read_csv(path, dtype=str, low_memory=False).fillna("")
        except Exception as e:
            logger.error("Error reading %s: %s", path, e)
            return None

    def _load_sample_data(self):
        self.tables["sales_order_headers"] = pd.DataFrame({
            "SalesOrder": ["1000001", "1000002", "1000003"],
            "SoldToParty": ["BP001", "BP002", "BP001"],
            "ShipToParty": ["BP001", "BP002", "BP001"],
            "OrderDate": ["2025-01-10", "2025-01-12", "2025-01-15"],
            "NetValue": ["5000", "8000", "3000"],
            "Currency": ["USD", "USD", "USD"],
        })
        self.tables["sales_order_items"] = pd.DataFrame({
            "SalesOrderItem": ["10", "20", "10"],
            "SalesOrder": ["1000001", "1000001", "1000002"],
            "Material": ["PROD001", "PROD002", "PROD001"],
            "RequestedQuantity": ["5", "2", "10"],
            "NetValue": ["2500", "2500", "8000"],
        })
        self.tables["outbound_delivery_headers"] = pd.DataFrame({
            "Delivery": ["80000001", "80000002"],
            "SalesOrder": ["1000001", "1000002"],
            "ShipToParty": ["BP001", "BP002"],
            "ActualGoodsMovementDate": ["2025-01-15", "2025-01-17"],
            "ShippingPoint": ["PLANT1", "PLANT1"],
        })
        self.tables["outbound_delivery_items"] = pd.DataFrame({
            "DeliveryItem": ["10", "20", "10"],
            "Delivery": ["80000001", "80000001", "80000002"],
            "SalesOrderItem": ["10", "20", "10"],
            "Material": ["PROD001", "PROD002", "PROD001"],
        })
        self.tables["billing_document_headers"] = pd.DataFrame({
            "BillingDocument": ["90000001", "90000002"],
            "SalesOrder": ["1000001", "1000002"],
            "PayerParty": ["BP001", "BP002"],
            "BillingDate": ["2025-01-20", "2025-01-22"],
            "NetValue": ["5000", "8000"],
            "Currency": ["USD", "USD"],
        })
        self.tables["billing_document_items"] = pd.DataFrame({
            "BillingItem": ["10", "20", "10"],
            "BillingDocument": ["90000001", "90000001", "90000002"],
            "DeliveryItem": ["10", "20", "10"],
            "Material": ["PROD001", "PROD002", "PROD001"],
            "NetValue": ["2500", "2500", "8000"],
        })
        self.tables["journal_entry_items_accounts_receivable"] = pd.DataFrame({
            "AccountingDocument": ["9400001", "9400002"],
            "ReferenceDocument": ["90000001", "90000002"],
            "FiscalYear": ["2025", "2025"],
            "PostingDate": ["2025-01-21", "2025-01-23"],
            "AmountInCompanyCodeCurrency": ["5000", "8000"],
        })
        self.tables["payments_accounts_receivable"] = pd.DataFrame({
            "AccountingDocument": ["9500001"],
            "ReferenceDocument": ["90000001"],
            "PostingDate": ["2025-01-25"],
            "AmountInCompanyCodeCurrency": ["5000"],
        })
        self.tables["business_partners"] = pd.DataFrame({
            "BusinessPartner": ["BP001", "BP002"],
            "BusinessPartnerFullName": ["Acme Corp", "Globex Ltd"],
            "Country": ["US", "UK"],
        })
        self.tables["products"] = pd.DataFrame({
            "Product": ["PROD001", "PROD002"],
            "BaseUnit": ["EA", "EA"],
            "ProductGroup": ["Electronics", "Electronics"],
        })
        self.tables["plants"] = pd.DataFrame({
            "Plant": ["PLANT1"],
            "PlantName": ["Main Warehouse"],
        })

    # ── SQLite ─────────────────────────────────────────────────────────────────
    def _build_sqlite(self):
        self.conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        for table_name, df in self.tables.items():
            df.to_sql(table_name, self.conn, if_exists="replace", index=False)
        self.conn.commit()
        logger.info("SQLite DB written to %s", DB_PATH)

    # ── Graph construction ─────────────────────────────────────────────────────
    def _build_graph(self):
        G = self.graph

        # Add nodes (cap at 5000 per type to keep memory reasonable)
        for folder_name, (node_type, pk_col, label_col) in ENTITY_CONFIG.items():
            df = self.tables.get(folder_name)
            if df is None or pk_col not in df.columns:
                continue
            for _, row in df.head(5000).iterrows():
                pk = row[pk_col]
                if not pk or pk in ("nan", ""):
                    continue
                node_id = f"{node_type}:{pk}"
                if G.has_node(node_id):
                    continue
                label = row.get(label_col, pk)
                attrs = {k: v for k, v in row.to_dict().items() if v and v not in ("nan", "")}
                G.add_node(node_id, type=node_type, label=str(label), table=folder_name, **attrs)

        # Add edges
        for (src_folder, tgt_folder, src_fk, tgt_pk_col, rel_label) in RELATIONSHIP_CONFIG:
            src_df = self.tables.get(src_folder)
            if src_df is None or src_fk not in src_df.columns:
                continue
            src_type = ENTITY_CONFIG[src_folder][0]
            tgt_type = ENTITY_CONFIG[tgt_folder][0]
            src_pk_col = ENTITY_CONFIG[src_folder][1]

            for _, row in src_df.head(5000).iterrows():
                src_pk = row.get(src_pk_col, "")
                tgt_val = row.get(src_fk, "")
                if not src_pk or not tgt_val or src_pk in ("nan","") or tgt_val in ("nan",""):
                    continue
                src_node = f"{src_type}:{src_pk}"
                tgt_node = f"{tgt_type}:{tgt_val}"
                if G.has_node(src_node) and G.has_node(tgt_node):
                    G.add_edge(src_node, tgt_node, relation=rel_label)

    # ── Public API ─────────────────────────────────────────────────────────────
    def get_graph_summary(self) -> dict:
        counts: dict[str, int] = {}
        for _, d in self.graph.nodes(data=True):
            t = d.get("type", "Unknown")
            counts[t] = counts.get(t, 0) + 1
        return {
            "total_nodes": self.graph.number_of_nodes(),
            "total_edges": self.graph.number_of_edges(),
            "node_types": counts,
            "tables": list(self.tables.keys()),
        }

    def get_schema_description(self) -> str:
        lines = ["SQLite tables from SAP O2C dataset:\n"]
        for table_name, df in self.tables.items():
            cols = ", ".join(df.columns.tolist()[:25])
            lines.append(f"  {table_name}({cols})")
            key_cols = [c for c in df.columns if any(k in c.lower() for k in
                ["order","delivery","billing","document","partner","product","material","amount","value","date","plant","payment"])]
            if key_cols and len(df) > 0:
                sample = df.iloc[0]
                lines.append("    sample: " + ", ".join(f"{c}={sample[c]!r}" for c in key_cols[:4]))
        lines.append("\nForeign-key relationships:")
        for src, tgt, sfk, tpk, rel in RELATIONSHIP_CONFIG:
            lines.append(f"  {src}.{sfk} → {tgt}.{tpk}  [{rel}]")
        return "\n".join(lines)

    def get_node_neighbors(self, node_id: str, depth: int = 1) -> dict:
        if node_id not in self.graph:
            return {"nodes": [], "edges": []}
        in_view = {node_id}
        current = {node_id}
        for _ in range(depth):
            nxt = set()
            for n in current:
                nxt.update(self.graph.predecessors(n))
                nxt.update(self.graph.successors(n))
            in_view.update(nxt)
            current = nxt
        nodes = [{"id": n, **dict(self.graph.nodes[n])} for n in in_view]
        edges = [
            {"source": u, "target": v, **data}
            for u, v, data in self.graph.edges(data=True)
            if u in in_view and v in in_view
        ]
        return {"nodes": nodes, "edges": edges}

    def get_initial_graph(self, max_nodes: int = 200) -> dict:
        degrees = dict(self.graph.degree())
        top = set(sorted(degrees, key=lambda n: degrees[n], reverse=True)[:max_nodes])
        nodes = [{"id": n, **dict(self.graph.nodes[n])} for n in top]
        edges = [
            {"source": u, "target": v, **data}
            for u, v, data in self.graph.edges(data=True)
            if u in top and v in top
        ]
        return {"nodes": nodes, "edges": edges}

    def execute_sql(self, sql: str) -> list[dict]:
        if self.conn is None:
            raise RuntimeError("Database not initialised")
        import re
        if not re.match(r"^\s*SELECT", sql, re.IGNORECASE):
            raise ValueError("Only SELECT statements are permitted")
        cursor = self.conn.execute(sql)
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]


# ── Singleton ──────────────────────────────────────────────────────────────────
_instance: Optional[GraphBuilder] = None


def get_graph_builder() -> GraphBuilder:
    global _instance
    if _instance is None:
        _instance = GraphBuilder()
        _instance.build()
    return _instance
