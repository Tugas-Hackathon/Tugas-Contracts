import os, sys
os.environ.setdefault("DATA_DIR", "/tmp/tugas-test")
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
    sig = w.sign_message(encode_defunct(text=nonce)).signature.hex()
    return client.post("/auth/verify", json={"address": w.address, "signature": "0x" + sig}).json()["token"]


def _branch(token):
    sid = client.post("/subjects", json={"name": "DBMS"},
                      headers={"Authorization": f"Bearer {token}"}).json()["id"]
    return client.post(f"/subjects/{sid}/branches",
                       json={"kind": "assignment", "title": "ER Diagram"},
                       headers={"Authorization": f"Bearer {token}"}).json()["id"]


def test_create_milestone():
    token = _login()
    bid = _branch(token)
    r = client.post(f"/branches/{bid}/milestones",
                    json={"title": "Draft 1"},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    assert r.json()["title"] == "Draft 1"


def test_hash_returns_hashes():
    token = _login()
    bid = _branch(token)
    r = client.post(f"/branches/{bid}/milestones",
                    json={"title": "Draft 1"},
                    headers={"Authorization": f"Bearer {token}"})
    mid = r.json()["id"]
    r2 = client.post(f"/milestones/{mid}/hash",
                     json={"draft": "My assignment draft text.", "brief": "Write about ER.", "rubric": "Must have diagrams."},
                     headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    data = r2.json()
    assert data["workHash"].startswith("0x")
    assert data["contextHash"].startswith("0x")
    assert 0 <= data["aiAssistLevel"] <= 100


def test_hash_is_deterministic():
    token = _login()
    bid = _branch(token)
    mid = client.post(f"/branches/{bid}/milestones",
                      json={"title": "D"},
                      headers={"Authorization": f"Bearer {token}"}).json()["id"]
    body = {"draft": "Same draft.", "brief": "Brief.", "rubric": "Rubric."}
    r1 = client.post(f"/milestones/{mid}/hash", json=body,
                     headers={"Authorization": f"Bearer {token}"})
    r2 = client.post(f"/milestones/{mid}/hash", json=body,
                     headers={"Authorization": f"Bearer {token}"})
    assert r1.json()["workHash"] == r2.json()["workHash"]
    assert r1.json()["contextHash"] == r2.json()["contextHash"]


def test_list_milestones():
    token = _login()
    bid = _branch(token)
    client.post(f"/branches/{bid}/milestones", json={"title": "M1"},
                headers={"Authorization": f"Bearer {token}"})
    r = client.get(f"/branches/{bid}/milestones",
                   headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) >= 1
