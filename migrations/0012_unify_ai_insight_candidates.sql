UPDATE ai_suggestions
SET structured_result_json = json_set(
  CASE WHEN json_valid(structured_result_json) THEN structured_result_json ELSE '{}' END,
  '$.insightCandidates',
  json(COALESCE((
    SELECT json_group_array(json(item))
    FROM (
      SELECT json_object('key', 'key-point-' || key, 'text', value, 'type', 'observation', 'evidence', json_array()) AS item
      FROM json_each(CASE WHEN json_type(structured_result_json, '$.keyPoints') = 'array'
        THEN json_extract(structured_result_json, '$.keyPoints') ELSE '[]' END)
      WHERE trim(CAST(value AS TEXT)) != ''
      UNION ALL
      SELECT json_object('key', 'risk', 'text', json_extract(structured_result_json, '$.risk'), 'type', 'risk', 'evidence', json_array())
      WHERE trim(COALESCE(json_extract(structured_result_json, '$.risk'), '')) != ''
      UNION ALL
      SELECT json_object('key', 'blocker', 'text', json_extract(structured_result_json, '$.blocker'), 'type', 'risk', 'evidence', json_array())
      WHERE trim(COALESCE(json_extract(structured_result_json, '$.blocker'), '')) != ''
      UNION ALL
      SELECT json_object('key', 'idea-summary', 'text', json_extract(structured_result_json, '$.ideaSummary'), 'type', 'observation', 'evidence', json_array())
      WHERE trim(COALESCE(json_extract(structured_result_json, '$.ideaSummary'), '')) != ''
    )
  ), '[]'))
)
WHERE json_type(structured_result_json, '$.insightCandidates') IS NULL;
