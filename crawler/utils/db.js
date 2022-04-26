const knex = require('knex');
const moment = require('moment-timezone');

const option = {
	client: 'mysql',
	connection: {
		database: process['env']['ENV_DB_name'],
		host: process['env']['ENV_DB_host'],
		port: process['env']['ENV_DB_port'],
		user: process['env']['ENV_DB_user'],
		password: process['env']['ENV_DB_password'],
		pool: {
			min: 0,
			max: 10,
		},
		typeCast: (field, next) => {
			if(field == 'BIT' && field.length == 1) return field.string() == '\x10' ? true : false;
			return next();
		},
	},
};

const db = knex(option);

if(process['env']['sql_debug'] != undefined && (process['env']['sql_debug'] == true || process['env']['sql_debug'] == false)) {
	db.on('query', (querydata) => {
		if(querydata['sql'] == 'BIGIN') return;

		let qry = querydata.sql;
		querydata.bindings.forEach((binding) => {
			qry = qry.replace('?', typeof binding == 'number' ? binding : binding instanceof Date ? `'${moment(binding).format('YYYY-MM-DD hh:mm:ss')}` : `'${binding}`);
		});

		console.log(`[${moment().locale('ko').format('YYYY-MM-DD A hh:mm:ss')}]`, qry);
	});
};

module.exports = db;