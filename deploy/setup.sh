#!/usr/bin/env bash
# One-time setup on a fresh Oracle Cloud Ubuntu VM:
#   curl -fsSL https://raw.githubusercontent.com/hadikhanhk786/citewise/main/deploy/setup.sh | bash
set -euo pipefail

REPO=https://github.com/hadikhanhk786/citewise.git
DIR=$HOME/citewise

# Docker
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# Oracle's Ubuntu images block everything except SSH in iptables; open HTTP/HTTPS.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport $port -j ACCEPT 2>/dev/null ||
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport $port -j ACCEPT
done
sudo apt-get install -y iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save

# Code
[ -d "$DIR/.git" ] || git clone "$REPO" "$DIR"
cd "$DIR/deploy"

# Secrets live only on this server.
if [ ! -f .env ]; then
  ip=$(curl -fsS https://ifconfig.me)
  sed -e "s/^API_DOMAIN=.*/API_DOMAIN=${ip//./-}.sslip.io/" \
      -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" \
      -e "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" \
      .env.example > .env
  chmod 600 .env
fi

sudo docker compose up -d --build
echo "API: https://$(grep ^API_DOMAIN= .env | cut -d= -f2)/api  (models download in the background: sudo docker compose logs -f ollama-pull)"
