#!/bin/bash

# InsightSerenity Platform - HTTPS Development Server Startup Script

echo "🔐 InsightSerenity Platform - HTTPS Development Setup"
echo "=================================================="
echo ""

# Check if SSL certificates exist
if [ ! -f "ssl/localhost.crt" ] || [ ! -f "ssl/localhost.key" ]; then
    echo "❌ SSL certificates not found. Generating new certificates..."
    mkdir -p ssl
    openssl req -x509 -newkey rsa:4096 -keyout ssl/localhost.key -out ssl/localhost.crt -days 365 -nodes \
        -subj "/C=US/ST=State/L=City/O=InsightSerenity/OU=Development/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
    echo "✅ SSL certificates generated"
else
    echo "✅ SSL certificates found"
fi

echo ""
echo "Starting services..."
echo ""

# Start frontend
echo "🌐 Starting Frontend (HTTPS) on https://localhost:3000"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=================================================="
echo "✅ All services started!"
echo ""
echo "Frontend:          https://localhost:3000"
echo "Customer Services: https://localhost:3001"
echo "Admin Server:      https://localhost:3002"
echo ""
echo "⚠️  First time? Accept the self-signed certificates in your browser:"
echo "   1. Visit https://localhost:3000"
echo "   2. Click 'Advanced' → 'Proceed to localhost'"
echo "   3. Repeat for https://localhost:3001 and https://localhost:3002"
echo ""
echo "📖 See SSL-SETUP.md for detailed documentation"
echo ""
echo "Press Ctrl+C to stop all services"
echo "=================================================="

# Wait for processes
wait
