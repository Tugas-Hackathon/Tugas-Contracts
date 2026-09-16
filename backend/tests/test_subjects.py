import os, sys
os.environ.setdefault("DATA_DIR", "/tmp/tugas-test")
os.environ.setdefault("SESSION_SECRET", "test-secret-32-chars-padding-here")
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi.testclient import TestClient
from main import app
from db import init_db

init_db()
client = TestClient(app)


def _login() -> str:
    wallet = Account.create()
    r = client.get(f"/auth/nonce?address={wallet.address}")
    nonce = r.json()["nonce"]
    msg = encode_defunct(text=nonce)
    sig = wallet.sign_message(msg).signature.hex()
    r2 = client.post("/auth/verify", json={"address": wallet.address, "signature": "0x" + sig})
    return r2.json()["token"]


def test_create_subject():
    token = _login()
    r = client.post("/subjects", json={"name": "Database Systems"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    assert r.json()["name"] == "Database Systems"


def test_list_subjects():
    token = _login()
    client.post("/subjects", json={"name": "Algorithms"},
                headers={"Authorization": f"Bearer {token}"})
    r = client.get("/subjects", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert "Algorithms" in names


def test_get_subject():
    token = _login()
    r = client.post("/subjects", json={"name": "OS"},
                    headers={"Authorization": f"Bearer {token}"})
    sid = r.json()["id"]
    r2 = client.get(f"/subjects/{sid}", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["id"] == sid


def test_delete_subject():
    token = _login()
    r = client.post("/subjects", json={"name": "ToDelete"},
                    headers={"Authorization": f"Bearer {token}"})
    sid = r.json()["id"]
    r2 = client.delete(f"/subjects/{sid}", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 204
    r3 = client.get(f"/subjects/{sid}", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 404


def test_cannot_access_other_users_subject():
    token1 = _login()
    token2 = _login()
    r = client.post("/subjects", json={"name": "Private"},
                    headers={"Authorization": f"Bearer {token1}"})
    sid = r.json()["id"]
    r2 = client.get(f"/subjects/{sid}", headers={"Authorization": f"Bearer {token2}"})
    assert r2.status_code == 404
