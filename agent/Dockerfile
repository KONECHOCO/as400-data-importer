FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y default-jre-headless curl && apt-get clean
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent.py .
COPY lib/ ./lib/
ENV AGENT_PORT=8400
ENV CLOUD_URL=https://as400.ikonetsolutions.com/api
EXPOSE 8400
CMD ["python", "agent.py"]
