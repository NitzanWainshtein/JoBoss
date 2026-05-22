import os
import asyncio

from telethon import TelegramClient
from telethon.sessions import StringSession


TG_API_ID = int(os.getenv("TG_API_ID", "0"))
TG_API_HASH = os.getenv("TG_API_HASH", "")


async def main():
    if not TG_API_ID or not TG_API_HASH:
        raise ValueError("Missing TG_API_ID or TG_API_HASH env vars")

    async with TelegramClient(StringSession(), TG_API_ID, TG_API_HASH) as client:
        print("\nTG_SESSION_STRING:")
        print(client.session.save())
        print("\nDo not share this value.")


if __name__ == "__main__":
    asyncio.run(main())