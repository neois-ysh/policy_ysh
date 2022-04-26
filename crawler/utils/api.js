const request = require('request-promise-native');
const axios = require('axios');
const moment = require('moment-timezone');
const fs = require('fs');
const db = require('./db');

exports.getUrlData = async(area) => {
	let res = db('url_data');
	if(area != undefined) {
		res = res.where({ area: area });
	};
	return await res;
};

exports.getHeaders = async(url, headers) => {
	let ret = null;
	try {
		let res = await axios.get(url);
		ret = res['headers'];
	} catch (err) {
		console.log('getHeaders_err', url, err);
	};
	return ret;
};

exports.getExistData = async(area, info) => {
	let res = await db('total_data').where({ area: area, src: info['src'], use: 'Y' });
	return res;
};

exports.updateDataUse = async(infos, area) => {
	let today = moment().tz('Asia/seoul').format('YYYYMMDD');
	let db_area = (area == undefined ? infos[0]['area'] : area);
	
	try {
		await db('total_data').update({ use: 'N', end_date: today }).where({ area: db_area }).whereNull('end_date').whereNotIn('src', infos.map(r => r['src']));
		await db('total_data').update({ use: 'N' }).where('use', 'Y').where('end_date', '<', today);
	} catch (err) {
		console.log('update_err', err);
	}
};

exports.updateResult = async(area, db_count, count) => {
	let qry = db('url_data');
	db_count == count ? qry = qry.update({ result: 'Success' }).where({ area: area }) : qry = qry.update({ result: 'Error' }).where({ area: area });
	await qry;
};

exports.remakeAddress = async(url, infos) => {
	for(let info of infos[`${url['area']}`]) {
		let temp_url = info['url'];
		info['href'] = await divString(info['href'], temp_url);
		info['src'] = await divString(info['src'], temp_url);
	};
	
	return infos;
};

async function divString(addr, url) {
	let ret_addr = addr;
	let url_clean = url;
	
	if(ret_addr != '') {
		if(ret_addr.startsWith('http')) {
			ret_addr = addr;
		} else {
			let reg = /(https|http):\/\/[^/]*/i;
			let arr_ret = url_clean.match(reg);
			if (arr_ret && Array.isArray(arr_ret)) {
				url_clean = arr_ret[0];
			}
			ret_addr = url_clean + addr;
		}
	}
	return ret_addr;
};

exports.urlSearch = async(url) => {
	let param = new URLSearchParams(new URL(url).search);
	let res = Array.from(param.values()).join('_');

	return res;
};

exports.downloadImage = async(url, path, headers) => {
	let rs;
	try {
		let res = await request({ url: url, headers: headers, encoding: null });
		fs.writeFileSync(path, res, 'binary');
	} catch (err) {
		console.log('downloadImage : download_err', err);
		rs = err['statusCode'];
	};
	return rs;
};

exports.checkExtension = async(file_name) => {
	let extensions = ['png', 'PNG', 'jpg', 'JPG', 'jpeg', 'JPEG'];
	let rs = false;
	let name = file_name;

	for(let extension of extensions) {
		if(name.endsWith(extension) == true) {
			rs = true;
			break;
		}
	};

	if(rs == false) name = name + '.jpg';

	return name;
};

exports.getAssortQS = async() => {
	let rs = await db('assort_section');
	return rs;
};

exports.timeout = async(ms) => {
	return new Promise(resolve => setTimeout(resolve, ms));
};