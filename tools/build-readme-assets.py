"""Compatibility entry point for screenshots rendered from the current widget."""
from pathlib import Path
import subprocess

if __name__ == '__main__':
    subprocess.run(['node', str(Path(__file__).with_suffix('.mjs'))], check=True)
