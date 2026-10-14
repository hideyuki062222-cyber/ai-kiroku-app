from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_record_requires_explicit_formal_save():
    js = text("record-safety.js")
    assert "この内容を正式保存" in js
    assert "loadTrustedAssignmentContext" in js
    assert "assignmentRecordCount" in js
    assert "pendingSignature" in js
    assert "removeSensitiveCache" in js


def test_record_entrypoint_loads_current_safety_bundle():
    html = text("index.html")
    assert "common-nav.js?v=20261014-2" in html
    assert "担当情報をクラウドから安全に確認しています" in html
    assert 'q.get("client")' not in html
    assert 'q.get("memo")' not in html


def test_assignment_passes_only_assignment_id_to_record_page():
    addon = text("assignment/safety-addon.js")
    assert "new URLSearchParams({from:'assignment',assignment:a.id})" in addon
    assert "client:" not in addon
    assert "memo:" not in addon
    wrapper = text("assignment/index.html")
    assert "./safety-addon.js?v=20261014-2" in wrapper


def test_dashboard_passes_only_assignment_id():
    html = text("dashboard/index.html")
    assert "new URLSearchParams({from:'assignment',assignment:x.id})" in html
    assert "client:c?.code" not in html
    assert "carry_over.eq.true" in html


def test_handoff_only_allows_workflow_state_columns():
    sql = text("supabase/20261014_handoff_cashbook_safety.sql")
    assert "revoke update on table public.handoff_entries from authenticated" in sql
    assert "grant update (carry_over, resolved)" in sql
    assert "handoff_workflow_audit_stamp" in sql
    addon = text("handoff/safety-addon.js")
    assert ".eq('organization_id',membership.organization_id)" in addon
    assert "updated_at:new Date" not in addon
    assert "12文字以上" in addon


def test_assignment_rls_uses_real_organization_comparisons():
    sql = text("supabase/20261014_fix_assignment_rls.sql")
    assert "c.organization_id = staff_assignments.organization_id" in sql
    assert "m.organization_id = staff_assignments.organization_id" in sql
    assert "s.organization_id = staff_assignments.organization_id" in sql
    assert "c.organization_id = c.organization_id" not in sql
    assert "m.organization_id = m.organization_id" not in sql
    assert "s.organization_id = s.organization_id" not in sql
    assert "(select auth.uid())" in sql


def test_cashbook_has_server_side_audit_stamp_and_client_freeze():
    sql = text("supabase/20261014_handoff_cashbook_safety.sql")
    assert "cashbook_entry_audit_stamp" in sql
    assert "new.created_by := v_uid" in sql
    assert "new.created_by_name" in sql
    assert "new.organization_id := old.organization_id" in sql
    assert "cashbook_account_audit_stamp" in sql
    addon = text("cashbook/safety-addon.js")
    assert "clientSelect.disabled=true" in addon
    assert "12文字以上" in addon


def test_legacy_integrated_pages_are_retired():
    for path in ("integrated/index.html", "integrated/fixed.html"):
        html = text(path)
        assert "location.replace('../')" in html
        assert "旧「統合システム」は使用を終了しました" in html
