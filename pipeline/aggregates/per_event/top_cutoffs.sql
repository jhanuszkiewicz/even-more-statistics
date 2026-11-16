-- Result of the 10th and 100th place in the rankings at the end of each year, per event,
-- kind (single/average) and region: world ('world'), continent (continent id), country (country id).
-- A result counts for the country the person represented when it was set (results.person_country_id),
-- as in the official WCA rankings. A series starts in the first year the region has N ranked people;
-- years run up to the last year the event was held.
-- One row per series: event_id, region, kind, n, years (list), "values" (list of raw results).
WITH res AS (
  SELECT r.event_id, r.person_id, r.person_country_id AS country_id, year(c.start_date) AS year,
         r.best, r.average
  FROM results r
  JOIN comp c ON c.id = r.competition_id
),
per_kind AS (
  SELECT event_id, person_id, country_id, year, 'single' AS kind, best AS value FROM res WHERE best > 0
  UNION ALL
  SELECT event_id, person_id, country_id, year, 'average', average FROM res WHERE average > 0
),
-- Best result of a person per country, kind and year.
yearly AS (
  SELECT event_id, kind, person_id, country_id, year, min(value) AS value
  FROM per_kind
  GROUP BY ALL
),
last_year AS (
  SELECT event_id, max(year) AS last FROM res GROUP BY event_id
),
-- Personal best at the end of every year from the first result to the event's last year.
pb AS (
  SELECT y.event_id, y.kind, y.person_id, y.country_id, y.year,
         min(y.value) OVER (PARTITION BY y.event_id, y.kind, y.person_id, y.country_id ORDER BY y.year) AS pb,
         coalesce(lead(y.year) OVER (PARTITION BY y.event_id, y.kind, y.person_id, y.country_id ORDER BY y.year),
                  l.last + 1) AS next_year
  FROM yearly y
  JOIN last_year l USING (event_id)
),
pb_years AS (
  SELECT event_id, kind, person_id, country_id, unnest(range(year, next_year)) AS year, pb
  FROM pb
),
p AS (
  SELECT b.*, co.continent_id FROM pb_years b JOIN countries co ON co.id = b.country_id
),
by_region AS (
  SELECT event_id, kind, year, 'world' AS region, person_id, min(pb) AS pb FROM p GROUP BY ALL
  UNION ALL
  SELECT event_id, kind, year, continent_id, person_id, min(pb) FROM p GROUP BY ALL
  UNION ALL
  SELECT event_id, kind, year, country_id, person_id, pb FROM p
),
ranked AS (
  SELECT event_id, kind, year, region, pb,
         row_number() OVER (PARTITION BY event_id, kind, year, region ORDER BY pb) AS place
  FROM by_region
  QUALIFY place IN (10, 100)
)
SELECT event_id, region, kind, place AS n,
       list(year ORDER BY year) AS years, list(pb ORDER BY year) AS "values"
FROM ranked
GROUP BY ALL
ORDER BY event_id, region, kind, n
