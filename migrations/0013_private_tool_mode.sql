UPDATE records
SET visibility = 'private', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE visibility <> 'private';
