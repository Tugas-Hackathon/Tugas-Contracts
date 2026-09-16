import os, sys, io
os.environ.setdefault("DATA_DIR", "/tmp/tugas-test")
os.environ.setdefault("SESSION_SECRET", "test-secret-32-chars-padding-here")
os.environ.setdefault("LLM_FIXTURES", "1")
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from main import app
from db import init_db

init_db()
client = TestClient(app)


def _login():
    w = Account.create()
    r = client.get(f"/auth/nonce?address={w.address}")
    nonce = r.json()["nonce"]
    msg = encode_defunct(text=nonce)
    sig = w.sign_message(msg).signature.hex()
    return client.post("/auth/verify", json={"address": w.address, "signature": "0x" + sig}).json()["token"]


def _subject(token):
    return client.post("/subjects", json={"name": "Test"}, headers={"Authorization": f"Bearer {token}"}).json()["id"]


def test_upload_txt():
    token = _login()
    sid = _subject(token)
    content = b"Hello world. This is a test material."
    r = client.post(
        f"/subjects/{sid}/materials",
        files={"file": ("notes.txt", io.BytesIO(content), "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["filename"] == "notes.txt"
    assert "id" in data


def test_upload_disallowed_ext():
    token = _login()
    sid = _subject(token)
    r = client.post(
        f"/subjects/{sid}/materials",
        files={"file": ("evil.exe", io.BytesIO(b"MZ"), "application/octet-stream")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


def test_list_materials():
    token = _login()
    sid = _subject(token)
    client.post(
        f"/subjects/{sid}/materials",
        files={"file": ("a.txt", io.BytesIO(b"some text here"), "text/plain")},
        headers={"Authorization": f"Bearer {token}"},
    )
    r = client.get(f"/subjects/{sid}/materials", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1
