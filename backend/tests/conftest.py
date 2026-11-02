"""Shared isolated fixtures; no production database or property registration."""
from test_api import client as _client
from test_api import db_session as _db_session

client = _client
db_session = _db_session
