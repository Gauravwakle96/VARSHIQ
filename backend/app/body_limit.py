from starlette.responses import JSONResponse


class BodyLimitMiddleware:
    """Count actual received bytes before JSON or multipart parsing/spooling."""

    def __init__(self, app, max_bytes):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PATCH", "PUT"}:
            await self.app(scope, receive, send)
            return
        limit = self.max_bytes if scope["path"].endswith("/photos") else min(self.max_bytes, 1_000_000)
        data = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(data) + len(chunk) > limit:
                response = JSONResponse(
                    {"error": {"code": "body_limit", "message": "Request exceeds the size limit"}},
                    status_code=413,
                )
                await response(scope, receive, send)
                return
            data.extend(chunk)
            if not message.get("more_body", False):
                break
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(data), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)
