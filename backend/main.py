from fastapi import FastAPI, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Field, create_engine, Session, select
from typing import List, Optional
import httpx
import asyncio
from apscheduler.schedulers.asyncio import AsyncioScheduler
from datetime import datetime

# Модели данных
class PushSubscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    endpoint: str
    p256dh: str
    auth: str
    user_id: str

class FavoriteOrganizer(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organizer_id: str
    name: str

# Настройка БД
sqlite_url = "sqlite:///./tenders.db"
engine = create_engine(sqlite_url)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session

app = FastAPI(title="Prozorro PWA Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    scheduler = AsyncioScheduler()
    scheduler.add_job(check_new_tenders, 'interval', minutes=10)
    scheduler.start()

from pywebpush import webpush, WebPushException
import json
import os
from dotenv import load_dotenv

load_dotenv() # Загрузка переменных из .env

# VAPID ключи (должны быть в .env)
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "your-private-key")
VAPID_CLAIMS = {
    "sub": "mailto:admin@example.com"
}

async def send_push_notification(subscription: PushSubscription, title: str, body: str):
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth
                }
            },
            data=json.dumps({"title": title, "body": body}),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
    except WebPushException as ex:
        print(f"Ошибка отправки Push: {ex}")

async def check_new_tenders():
    print(f"[{datetime.now()}] Проверка новых тендеров от избранных заказчиков...")
    with Session(engine) as session:
        # 1. Получаем список избранных
        favorites = session.exec(select(FavoriteOrganizer)).all()
        # 2. Имитируем запрос к Prozorro API
        # 3. Если нашли новый тендер - рассылаем уведомления подписчикам
        subscriptions = session.exec(select(PushSubscription)).all()
        for sub in subscriptions:
            await send_push_notification(sub, "Новый тендер!", "Найден тендер от вашего избранного заказчика.")

@app.get("/api/tenders/search")
async def search_tenders(q: str):
    async with httpx.AsyncClient() as client:
        # Пример вызова Prozorro API (публичный поиск)
        response = await client.get(f"https://api.openprocurement.org/api/2.5/tenders?search={q}")
        return response.json()

@app.post("/api/push/subscribe")
async def subscribe(sub: PushSubscription, session: Session = Depends(get_session)):
    session.add(sub)
    session.commit()
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
