from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from db import init_db
from auth import router as auth_router
from subjects import router as subjects_router
from materials import router as materials_router
from tutor import router as tutor_router
from branches import router as branches_router
from milestones import router as milestones_router
from whatsapp import router as whatsapp_router
from intake import router as intake_router

app = FastAPI(title="Tugas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(subjects_router)
app.include_router(materials_router)
app.include_router(tutor_router)
app.include_router(branches_router)
app.include_router(milestones_router)
app.include_router(whatsapp_router)
app.include_router(intake_router)

@app.on_event("startup")
def startup():
    init_db()

@app.get("/health")
def health():
    return {"ok": True}
