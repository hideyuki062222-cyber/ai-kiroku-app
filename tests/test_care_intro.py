from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INTRO = "指示内容確認しました。前回のサービス記録確認しました。"


def text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_care_intro_addon_uses_expected_default_and_client_setting():
    addon = text("care-intro-addon.js")
    assert DEFAULT_INTRO in addon
    assert "profileCareIntro" in addon
    assert "care_intro_text" in addon
    assert "②の冒頭文（利用者別）" in addon
    assert "括弧（ ）は付きません" in addon
    assert "buildCareRecord" in addon


def test_record_page_loads_care_intro_addon():
    common = text("common-nav.js")
    assert "care-intro-addon.js?v=20261028-1" in common


def test_client_care_intro_migration_has_safe_default():
    migration = text("supabase/20261028_client_care_intro.sql")
    assert "add column if not exists care_intro_text text not null" in migration
    assert DEFAULT_INTRO in migration
