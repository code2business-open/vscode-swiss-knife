INSERT INTO
	`plan_career_monthly_lines`
WITH
	`customer_points` AS (
		SELECT
			`customer`, SUM(IF(`typeCareer` = "c", `valueCareer`, - `valueCareer`)) `points`
		FROM
			`winnings_network`
		WHERE
			`typeCareer` != "x" AND `date` > "2026-11-01"
		GROUP BY
			`customer`
		HAVING
			`points` >= 1
	), `points_own` AS (
		SELECT
			`w`.`customer`, SUM(IF(`typeCareer` = "c", `valueCareer`, - `valueCareer`)) `points`
		FROM
			`winnings_network` `w`
		WHERE
			`w`.`typeCareer` != "x" AND `w`.`side` = "x" AND `w`.`date` > "2026-11-01"
		GROUP BY
			`w`.`customer`
		HAVING
			`points` >= 1
	), `points_lines` AS (
		SELECT
			`n`.`customer`, `n`.`direct`, SUM(IF(`typeCareer` = "c", `valueCareer`, - `valueCareer`)) `points`
		FROM
			`winnings_network` `w`
		LEFT JOIN `network` `n` ON `n`.`customer` = `w`.`customer`
		WHERE
			`w`.`typeCareer` != "x" AND `w`.`date` > "2026-11-01"
		GROUP BY
			`n`.`customer`
		HAVING
			`points` >= 1
	)
SELECT
	`w`.*, JSON_ARRAY_APPEND(IF(`d`.`direct` IS NULL, '[]', JSON_ARRAYAGG(COALESCE(`d`.`points`, 0))), '$', COALESCE(`o`.`points`, 0)) `lines`, JSON_ARRAY_APPEND(IF(`d`.`direct` IS NULL, '[]', JSON_ARRAYAGG(JSON_OBJECT("downline", `d`.`customer`, "points", `d`.`points`))), '$', JSON_OBJECT("downline", `w`.`customer`, "points", COALESCE(`o`.`points`, 0))) `linesFull`
FROM
	`customer_points` `w`
LEFT JOIN `points_lines` `d` ON `d`.`direct` = `w`.`customer`
LEFT JOIN `points_own` `o` ON `o`.`customer` = `w`.`customer`
GROUP BY
	`w`.`customer`
;
