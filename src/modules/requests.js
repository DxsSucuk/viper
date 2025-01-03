const fs = require("fs");
const path = require("path");
const { app, ipcMain } = require("electron");
const https = require("follow-redirects").https;

const json = require("./json");
const version = require("./version");

var cache_dir = app.getPath("userData");
var cache_file = path.join(cache_dir, "cached-requests.json");

// lets renderer delete request cache
ipcMain.on("delete-request-cache", () => {
	requests.cache.delete.all();
})

// lets renderer use `requests.get()`
ipcMain.handle("request", async (e, ...args) => {
	let res = false;

	try {
		res = await requests.get(...args);
	}catch(err) {}

	return res;
})

ipcMain.handle("request-check", async (_, ...args) => {
	let res = false;

	try {
		res = await requests.check(...args);
	}catch(err) {}

	return res;
})

// updates `cache_dir` and `cache_file`
function set_paths() {
	cache_dir = app.getPath("userData");
	cache_file = path.join(cache_dir, "cached-requests.json");
}

let requests = {
	cache: {}
}

// verifies and ensures `cache_dir` exists
function ensure_dir() {
	set_paths();

	// does the folder exist?
	let exists = fs.existsSync(cache_dir);

	// shorthand for creating folder
	let mkdir = () => {fs.mkdirSync(cache_dir)};

	// if folder doesn't exist at all, create it
	if (! exists) {
		mkdir();
		return;
	}

	// if it does exist, but somehow is a file, remove it, then recreate
	// it as an actual folder, wait how did this even happen?
	if (exists && fs.statSync(cache_dir).isFile()) {
		fs.rmSync(cache_dir);
		mkdir();
	}
}

// check `cache_file` and optionally check for the existence of
// `cache_key`, and if it exists, return it as is
let check_file = (cache_key) => {
	// if `cache_file` doesn't exist, or isn't even a file, somehow,
	// simply return `false`, and if it wasn't a file, we'll also remove
	// the non-file item.
	if (! fs.existsSync(cache_file)
		|| ! fs.statSync(cache_file).isFile()) {

		if (fs.existsSync(cache_file)) {
			fs.rmSync(cache_file, {recursive: true});
		}

		return false;
	}

	// attempt to read and parse `cache_file` as JSON
	let file = json(cache_file);

	// if parsing failed, remove file, and return `false`
	if (! file) {
		fs.rmSync(cache_file);
		return false;
	}

	if (! cache_key) {
		return file;
	}

	// if `cache_key` isn't found, return `false`
	if (! file[cache_key]) {
		return false;
	}

	return file[cache_key];
}

// attempts to get a `cache_key`'s value, unless it's been set more than
// `max_time_min` ago, set it to a falsy value to disable
requests.cache.get = (cache_key, max_time_min = 5) => {
	ensure_dir();

	let key = check_file(cache_key);

	// something went wrong with the config file or the key doesn't
	// exist, return `false`
	if (! key) {
		return false;
	}

	// if the key is missing `.data` or `.time`, return `false`
	if (! key.data || ! key.time) {
		return false;
	}

	// convert from minutes to milliseconds
	max_time_min = max_time_min * 1000 * 60;

	let now = new Date().getTime();

	// check if `key.time` is more than `max_time_min` since it got set
	if (now - key.time > max_time_min && max_time_min) {
		return false;
	}

	return key.data;
}

// attempt to delete `cache_key` from `cache_file`
requests.cache.delete = (cache_key) => {
	ensure_dir();
	let file = check_file();

	// if something went wrong when checking the `cache_file`, simply
	// set the file to an empty Object
	if (! file) {
		file = {};
	}

	delete file[cache_key];
	fs.writeFileSync(cache_file, JSON.stringify(file));
}

// deletes all cached keys
requests.cache.delete.all = () => {
	// paths to files we'll be deleting
	let files = [
		cache_file,
		path.join(app.getPath("cache"), "viper-requests.json")
	]

	// run through list of files, and attempt to delete each of them
	for (let i = 0; i < files.length; i++) {
		// if the file actually exists, delete it!
		if (fs.existsSync(files[i])) {
			fs.rmSync(files[i], {recursive: true});
		}
	}
}

// sets `cache_key` to `data` and updates its timestamp
requests.cache.set = (cache_key, data) => {
	ensure_dir();
	let file = check_file();

	// if something went wrong when checking the `cache_file`, simply
	// set the file to an empty Object
	if (! file) {
		file = {};
	}

	file[cache_key] = {
		data: data,
		time: new Date().getTime()
	}

	fs.writeFileSync(cache_file, JSON.stringify(file));
}

// attempts to `GET` `https://<host>/<path>`, and then returns the
// result or if it fails it'll reject with `false`
//
// if `cache_key` is set, we'll first attempt to check if any valid
// cache with that key exists, and then return it directly if its still
// valid cache.
requests.get = (host, path, cache_key, ignore_max_time_when_offline = true, max_time_min) => {
	let cached = requests.cache.get(cache_key, max_time_min);
	if (cached) {
		return cached;
	}

	// we'll use this as the `User-Agent` header for the request
	let user_agent = "viper/" + version.viper();

	return new Promise((resolve, reject) => {
		// start `GET` request
		https.get({
			host: host,
			port: 443,
			path: path,
			method: "GET",
			headers: { "User-Agent": user_agent }
		},

		// on data response
		response => {
			// set correct encoding
			response.setEncoding("utf8");

			// this'll be filled with incoming data
			let res_data = "";

			// data has arrived, add it on `res_data`
			response.on("data", data => {
				res_data += data;
			})

			// request is done, return result
			response.on("end", _ => {
				resolve(res_data);
				if (cache_key) {
					requests.cache.set(cache_key, res_data);
				}
			})
		})
		
		// an error occured
		.on("error", () => {
			if (ignore_max_time_when_offline) {
				// check if the request has been cached before, at all, not
				// caring about how long time ago it was, and if it was, we
				// simply return that, as a last resort.
				cached = requests.cache.get(cache_key, false);

				if (cached) {
					return resolve(cached);
				}
			}

			reject(false);
		})
	})
}

// checks whether a list of `endpoints` can be contacted
requests.check = async (endpoints) => {
	// turn `endpoints` into an array, if it isn't already
	if (typeof endpoints == "string") {
		endpoints = [endpoints];
	}

	// list of what failed and succeeded, will be returned later
	let res = {
		failed: [],
		succeeded: []
	}

	// run through all the endpoints
	for (let endpoint of endpoints) {
		let req;

		// attempt to do a request
		try {
			req = await fetch(endpoint);
		} catch(err) { // something went wrong!
			res.failed.push(endpoint);
			continue;
		}

		// if we're within the `200-299` response code range, we
		// consider it a success
		if (req.status < 300 && req.status >= 200) {
			res.succeeded.push(endpoint);
			continue;
		}

		// we failed!
		res.failed.push(endpoint);
	}

	return res;
}

module.exports = requests;
