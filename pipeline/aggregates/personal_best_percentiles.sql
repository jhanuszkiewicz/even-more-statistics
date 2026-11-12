-- Percentiles (1..99) of personal bests per event, for single and average.
-- Values are in the event's own unit (centiseconds, moves, or packed multi-blind).
WITH q AS (
  SELECT 'single' AS kind, event_id,
         quantile_disc(best, [x / 100 FOR x IN range(1, 100)]) AS v
  FROM ranks_single WHERE event_id <> '333mbo' GROUP BY event_id
  UNION ALL
  SELECT 'average', event_id,
         quantile_disc(best, [x / 100 FOR x IN range(1, 100)])
  FROM ranks_average GROUP BY event_id
)
SELECT kind, event_id, unnest(range(1, 100)) AS pct, unnest(v) AS value
FROM q
ORDER BY kind, event_id, pct
