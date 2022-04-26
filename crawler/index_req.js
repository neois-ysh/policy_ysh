process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const puppeteer = require('puppeteer');
const fs = require('fs');
const db = require('./utils/db');
const moment = require('moment-timezone');
const cheerio = require('cheerio');
const request = require('request-promise-native');

const api = require('./utils/api');
const Area = require('./classes/area');

console.log(`/////////////////////////////////////`);
console.log(`// SYSTEM START (${new Date()})`);
console.log(`// 2021-12-13 시스템 런칭 YSH`);
console.log(`/////////////////////////////////////`);

let timings = ['090000', '130000', '180000'];

(async () => {
	try {
		console.log('request start');
		await timeCheck();
	} catch (err) {
		console.log(err);
	};
})();

async function timeCheck() {
	let hhmmss = moment().tz('Asia/Seoul').format('HHmmss');

	if(timings.indexOf(hhmmss) != -1) await work();

	setTimeout(async() => {
		await timeCheck();
	}, 1000*1);
};

async function work() {
	let area = undefined;

	console.log('전체 URL 정보 호출 중...');
	let urls = await api.getUrlData(db, area);
	
	for (let url of urls) {
		workOneSite(url);
	};
};

async function workOneSite(url) {
	let area = url['area'];
	let headers = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.164 Safari/537.36' };
	
	console.log(`${area} 배너 정보 수집 중...`);
	let infos = await saveBannerInfo(url, headers);
	
	console.log(`${area} 주소 가공 중...`);
	infos = await api.remakeAddress(url, infos);
	
	console.log(`${area} puppeteer 실행 중...`);
	await screenshotBoard(url, infos, headers);
	
	console.log(`${area} DB 저장 중...`);
	for (let info of infos[area]) {
		let save_info = new Area(info, area);
		await save_info.save(db);
	};

	console.log(`${area} 정책리스트 업데이트 중...`);
	await api.updateDataUse(db, infos[area]);
	console.log(`${area} DB 저장 끝`);
};

// 각 배너 정보 저장
async function saveBannerInfo(url, headers) {
	let list = {};
	let db_encoding = url['encoding'] == undefined? null : url['encoding'];
	let temp_list = [];
		try {
			await request({ url: url['url'], headers: headers, rejectUnauthorized: false, encoding: db_encoding }, (err, res, body) => {
				const $ = cheerio.load(body);
				$(url['info_qs']).each((i, elem) => {
					let temp = {
						url: url['url'],
						href: $(elem).find('a').attr('href'),
						src: $(elem).find('img').attr('src'),
						alt: $(elem).find('img').attr('alt'),
					};
					if(temp['href'] == undefined) temp['href'] = '';
					temp_list.push(temp);
				});
			});
		} catch (err) {
			console.log('cheerio_err');
		}

		list[`${url['area']}`] = temp_list;

	return list;
};

// 이미지 저장
async function screenshotBoard(url, infos, headers) {
	const browser = await puppeteer.launch({
		headless: true,
	});
	
	const page = await browser.newPage();
	try {
		await page.goto(`${url['url']}`);
	} catch (err) {
		console.log('goto_err', err);
		await page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });
	};

	await page.setViewport({
		width: 1920,
		height: 1080,
		deviceScaleFactor: 1,
	});

	let today = moment().tz('Asia/seoul').format('YYYYMMDD');

	for (let info of infos[`${url['area']}`]) {
		info['reg_date'] 	= today;
		info['bn_path'] 	= '';
		info['bd_path'] 	= '';
		
		let down_dir = path.join(__dirname, 'download', today, `${url['area']}`);
		if (!fs.existsSync(down_dir)) fs.mkdirSync(down_dir, { recursive: true });

		let idx = info['src'].lastIndexOf('/');
		
		// 배너 썸네일 content-type 확인
		let g_headers = await api.getHeaders(info['src'], headers);
		let bool = -1;
		
		if (g_headers != null) {
			let content_type = g_headers['content-type'];
			bool = content_type.indexOf('application/octet-stream');
		};

		let file_name;

		if (bool == -1) {
			file_name = path.join(down_dir, `${info['src'].substring(idx + 1)}`);
			if(file_name.indexOf('?') != -1) {
				let temp_name = await api.urlSearch(info['src']);
				file_name = path.join(down_dir, temp_name);
			}
		} else {
			let idx = g_headers['content-disposition'].indexOf('=');
			file_name = path.join(down_dir, `${g_headers['content-disposition'].substring(idx + 1)}`);
		};
		
		let temp_name = await api.checkExtension(file_name);
		file_name = temp_name;
		
		info['bn_path'] = file_name;

		// 배너 썸네일 다운로드
		if (!fs.existsSync(file_name)) {
			let status_code = await api.downloadImage(info['src'], file_name, headers);
			if(status_code != undefined && (status_code == 400 || status_code == 404 || status_code == 500)) {
				info['bn_path'] = '';
			}
		};
		
		// 본문 스크린샷
		file_name = file_name.substring(0, file_name.length - 4) + '_bd.jpg';
		info['bd_path'] = file_name;
		
		if (!fs.existsSync(file_name)) {
			try {
				if(info['href'] != '') {
					await page.goto(info['href'], { waitUntil: 'networkidle2' });

					let new_url = info['href'];
					
					if(new_url.indexOf('blog.naver.com') != -1) {
						const frame = await page.frames().find(frame => frame.name() === 'mainFrame');
						new_url = frame['_url'];

						await page.goto(new_url, { waitUntil: 'networkidle0' });

						await page.setViewport({
							width: 1024,
							height: 1366,
							deviceScaleFactor: 1,
							isMobile: true,
							isLandscape: false,
						});

						await page.evaluate(() => {
							document.querySelector('#floating_area_header').remove();
							document.querySelector('#floating_bottom').remove();
							window.scrollTo(0, document.body.scrollHeight);
						});
						await api.timeout(5000);
					} else {
						await page.goto(new_url, { waitUntil: 'networkidle0' });

						await page.setViewport({
							width: 1024,
							height: 1366,
							deviceScaleFactor: 1,
							isMobile: true,
							isLandscape: false,
						});
						await api.timeout(2000);
					}

					await page.screenshot({
						path: file_name,
						fullPage: true,
					});
				} else {
					info['bd_path'] = '';	
				}
			} catch (err) {
				console.log(err);
				info['bd_path'] = '';
			};
		}
	};
	console.log(`${url['area']} 끝`);

	await browser.close();
};
