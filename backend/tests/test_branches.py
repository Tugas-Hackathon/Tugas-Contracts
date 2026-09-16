import os, sys
os.environ.setdefault("DATA_DIR", "/tmp/tugas-test")
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
    sig = w.sign_message(encode_defunct(text=nonce)).signature.hex()
    return client.post("/auth/verify", json={"address": w.address, "signature": "0x" + sig}).json()["token"]


def _subject(token):
    return client.post("/subjects", json={"name": "DBMS"},
                       headers={"Authorization": f"Bearer {token}"}).json()["id"]


def test_create_branch():
    token = _login()
    sid = _subject(token)
    r = client.post(f"/subjects/{sid}/branches",
                    json={"kind": "assignment", "title": "ER Diagram", "due_at": 1800000000},
                    headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201
    assert r.json()["title"] == "ER Diagram"


def test_list_branches():
    token = _login()
    sid = _subject(token)
    client.post(f"/subjects/{sid}/branches",
                json={"kind": "assignment", "title": "B1"},
                headers={"Authorization": f"Bearer {token}"})
    r = client.get(f"/subjects/{sid}/branches", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert any(b["title"] == "B1" for b in r.json())


def test_outline_returns_sections():
    token = _login()
    sid = _subject(token)
    r = client.post(f"/subjects/{sid}/branches",
                    json={"kind": "assignment", "title": "Report"},
                    headers={"Authorization": f"Bearer {token}"})
    bid = r.json()["id"]
    r2 = client.post(f"/branches/{bid}/outline",
                     json={"brief": "Write a report on normalisation."},
                     headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert "sections" in r2.json()


def test_rubric_check_returns_criteria():
    token = _login()
    sid = _subject(token)
    r = client.post(f"/subjects/{sid}/branches",
                    json={"kind": "assignment", "title": "Essay"},
                    headers={"Authorization": f"Bearer {token}"})
    bid = r.json()["id"]
    r2 = client.post(f"/branches/{bid}/rubric-check",
                     json={"draft": "This essay discusses normalisation..."},
                     headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert "criteria" in r2.json()
    for c in r2.json()["criteria"]:
        assert "name" in c and "met" in c
