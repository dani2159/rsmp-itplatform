#!/usr/bin/env python3
"""RSMP-IT noVNC Dynamic Proxy v6.0 -- real WebSocket<->TCP relay"""
import asyncio, logging, os, re
from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('novnc')
# 127.0.0.1 di bare-metal (nginx + proxy sama-sama di host itu juga).
# Di Docker nginx ada di container lain -> perlu 0.0.0.0 (set via env NOVNC_PROXY_HOST).
HOST = os.environ.get('NOVNC_PROXY_HOST', '127.0.0.1')
PORT = 6081

def valid_ip(ip):
    if not re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', ip): return False
    return all(0 <= int(p) <= 255 for p in ip.split('.'))

async def ws_to_tcp(ws, writer):
    try:
        async for msg in ws:
            if isinstance(msg, str): msg = msg.encode()
            writer.write(msg)
            await writer.drain()
    except (ConnectionClosed, Exception):
        pass
    finally:
        try: writer.close()
        except: pass

async def tcp_to_ws(reader, ws):
    try:
        while True:
            data = await reader.read(65536)
            if not data: break
            await ws.send(data)
    except (ConnectionClosed, Exception):
        pass
    finally:
        try: await ws.close()
        except: pass

async def handle(ws):
    path = ws.request.path
    m = re.match(r'/novnc-ws/([^/]+)/(\d+)', path)
    if not m:
        await ws.close(code=1008, reason='bad path'); return
    vhost, vport = m.group(1), int(m.group(2))
    if not valid_ip(vhost):
        await ws.close(code=1008, reason='bad host'); return
    log.info(f"VNC: {vhost}:{vport}")
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(vhost, vport), timeout=10)
    except asyncio.TimeoutError:
        log.error(f"Timeout connecting {vhost}:{vport}")
        await ws.close(code=1011, reason='vnc timeout'); return
    except ConnectionRefusedError:
        log.error(f"Refused {vhost}:{vport}")
        await ws.close(code=1011, reason='vnc refused'); return
    except OSError as e:
        log.error(f"Connect error {vhost}:{vport}: {e}")
        await ws.close(code=1011, reason='vnc unreachable'); return
    await asyncio.gather(ws_to_tcp(ws, writer), tcp_to_ws(reader, ws), return_exceptions=True)

async def main():
    async with serve(handle, HOST, PORT, reuse_address=True, max_size=None):
        log.info(f"noVNC Proxy {HOST}:{PORT} (real WS)")
        await asyncio.get_running_loop().create_future()

if __name__ == '__main__':
    asyncio.run(main())
