UPDATE records
SET type = CASE type
  WHEN 'thought' THEN 'note'
  WHEN 'progress' THEN 'review'
  WHEN 'blocker' THEN 'review'
  WHEN 'reflection' THEN 'review'
  WHEN 'content_seed' THEN 'idea'
  ELSE type
END
WHERE type IN ('thought', 'progress', 'blocker', 'reflection', 'content_seed');

UPDATE records
SET type = 'note'
WHERE type IN ('diary', 'health')
  AND (domain IS NULL OR domain != 'life');

UPDATE records
SET domain = 'life'
WHERE domain IS NULL;

UPDATE records
SET tags_json = (
  SELECT COALESCE(json_group_array(value), '[]')
  FROM (
    SELECT DISTINCT value
    FROM json_each(records.tags_json)
    WHERE value IS NOT NULL AND TRIM(value) != ''
    LIMIT 3
  )
)
WHERE json_valid(tags_json);

UPDATE daily_reviews
SET mood = CASE
  WHEN mood IN ('平静', '开心', '有进展感', '疲惫', '焦虑', '烦躁', '低落', '松了一口气') THEN mood
  WHEN mood LIKE '%平静%' OR mood LIKE '%稳定%' THEN '平静'
  WHEN mood LIKE '%开心%' OR mood LIKE '%高兴%' OR mood LIKE '%愉快%' THEN '开心'
  WHEN mood LIKE '%进展%' OR mood LIKE '%充实%' OR mood LIKE '%成就%' THEN '有进展感'
  WHEN mood LIKE '%疲%' OR mood LIKE '%累%' THEN '疲惫'
  WHEN mood LIKE '%焦虑%' OR mood LIKE '%担心%' THEN '焦虑'
  WHEN mood LIKE '%烦%' OR mood LIKE '%躁%' THEN '烦躁'
  WHEN mood LIKE '%低落%' OR mood LIKE '%沮丧%' OR mood LIKE '%难过%' THEN '低落'
  WHEN mood LIKE '%松%' OR mood LIKE '%放松%' THEN '松了一口气'
  ELSE NULL
END
WHERE mood IS NOT NULL;
