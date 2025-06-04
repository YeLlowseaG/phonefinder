import httpx
from typing import Dict, List, Optional
from ..core.config import get_settings

class AmapService:
    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.AMAP_BASE_URL
        self.key = self.settings.AMAP_KEY

    async def get_districts(self, keywords: str = "", subdistrict: int = 1) -> Dict:
        """获取行政区划信息"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/config/district",
                params={
                    "key": self.key,
                    "keywords": keywords,
                    "subdistrict": subdistrict,
                    "extensions": "base"
                }
            )
            data = response.json()
            if data.get("status") != "1":
                raise Exception(f"获取行政区划失败: {data.get('info')}")
            return data

    async def search_poi(self, 
                        keywords: str,
                        city: Optional[str] = None,
                        district: Optional[str] = None,
                        page: int = 1,
                        offset: int = 20,
                        types: Optional[str] = None,
                        sortrule: str = "distance") -> Dict:
        """搜索POI信息
        
        Args:
            keywords: 搜索关键字
            city: 城市名称或编码
            district: 区县名称或编码
            page: 当前页数
            offset: 每页记录数
            types: POI类型，多个类型用"|"分隔
            sortrule: 排序规则，可选值：distance（距离排序）, weight（权重排序）
        """
        async with httpx.AsyncClient() as client:
            params = {
                "key": self.key,
                "keywords": keywords,
                "page": page,
                "offset": offset,
                "extensions": "all",
                "sortrule": sortrule
            }
            if city:
                params["city"] = city
            if district:
                params["district"] = district
            if types:
                params["types"] = types

            response = await client.get(
                f"{self.base_url}/place/text",
                params=params
            )
            data = response.json()
            if data.get("status") != "1":
                raise Exception(f"搜索POI失败: {data.get('info')}")
            return data

    async def get_poi_detail(self, id: str) -> Dict:
        """获取POI详细信息"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/place/detail",
                params={
                    "key": self.key,
                    "id": id,
                    "extensions": "all"
                }
            )
            data = response.json()
            if data.get("status") != "1":
                raise Exception(f"获取POI详情失败: {data.get('info')}")
            return data 