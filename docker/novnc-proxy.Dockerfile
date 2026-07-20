# Build context: root repo
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir websockets
COPY server-setup/novnc-proxy.py .
ENV NOVNC_PROXY_HOST=0.0.0.0
EXPOSE 6081
CMD ["python3", "novnc-proxy.py"]
