const {readFile} = require('fs');
const { app, BrowserWindow, nativeTheme, Notification, Tray, shell, ipcMain, Menu } = require('electron');
const {join} = require('path');
const {autoUpdater} = require("electron-updater");  // AutoUpdater Init

let cachedActivity;
let Functions = {
    LoadTheme: function (cssPath) {
        readFile(join(__dirname, `./themes/${cssPath}`), "utf-8", function (error, data) {
            if (!error) {
                let formattedData = data.replace(/\s{2,10}/g, ' ').trim();
                app.win.webContents.insertCSS(formattedData).then(() => console.log(`[Themes] '${cssPath}' successfully injected.`));
            }
        });

        let themeConfig = require('./themes/theme-config.json')
        for (let v in themeConfig.dark) {
            if (cssPath === v) {
                nativeTheme.themeSource = "dark"
            }
        }
        for (let v in themeConfig.light) {
            if (cssPath === v) {
                nativeTheme.themeSource = "light"
            }
        }
    },
    LoadJSFile: function (jsPath) {
        readFile(join(__dirname, `./js/${jsPath}`), "utf-8", function (error, data) {
            if (!error) {
                let formattedData = data.replace(/\s{2,10}/g, ' ').trim();
                app.win.webContents.executeJavaScript(formattedData).then(() => console.log(`[JS] '${jsPath}' successfully injected.`));
            }
        });
    },

    Init: function() {
        if (app.config.advanced.enableLogging) { // Logging Init
            const log = require("electron-log");
            console.log('---------------------------------------------------------------------')
            console.log('Apple-Music-Electron application has started.');
            console.log("---------------------------------------------------------------------")
            console.log = log.log;
        }

        autoUpdater.logger = require("electron-log");
        if (app.config.advanced.autoUpdaterBetaBuilds) {
            autoUpdater.allowPrerelease = true
            autoUpdater.allowDowngrade = false
        }
        console.log("[AutoUpdater] Checking for updates...")
        autoUpdater.checkForUpdatesAndNotify().then(r => console.log(`[AutoUpdater] Latest Version is ${r.updateInfo.version}`))

        Functions.SetTaskList() // Set the Task List

        app.setPath("userData", join(app.getPath("cache"), app.name)) // Set proper cache folder
        app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors'); // Disable CORS

        //    Set the Default Theme
        let theme;
        if (app.config.preferences.defaultTheme) {
            theme = app.config.preferences.defaultTheme.toLowerCase()
        } else if (nativeTheme.shouldUseDarkColors === true) {
            theme = "dark"
        } else if (nativeTheme.shouldUseDarkColors === false) {
            theme = "light"
        } else {
            theme = "system"
        }
        app.config.systemTheme = theme
    },
    InitDiscordRPC: function() {
        if (!app.discord.client) return;

        // Connected to Discord
        app.discord.client.on("connected", () => {
            console.log("[DiscordRPC] Successfully Connected to Discord!");
        });

        // Error Handler
        app.discord.client.on('error', err => {
            console.log(`[DiscordRPC] Error: ${err}`);
            console.log(`[DiscordRPC] Disconnecting from Discord.`)
            app.discord.client.disconnect()
            app.discord.client = false;
        });
    },
    InitTray: function() {
        app.tray = new Tray((process.platform === "win32") ? join(__dirname, `./icons/icon.ico`) : join(__dirname, `./icons/icon.png`))
        app.tray.setToolTip('Apple Music');
        Functions.SetContextMenu(true);

        app.tray.on('double-click', () => {
            app.win.show()
        })
    },
    InitDevMode: function() {
        console.log("[Apple-Music-Electron] [NOTICE] DEVELOPER MODE HAS BEEN ACTIVATED: allowSetMenu, Logging, discordRPC, trayTooltipSongName, macosWindow, removeUpsell and removeAppleLogo have been force enabled!")
        let adv = app.config.advanced
        adv.allowSetMenu = true
        adv.enableLogging = true
        let perf = app.config.preferences
        perf.discordRPC = true
        perf.playbackNotifications = true
        perf.trayTooltipSongName = true
        let css = app.config.css
        css.macosWindow = true
        css.removeUpsell = true
        css.removeAppleLogo = true
    },
    InitMpris: function() {
      const Mpris = require('mpris-service');
      let pos_atr = {durationInMillis: 0};
      let currentPlayBackProgress = "0";
      app.mpris = Mpris({
          name: 'AppleMusic',
          identity: 'Apple Music (Linux)',
          supportedUriSchemes: [],
          supportedMimeTypes: [],
          supportedInterfaces: ['player']
      });
      app.mpris.getPosition = function () {
          const durationInMicro = pos_atr.durationInMillis * 1000;
          const percentage = parseFloat(currentPlayBackProgress) || 0;
          return durationInMicro * percentage;
      }
      app.mpris.canQuit = true;
      app.mpris.canControl = true;
      app.mpris.canPause = true;
      app.mpris.canPlay = true;
      app.mpris.canGoNext = true;
      app.mpris.metadata = {'mpris:trackid': '/org/mpris/MediaPlayer2/TrackList/NoTrack'}
      app.mpris.playbackStatus = 'Stopped'

      mpris.on('playpause', async () => {
          if (mpris.playbackStatus === 'Playing') {
              await app.win.webContents.executeJavaScript('MusicKit.getInstance().pause()')
          } else {
              await app.win.webContents.executeJavaScript('MusicKit.getInstance().play()')
          }
        });

        app.mpris.on('play', async () => {
            await app.win.webContents.executeJavaScript('MusicKit.getInstance().play()')
        });

        app.mpris.on('pause', async () => {
            await app.win.webContents.executeJavaScript('MusicKit.getInstance().pause()')
        });

        app.mpris.on('next', async () => {
            await app.win.webContents.executeJavaScript('MusicKit.getInstance().skipToNextItem()')
        });

        app.mpris.on('previous', async () => {
            await app.win.webContents.executeJavaScript('MusicKit.getInstance().skipToPreviousItem()')
        });
    },
    
    UpdateMetaDataMpris: function(attributes) {
        let m = {'mpris:trackid': '/org/mpris/MediaPlayer2/TrackList/NoTrack'}
        if (attributes == null) {
            return
        } else if (attributes.playParams.id === 'no-id-found') {

        } else {
            let url = `${attributes.artwork.url.replace('/{w}x{h}bb', '/35x35bb')}`
            url = `${url.replace('/2000x2000bb', '/35x35bb')}`
            m = {
                'mpris:trackid': mpris.objectPath(`track/${attributes.playParams.id.replace(/[\.]+/g, "")}`),
                'mpris:length': attributes.durationInMillis * 1000, // In microseconds
                'mpris:artUrl': url,
                'xesam:title': `${attributes.name}`,
                'xesam:album': `${attributes.albumName}`,
                'xesam:artist': [`${attributes.artistName}`,],
                'xesam:genre': attributes.genreNames
            }
        }
        if (app.mpris.metadata["mpris:trackid"] === m["mpris:trackid"]) {
            return
        }
        mpris.metadata = m
    },
    PlaybackStateHandler: function(a) {
      const playbackStatusPlay = 'Playing';
      const playbackStatusPause = 'Paused';
      const playbackStatusStop = 'Stopped';

      function setPlaybackIfNeeded(status) {
        if (mpris.playbackStatus === status) {
          return
        }
        mpris.playbackStatus = status;
      }

      switch (a) {
        case 0:
            console.log("[Mpris] NONE")
            setPlaybackIfNeeded(playbackStatusPause);
            break;
        case 1:
            console.log("[Mpris] loading")
            setPlaybackIfNeeded(playbackStatusPause);
            break;
        case 2:
            console.log("[Mpris] playing")
            setPlaybackIfNeeded(playbackStatusPlay);
            break;
        case 3:
            console.log("[Mpris] paused")
            setPlaybackIfNeeded(playbackStatusPause);
            break;
        case 4:
            console.log("[Mpris] stopped")
            setPlaybackIfNeeded(playbackStatusStop);
            break;
        case 5:
            console.log("[Mpris] ended")
            break;
        case 6:
            console.log("[Mpris] seeking")
            break;
        case 7:
            console.log("[Mpris] waiting")
            break;
        case 8:
            console.log("[Mpris] stalled")
            break;
        case 9:
            console.log("[Mpris] completed")
            break;
      }
    },

    UpdateDiscordActivity: function(a) {
        if (!cachedActivity) {
            cachedActivity = a
            return true
        } else if (cachedActivity === a) {
            return true
        }
        console.log(`[DiscordRPC] Updating Play Presence for ${a.name} to ${a.status}`)
        if (a.status === true) {
            app.discord.client.updatePresence({
                details: a.name,
                state: `by ${a.artistName}`,
                startTimestamp: a.startTime,
                endTimestamp: a.endTime,
                largeImageKey: 'apple',
                largeImageText: a.albumName,
                smallImageKey: 'play',
                smallImageText: 'Playing',
                instance: false,
            });
        } else {
            app.discord.client.updatePresence({
                details: a.name,
                state: `by ${a.artistName}`,
                largeImageKey: 'apple',
                largeImageText: a.albumName,
                smallImageKey: 'pause',
                smallImageText: 'Paused',
                instance: false,
            });
        }
        return true
    },
    UpdateTooltip: function(a) {
        console.log(`[UpdateTooltip] Updating Tooltip for ${a.name} to ${a.status}`)
        if (a.status === true) {
            app.tray.setToolTip(`Playing ${a.name} by ${a.artistName} on ${a.albumName}`);
        } else {
            app.tray.setToolTip(`Paused ${a.name} by ${a.artistName} on ${a.albumName}`);
        }
        return true
    },

    GetLocale: function () {
        const SystemLang = app.getLocaleCountryCode().toLowerCase()
        const languages = require('./languages.json')
        let localeAs = SystemLang;
        if (app.config.advanced.forceApplicationLanguage) {
            for (let key in languages) {
                if (languages.hasOwnProperty(key)) {
                    key = key.toLowerCase()
                    if (targetLocaleAs === key) {
                        console.log(`[Language] Found: ${key} | System Language: ${SystemLang}`)
                        localeAs = key;
                    }
                }
            }
        }
        return localeAs
    },

    SetThumbarButtons: function (state) {
        let theme = app.config.systemTheme
        if (theme === "dark") {
            theme = "light"
        }
        let array;
        switch(state) {
            case false:
            case "paused":
                array = [
                    {
                        tooltip: 'Previous',
                        icon: join(__dirname, `./media/${theme}/previous.png`),
                        click() {
                            console.log('[setThumbarButtons] Previous song button clicked.')
                            app.win.webContents.executeJavaScript("MusicKit.getInstance().skipToPreviousItem()").then(() => console.log("[ThumbarPlaying] skipToPreviousItem"))
                        }
                    },
                    {
                        tooltip: 'Play',
                        icon: join(__dirname, `./media/${theme}/play.png`),
                        click() {
                            console.log('[setThumbarButtons] Play song button clicked.')
                            app.win.webContents.executeJavaScript("MusicKit.getInstance().play()").then(() => console.log("[ThumbarPlaying] play"))
                        }
                    },
                    {
                        tooltip: 'Next',
                        icon: join(__dirname, `./media/${theme}/next.png`),
                        click() {
                            console.log('[setThumbarButtons] Pause song button clicked.')
                            app.win.webContents.executeJavaScript("MusicKit.getInstance().skipToNextItem()").then(() => console.log("[ThumbarPlaying] skipToNextItem"))
                        }
                    }
                ];
                break;

            default:
            case "inactive":
                array = [
                    {
                        tooltip: 'Previous',
                        icon: join(__dirname, `./media/${theme}/previous-inactive.png`)
                    },
                    {
                        tooltip: 'Play',
                        icon: join(__dirname, `./media/${theme}/play-inactive.png`)
                    },
                    {
                        tooltip: 'Next',
                        icon: join(__dirname, `./media/${theme}/next-inactive.png`)
                    }
                ];
                break;

            case true:
            case "playing":
                array = [
                    {
                        tooltip: 'Previous',
                        icon: join(__dirname, `./media/${theme}/previous.png`),
                        click() {
                            console.log('[setThumbarButtons] Previous song button clicked.')
                            app.win.webContents.executeJavaScript("MusicKit.getInstance().skipToPreviousItem()").then(() => console.log("[ThumbarPaused] skipToPreviousItem"))
                        }
                    },
                    {
                        tooltip: 'Pause',
                        icon: join(__dirname, `./media/${theme}/pause.png`),
                        click() {
                            console.log('[setThumbarButtons] Play song button clicked.')
                            app.win.webContents.executeJavaScript("MusicKit.getInstance().pause()").then(() => console.log("[ThumbarPaused] pause"))
                        }
                    },
                    {
                        tooltip: 'Next',
                        icon: join(__dirname, `./media/${theme}/next.png`),
                        click() {
                            console.log('[setThumbarButtons] Pause song button clicked.')
                            app.win.webContents.executeJavaScript("MusicKit.getInstance().skipToNextItem()").then(() => console.log("[ThumbarPaused] skipToNextItem"))
                        }
                    }
                ]
                break;
        }
        if (process.platform === "win32") {
            app.win.setThumbarButtons(array)
        }
        return true
    },
    SetTaskList: function () {
        if (process.platform !== "win32") return;
        app.setUserTasks([
            {
                program: process.execPath,
                arguments: '--force-quit',
                iconPath: process.execPath,
                iconIndex: 0,
                title: 'Quit Apple Music'
            }
        ]);
    },
    SetContextMenu: function (visibility) {
        if (visibility) {
            app.tray.setContextMenu(Menu.buildFromTemplate([
                {
                    label: 'Check for Updates',
                    click: function () {
                        autoUpdater.checkForUpdatesAndNotify().then(r => console.log(`[AutoUpdater] Latest Version is ${r.updateInfo.version}`));
                    }
                },
                {
                    label: 'Minimize to Tray',
                    click: function () {
                        app.win.hide();
                    }
                },
                {
                    label: 'Quit',
                    click: function () {
                        app.isQuiting = true
                        app.quit();
                    }
                }
            ]));
        } else {
            app.tray.setContextMenu(Menu.buildFromTemplate([
                {
                    label: 'Check for Updates',
                    click: function () {
                        autoUpdater.checkForUpdatesAndNotify().then(r => console.log(`[AutoUpdater] Latest Version is ${r.updateInfo.version}`));
                    }
                },
                {
                    label: 'Show Apple Music',
                    click: function () {
                        app.win.show();
                    }
                },
                {
                    label: 'Quit',
                    click: function () {
                        app.isQuiting = true
                        app.quit();
                    }
                }
            ]));
        }

    },

    WindowHandler: function() {
        app.win.webContents.setWindowOpenHandler(({url}) => {
            if (url.startsWith('https://apple.com/') || url.startsWith('https://www.apple.com/') || url.startsWith('https://support.apple.com/')) { // for security (pretty pointless ik)
                shell.openExternal(url).then(() => console.log(`[Apple-Music-Electron] User has opened ${url} which has been redirected to browser.`));
                return {action: 'deny'}
            }
            console.log(`[Apple-Music-Electron] User has attempted to open ${url} which was blocked.`)
            return {action: 'deny'}
        })

        app.win.on('unresponsive', function () {
            console.log("[Apple-Music-Electron] Application has become unresponsive and has been closed.")
            app.exit();
        });


        app.win.on('page-title-updated', function (event) { // Prevents the Window Title from being Updated
            event.preventDefault()
        });

        app.win.on('close', function (event) { // Hide the App if isQuitting is not true
            if (!app.isQuiting) {
                event.preventDefault();
                app.win.hide();
            } else {
                event.preventDefault();
                app.win.destroy();
            }
        });

        ipcMain.on('minimize', () => { // listen for minimize event
            app.win.minimize()
        })

        ipcMain.on('maximize', () => { // listen for maximize event and perform restore/maximize depending on window state
            if (app.win.isMaximized()) {
                app.win.restore()
            } else {
                app.win.maximize()
            }
        })

        ipcMain.on('close', () => { // listen for close event
            app.win.close();
        })

        app.win.on('show', function () {
            Functions.SetContextMenu(true)
            Functions.SetThumbarButtons(app.isPlaying)
        })

        app.win.on('hide', function () {
            Functions.SetContextMenu(false)
        })
    },

    CreatePlaybackNotification: function (a) {
        if (process.platform === "win32") app.setAppUserModelId("Apple Music");
        console.log(`[CreatePlaybackNotification] Notification Generating | Function Parameters: SongName: ${a.name} | Artist: ${a.artistName} | Album: ${a.albumName}`)
        let NOTIFICATION_TITLE = a.name;
        let NOTIFICATION_BODY = `${a.artistName} - ${a.albumName}`;
        new Notification({
            title: NOTIFICATION_TITLE,
            body: NOTIFICATION_BODY,
            silent: true,
            icon: join(__dirname, './icons/icon.png')
        }).show()
        return true
    },
    CreateBrowserWindow: function () {
        let options = {
            icon: join(__dirname, `./icons/icon.ico`),
            width: 1024,
            height: 600,
            minWidth: 300,
            minHeight: 300,
            frame: !app.config.css.macosWindow,
            title: "Apple Music",
            // Enables DRM
            webPreferences: {
                plugins: true,
                preload: join(__dirname, './js/MusicKitInterop.js'),
                allowRunningInsecureContent: app.config.advanced.allowRunningInsecureContent,
                contextIsolation: false,
                webSecurity: false,
                sandbox: true
            }
        };

        if (app.config.css.glasstron) { // Glasstron Theme Window Creation
            let glasstron = require('glasstron');
            if (process.platform !== "win32") app.commandLine.appendSwitch("enable-transparent-visuals");
            app.win = new glasstron.BrowserWindow(options)
            app.win.blurType = "blurbehind";
            app.win.setBlur(true);
        } else {
            app.win = new BrowserWindow(options)
        }

        if (!app.config.advanced.menuBarVisible) app.win.setMenuBarVisibility(false); // Hide that nasty menu bar
        if (!app.config.advanced.allowSetMenu) app.win.setMenu(null); // Disables DevTools
    }
};

module.exports = Functions;