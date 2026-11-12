-- Held (not cancelled) competitions per year and continent.
SELECT year(c.start_date) AS year, co.continent_id, count(*) AS competitions
FROM comp c
JOIN countries co ON co.id = c.country_id
WHERE NOT c.cancelled AND c.start_date <= current_date
GROUP BY ALL
ORDER BY year, continent_id
