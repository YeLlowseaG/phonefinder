from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from ..services.amap_service import AmapService

router = APIRouter()
amap_service = AmapService()

@router.get("/districts")
async def get_districts(keywords: str = ""):
    """获取行政区划信息"""
    try:
        return await amap_service.get_districts(keywords)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/search")
async def search_poi(
    keywords: str,
    city: Optional[str] = None,
    district: Optional[str] = None,
    page: int = Query(1, ge=1),
    offset: int = Query(20, ge=1, le=50),
    types: Optional[str] = None,
    sortrule: str = Query("distance", regex="^(distance|weight)$")
):
    """搜索POI信息"""
    try:
        return await amap_service.search_poi(
            keywords=keywords,
            city=city,
            district=district,
            page=page,
            offset=offset,
            types=types,
            sortrule=sortrule
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/poi/{poi_id}")
async def get_poi_detail(poi_id: str):
    """获取POI详细信息"""
    try:
        return await amap_service.get_poi_detail(poi_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) 