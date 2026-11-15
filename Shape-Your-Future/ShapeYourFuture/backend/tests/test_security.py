"""
Unit tests for the stdlib-only auth primitives (see app/core/security.py).
These need no network and no LLM - just run `pytest`.
"""
import time

from app.core.security import create_access_token, decode_access_token, hash_password, verify_password


def test_hash_and_verify_roundtrip():
    h = hash_password("correcthorsebatterystaple")
    assert verify_password("correcthorsebatterystaple", h) is True


def test_verify_rejects_wrong_password():
    h = hash_password("correcthorsebatterystaple")
    assert verify_password("wrong-password", h) is False


def test_same_password_hashes_differently_each_time():
    assert hash_password("same-input") != hash_password("same-input")


def test_verify_rejects_malformed_hash():
    assert verify_password("anything", "not-a-real-hash") is False


def test_token_roundtrip():
    token = create_access_token(subject="user@example.com")
    assert decode_access_token(token) == "user@example.com"


def test_token_rejects_tampering():
    token = create_access_token(subject="user@example.com")
    tampered = token[:-4] + "abcd"
    assert decode_access_token(tampered) is None


def test_token_rejects_garbage():
    assert decode_access_token("not.a.jwt") is None


def test_expired_token_rejected():
    token = create_access_token(subject="user@example.com", expires_minutes=-1)
    assert decode_access_token(token) is None
