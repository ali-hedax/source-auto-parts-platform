#!/bin/bash
# SMTP TLS path fix verified on 2026-10-31. No SMTP credentials are read here.
# Limit only SYN MSS to the current IPv4 SMTP destination, port 587.
set -euo pipefail
for chain in OUTPUT FORWARD; do
  rule=(-d mail.parsgate.online/32 -p tcp --dport 587 --tcp-flags SYN,RST SYN -m comment --comment hedax-mail-mss-20261031 -j TCPMSS --set-mss 1260)
  iptables -t mangle -C "$chain" "${rule[@]}" 2>/dev/null || iptables -t mangle -A "$chain" "${rule[@]}"
done
