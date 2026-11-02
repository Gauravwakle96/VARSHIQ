from datetime import datetime

from app.models import Property
from app.security import utc


def row_data(row, exclude=()):
    result = {}
    for column in row.__table__.columns:
        if column.key in exclude or column.key == "spatial_geometry":
            continue
        value = getattr(row, column.key)
        result[column.key] = utc(value).isoformat() if isinstance(value, datetime) else value
    return result


def property_data(prop: Property):
    return row_data(prop)


def user_data(user):
    return {key: getattr(user, key) for key in ("id", "name", "email", "role", "organisation_id")}


def ok(data, **meta):
    return {"data": data, "meta": meta}
