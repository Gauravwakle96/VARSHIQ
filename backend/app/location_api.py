from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.security import require_user
from app.serializers import ok
from app.services.locations import district_directory, reverse, search

router = APIRouter(prefix="/api/v1/locations")


@router.get("/districts")
def districts(state: str = Query("Maharashtra", max_length=120), user=Depends(require_user)):
    return ok(district_directory(state))


@router.get("/search")
async def search_location(q: str = Query(min_length=2, max_length=250),
                          country: str = Query("IN", pattern="^[A-Z]{2}$"),
                          state: str = Query("Maharashtra", max_length=120),
                          db: Session = Depends(get_db), user=Depends(require_user)):
    if len(q.strip()) < 2:
        raise HTTPException(422, "Enter at least two visible search characters")
    return ok(await search(db, q.strip(), country, state.strip()))


@router.get("/reverse")
async def reverse_location(latitude: float = Query(ge=-85, le=85),
                           longitude: float = Query(ge=-180, le=180),
                           db: Session = Depends(get_db), user=Depends(require_user)):
    return ok(await reverse(db, latitude, longitude))
