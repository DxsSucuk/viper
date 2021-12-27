const fs = require("fs");
const path = require("path");
const { app, dialog, ipcMain } = require("electron");

const Emitter = require("events");
const events = new Emitter();

const cli = require("./cli");

const unzip = require("unzipper");
const request = require("request");
const exec = require("child_process").spawn;
const { https } = require("follow-redirects");

process.chdir(app.getPath("appData"));

var settings = {
	gamepath: "",
	file: "viper.json",
	zip: "/northstar.zip",
}

if (fs.existsSync(settings.file)) {
	settings = {...settings, ...JSON.parse(fs.readFileSync(settings.file, "utf8"))};
	settings.zip = path.join(settings.gamepath + "/northstar.zip");
} else {
	console.log("Game path is not set! Please select the path.");
}


function setpath(win) {
	if (! win) {
		settings.gamepath = cli.param("setpath");
	} else {
		dialog.showOpenDialog({properties: ["openDirectory"]}).then(res => {
			win.webContents.send("newpath", res.filePaths[0]);
			settings.gamepath = res.filePaths[0];
		}).catch(err => {console.error(err)})
	}

	fs.writeFileSync(app.getPath("appData") + "/viper.json", JSON.stringify({...settings}));
	cli.exit();
}

function update() {
	console.log("Downloading...");
	request({
		json: true,
		headers: {"User-Agent": "Viper"},
		url: "https://api.github.com/repos/R2Northstar/Northstar/releases/latest",
	}, (error, response, body) => {
		https.get(body.assets[0].browser_download_url, (res) => {
			let stream = fs.createWriteStream(settings.zip);
			res.pipe(stream);
			stream.on("finish", () => {
				stream.close();
				console.log("Download done! Extracting...");
				fs.createReadStream(settings.zip).pipe(unzip.Extract({path: settings.gamepath}))
				.on("finish", () => {
					console.log("Installation/Update finished!");
					events.emit("updated");
					cli.exit();
				});
			})
		})
	})
}

function launch(version) {
	if (process.platform == "linux") {
		console.error("error: Launching the game is not currently supported on Linux")
		cli.exit(1);
	}

	switch(version) {
		case "vanilla":
			console.log("Launching Vanilla...")
			exec(path.join(settings.gamepath + "/Titanfall2.exe"))
			break;
		default:
			console.log("Launching Northstar...")
			exec(path.join(settings.gamepath + "/NorthstarLauncher.exe"))
			break;
	}
}

module.exports = {
	launch,
	update,
	setpath,
	settings,
}