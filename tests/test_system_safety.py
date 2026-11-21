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
    assert "common-nav.js?v=20261121-variants-1" in html
    assert "担当情報をクラウドから安全に確認しています" in html
    assert 'q.get("client")' not in html
    assert 'q.get("memo")' not in html


def test_assignment_context_fails_closed_until_trusted():
    common = text("common-nav.js")
    guard = text("assignment-context-guard.js")
    assert "assignment-context-guard.js?v=20261120-quality-1" in common
    assert "lockAssignmentFlowButtons" in common
    assert "__assignmentContextGuardReady" in guard
    assert "ctx.assignmentId===assignmentId" in guard
    assert "!!ctx.clientId" in guard
    assert "!!ctx.organizationId" in guard
    assert "__formalSaveWrapped" in guard
    assert "#recordCommitButton" in guard
    assert "stopImmediatePropagation" in guard
    assert "記録の作成・保存を停止しています" in guard


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


def test_handoff_workflow_writes_use_atomic_rpcs():
    sql = text("supabase/migrations/20261115082458_handoff_workflow_history.sql")
    app = text("handoff/app.js")
    assert "revoke update,delete on public.handoff_entries from authenticated" in sql
    assert "revoke insert,update,delete on public.handoff_confirmations" in sql
    assert "handoff_set_confirmation" in app and "handoff_transition" in app
    assert "p_expected_revision" in app and "p_request_id" in app
    assert "password.length<12" in app


def test_handoff_requires_explicit_target_for_floating_new_entry():
    app = text("handoff/app.js")
    assert "$('entryClient').value=cid||''" in app
    assert "利用者または全体を選択" in app
    assert "crypto.randomUUID()" in app
    assert "entrySaving" in app


def test_handoff_is_local_and_retains_navigation():
    html = text("handoff/index.html")
    assert './app.js?v=' in html and './core.js?v=' in html
    assert '../common-nav.js?' in html
    assert 'raw.githubusercontent.com' not in html
    assert 'actionDialog' in html and 'countUnread' in html


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


def test_cashbook_requires_explicit_client_before_showing_or_saving_records():
    addon = text("cashbook/safety-addon.js")
    common = text("common-nav.js")
    wrapper = text("cashbook/index.html")
    assert "利用者を選択してください" in addon
    assert "selectedClientId=null" in addon
    assert "explicitClientChosen" in addon
    assert "if(!selectedClientId)" in addon
    assert "cashbook/safety-addon.js?v=20261014-3" in common
    assert "common-nav.js?v=20261019-attendance" in wrapper


def test_room_number_is_separate_from_resident_identity():
    sql = text("supabase/20261014_room_resident_separation.sql")
    manage = text("manage/index.html")
    assert "add column if not exists room_number" in sql
    assert "clients_one_active_resident_per_room" in sql
    assert "display_name = '空室'" in sql
    assert "newRoomNumber" in manage
    assert "newResidentName" in manage
    assert "internalResidentCode" in manage
    assert "room_number:room" in manage
    assert "以前その部屋にいた人を復元・名前変更して使い回さない" in manage
    assert "退去済み・旧データ" in manage


def test_room_labels_are_loaded_across_shared_pages():
    common = text("common-nav.js")
    room_ui = text("client-room-ui.js")
    handoff = text("handoff/index.html")
    assert "client-room-ui.js?v=20261014-1" in common
    assert "./app.js?v=" in handoff
    assert "room_number" in text("handoff/app.js")
    assert "room_number" in room_ui
    assert "window.clientLabel=wrapped" in room_ui
    assert "clientAdminCard" in room_ui
    assert "利用者の入退居は事業所管理" in room_ui


def test_legacy_integrated_pages_are_retired():
    for path in ("integrated/index.html", "integrated/fixed.html"):
        html = text(path)
        assert "location.replace('../')" in html
        assert "旧「統合システム」は使用を終了しました" in html
