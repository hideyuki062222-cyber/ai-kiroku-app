"""Parse actual SQL, distinguishing installed function bodies from migration-time DML."""
import json
import subprocess
import sys
from pathlib import Path

from pglast import parse_sql, parser
from pglast.stream import RawStream

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / 'supabase/migrations/20261120051058_safe_granular_facility_permissions.sql'


def statements(sql):
    return [item['stmt'] for item in json.loads(parser.parse_sql_json(sql))['stmts']]


def stored_queries(node):
    if isinstance(node, dict):
        if 'PLpgSQL_stmt_execsql' in node:
            yield node['PLpgSQL_stmt_execsql']['sqlstmt']['PLpgSQL_expr']['query']
        for value in node.values():
            yield from stored_queries(value)
    elif isinstance(node, list):
        for value in node:
            yield from stored_queries(value)


def test_application_only_inserts_into_new_permission_tables():
    assert not (ROOT / 'supabase/migrations/20261119144626_granular_facility_permissions.sql').exists()
    allowed = {'organization_permission_sets', 'organization_feature_permissions', 'feature_permission_history'}
    inserts = []
    for stmt in statements(FILE.read_text()):
        assert not {'DropStmt', 'TruncateStmt', 'UpdateStmt', 'DeleteStmt'} & stmt.keys()
        if 'InsertStmt' in stmt:
            inserts.append(stmt['InsertStmt']['relation']['relname'])
    assert set(inserts) == allowed and len(inserts) == 3


def test_future_deletes_and_updates_are_limited():
    deletes = updates = 0
    for raw in parse_sql(FILE.read_text()):
        fn = raw.stmt
        if type(fn).__name__ != 'CreateFunctionStmt':
            continue
        language = next((getattr(o.arg, 'sval', None) for o in fn.options if o.defname == 'language'), None)
        if language != 'plpgsql':
            continue
        for query in stored_queries(json.loads(parser.parse_plpgsql_json(RawStream()(fn)))):
            for stmt in statements(query):
                assert not {'DropStmt', 'TruncateStmt'} & stmt.keys()
                if 'DeleteStmt' in stmt:
                    item = stmt['DeleteStmt']
                    assert item.get('whereClause')
                    assert item['relation']['relname'] == 'organization_feature_permissions'
                    assert item['relation']['schemaname'] == 'public'
                    deletes += 1
                if 'UpdateStmt' in stmt:
                    assert stmt['UpdateStmt'].get('whereClause')
                    updates += 1
                if 'InsertStmt' in stmt and stmt['InsertStmt'].get('onConflictClause'):
                    conflict = stmt['InsertStmt']['onConflictClause']
                    keys = [i['IndexElem']['name'] for i in conflict['infer']['indexElems']]
                    assert 'organization_id' in keys
                    assert 'user_id' in keys or 'client_id' in keys
    assert deletes == 3 and updates == 8


def test_containment_and_resume_do_not_remove_data_or_reset_grants():
    for file in (ROOT / 'supabase/rollbacks').glob('20261120051058_*.sql'):
        for stmt in statements(file.read_text()):
            assert not {'DropStmt', 'TruncateStmt', 'UpdateStmt', 'DeleteStmt', 'InsertStmt'} & stmt.keys()


def test_backup_export_scope_ignores_unrelated_application_rows(tmp_path):
    pairs = [('public', 'clients'), ('private', 'record_profile_history'),
             ('private', 'unrelated_table'), ('public', 'recruitment_applicants'),
             ('public', 'sm_clients'), ('sm_history', 'changes')]
    metadata = {'relations': [{'schema': s, 'name': t, 'kind': 'r'} for s, t in pairs],
                'columns': [{'schema': s, 'table': t, 'name': 'id', 'type': 'uuid'} for s, t in pairs]}
    source, key, output = [tmp_path / n for n in ['metadata.json', 'public.asc', 'query.sql']]
    source.write_text(json.dumps(metadata))
    key.write_text('-----BEGIN PGP PUBLIC KEY BLOCK-----\nsynthetic\n-----END PGP PUBLIC KEY BLOCK-----')
    subprocess.run([sys.executable, str(ROOT / 'tools/scoped-backup-query.py'), str(source), str(key), str(output)], check=True, capture_output=True)
    relations = set()

    def inspect(node):
        if isinstance(node, dict):
            if 'RangeVar' in node:
                r = node['RangeVar']
                relations.add((r.get('schemaname'), r['relname']))
            for v in node.values():
                inspect(v)
        elif isinstance(node, list):
            for v in node:
                inspect(v)

    inspect(statements(output.read_text()))
    assert ('public', 'clients') in relations and ('private', 'record_profile_history') in relations
    for pair in pairs[2:]:
        assert pair not in relations
    assert ('auth', 'users') in relations
    output.unlink()
    metadata['columns'][0]['name'] = 'password'
    source.write_text(json.dumps(metadata))
    result = subprocess.run([sys.executable, str(ROOT / 'tools/scoped-backup-query.py'), str(source), str(key), str(output)], capture_output=True)
    assert result.returncode != 0 and not output.exists()
