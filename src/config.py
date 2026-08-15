# Backward-compat shim — mọi code import từ src.config vẫn hoạt động
# Source of truth đã chuyển sang src/core/config.py
from src.core.config import Settings, get_settings  # noqa: F401

__all__ = ["Settings", "get_settings"]
