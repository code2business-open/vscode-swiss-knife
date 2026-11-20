UPDATE
	`network` `n`
LEFT JOIN (
	SELECT
		`customer`,
		SUM(IF(`side` = 'l', `valueCareer`, 0)) `sumLeft`,
		SUM(IF(`side` = 'r', `valueCareer`, 0)) `sumRight`,
		SUM(IF(`side` = 'x', `valueCareer`, 0)) `sumOwn`
	FROM
		`winnings_network`
	WHERE
		`typeCareer` = 'c'
	GROUP BY
		`customer`
) `wc` ON `wc`.`customer` = `n`.`customer`
LEFT JOIN (
	SELECT
		`customer`,
		SUM(IF(`side` = 'l', `valueCareer`, 0)) `sumLeft`,
		SUM(IF(`side` = 'r', `valueCareer`, 0)) `sumRight`,
		SUM(IF(`side` = 'x', `valueCareer`, 0)) `sumOwn`
	FROM
		`winnings_network`
	WHERE
		`typeCareer` = 'd'
	GROUP BY
		`customer`
) `wd` ON `wd`.`customer` = `n`.`customer`
SET
	`n`.`pointsCrLeft` = (`wc`.`sumLeft` - IFNULL(`wd`.`sumLeft`, 0)),
	`n`.`pointsCrRight` = (`wc`.`sumRight` - IFNULL(`wd`.`sumRight`, 0)),
	`n`.`pointsOwn` = (`wc`.`sumOwn` - IFNULL(`wd`.`sumOwn`, 0))
WHERE
	`wc`.`customer` IS NOT NULL
;
