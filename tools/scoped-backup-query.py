"""Build a read-only public-key encrypted app backup SELECT. Never executes SQL.

Input metadata/public key and output query must be in the protected backup directory.
Auth rows are not dumped: only UUIDs referenced by application UUID columns are kept.
"""
import json
import pathlib
import sys

metadata_path, public_key_path, output_path = map(pathlib.Path, sys.argv[1:])
metadata = json.loads(metadata_path.read_text())
public_key = public_key_path.read_text().strip()
if not public_key.startswith('-----BEGIN PGP PUBLIC KEY BLOCK-----'):
    raise ValueError('An encryption public key is required; never pass a secret key')
if any(any(word in c['name'].lower() for word in ['password', 'token', 'secret']) for c in metadata['columns']):
    raise ValueError('Credential-like application columns require an explicit exclusion review')
nexia_public = {
    'organizations','organization_members','organization_staff','organization_facility_editors',
    'organization_permission_sets','organization_feature_permissions','facility_operation_history',
    'clients','client_service_slots','staff_assignments','care_records','care_record_amendments',
    'client_record_profiles','generation_counters','handoff_entries','handoff_confirmations',
    'handoff_activity','handoff_quick_inputs','attendance_months','meal_profiles','meal_prices',
    'meal_entries','meal_extra_prices','meal_entry_extras','meal_bill_versions',
    'cashbook_accounts','cashbook_entries','cashbook_choices'
}
tables = [t for t in metadata['relations'] if t['kind'] in ['r', 'p'] and (
    t['schema']=='private' and t['name'] in {'facility_edit_history','facility_permission_history','feature_permission_history','meal_extra_history','record_profile_history'} or
    t['schema']=='meal_history' and t['name']=='changes' or
    t['schema']=='attendance_backup' and t['name'] in {'members_before_integration','month_revisions','policies_before_integration','service_slots_before_presets_20261020','staff_before_integration'} or
    t['schema']=='public' and t['name'] in nexia_public
)]
quote = lambda s: "'" + s.replace("'", "''") + "'"
ident = lambda s: '"' + s.replace('"', '""') + '"'
rows = '\nunion all\n'.join(
    f"select {quote(t['schema']+'.'+t['name'])} name,coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) rows from {ident(t['schema'])}.{ident(t['name'])} t"
    for t in tables
)
uuid_columns = [c for c in metadata['columns'] if c['type'] == 'uuid' and any(t['schema']==c['schema'] and t['name']==c['table'] for t in tables)]
references = ' union '.join(f"select {ident(c['name'])} id from {ident(c['schema'])}.{ident(c['table'])} where {ident(c['name'])} is not null" for c in uuid_columns)
query = f"""-- SELECT only; data is encrypted on the DB server before leaving it.
with data_tables as materialized({rows}),payload as materialized(
 select jsonb_build_object('format','nexia-encrypted-logical-backup-v1','scope','NEXIA only; excludes recruitment/shared-meals/Auth credentials/Storage','project','pagamoaxhqszojxrpxyu','captured_at',clock_timestamp(),'snapshot',pg_current_snapshot()::text,
 'schema_catalog',{quote(json.dumps(metadata,ensure_ascii=False,separators=(',',':')))}::jsonb,
 'tables',(select jsonb_object_agg(name,rows) from data_tables),
 'auth_reference_ids',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from auth.users where id in({references})),
 'migration_history',(select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name) order by version),'[]'::jsonb) from supabase_migrations.schema_migrations)) data)
select encode(extensions.pgp_pub_encrypt(data::text,extensions.dearmor({quote(public_key)}),'cipher-algo=aes256,compress-algo=1,compress-level=6'),'base64') encrypted_backup,
 (select jsonb_object_agg(name,jsonb_array_length(rows)) from data_tables) table_counts,octet_length(data::text) plaintext_bytes from payload;
"""
output_path.write_text(query)
output_path.chmod(0o600)
print('Read-only encrypted backup query prepared; no database connection was made.')
