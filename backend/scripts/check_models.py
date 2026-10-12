import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.llm import (
    OmniRouteError,
    _refresh_model_registry,
    model_chain_for,
    probe_model_details,
)


async def main() -> None:
    print(f"{'ROLE':<12} {'MODEL':<44} {'STATUS':<8} {'LATENCY':>9}  ERROR")
    try:
        await _refresh_model_registry()
    except OmniRouteError as error:
        print(f"Model check stopped: {error}")
        return
    for role in ("teacher", "practice", "reasoning", "multimodal", "json"):
        for model in model_chain_for(role):
            success, elapsed, error = await probe_model_details(model)
            status = "PASS" if success else "FAIL"
            print(
                f"{role:<12} {model:<44} {status:<8} "
                f"{elapsed:>8.2f}s  {error}"
            )


if __name__ == "__main__":
    asyncio.run(main())
