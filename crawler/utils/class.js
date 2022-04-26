exports.getBasic = (obj) => {
	let temp = {};
	for(let [k, v] of Object.entries(obj)) {
		if(typeof v != 'object' && typeof v != 'function') temp[k] = v;
	};
	return temp;
};

exports.toCamelCase = (string) => {
	return string.replace(/\.?([A-Z])/g, function(x, y) {
		return '_' + y, toLowerCase();
	}).replace(/^_/, '');
};

exports.showDiff = (obj1, obj2) => {
	let rs = {};
	let total_keys = [...new Set(Object.keys(obj1).concat(Object.keys(obj2)))];
	
	for(let key of total_keys) {
		let val1 = obj1[key] != undefined ? obj1[key] : null;
		let val2 = obj2[key] != undefined ? obj2[key] : null;
		if(val1 != val2) rs[key] = { before: val1, after: val2 };
	};

	return rs;
};