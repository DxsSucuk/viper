const fs = require("fs");
const path = require("path");
const { app, dialog, ipcMain, BrowserWindow } = require("electron");

const Emitter = require("events");
const events = new Emitter();

const utils = require("./utils");
const cli = require("./cli");

function start() {
	win = new BrowserWindow({
		width: 500,
		height: 115,
		show: false,
		title: "Viper",
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	}); win.openDevTools()

	win.removeMenu();
	win.loadFile(__dirname + "/app/index.html");
	win.webContents.once("dom-ready", () => {win.show()});

	ipcMain.on("setpath", (event) => {utils.setpath(win)})
}

ipcMain.on("launch", (event) => {utils.launch()})
ipcMain.on("launchVanilla", (event) => {utils.launch("vanilla")})

ipcMain.on("update", (event) => {utils.update()})
ipcMain.on("setpathcli", (event) => {utils.setpath()})

process.chdir(app.getPath("appData"));

if (cli.hasArgs()) {
	cli.init();
} else {
	app.on("ready", () => {
		app.setPath("userData", path.join(app.getPath("cache"), app.name));
		start();
	})
}