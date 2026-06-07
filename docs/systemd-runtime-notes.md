# systemd Runtime Notes

This note records the 2026-06-07 `train05` cutover from ad hoc workstation
processes to `systemd --user` management.

## Current operational shape on train05

- `vllm-hust-workstation.service` is now the owner of local port `3001`.
- The previous manual launcher was an ad hoc `nohup bash
  scripts/run_workstation_systemd.sh` process. That process was removed after
  `vllm-hust-workstation.service` became healthy.
- Local workstation continues to proxy against:
  `VLLM_HUST_BASE_URL=http://127.0.0.1:18000`
- The workstation repository itself still does not install a dedicated
  Cloudflare tunnel unit.
- Public ingress for `ws.sage.org.ai` is currently provided by the shared
  host-level user service `sage-public-cloudflared.service`, which reuses the
  existing named tunnel config from the `sage-faculty-twin` host deployment.

## Important boundary

The workstation deploy scripts manage the workstation UI runtime, but not the
shared named tunnel. If this host keeps using the shared SAGE tunnel, the tunnel
service remains an operational host concern rather than a repo-local deploy
artifact.

## Verification commands

```bash
export XDG_RUNTIME_DIR=/run/user/22629
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/22629/bus

systemctl --user status vllm-hust-workstation.service
systemctl --user status sage-public-cloudflared.service

curl http://127.0.0.1:3001/api/models
curl https://ws.sage.org.ai/api/models
```

## If a future host wants a repo-local tunnel

If the workstation needs its own dedicated tunnel instead of the shared host
tunnel, add a repo-owned `cloudflared` unit template and token/config wiring
here rather than relying on the `sage-faculty-twin` runtime directory.