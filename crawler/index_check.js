const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const api = require('./utils/api');

api.getResult().then(result => {
	let msg = '_SYSTEM_OK_';

	if(result) {
		for(let rs of result) {
			if(rs.result != 'SUCCESS') msg = '_SYSTEM_NG_';
			break;
		};
	} else { msg = '_SYSTEM_NG_'; }

	console.log(msg, JSON.stringify(result));
})
.finally(f => {
	process.exit(0);
});
