# Multi-stage Dockerfile for AutoForm AI with LaTeX support

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the frontend
RUN npm run build

# Stage 2: Production image with Python and LaTeX
FROM python:3.11-slim

# Install TeX Live (minimal installation for form generation)
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-lang-german \
    texlive-plain-generic \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python requirements and install
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install serve for static file serving
RUN npm install -g serve

# Copy the built frontend
COPY --from=frontend-builder /app/dist ./dist

# Copy Python backend and LaTeX templates
COPY latex_service.py ./
COPY server.py ./
COPY templates ./templates

# Create startup script
RUN echo '#!/bin/bash\n\
python server.py &\n\
serve dist -l ${PORT:-3000}\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose ports
EXPOSE 3000 5000

# Environment variables
# PORT is used by serve for the frontend (Railway will set this)
ENV PORT=3000
# FLASK_PORT is used by the Python API server (separate from Railway's PORT)
ENV FLASK_PORT=5000
ENV FLASK_DEBUG=false
ENV VITE_LATEX_API_URL=http://localhost:5000

# Start both services
CMD ["/app/start.sh"]
