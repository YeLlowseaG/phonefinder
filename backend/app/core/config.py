from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    AMAP_KEY: str
    AMAP_BASE_URL: str = "https://restapi.amap.com/v3"
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings() 