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

WALLET = Account.create()


def test_nonce_returns_string():
    r = client.get(f"/auth/nonce?address={WALLET.address}")
    assert r.status_code == 200
    data = r.json()
    assert "nonce" in data
    assert len(data["nonce"]) > 10


def test_verify_returns_token():
    r = client.get(f"/auth/nonce?address={WALLET.address}")
    nonce = r.json()["nonce"]
    msg = encode_defunct(text=nonce)
    sig = WALLET.sign_message(msg).signature.hex()
    r2 = client.post("/auth/verify", json={"address": WALLET.address, "signature": "0x" + sig})
    assert r2.status_code == 200
    assert "token" in r2.json()


def test_nonce_single_use():
    r = client.get(f"/auth/nonce?address={WALLET.address}")
    nonce = r.json()["nonce"]
    msg = encode_defunct(text=nonce)
    sig = WALLET.sign_message(msg).signature.hex()
    client.post("/auth/verify", json={"address": WALLET.address, "signature": "0x" + sig})
    r3 = client.post("/auth/verify", json={"address": WALLET.address, "signature": "0x" + sig})
    assert r3.status_code == 401


def test_wrong_signature_rejected():
    r = client.get(f"/auth/nonce?address={WALLET.address}")
    nonce = r.json()["nonce"]
    other = Account.create()
    msg = encode_defunct(text=nonce)
    sig = other.sign_message(msg).signature.hex()
    r2 = client.post("/auth/verify", json={"address": WALLET.address, "signature": "0x" + sig})
    assert r2.status_code == 401
