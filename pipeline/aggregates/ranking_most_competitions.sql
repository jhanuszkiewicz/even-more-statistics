-- Top 20 competitors by number of competitions with at least one result, per region:
-- world ('world'), continent (continent id) and country (country id) of the person's current country.
-- Ties share a rank (1, 2, 2, 4), so a region can list more than 20 people.
-- Columns follow the shared ranking shape: region, rank, person_id, name, country_id, value.
WITH counts AS (
  SELECT r.person_id, count(DISTINCT r.competition_id) AS competitions
  FROM results r
  GROUP BY r.person_id
),
p AS (
  SELECT c.person_id, pe.name, pe.country_id, co.continent_id, c.competitions
  FROM counts c
  JOIN persons pe ON pe.wca_id = c.person_id AND pe.sub_id = 1
  JOIN countries co ON co.id = pe.country_id
),
by_region AS (
  SELECT 'world' AS region, * FROM p
  UNION ALL SELECT continent_id, * FROM p
  UNION ALL SELECT country_id, * FROM p
)
SELECT region, rank() OVER (PARTITION BY region ORDER BY competitions DESC) AS rank,
       person_id, name, country_id, competitions AS value
FROM by_region
QUALIFY rank <= 20
ORDER BY region, rank, name
