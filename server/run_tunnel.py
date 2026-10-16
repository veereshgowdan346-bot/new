"""
CHINTU AI Remote Access & Mobile Tunnel Helper
Allows full worldwide access to CHINTU AI TRADING SYSTEM from iOS/Android devices.
Options:
1. Local Wi-Fi / LAN Direct IP Access (Zero setup)
2. Cloudflare Quick Tunnel (Free, no login needed, HTTPS)
3. Local ngrok / pyngrok helper
"""

import socket
import subprocess
import sys
import shutil
import time

def get_local_ip():
    """Finds the local LAN IP address of this machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def print_banner():
    local_ip = get_local_ip()
    print("=" * 65)
    print("      🚀 CHINTU AI REMOTE MOBILE ACCESS & TUNNEL UTILITY 🚀")
    print("=" * 65)
    print(f"\n📱 1. LOCAL WI-FI / MOBILE ACCESS (Same Wi-Fi network):")
    print(f"   Open on your iPhone / Android Chrome or Safari:")
    print(f"   👉 http://{local_ip}:5173")
    print(f"\n   Backend API & WebSocket Stream:")
    print(f"   👉 http://{local_ip}:8000")
    print("\n   [TIP]: On mobile browser, tap 'Add to Home Screen' to install as Native PWA!")
    print("-" * 65)
    print("🌐 2. WORLDWIDE CELLULAR ACCESS (Outside Home Wi-Fi):")
    print("   To access from 4G/5G mobile data anywhere in the world:")
    
    cloudflared = shutil.which("cloudflared")
    if cloudflared:
        print("   Found Cloudflare Tunnel ('cloudflared'). Starting quick tunnel for port 5173...")
        try:
            cmd = [cloudflared, "tunnel", "--url", "http://localhost:5173"]
            subprocess.run(cmd)
        except KeyboardInterrupt:
            print("\nTunnel stopped by user.")
    else:
        print("   Option A: Cloudflare Quick Tunnel (Recommended & Free):")
        print("     1. Download cloudflared from: https://github.com/cloudflare/cloudflared/releases")
        print("     2. Run: cloudflared tunnel --url http://localhost:5173")
        print("     (It generates a free https://*.trycloudflare.com link instantly)")
        print("\n   Option B: ngrok (Alternative):")
        print("     Run: npx ngrok http 5173")
        print("=" * 65)

if __name__ == "__main__":
    print_banner()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[Exited]")

