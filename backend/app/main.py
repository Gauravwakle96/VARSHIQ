import asyncio
import logging
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.models import Property

settings = get_settings()
logger = logging.getLogger("varshiq")


async def refresh_forecasts():
    from app.services.rainfall.forecast_service import forecast

    while True:
        await asyncio.sleep(settings.refresh_interval_seconds)
        with SessionLocal() as db:
            properties = list(db.scalars(select(Property)))
            for prop in properties:
                try:
                    await forecast(db, prop.latitude, prop.longitude, prop.timezone, 7, prop.id)
                    db.refresh(prop)
                    if prop.effective_catchment_m2 and prop.runoff_coefficient is not None and prop.coefficient_source:
                        from app.services.watertwin import run_twin

                        await run_twin(db, prop, 7)
                except HTTPException:
                    logger.warning("Background forecast refresh unavailable for a registered property")
                await asyncio.sleep(0.2)


@asynccontextmanager
async def lifespan(app):
    if settings.app_env != "production":
        Base.metadata.create_all(engine)
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    task = asyncio.create_task(refresh_forecasts()) if settings.app_env != "test" and settings.runtime_mode == "persistent" else None
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title="VARSHIQ",
    version="0.1.0",
    description="Transparent property-specific rainwater intelligence",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
requests_by_key = defaultdict(deque)


@app.middleware("http")
async def security_and_limits(request: Request, call_next):
    instant = time.monotonic()
    ip = request.client.host if request.client else "unknown"
    if settings.runtime_mode == "serverless" and os.environ.get("VERCEL") == "1":
        # Vercel overwrites this header at its ingress. Never trust it for the
        # local/native server, where callers can supply arbitrary headers.
        ip = request.headers.get("x-forwarded-for", ip).split(",")[0].strip()
    path = request.url.path
    category = (
        "demo_map"
        if path == "/api/v1/demo/footprints"
        else "demo"
        if path.startswith("/api/v1/demo/")
        else "auth"
        if path.startswith("/api/v1/auth/") and request.method == "POST"
        else "expensive"
        if any(
            part in path
            for part in ("/lookup", "/locations/search", "/locations/reverse", "/optimise", "/assistant", "/rainwater/forecast", "/rainwater/scenario")
        )
        else "api"
    )
    limit = 6 if category == "demo_map" else 60 if category == "demo" else 15 if category in {"auth", "expensive"} else 180
    if settings.runtime_mode == "serverless" and path != "/api/v1/health":
        from app.services.shared_limits import consume
        try:
            allowed = await run_in_threadpool(consume, ip, category, limit)
        except Exception:
            return JSONResponse({"error": {"code": "service_unavailable", "message": "The database is temporarily unavailable; retry shortly."}}, status_code=503)
    else:
        key = (ip, category)
        bucket = requests_by_key[key]
        while bucket and instant - bucket[0] > 60:
            bucket.popleft()
        allowed = len(bucket) < limit
        if allowed:
            bucket.append(instant)
    if not allowed:
        return JSONResponse(
            {"error": {"code": "rate_limit", "message": "Too many requests; retry in one minute"}},
            status_code=429,
            headers={"Retry-After": "60"},
        )
    if len(requests_by_key) > 10000:
        stale_keys = [
            item for item, values in requests_by_key.items() if not values or instant - values[-1] > 60
        ]
        for item in stale_keys:
            requests_by_key.pop(item, None)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.upload_max_bytes + 100000:
                return JSONResponse(
                    {"error": {"code": "upload_limit", "message": "Request exceeds the size limit"}},
                    status_code=413,
                )
        except ValueError:
            return JSONResponse(
                {"error": {"code": "invalid_request", "message": "Invalid request length"}}, status_code=400
            )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store"
    if settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(
        {"error": {"code": f"http_{exc.status_code}", "message": str(exc.detail)}},
        status_code=exc.status_code,
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Never echo user input: validation input may contain passwords or credentials.
    details = [
        {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]} for error in exc.errors()
    ]
    return JSONResponse(
        {"error": {"code": "validation", "message": "Check the supplied inputs", "details": details}},
        status_code=422,
    )


@app.exception_handler(ValueError)
async def domain_error(request, exc):
    return JSONResponse({"error": {"code": "invalid_domain_input", "message": str(exc)}}, status_code=422)


@app.exception_handler(Exception)
async def unexpected_error(request, exc):
    # Log class only; provider exceptions can include API credentials in URLs.
    logger.error("Request failed: %s", type(exc).__name__)
    return JSONResponse(
        {
            "error": {
                "code": "internal_error",
                "message": "Request could not be completed; retry or contact support",
            }
        },
        status_code=500,
    )


@app.get("/api/v1/health")
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {
        "data": {
            "status": "ok",
            "version": "0.1.0",
            "database": engine.dialect.name,
            "field_pilot": "Requires authorised real-property registrations and measurements",
        }
    }


from app.analytics import router as analytics_router  # noqa: E402
from app.api import router as core_router  # noqa: E402
from app.demo_api import router as demo_router  # noqa: E402
from app.location_api import router as location_router  # noqa: E402
from app.operations_api import router as operations_router  # noqa: E402

app.include_router(core_router)
app.include_router(analytics_router)
app.include_router(operations_router)
app.include_router(location_router)
app.include_router(demo_router)

from app.body_limit import BodyLimitMiddleware  # noqa: E402

app.add_middleware(BodyLimitMiddleware, max_bytes=settings.upload_max_bytes + 100000)
