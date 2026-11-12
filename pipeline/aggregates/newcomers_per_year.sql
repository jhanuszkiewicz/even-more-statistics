-- Competitors by the year of their first competition.
SELECT first_year AS year, count(*) AS newcomers
FROM (
  SELECT r.person_id, min(year(c.start_date)) AS first_year
  FROM results r JOIN comp c ON c.id = r.competition_id
  GROUP BY r.person_id
)
GROUP BY first_year
ORDER BY year
