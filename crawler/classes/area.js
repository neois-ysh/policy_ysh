const util_class = require('../utils/class');

class Area{
	#table = 'total_data';
	constructor(json, area) {
		if(json['area'] == undefined) json['area'] = area;

		for(let [k, v] of Object.entries(json)) {
			this[util_class.toCamelCase(k)] = typeof json[k] == 'string' ? json[k].trim() : json[k];
		};
	};

	insert = (db, row) => {
		let qry = db(this.#table).insert(row);
		return qry;
	};

	select = (db) => {
		let qry = db(this.#table).where({ area: this['area'], src: this['src'], use: 'Y' }).first();
		return qry;
	};

	update = (db, updates) => {
		let qry = db(this.#table).update(updates).where({ area: this['area'], use: 'Y', id: updates['id'] });
		return qry;
	};

	column = async(db) => {
		let qry = db.select('COLUMN_NAME').from('COLUMNS').withSchema('information_schema').where({ TABLE_SCHEMA: process.env.ENV_DB_name, TABLE_NAME: this.#table });
		let rs = await qry;
		return rs.map((r) => r['COLUMN_NAME']);
	};

	save = async(db) => {
		let columns = await this.column(db);
		columns = columns.filter((column) => { return column != 'created_at'; });
		let row = util_class.getBasic(this);
		let exist_list = await this.select(db, row);
		
		if(exist_list != undefined) {
			let diffs = util_class.showDiff(exist_list, row);
			
			if(Object.keys(diffs).length > 0) {
				let updates = {};
				for(let [k, v] of Object.entries(diffs)) {
					if(k == 'reg_date' || k == 'use' || k == 'id') {
						updates[k] = v['before']
					} else {
						updates[k] = v['after'];
					}					
				};
				delete updates['url'];
				
				let temp_update = {};
				for(let column of columns) {
					for(let [k, v] of Object.entries(updates)) {
						if(column == k) temp_update[k] = v;
					};
				};
				
				await this.update(db, temp_update);
			}
		} else {
			let insert = {};

			for(let column of columns) {
				insert[column] = row[column];
			};
			
			await this.insert(db, insert);
		}		
	};
};

module.exports = Area;