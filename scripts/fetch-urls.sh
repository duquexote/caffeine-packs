#!/usr/bin/env bash
# Baixa os PNGs exportados do Figma. Uso: scripts/fetch-urls.sh <arquivo com linhas "nodeId url">
# Salva em figma/raw/<nodeId com ":" trocado por "-">.png
set -u
cd "$(dirname "$0")/.."
while read -r id url; do
  [ -z "${id:-}" ] && continue
  out="figma/raw/${id/:/-}.png"
  curl -sSL --retry 3 -o "$out" "$url" &
done < "$1"
wait
ls figma/raw | wc -l
