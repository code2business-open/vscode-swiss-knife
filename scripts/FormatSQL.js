/**
	{
		"api":1,
		"name":"Format SQL",
		"description":"Cleans and format SQL queries.",
		"author":"Code2Business",
		"icon":"broom",
		"tags":"mysql,sql,prettify,clean,indent",
        "bias": -0.1
	}
**/

const { formatSql } = require('@sk/sqlFormatter')


function main(state) {
	state.text = formatSql(state.text, state.options)
}
