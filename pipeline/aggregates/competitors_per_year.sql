-- Distinct competitors per year and event, plus the "all events" total (event_id = '*').
WITH r AS (
  SELECT year(c.start_date) AS year, r.event_id, r.person_id
  FROM results r JOIN comp c ON c.id = r.competition_id
)
SELECT year, event_id, count(DISTINCT person_id) AS competitors FROM r GROUP BY ALL
UNION ALL
SELECT year, '*' AS event_id, count(DISTINCT person_id) FROM r GROUP BY year
ORDER BY year, event_id
