FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    default-jre-headless curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/

ENV STATIC_DIR=/app/frontend/build
EXPOSE 8003

CMD ["uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8003"]
