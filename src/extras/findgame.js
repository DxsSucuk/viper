const fs = require("fs");
const path = require("path");
const vdf = require("simple-vdf");
const { app } = require("electron");

const util = require("util");
const exec = util.promisify(require("child_process").exec);

module.exports = async () => {
	let gamepath = "";
	
	// Autodetect path
	// Windows only using powershell and windows registery
	// Get-Item -Path Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Respawn\Titanfall2\
	if (process.platform == "win32") {
		try {
			const {stdout} = await exec("Get-ItemProperty -Path Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Respawn\\Titanfall2\\ -Name \"Install Dir\"", {"shell":"powershell.exe"});

			const gamepath = stdout.split('\n')
				.filter(r => r.indexOf("Install Dir") !== -1)[0]
				.replace(/\s+/g,' ')
				.trim()
				.replace("Install Dir : ","");

			if (gamepath) {return gamepath}
		} catch (err) {}
	}

	// Detect using Steam VDF
	function readvdf(data) {
		// Parse read_data
		data = vdf.parse(data);

		let values = Object.values(data["libraryfolders"]);
		if (typeof values[values.length - 1] != "object") {
			values.pop(1);
		}
		
		// `.length - 1` This is because the last value is `contentstatsid`
		for (let i = 0; i < values.length; i++) {
			let data_array = Object.values(values[i])
			
			if (fs.existsSync(data_array[0] + "/steamapps/common/Titanfall2/Titanfall2.exe")) {
				console.log("Found game in:", data_array[0])
				return data_array[0] + "/steamapps/common/Titanfall2";
			}
		}
	}

	let folder = null;
	switch (process.platform) {
		case "win32":
			folder = "C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf";
			break
		case "linux":
		case "openbsd":
		case "freebsd":
			let paths = [
				"/.steam/steam/steamapps/libraryfolders.vdf",
				".var/app/com.valvesoftware.Steam/.steam/steam/steamapps/libraryfolders.vdf"
			]

			for (let i = 0; i < paths.length; i++) {
				if (fs.existsSync(path.join(app.getPath("home"), paths[i]))) {
					folder = path.join(app.getPath("home"), paths[i]);
					continue
				}
			}
			break
	}

	if (fs.existsSync(folder) && folder) {
		let data = fs.readFileSync(folder)
		let read_vdf = readvdf(data.toString())
		if (read_vdf ) {return read_vdf}
	}

	if (gamepath) {
		return gamepath;
	} else {
		return false;
	}
}
