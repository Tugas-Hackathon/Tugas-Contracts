# Backend and WhatsApp sidecar in one image. They share a volume and a token
# and are useless apart, so splitting them would mean two services, two
# deploys and a network hop for no gain.
FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # Puppeteer downloads its own Chromium by default — ~400MB and frequently
    # the wrong build for slim images. Use the distro one instead.
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# chromium plus the fonts and libs it needs to render WhatsApp Web headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates chromium \
      fonts-liberation fonts-noto-color-emoji \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libasound2 \
  && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first so a source edit does not reinstall them.
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen --no-dev

COPY bot/package.json bot/package-lock.json ./bot/
RUN cd bot && npm ci --omit=dev

COPY . .

# SQLite, uploads and WhatsApp sessions all live here. Mount a volume or a
# redeploy wipes every student's data.
ENV DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 8000

# Sessions outlive deploys only if they are on the volume, not in the image.
ENV WA_SESSION_DIR=/data/wa

COPY start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
