import os
import asyncio
from telethon import TelegramClient

API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
SESSION_NAME = "joboss_telegram_session"

# אפשר לשנות לערוץ רלוונטי
CHANNEL_USERNAME = os.getenv("TG_CHANNEL", "nixos_jobs")


async def main():
    if not API_ID or not API_HASH:
        raise ValueError("Missing TG_API_ID or TG_API_HASH env vars")

    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
    await client.start()

    print(f"Reading latest messages from: @{CHANNEL_USERNAME}")
    entity = await client.get_entity(CHANNEL_USERNAME)

    messages = await client.get_messages(entity, limit=20)

    for i, msg in enumerate(messages, start=1):
        text = (msg.message or "").replace("\n", " ")[:200]
        print(f"{i:02d}. id={msg.id} | date={msg.date} | text={text}")

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())