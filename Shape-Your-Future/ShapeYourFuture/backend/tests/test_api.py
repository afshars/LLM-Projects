"""
API-level smoke tests. LLM calls are mocked via the fake_llm fixture -
no network is used and results are fully deterministic.
"""

def test_register_and_login_flow(client):
    res = client.post("/auth/register", json={"username": "userab", "password": "Secret.123@"})
    assert res.status_code == 201
    assert "access_token" in res.json()

    res2 = client.post("/auth/login", data={"username": "userab", "password": "Secret.123@"})
    assert res2.status_code == 200


def test_login_wrong_password_rejected(client):
    client.post("/auth/register", json={"username": "userab", "password": "Secret.123@"})
    res = client.post("/auth/login", data={"username": "userab", "password": "wrong"})
    assert res.status_code == 401


def test_protected_endpoint_requires_token(client):
    res = client.post("/coach/tactic/suggest", json={"obstacle": "test"})
    assert res.status_code == 401


def test_healthz(client):
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
