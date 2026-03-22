#!/bin/bash
# ContextGraph quick-start script
set -e

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  ContextGraph — Order to Cash Setup    ║"
echo "╚════════════════════════════════════════╝"
echo ""

# ── Backend setup ─────────────────────────────────────────────
echo "▶ Setting up backend..."
cd backend

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "⚠  Created backend/.env — please add your GROQ_API_KEY:"
  echo "   Get a free key at: https://console.groq.com"
  echo ""
  read -p "   Enter GROQ_API_KEY (or press Enter to skip for now): " api_key
  if [ -n "$api_key" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/your_groq_api_key_here/$api_key/" .env
    else
      sed -i "s/your_groq_api_key_here/$api_key/" .env
    fi
    echo "   ✓ API key saved."
  fi
fi

echo "▶ Installing Python dependencies..."
pip install -r requirements.txt -q

mkdir -p data
echo "▶ Backend ready. Data directory: $(pwd)/data"

cd ..

# ── Frontend setup ────────────────────────────────────────────
echo ""
echo "▶ Setting up frontend..."
cd frontend
npm install --silent
echo "▶ Frontend ready."
cd ..

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  Setup complete! To start:             ║"
echo "║                                        ║"
echo "║  Terminal 1 (backend):                 ║"
echo "║    cd backend                          ║"
echo "║    uvicorn main:app --reload           ║"
echo "║                                        ║"
echo "║  Terminal 2 (frontend):                ║"
echo "║    cd frontend                         ║"
echo "║    npm run dev                         ║"
echo "║                                        ║"
echo "║  Then open: http://localhost:5173      ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "📁 Place dataset files in: backend/data/"
echo "   (Supported: .csv or .xlsx per table)"
echo ""
