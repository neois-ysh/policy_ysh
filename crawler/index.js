process.setMaxListeners(15);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const puppeteer = require('puppeteer');
const fs = require('fs');
const db = require('./utils/db');
const moment = require('moment-timezone');

const api = require('./utils/api');
const Area = require('./classes/area');

let today = moment().tz('Asia/seoul').format('YYYYMMDD');
let headers = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.164 Safari/537.36' };

const INTV_WORK_MS 	= 1000;
const TIMINGS 			= ['090000', '130000', '180000'];

console.log(`/////////////////////////////////////`);
console.log(`// SYSTEM START (${new Date()})`);
console.log(`// 2021-12-13 시스템 런칭 YSH`);
console.log(`// 2021-12-14 Linux 환경에서 puppeteer의 구동이 가능하도록 추가 설치(게시판 참고)`);
console.log(`// 2022-03-24 지역 추가 및 정책 본문 스크린샷 영역 수정`);
console.log(`// 2022-03-29 배너 pc/mobile ver 분리 저장`);
console.log(`// 2022-04-11 4/9 구리시청 홈페이지 리뉴얼에 따른 selector 수정`);
console.log(`// 2022-04-13 DB > total_data에 created_at 컬럼 추가로 인한 NULL 에러 수정(area.js > columns)`);
console.log(`// 2022-06-17 논산시청 추가 및 팝업창 제거 기능 추가`);
console.log(`// 2022-07-28 url_data.result 계산식 변경, NIMS에 사용할 index_check.js 생성`);
console.log(`// 2023-01-09 utils api.js의 getAssortQS() area 변수 추가 && 부천, 수원, 춘천 querySelector 수정`);
console.log(`/////////////////////////////////////`);

let bProcessing = false;

(async () => {
	try {
		console.log('timeCheck start');
		setInterval(async() => {
			if(!bProcessing) await timeCheck();
		}, INTV_WORK_MS *1);
		// await work();
	} catch (err) {
		console.log(err);
	};
})();

async function timeCheck() {
	// console.log('timeCheck 실행');
	bProcessing = true;
	try {		
		let hhmmss = moment().tz('Asia/Seoul').format('HHmmss');
		today = moment().tz('Asia/seoul').format('YYYYMMDD');

		if(TIMINGS.indexOf(hhmmss) != -1) await work();
	} catch(e) {					
		console.log('ERROR : timeCheck', e);
	}
	bProcessing = false;
};

async function work() {
	let area = undefined;
	// let area = 'suwon';
	
	console.log('전체 URL 정보 호출 중...');
	let urls = await api.getUrlData(area);
	
	for (let url of urls) {
		try {
			await workPuppeteer(url, headers);
		} catch(e) {
			console.log('ERROR : work',url, e);
			continue;
		}		
	};

	console.log('정책 수집 종료');
};

async function workPuppeteer(url, headers) {
	let infos = {};

	console.log('puppeteer 실행 중...');
	
	const browser = await puppeteer.launch({
		headless: true,
		devtools: false,
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	});

	const page = await browser.newPage();

	// alert창
	page.on('dialog', async (dialog) => {
		await dialog.accept();
	}); 
	
	console.log(`${url['area']}로 이동 중...`);

	try {
		await page.setExtraHTTPHeaders(headers);
		await page.goto(`${url['url']}`);
		if(page.url() != url['url']) await page.goto(`${url['url']}`);
	} catch (err) {
		console.log(`${url['area']} goto_err`, err);

		// 5번 재시도 추가!!
		let n_retry = 5;
		while(n_retry > 0) {			
			try {
				await page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });
				break;
			} catch(e) {
				console.log(`ERROR : ${url['area']} page.reload`, e);
				n_retry--;
			}			
		}
	};
	
	let query_data = {
		all : url['scr_qs_all'],
		sub : url['scr_qs_aub'],
	};
	
	console.log('정보 수집 중...');

	let pc_infos = undefined;
	let mob_infos = undefined;
	
	try {
		pc_infos = await getPuppetInfo(page, query_data, 'pc');
		mob_infos = await getPuppetInfo(page, query_data, 'mob');
	} catch (err) {
		console.log('ERROR: getPuppetInfo ', err);

		// 재시도
		let n_retry = 5;
		while(n_retry > 0) {			
			try {
				pc_infos = await getPuppetInfo(page, query_data, 'pc');
				mob_infos = await getPuppetInfo(page, query_data, 'mob');
				break;
			} catch(err) {
				console.log(`ERROR: getPuppetInfo reload `, err);
				n_retry--;
			}
		};
	}
	if(pc_infos.length > 0 && mob_infos.length > 0) {
		infos[`${url['area']}`] = pc_infos;
		infos[`${url['area']}`].forEach((info, i) => {
			info['src_mob'] = mob_infos[i]['src'];
		});
		
		for (let info of infos[`${url['area']}`]) {
			// console.log('>>', info)
			info['reg_date'] = today;
			info['bn_path_pc'] = '';
			info['bn_path_mob'] = '';
			info['bd_path'] = '';
			
			// 배너 이미지 저장
			let file_name;

			file_name = await setBannerPath(url, info['src']);
			info['bn_path_pc'] = file_name;
			file_name = await setBannerPath(url, info['src_mob']);
			info['bn_path_mob'] = file_name;
			
			// 본문 스크린샷
			file_name = file_name.substring(0, file_name.length - 4) + '_bd.jpg';
			info['bd_path'] = file_name;
			
			let assorts = await api.getAssortQS(url['area']);
			console.log(222, assorts);
			
			if (!fs.existsSync(file_name)) {
				if (info['href'] != '') {
					let new_url = info['href'];
					
					try {
						await page.goto(new_url, { waitUntil: 'networkidle0' });

						for(let a of assorts) {
							if(new_url.indexOf(a['area']) > -1 && new_url.indexOf(a['type']) > -1) {
								hides = a['hide_qs'].split('|') || [];
								backs = a['delete_qs'].split('|') || [];
								spaces = a['space_qs'].split('|') || [];
								
								if(a['area'] == 'naver' && a['type'] == 'blog') {
									const frame = await page.frames().find((frame) => frame.name() === 'mainFrame');
									if(frame['_url'] != undefined) {
										new_url = frame['_url'];
									}
								}

								await page.goto(new_url, { waitUntil: 'networkidle0' });

								await api.timeout(5000);

								await page.setViewport({
									width: 414,
									height: 896,
									deviceScaleFactor: 2,
									isMobile: true,
									isLandscape: false,
								});
		
								await api.timeout(2000);
		
								await page.evaluate((hides, backs, spaces) => {
									let style = document.createElement('style');
									document.head.appendChild(style);
									if(hides.length > 0) {
										hides.forEach((hide) => {
											style.innerHTML += `${hide} { display:none; }`;
										});
									}
									if(backs.length > 0) {
										backs.forEach((back) => {
											style.innerHTML += `${back} { background: none !important; }`;
										});
									}
									if(spaces.length > 0) {
										spaces.forEach((space) => {
											style.innerHTML += `${space} { padding: 0 !important; margin: 0 !important; }`;
										});
									}
									window.scrollTo(0, document.body.scrollHeight);
								}, hides, backs, spaces);

							} else {
								await page.setViewport({
									width: 414,
									height: 896,
									deviceScaleFactor: 2,
									isMobile: true,
									isLandscape: false,
								});
								await api.timeout(2000);
							}
						};

						await page.screenshot({
							path: file_name,
							fullPage: true,
						});

					} catch (err) {
						console.log('본문 스크린샷 new_url ', err);
						await browser.close();
					}
				} else {
					info['bd_path'] = '';
				}
			}
		};
		
		await browser.close();
		
		console.log(`${url['area']} 끝`);
		
		console.log(`${url['area']} DB 저장 중...`);

		try {
			for (let info of infos[`${url['area']}`]) {
				let save_info = new Area(info, url['area']);
				await save_info.save(db);
			};
		} catch (err) {
			console.log('ERROR: save_info ', err);
		}

		console.log(`${url['area']} 정책리스트 업데이트 중...`);
		let db_count = await api.updateDataUse(infos[`${url['area']}`], `${url['area']}`);
		
		console.log(`${url['area']} 정책 개수 비교 중...`);
		let result = 'SUCCESS';
		if(db_count != pc_infos.length) result = 'ERROR';
		await api.updateResult(url['area'], result);

		console.log(`${url['area']} DB 저장 끝`);

	} else {
		console.log('ERROR : getPuppetInfo에서 받아온 데이터가 없습니다.');
	}
};

// href, img src 등 각 정책 정보 수집
async function getPuppetInfo(page, query_data, version) {
	let rs = [];
	if(version == 'pc') {
		await page.setViewport({
			width: 1920,
			height: 1080,
			deviceScaleFactor: 1,
		});
	} else if(version == 'mob') {
		await page.setViewport({
			width: 414,
			height: 896,
			deviceScaleFactor: 2,
			isMobile: true,
			isLandscape: false,
		});
		if(query_data['sub'] != null && query_data['sub'].indexOf('span.visual_image') > -1) query_data['sub'] = 'span.visual_mobile';
	}
	
	try {
		rs = await page.evaluate((query_data) => {
			let temp_data = [];
			let slides = Array.from(document.querySelectorAll(query_data['all']));

			slides.forEach((slide, i) => {
				let temp;
				if (query_data['sub'] == '' || query_data['sub'] == null) {
					temp = {
						index: i,
						href: slide.querySelector('a') != null ? slide.querySelector('a').href : '',
						src: slide.querySelector('img') != null ? slide.querySelector('img').src : `https://www.suwon.go.kr${slide.querySelector('a').style.backgroundImage.split('"')[1]}`,
						alt: slide.querySelector('img') != null ? slide.querySelector('img').alt : slide.querySelector('a').innerText,
					};
				} else {
					temp = {
						index: i,
						href: slide.querySelector('a') != null ? slide.querySelector('a').href : '',
						src: slide.querySelector(query_data['sub']).querySelector('img').src,
						alt: slide.querySelector(query_data['sub']).querySelector('img').alt,
					};
				}

				temp_data.push(temp);
			});

			return temp_data;
		}, query_data);
	} catch (err) {
		console.log('info_err', err);
	}
	
	return rs;
}

// 자동 다운로드 이미지와 일반 이미지를 분리하여 배너 이미지 파일명 설정
async function setBannerPath(url, src) {
	let down_dir = path.join(__dirname, 'download', today, `${url['area']}`);
	if (!fs.existsSync(down_dir)) fs.mkdirSync(down_dir, { recursive: true });

	let idx = src.lastIndexOf('/');

	let g_headers = await api.getHeaders(src, headers);
	let bool = -1;

	if (g_headers != null) {
		let content_type = g_headers['content-type'];
		bool = content_type.indexOf('application/octet-stream');	//자동 다운로드
	}

	let file_name;

	if (bool == -1) {
		file_name = path.join(down_dir, `${src.substring(idx + 1)}`);
		if (file_name.indexOf('?') != -1) {
			let temp_name = await api.urlSearch(src);
			file_name = path.join(down_dir, temp_name);
		}
	} else {
		let idx = g_headers['content-disposition'].indexOf('=');
		file_name = path.join(down_dir, `${g_headers['content-disposition'].substring(idx + 1)}`);
	}

	let temp_name = await api.checkExtension(file_name);
	file_name = temp_name;

	// bn_path = file_name;

	if (!fs.existsSync(file_name)) {
		let status_code = await api.downloadImage(src, file_name, headers);
		if (status_code != undefined && (status_code == 400 || status_code == 404 || status_code == 500)) {
			// bn_path = '';
			file_name = '';
		}
	}

	return file_name;
}