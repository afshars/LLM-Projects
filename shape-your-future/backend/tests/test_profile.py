"""
Tests for /profile/* - display name/bio, avatar (preset + custom upload),
and password change. No LLM involved, so no fake_llm needed here.
"""
import base64

# A real (tiny, 1x1) PNG, base64-encoded - avoids pulling in an image
# library just for tests while still exercising real base64-decode +
# data: URI parsing in the endpoint.
_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def _tiny_png_data_uri():
    return f"data:image/png;base64,{_TINY_PNG_B64}"


def test_get_profile_defaults(client, auth_headers):
    res = client.get("/profile/me", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["username"] == "testuser"
    assert body["display_name"] == "testuser"  # falls back to username
    assert body["bio"] is None
    assert body["avatar_kind"] == "preset"
    assert body["avatar_value"] == "fox"


def test_update_display_name_and_bio(client, auth_headers):
    res = client.put(
        "/profile/me",
        json={"display_name": "Mehdi", "bio": "Small steps every day."},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["display_name"] == "Mehdi"
    assert body["bio"] == "Small steps every day."


def test_bio_too_long_rejected(client, auth_headers):
    res = client.put(
        "/profile/me",
        json={"display_name": None, "bio": "x" * 241},
        headers=auth_headers,
    )
    assert res.status_code == 422


def test_set_preset_avatar(client, auth_headers):
    res = client.put("/profile/me/avatar", json={"kind": "preset", "value": "owl"}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["avatar_kind"] == "preset"
    assert res.json()["avatar_value"] == "owl"


def test_invalid_preset_rejected(client, auth_headers):
    res = client.put("/profile/me/avatar", json={"kind": "preset", "value": "dragon"}, headers=auth_headers)
    assert res.status_code == 400


def test_custom_avatar_upload_accepted(client, auth_headers):
    data_uri = _tiny_png_data_uri()
    res = client.put("/profile/me/avatar", json={"kind": "custom", "value": data_uri}, headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["avatar_kind"] == "custom"
    assert body["avatar_value"] == data_uri


def test_custom_avatar_oversized_rejected(client, auth_headers):
    # ~400KB of raw bytes, well past the 300KB cap.
    huge_b64 = base64.b64encode(b"\x00" * (400 * 1024)).decode("ascii")
    data_uri = f"data:image/png;base64,{huge_b64}"
    res = client.put("/profile/me/avatar", json={"kind": "custom", "value": data_uri}, headers=auth_headers)
    assert res.status_code == 400


def test_custom_avatar_bad_format_rejected(client, auth_headers):
    res = client.put(
        "/profile/me/avatar",
        json={"kind": "custom", "value": "not-a-data-uri"},
        headers=auth_headers,
    )
    assert res.status_code == 400


def test_change_password_flow(client, auth_headers):
    res = client.put(
        "/profile/me/password",
        json={"current_password": "Secret.123@", "new_password": "NewPass1@"},
        headers=auth_headers,
    )
    assert res.status_code == 204

    # old password no longer works, new one does
    old = client.post("/auth/login", data={"username": "testuser", "password": "Secret.123@"})
    assert old.status_code == 401
    new = client.post("/auth/login", data={"username": "testuser", "password": "NewPass1@"})
    assert new.status_code == 200


def test_change_password_wrong_current_rejected(client, auth_headers):
    res = client.put(
        "/profile/me/password",
        json={"current_password": "wrong-one", "new_password": "NewPass1@"},
        headers=auth_headers,
    )
    assert res.status_code == 400


def test_new_password_allows_either_at_or_dot_not_both(client, auth_headers):
    # Only "@", no ".", must now be accepted (previously required both).
    res = client.put(
        "/profile/me/password",
        json={"current_password": "Secret.123@", "new_password": "OnlyAt123@"},
        headers=auth_headers,
    )
    assert res.status_code == 204


def test_register_with_only_dot_no_at_accepted(client):
    res = client.post("/auth/register", json={"username": "dotuser", "password": "OnlyDot123.x"})
    assert res.status_code == 201


def test_profile_requires_auth(client):
    res = client.get("/profile/me")
    assert res.status_code == 401
